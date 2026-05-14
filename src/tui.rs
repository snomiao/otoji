//! react-ink-style live transcript view, but built on `ratatui`.
//!
//! Layout:
//!  ┌────────────────────────────────────────────┐
//!  │ otoji · listening · 12 final · 1 partial   │  ← header
//!  ├────────────────────────────────────────────┤
//!  │ [final, polished sentences scroll here]    │  ← body
//!  │ ...                                        │
//!  │ ░ partial hypothesis (gray italic)         │  ← partial line
//!  └────────────────────────────────────────────┘
//!
//! Finals are pushed through the polisher in the background and the on-screen
//! line is replaced with the polished version once it returns.

use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use otoji::core::AsrEvent;
use otoji::polish::{PolishInput, Polisher};
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Terminal;
use std::collections::BTreeMap;
use std::io;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{self, Receiver};
use tokio::sync::Mutex;

/// Shared runtime settings readable from both TUI and audio pipeline.
pub struct LiveSettings {
    pub vad_enabled: AtomicBool,
    /// Gain as f32 bits (use f32::from_bits / f32::to_bits).
    gain_bits: AtomicU32,
}

impl LiveSettings {
    pub fn new() -> Self {
        Self {
            vad_enabled: AtomicBool::new(true),
            gain_bits: AtomicU32::new(1.0_f32.to_bits()),
        }
    }
    pub fn gain(&self) -> f32 {
        f32::from_bits(self.gain_bits.load(Ordering::Relaxed))
    }
    pub fn set_gain(&self, v: f32) {
        self.gain_bits.store(v.to_bits(), Ordering::Relaxed);
    }
}

#[derive(Debug, Clone)]
struct Segment {
    seg_id: u64,
    raw: String,
    polished: Option<String>,
    /// Wall-clock time when Final arrived from ASR.
    final_at: chrono::DateTime<chrono::Local>,
    /// Wall-clock time when polish completed (None if pending or disabled).
    polish_at: Option<chrono::DateTime<chrono::Local>>,
    /// Wall-clock time when the user started speaking this segment
    /// (estimated: final_at minus audio duration).
    start_at: chrono::DateTime<chrono::Local>,
}

struct State {
    finals: BTreeMap<u64, Segment>,
    partial: Option<(u64, String)>,
    status: Option<String>,
    error: Option<String>,
    closed: bool,
    polish_enabled: bool,
    /// Reference to shared atomic settings (gain, vad) for display.
    live: Arc<LiveSettings>,
}

impl State {
    fn new(polish_available: bool, live: Arc<LiveSettings>) -> Self {
        Self {
            finals: BTreeMap::new(),
            partial: None,
            status: None,
            error: None,
            closed: false,
            polish_enabled: polish_available,
            live,
        }
    }
}

pub async fn run(
    mut events: Receiver<AsrEvent>,
    polisher: Arc<dyn Polisher>,
    live: Arc<LiveSettings>,
) -> Result<()> {
    let polish_available = polisher.name() != "noop";
    let state = Arc::new(Mutex::new(State::new(polish_available, live.clone())));
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let is_noop = polisher.name() == "noop";
    let (polish_tx, mut polish_rx) = mpsc::channel::<(u64, String, Option<Vec<f32>>)>(64);
    if !is_noop {
        let state = state.clone();
        let polisher = polisher.clone();
        tokio::spawn(async move {
            while let Some((seg_id, raw, audio)) = polish_rx.recv().await {
                let prev = {
                    let s = state.lock().await;
                    s.finals
                        .range(..seg_id)
                        .next_back()
                        .and_then(|(_, seg)| seg.polished.clone().or_else(|| Some(seg.raw.clone())))
                };
                let input = PolishInput {
                    text: &raw,
                    prev: prev.as_deref(),
                    audio: audio.as_deref(),
                    context: None,
                    translate_to: None,
                };
                match polisher.polish(input).await {
                    Ok(p) => {
                        let mut s = state.lock().await;
                        if let Some(seg) = s.finals.get_mut(&seg_id) {
                            seg.polish_at = Some(chrono::Local::now());
                            // Don't mark as polished if text is unchanged (noop/deferred not ready).
                            if p != seg.raw {
                                seg.polished = Some(p);
                            }
                        }
                    }
                    Err(e) => {
                        let mut s = state.lock().await;
                        s.error = Some(format!("polish: {e}"));
                    }
                }
            }
        });
    }

    let res = event_loop(&mut terminal, &mut events, state.clone(), polish_tx).await;

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    res
}

async fn event_loop<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    events: &mut Receiver<AsrEvent>,
    state: Arc<Mutex<State>>,
    polish_tx: mpsc::Sender<(u64, String, Option<Vec<f32>>)>,
) -> Result<()> {
    let mut tick = tokio::time::interval(Duration::from_millis(16));
    loop {
        tokio::select! {
            maybe = events.recv() => {
                match maybe {
                    Some(ev) => apply_event(&state, &polish_tx, ev).await,
                    None => {
                        let mut s = state.lock().await;
                        s.closed = true;
                    }
                }
            }
            _ = tick.tick() => {
                draw(terminal, &state).await?;
                if event::poll(Duration::from_millis(0))? {
                    if let Event::Key(KeyEvent { code, modifiers, .. }) = event::read()? {
                        let quit = matches!(code, KeyCode::Char('q') | KeyCode::Esc)
                            || (code == KeyCode::Char('c')
                                && modifiers.contains(KeyModifiers::CONTROL));
                        if quit { return Ok(()); }
                        let mut s = state.lock().await;
                        match code {
                            KeyCode::Char('p') => s.polish_enabled = !s.polish_enabled,
                            KeyCode::Char('v') => {
                                let cur = s.live.vad_enabled.load(Ordering::Relaxed);
                                s.live.vad_enabled.store(!cur, Ordering::Relaxed);
                            }
                            KeyCode::Char('+') | KeyCode::Char('=') => {
                                s.live.set_gain((s.live.gain() * 1.5).min(32.0));
                            }
                            KeyCode::Char('-') => {
                                s.live.set_gain((s.live.gain() / 1.5).max(0.1));
                            }
                            KeyCode::Char('0') => s.live.set_gain(1.0),
                            _ => {}
                        }
                    }
                }
                // After close we used to auto-quit immediately, which made
                // file-replay sessions exit before the user could see the
                // last segment. Stay on screen until the user presses q/esc.
            }
        }
    }
}

async fn apply_event(
    state: &Arc<Mutex<State>>,
    polish_tx: &mpsc::Sender<(u64, String, Option<Vec<f32>>)>,
    ev: AsrEvent,
) {
    let mut s = state.lock().await;
    match ev {
        AsrEvent::Open => {}
        AsrEvent::Partial { seg_id, text } => {
            s.partial = Some((seg_id, text));
        }
        AsrEvent::Final {
            seg_id,
            text,
            audio,
            ..
        } => {
            let now = chrono::Local::now();
            // Estimate start from audio length (f32 samples @ 16kHz).
            let dur_ms = audio.as_ref().map(|a| a.len() * 1000 / 16_000).unwrap_or(0);
            let start_at = now - chrono::Duration::milliseconds(dur_ms as i64);
            s.finals.insert(
                seg_id,
                Segment {
                    seg_id,
                    raw: text.clone(),
                    polished: None,
                    final_at: now,
                    polish_at: None,
                    start_at,
                },
            );
            if s.partial.as_ref().map(|(id, _)| *id) == Some(seg_id) {
                s.partial = None;
            }
            // Send to polish in background — never blocks display.
            if s.polish_enabled {
                let _ = polish_tx.try_send((seg_id, text, audio));
            }
        }
        AsrEvent::Status { message } => {
            s.status = Some(message);
        }
        AsrEvent::Closed => {
            s.closed = true;
            s.partial = None;
        }
        AsrEvent::Error { message } => {
            s.error = Some(message);
        }
        // PTT events are for external consumers (--plain mode); TUI ignores them.
        AsrEvent::PttPartial { .. }
        | AsrEvent::PttFinal { .. }
        | AsrEvent::PttUpgrade { .. }
        | AsrEvent::PttTranslated { .. }
        | AsrEvent::LanguageDetected { .. } => {}
    }
}

/// Build word-level diff spans between raw ASR text and polished text.
/// Equal words are white bold, deleted words red+strikethrough, inserted green.
fn diff_spans(raw: &str, polished: &str) -> Vec<Span<'static>> {
    use similar::{ChangeTag, TextDiff};
    let diff = TextDiff::from_words(raw, polished);
    let mut spans = Vec::new();
    for change in diff.iter_all_changes() {
        let text = change.value().to_string();
        let span = match change.tag() {
            ChangeTag::Equal => Span::styled(
                text,
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ),
            ChangeTag::Delete => Span::styled(
                text,
                Style::default()
                    .fg(Color::Red)
                    .add_modifier(Modifier::CROSSED_OUT),
            ),
            ChangeTag::Insert => Span::styled(text, Style::default().fg(Color::Green)),
        };
        spans.push(span);
    }
    spans
}

async fn draw<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    state: &Arc<Mutex<State>>,
) -> Result<()> {
    let s = state.lock().await;
    terminal.draw(|f| {
        let area = f.area();

        // Build the header line; if it doesn't fit on one row (with the
        // status appended), wrap status onto a second row.
        let state_label = if s.closed { "closed" } else { "listening" };
        let polished_count = s
            .finals
            .values()
            .filter(|seg| seg.polished.is_some())
            .count();
        let counts = format!(
            " · {} final · {} polished · {} partial",
            s.finals.len(),
            polished_count,
            s.partial.is_some() as usize,
        );
        let toggles = format!(
            " · polish:{} · vad:{} · gain:{:.1}x",
            if s.polish_enabled { "on" } else { "off" },
            if s.live.vad_enabled.load(Ordering::Relaxed) {
                "on"
            } else {
                "off"
            },
            s.live.gain(),
        );
        let hint = "(q p v +/- 0)";
        let primary_text = format!("otoji · {state_label}{counts}{toggles}    {hint}");
        let primary_len = primary_text.chars().count() as u16;
        let status_text = s.status.as_deref();
        let inner_width = area.width.saturating_sub(2); // borders
        let need_wrap = match status_text {
            Some(st) => {
                let combined = primary_len + 4 + st.chars().count() as u16;
                combined > inner_width
            }
            None => false,
        };
        let header_height: u16 = if need_wrap { 4 } else { 3 };

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(header_height), Constraint::Min(1)])
            .split(area);

        let primary_spans = vec![
            Span::styled(
                "otoji ",
                Style::default()
                    .fg(Color::Magenta)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("· "),
            Span::styled(
                state_label,
                Style::default().fg(if s.closed { Color::Red } else { Color::Green }),
            ),
            Span::raw(counts),
            Span::raw("    "),
            Span::styled(hint, Style::default().fg(Color::DarkGray)),
        ];

        let status_span = |st: &str| {
            Span::styled(
                format!("· {st}"),
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::ITALIC),
            )
        };

        let mut header_lines: Vec<Line> = Vec::new();
        if let (Some(st), false) = (status_text, need_wrap) {
            let mut spans = primary_spans.clone();
            spans.push(Span::raw("    "));
            spans.push(status_span(st));
            header_lines.push(Line::from(spans));
        } else {
            header_lines.push(Line::from(primary_spans));
            if let Some(st) = status_text {
                header_lines.push(Line::from(vec![status_span(st)]));
            }
        }
        let header = Paragraph::new(header_lines)
            .block(Block::default().borders(Borders::ALL).title("音字"));
        f.render_widget(header, chunks[0]);

        let mut lines: Vec<Line> = Vec::new();
        for seg in s.finals.values() {
            let start_ts = seg.start_at.format("%H:%M:%S").to_string();
            let end_ts = seg.final_at.format("%H:%M:%S").to_string();
            let polish_ms = seg
                .polish_at
                .map(|t| (t - seg.final_at).num_milliseconds().max(0));
            let time_label = match polish_ms {
                Some(ms) => format!("{start_ts}-{end_ts} +{ms}ms "),
                None if seg.polished.is_some() => format!("{start_ts}-{end_ts}        "),
                None => format!("{start_ts}-{end_ts} ..?   "),
            };
            let mut spans = vec![
                Span::styled(
                    format!("[{:>3}] ", seg.seg_id),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(time_label, Style::default().fg(Color::DarkGray)),
            ];
            match &seg.polished {
                Some(polished) if *polished != seg.raw => {
                    spans.extend(diff_spans(&seg.raw, polished));
                }
                Some(polished) => {
                    // Polished but unchanged — show as bold white.
                    spans.push(Span::styled(
                        polished.clone(),
                        Style::default()
                            .fg(Color::White)
                            .add_modifier(Modifier::BOLD),
                    ));
                }
                None => {
                    spans.push(Span::styled(
                        seg.raw.clone(),
                        Style::default().fg(Color::Gray),
                    ));
                }
            }
            lines.push(Line::from(spans));
        }
        if let Some((id, partial)) = &s.partial {
            // Blinking caret to convey live streaming.
            let caret = if std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| (d.as_millis() / 500) % 2 == 0)
                .unwrap_or(true)
            {
                "▏"
            } else {
                " "
            };
            // Partial doesn't have a start timestamp — show ??-??.
            let now_ts = chrono::Local::now().format("%H:%M:%S").to_string();
            let time_label = format!("{now_ts}-??:??:?? ...   ");
            lines.push(Line::from(vec![
                Span::styled(format!("[{id:>3}] "), Style::default().fg(Color::DarkGray)),
                Span::styled(time_label, Style::default().fg(Color::DarkGray)),
                Span::styled(
                    format!("░ {partial}"),
                    Style::default()
                        .fg(Color::LightCyan)
                        .add_modifier(Modifier::ITALIC),
                ),
                Span::styled(
                    caret.to_string(),
                    Style::default()
                        .fg(Color::LightCyan)
                        .add_modifier(Modifier::BOLD),
                ),
            ]));
        }
        if let Some(err) = &s.error {
            lines.push(Line::from(Span::styled(
                format!("error: {err}"),
                Style::default().fg(Color::Red),
            )));
        }

        // Auto-scroll: keep the latest lines visible.
        let body_height = chunks[1].height.saturating_sub(2) as usize; // minus borders
        let total_lines = lines.len();
        let scroll = if total_lines > body_height {
            (total_lines - body_height) as u16
        } else {
            0
        };
        let body = Paragraph::new(lines)
            .wrap(Wrap { trim: false })
            .scroll((scroll, 0))
            .block(Block::default().borders(Borders::ALL).title("transcript"));
        f.render_widget(body, chunks[1]);
    })?;
    Ok(())
}
