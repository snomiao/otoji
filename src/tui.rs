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
use otoji::polish::Polisher;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Terminal;
use std::collections::BTreeMap;
use std::io;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{self, Receiver};
use tokio::sync::Mutex;

#[derive(Debug, Clone)]
struct Segment {
    seg_id: u64,
    raw: String,
    polished: Option<String>,
}

#[derive(Default)]
struct State {
    finals: BTreeMap<u64, Segment>,
    partial: Option<(u64, String)>,
    status: Option<String>,
    error: Option<String>,
    closed: bool,
}

pub async fn run(mut events: Receiver<AsrEvent>, polisher: Arc<dyn Polisher>) -> Result<()> {
    let state = Arc::new(Mutex::new(State::default()));
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let (polish_tx, mut polish_rx) = mpsc::channel::<(u64, String)>(64);
    {
        let state = state.clone();
        let polisher = polisher.clone();
        tokio::spawn(async move {
            while let Some((seg_id, raw)) = polish_rx.recv().await {
                let prev = {
                    let s = state.lock().await;
                    s.finals
                        .range(..seg_id)
                        .next_back()
                        .and_then(|(_, seg)| seg.polished.clone().or_else(|| Some(seg.raw.clone())))
                };
                match polisher.polish(&raw, prev.as_deref()).await {
                    Ok(p) => {
                        let mut s = state.lock().await;
                        if let Some(seg) = s.finals.get_mut(&seg_id) {
                            seg.polished = Some(p);
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
    polish_tx: mpsc::Sender<(u64, String)>,
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
    polish_tx: &mpsc::Sender<(u64, String)>,
    ev: AsrEvent,
) {
    let mut s = state.lock().await;
    match ev {
        AsrEvent::Open => {}
        AsrEvent::Partial { seg_id, text } => {
            s.partial = Some((seg_id, text));
        }
        AsrEvent::Final { seg_id, text, .. } => {
            s.finals.insert(
                seg_id,
                Segment {
                    seg_id,
                    raw: text.clone(),
                    polished: None,
                },
            );
            if s.partial.as_ref().map(|(id, _)| *id) == Some(seg_id) {
                s.partial = None;
            }
            let _ = polish_tx.try_send((seg_id, text));
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
    }
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
        let counts = format!(
            " · {} final · {} partial",
            s.finals.len(),
            s.partial.is_some() as usize,
        );
        let hint = "(q/esc to quit)";
        let primary_text = format!("otoji · {state_label}{counts}    {hint}");
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
            let style = if seg.polished.is_some() {
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::Gray)
            };
            let text = seg.polished.clone().unwrap_or_else(|| seg.raw.clone());
            lines.push(Line::from(vec![
                Span::styled(
                    format!("[{:>4}] ", seg.seg_id),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(text, style),
            ]));
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
            lines.push(Line::from(vec![
                Span::styled(format!("[{id:>4}] "), Style::default().fg(Color::DarkGray)),
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

        let body = Paragraph::new(lines)
            .wrap(Wrap { trim: false })
            .block(Block::default().borders(Borders::ALL).title("transcript"));
        f.render_widget(body, chunks[1]);
    })?;
    Ok(())
}
