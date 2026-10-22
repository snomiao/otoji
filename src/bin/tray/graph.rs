// The tray's pipeline, described by `<data>/pipeline.otoji` (see
// docs/11-pipeline-language.md). The file is the source of truth: the menu
// shows its lines verbatim with a live `# <state> <detail>` status per node,
// clicking a row turns that node on/off (rewriting the file), and saving the
// file in an editor applies it.
//
// Runtime v1 runs a fixed topology — mic → stt → {overlay, polish ∥
// translate, append} — and maps each line onto it by node kind. Wiring other
// than that is accepted by the parser but not executed (reported as `!`).

use super::overlay;
use otoji::pipeline::{Activity, Head, Line, NodeState, NodeStatus, Pipeline};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

const DEFAULT_PIPELINE: &str = "\
# otoji pipeline: click a row to turn it on/off · docs/11-pipeline-language.md
.            mic  mic default
|mic>        stt  stt sensevoice
|stt>        cap  overlay
#|stt.final> pol  polish auto
#|stt.final> tr   translate en
#|stt.final> log  append transcripts/$date.stt
";

pub fn path() -> std::path::PathBuf {
    otoji::notes::data_dir().join("pipeline.otoji")
}

/// Node kinds runtime v1 can run.
const KINDS: &[&str] = &["mic", "stt", "overlay", "polish", "translate", "append"];

struct State {
    pipeline: Pipeline,
    /// Parse error of the file on disk (the last good pipeline stays active).
    error: Option<String>,
    mtime: Option<SystemTime>,
    listen_started: Option<Instant>,
    decoded_once: bool,
    stt: Activity,
    polish: Activity,
    translate: Activity,
    polish_done: u64,
    translate_done: u64,
    polish_last: String,
    translate_last: String,
    polish_err: Option<String>,
    translate_err: Option<String>,
    appended: u64,
    append_err: Option<String>,
    levels: VecDeque<u32>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

fn with<R>(f: impl FnOnce(&mut State) -> R) -> R {
    let mut g = STATE.lock().unwrap();
    let s = g.get_or_insert_with(|| {
        let w = Duration::from_secs(1);
        State {
            pipeline: Pipeline::parse(DEFAULT_PIPELINE).expect("default pipeline parses"),
            error: None,
            mtime: None,
            listen_started: None,
            decoded_once: false,
            stt: Activity::new(w),
            polish: Activity::new(w),
            translate: Activity::new(w),
            polish_done: 0,
            translate_done: 0,
            polish_last: String::new(),
            translate_last: String::new(),
            polish_err: None,
            translate_err: None,
            appended: 0,
            append_err: None,
            levels: VecDeque::new(),
        }
    });
    f(s)
}

/// The first enabled node of `kind`, if any: (id, args).
fn enabled_node(p: &Pipeline, kind: &str) -> Option<(String, Vec<String>)> {
    p.nodes()
        .find(|n| n.enabled && n.kind == kind)
        .map(|n| (n.id.clone(), n.args.iter().map(|a| a.trim_matches('"').to_string()).collect()))
}

pub fn pipeline() -> Pipeline {
    with(|s| s.pipeline.clone())
}

pub fn error() -> Option<String> {
    with(|s| s.error.clone())
}

/// Load the file (writing the default first if it doesn't exist). Returns
/// true when the active pipeline or its error changed.
pub fn reload() -> bool {
    let p = path();
    if !p.exists() {
        let _ = std::fs::create_dir_all(otoji::notes::data_dir());
        let _ = std::fs::write(&p, DEFAULT_PIPELINE);
    }
    let mtime = std::fs::metadata(&p).and_then(|m| m.modified()).ok();
    if with(|s| s.mtime == mtime && mtime.is_some()) {
        return false;
    }
    let text = std::fs::read_to_string(&p).unwrap_or_default();
    with(|s| {
        s.mtime = mtime;
        match Pipeline::parse(&text) {
            Ok(pl) => {
                s.pipeline = pl;
                s.error = None;
            }
            Err(e) => s.error = Some(e.to_string()),
        }
    });
    eprintln!("otoji-tray: pipeline loaded from {}", p.display());
    true
}

/// Called every tick: pick up edits saved from an editor.
pub fn poll_file() -> bool {
    reload()
}

fn save(p: &Pipeline) {
    let path = path();
    if let Err(e) = std::fs::write(&path, p.format()) {
        eprintln!("otoji-tray: cannot write {}: {e}", path.display());
    }
    let mtime = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
    with(|s| {
        s.pipeline = p.clone();
        s.error = None;
        s.mtime = mtime;
    });
}

/// Turn node `id` on/off and persist it.
pub fn set_enabled(id: &str, on: bool) {
    let mut p = pipeline();
    if p.set_enabled(id, on) {
        save(&p);
        eprintln!("otoji-tray: pipeline node {id} {}", if on { "on" } else { "off" });
    }
}

pub fn toggle(id: &str) {
    let on = pipeline().nodes().any(|n| n.id == id && n.enabled);
    set_enabled(id, !on);
}

/// Whether the pipeline wants the mic + STT (the listen child) running.
pub fn wants_listen() -> bool {
    let p = pipeline();
    enabled_node(&p, "mic").is_some() && enabled_node(&p, "stt").is_some()
}

/// The on/off hotkey: flip the mic line (and so listening).
pub fn toggle_mic() {
    let p = pipeline();
    let mic = p.nodes().find(|n| n.kind == "mic").map(|n| (n.id.clone(), n.enabled));
    if let Some((id, on)) = mic {
        set_enabled(&id, !on);
    }
}

pub fn overlay_enabled() -> bool {
    enabled_node(&pipeline(), "overlay").is_some()
}

// ── events from the listen child (reader thread) ─────────────────────────

pub fn on_listen_started() {
    with(|s| {
        s.listen_started = Some(Instant::now());
        s.decoded_once = false;
    });
}

pub fn on_decode(ms: u64) {
    let now = Instant::now();
    with(|s| {
        s.decoded_once = true;
        s.stt.record(now - Duration::from_millis(ms), now);
    });
}

/// A final sentence: fan out to polish ∥ translate, and append.
pub fn on_final(text: &str) {
    let p = pipeline();
    if let Some((_, args)) = enabled_node(&p, "append") {
        append_line(args.first().map(String::as_str).unwrap_or("transcripts/$date.stt"), text);
    }
    let polish = enabled_node(&p, "polish");
    let translate = enabled_node(&p, "translate");
    if polish.is_none() && translate.is_none() {
        return;
    }
    let text = text.to_string();
    if let Some((_, args)) = polish {
        let provider = args.first().cloned().unwrap_or_else(|| "auto".into());
        spawn_llm(Job::Polish, provider, text.clone());
    }
    if let Some((_, args)) = translate {
        let lang = args.first().cloned().unwrap_or_else(|| "en".into());
        let provider = args.get(1).cloned().unwrap_or_else(|| "auto".into());
        spawn_llm(Job::Translate(lang), provider, text);
    }
}

fn append_line(target: &str, text: &str) {
    let now = chrono::Local::now();
    let vars = HashMap::from([
        ("date", now.format("%Y-%m-%d").to_string()),
        ("time", now.format("%H%M%S").to_string()),
    ]);
    let rel = otoji::pipeline::expand_vars(target, &vars);
    let path = otoji::notes::data_dir().join(rel);
    let res = (|| -> std::io::Result<()> {
        use std::io::Write;
        if let Some(d) = path.parent() {
            std::fs::create_dir_all(d)?;
        }
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open(&path)?;
        writeln!(f, "{}\t{}", now.format("%H:%M:%S"), text)
    })();
    with(|s| match res {
        Ok(()) => {
            s.appended += 1;
            s.append_err = None;
        }
        Err(e) => s.append_err = Some(e.to_string()),
    });
}

// ── polish ∥ translate (LLM calls on a small shared runtime) ─────────────

enum Job {
    Polish,
    Translate(String),
}

fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: std::sync::OnceLock<tokio::runtime::Runtime> = std::sync::OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
}

/// Build a polisher for a provider name. Cloud providers need their key in
/// the environment or `<data>/.env`; `None` when it is missing.
/// - `gemini` / `anthropic`: their own clients (GEMINI_API_KEY / ANTHROPIC_API_KEY)
/// - `openai`: api.openai.com with OPENAI_API_KEY (model: OTOJI_OPENAI_MODEL,
///   default gpt-4.1-mini)
/// - `ollama`: the local OpenAI-compatible server (OTOJI_POLISH_BASE_URL,
///   default localhost:11434). Explicit only — it runs the model on this
///   Mac's GPU, so `auto` never picks it.
/// - `auto`: gemini → openai → anthropic.
fn polisher(provider: &str) -> Option<Arc<dyn otoji::polish::Polisher>> {
    use otoji::polish::{AnthropicPolisher, GeminiPolisher, OpenAiPolisher, Polisher};
    let key = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    let gemini = || {
        key("GEMINI_API_KEY")?;
        GeminiPolisher::from_env().ok().map(|p| Arc::new(p) as Arc<dyn Polisher>)
    };
    let anthropic = || {
        key("ANTHROPIC_API_KEY")?;
        AnthropicPolisher::from_env().ok().map(|p| Arc::new(p) as Arc<dyn Polisher>)
    };
    let openai = || {
        let k = key("OPENAI_API_KEY")?;
        let model = key("OTOJI_OPENAI_MODEL").unwrap_or_else(|| "gpt-4.1-mini".into());
        Some(Arc::new(OpenAiPolisher::new("https://api.openai.com/v1", k, model)) as Arc<dyn Polisher>)
    };
    let ollama = || {
        let mut p = OpenAiPolisher::from_env().ok()?;
        if p.model.is_empty() {
            p.model = key("OTOJI_POLISH_MODEL").unwrap_or_else(|| "gemma3:4b".into());
        }
        Some(Arc::new(p) as Arc<dyn Polisher>)
    };
    match provider {
        "gemini" => gemini(),
        "openai" => openai(),
        "anthropic" => anthropic(),
        "ollama" | "local" => ollama(),
        _ => gemini().or_else(openai).or_else(anthropic),
    }
}

pub fn has_llm_key(provider: &str) -> bool {
    polisher(provider).is_some()
}

fn spawn_llm(job: Job, provider: String, text: String) {
    let Some(p) = polisher(&provider) else {
        return; // status shows "? needs an LLM API key"
    };
    let is_polish = matches!(job, Job::Polish);
    with(|s| {
        let a = if is_polish { &mut s.polish } else { &mut s.translate };
        a.begin(Instant::now());
    });
    runtime().spawn(async move {
        let to = match &job {
            Job::Polish => None,
            Job::Translate(lang) => Some(lang.as_str()),
        };
        let input = otoji::polish::PolishInput {
            text: &text,
            prev: None,
            audio: None,
            context: None,
            translate_to: to,
        };
        let res = match &job {
            Job::Polish => p.polish(input).await.map(|t| (t, None)),
            Job::Translate(_) => p.polish_full(input).await.map(|o| (o.original, o.translated)),
        };
        let now = Instant::now();
        with(|s| {
            if is_polish {
                s.polish.end(now);
                match &res {
                    Ok((t, _)) => {
                        s.polish_done += 1;
                        s.polish_last = t.clone();
                        s.polish_err = None;
                    }
                    Err(e) => s.polish_err = Some(e.to_string()),
                }
            } else {
                s.translate.end(now);
                match &res {
                    Ok((_, Some(t))) => {
                        s.translate_done += 1;
                        s.translate_last = t.clone();
                        s.translate_err = None;
                    }
                    Ok((_, None)) => s.translate_err = Some("no translation returned".into()),
                    Err(e) => s.translate_err = Some(e.to_string()),
                }
            }
        });
        match res {
            Ok((t, None)) if is_polish => overlay::notify(&t),
            Ok((orig, Some(tr))) => overlay::notify(&format!("{orig}\n{tr}")),
            _ => {}
        }
    });
}

// ── status rendering ─────────────────────────────────────────────────────

fn sparkline(levels: &VecDeque<u32>) -> String {
    levels
        .iter()
        .map(|&p| match p {
            0..=150 => '▁',
            151..=600 => '▂',
            601..=1500 => '▃',
            1501..=4000 => '▅',
            4001..=10000 => '▆',
            _ => '▇',
        })
        .collect()
}

fn short(s: &str, max: usize) -> String {
    let one_line = s.replace('\n', " ");
    let chars: Vec<char> = one_line.chars().collect();
    if chars.len() <= max {
        one_line
    } else {
        chars[..max.saturating_sub(1)].iter().collect::<String>() + "…"
    }
}

/// Sample the mic level (called every tick) for the sparkline.
pub fn sample_level() {
    let lvl = overlay::stats().mic_level;
    with(|s| {
        s.levels.push_back(lvl);
        while s.levels.len() > 12 {
            s.levels.pop_front();
        }
    });
}

fn duty(a: &mut Activity, now: Instant, busy: NodeState) -> (NodeState, String) {
    let (st, frac) = a.state_at(now, busy);
    let pct = (frac * 100.0).round() as u32;
    (st, if pct > 0 { format!("{pct}% busy") } else { String::new() })
}

/// Live status of every node, keyed by id.
pub fn statuses(mic_authorized: bool) -> HashMap<String, NodeStatus> {
    let p = pipeline();
    let st = overlay::stats();
    let listening = overlay::is_listening();
    let now = Instant::now();
    let mut out = HashMap::new();
    with(|s| {
        for n in p.nodes() {
            let mut detail = Vec::<String>::new();
            let state = if !KINDS.contains(&n.kind.as_str()) {
                detail.push(format!("unknown kind `{}`", n.kind));
                NodeState::Error
            } else {
                match n.kind.as_str() {
                    "mic" if !mic_authorized => {
                        detail.push("needs microphone permission".into());
                        NodeState::NeedsUser
                    }
                    "mic" if listening => {
                        let secs = st.mic_bytes / 32_000;
                        detail.push(sparkline(&s.levels));
                        detail.push(format!("{}:{:02}", secs / 60, secs % 60));
                        NodeState::Streaming
                    }
                    "mic" | "stt" if !listening => {
                        detail.push(if wants_listen_of(&p) { "starting…" } else { "stopped" }.into());
                        NodeState::Idle
                    }
                    "stt" if !s.decoded_once
                        && s.listen_started.is_some_and(|t| t.elapsed() < Duration::from_secs(20)) =>
                    {
                        detail.push("loading model".into());
                        NodeState::Loading
                    }
                    "stt" => {
                        let (state, busy) = duty(&mut s.stt, now, NodeState::Chunk);
                        if !busy.is_empty() {
                            detail.push(busy);
                        }
                        detail.push(format!(
                            "{} sentence{} · {} chars",
                            st.finals,
                            if st.finals == 1 { "" } else { "s" },
                            st.chars
                        ));
                        if !st.text.is_empty() {
                            let what = if st.live { "hearing" } else { "last" };
                            detail.push(format!("{what} “{}”", short(&st.text, 28)));
                        }
                        state
                    }
                    "overlay" => {
                        detail.push("captions on screen".into());
                        if st.live { NodeState::Streaming } else { NodeState::Idle }
                    }
                    "polish" | "translate" => {
                        let is_polish = n.kind == "polish";
                        let provider = if is_polish { n.args.first() } else { n.args.get(1) };
                        let provider = provider.map(|p| p.trim_matches('"')).unwrap_or("auto");
                        let (err, done, last) = if is_polish {
                            (&s.polish_err, s.polish_done, &s.polish_last)
                        } else {
                            (&s.translate_err, s.translate_done, &s.translate_last)
                        };
                        if !n.enabled {
                            NodeState::Off
                        } else if !has_llm_key(provider) {
                            detail.push("needs an LLM API key: add GEMINI_API_KEY=… to otoji/.env".into());
                            NodeState::NeedsUser
                        } else if let Some(e) = err.clone() {
                            detail.push(short(&e, 40));
                            NodeState::Error
                        } else {
                            let a = if is_polish { &mut s.polish } else { &mut s.translate };
                            let (state, busy) = duty(a, now, NodeState::Chunk);
                            if !busy.is_empty() {
                                detail.push(busy);
                            }
                            detail.push(format!("{done} done"));
                            if !last.is_empty() {
                                detail.push(format!("“{}”", short(last, 24)));
                            }
                            state
                        }
                    }
                    "append" => {
                        if let Some(e) = &s.append_err {
                            detail.push(short(e, 40));
                            NodeState::Error
                        } else {
                            detail.push(format!("{} line{}", s.appended, if s.appended == 1 { "" } else { "s" }));
                            NodeState::Idle
                        }
                    }
                    _ => NodeState::Idle,
                }
            };
            // Wiring the v1 runtime doesn't execute is flagged, not hidden.
            if state != NodeState::Error && !wiring_supported(&p, &n.kind, &n.head) {
                detail.push("(input wiring not run by v1 runtime)".into());
            }
            out.insert(n.id.clone(), NodeStatus { state, detail: detail.join(" · ") });
        }
    });
    out
}

fn wants_listen_of(p: &Pipeline) -> bool {
    enabled_node(p, "mic").is_some() && enabled_node(p, "stt").is_some()
}

/// Runtime v1 topology: mic is a source; everything else reads stt or mic.
fn wiring_supported(p: &Pipeline, kind: &str, head: &Head) -> bool {
    let inputs: Vec<String> = match head {
        Head::Source => return kind == "mic",
        Head::Previous => return kind != "mic",
        Head::Refs(r) => r.iter().map(|r| r.node.clone()).collect(),
    };
    let kind_of = |id: &str| p.nodes().find(|n| n.id == id).map(|n| n.kind.clone());
    match kind {
        "mic" => false,
        "stt" => inputs.iter().all(|i| kind_of(i).as_deref() == Some("mic")),
        _ => inputs.iter().all(|i| kind_of(i).as_deref() == Some("stt")),
    }
}

/// Menu rows: (text, node id if the row is a node line). Comment lines are
/// shown too (as plain rows); blank lines are dropped.
pub fn rows(mic_authorized: bool) -> Vec<(String, Option<String>)> {
    let p = pipeline();
    let rendered = p.render_with_status(&statuses(mic_authorized));
    let mut ids = p.lines.iter().filter_map(|l| match l {
        Line::Node(n) => Some(Some(n.id.clone())),
        Line::Comment(_) => Some(None),
        Line::Blank => None,
    });
    rendered
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| (l.to_string(), ids.next().flatten()))
        .collect()
}
