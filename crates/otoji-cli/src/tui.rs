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
use otoji_core::AsrEvent;
use otoji_polish::Polisher;
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
    error: Option<String>,
    closed: bool,
}

pub async fn run(
    mut events: Receiver<AsrEvent>,
    polisher: Arc<dyn Polisher>,
) -> Result<()> {
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
    let mut tick = tokio::time::interval(Duration::from_millis(50));
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
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(3), Constraint::Min(1)])
            .split(area);

        let header = Paragraph::new(Line::from(vec![
            Span::styled(
                "otoji ",
                Style::default()
                    .fg(Color::Magenta)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("· "),
            Span::styled(
                if s.closed { "closed" } else { "listening" },
                Style::default().fg(if s.closed { Color::Red } else { Color::Green }),
            ),
            Span::raw(format!(
                " · {} final · {} partial",
                s.finals.len(),
                s.partial.is_some() as usize,
            )),
            Span::raw("    "),
            Span::styled(
                "(q/esc to quit)",
                Style::default().fg(Color::DarkGray),
            ),
        ]))
        .block(Block::default().borders(Borders::ALL).title("音字"));
        f.render_widget(header, chunks[0]);

        let mut lines: Vec<Line> = Vec::new();
        for seg in s.finals.values() {
            let style = if seg.polished.is_some() {
                Style::default().fg(Color::White).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::Gray)
            };
            let text = seg.polished.clone().unwrap_or_else(|| seg.raw.clone());
            lines.push(Line::from(vec![
                Span::styled(format!("[{:>4}] ", seg.seg_id), Style::default().fg(Color::DarkGray)),
                Span::styled(text, style),
            ]));
        }
        if let Some((id, partial)) = &s.partial {
            lines.push(Line::from(vec![
                Span::styled(format!("[{id:>4}] "), Style::default().fg(Color::DarkGray)),
                Span::styled(
                    format!("░ {partial}"),
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::ITALIC),
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
