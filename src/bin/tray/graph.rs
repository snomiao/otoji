// The tray's pipeline, described by `<data>/pipeline.otoji` (see
// docs/11-pipeline-language.md). The file is the source of truth: the menu
// shows its lines verbatim with a live `# <state> <detail>` status per node,
// clicking a row turns that node on/off (rewriting the file), and saving the
// file in an editor applies it.
//
// Parsing is lenient: a line with a syntax error or an unknown input shows
// `! <reason>` in its row and is left out; the rest of the graph keeps running.
//
// Runtime v1 runs a fixed topology — mic → stt → {overlay, polish ∥
// translate, append} — and maps each line onto it by node kind. Wiring other
// than that is accepted by the parser but not executed (reported as `!`).

use super::overlay;
use otoji::pipeline::{Activity, Head, Line, NodeState, NodeStatus, Pipeline};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use otoji::pipeline::DEFAULT_PIPELINE;

pub fn path() -> std::path::PathBuf {
    otoji::notes::data_dir().join("pipeline.otoji")
}

/// Node kinds runtime v1 can run.
const KINDS: &[&str] = &["mic", "vad", "stt", "overlay", "polish", "translate", "append", "llm"];

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
    vad_speech: bool,
    vad_segments: u64,
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
            vad_speech: false,
            vad_segments: 0,
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
        // Lenient: a broken line shows as `!` in the menu; the rest runs.
        s.pipeline = Pipeline::parse_lenient(&text);
        s.error = None;
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
        s.vad_speech = false;
        s.vad_segments = 0;
    });
}

pub fn on_vad(speech: bool) {
    with(|s| {
        if speech && !s.vad_speech {
            s.vad_segments += 1;
        }
        s.vad_speech = speech;
    });
}

/// `3s`, `1.5s`, `300ms` or a bare number of ms → milliseconds.
fn parse_ms(v: &str) -> Option<u64> {
    if let Some(n) = v.strip_suffix("ms") {
        n.parse().ok()
    } else if let Some(n) = v.strip_suffix('s') {
        n.parse::<f64>().ok().map(|f| (f * 1000.0).round() as u64)
    } else {
        v.parse().ok()
    }
}

/// Environment for the `otoji listen` child from the `vad` line:
/// `silence=` (end-of-speech pause), `max=` (longest chunk), `threshold=`
/// (energy level). Err names the first bad argument.
fn vad_env_of(args: &[String]) -> Result<Vec<(String, String)>, String> {
    let mut env = Vec::new();
    for a in args {
        let Some((k, v)) = a.split_once('=') else {
            return Err(format!("unexpected word `{a}` (want silence=, max=, threshold=)"));
        };
        let bad = || format!("bad value `{a}`");
        match k {
            "silence" => env.push(("OTOJI_VAD_SILENCE_MS".into(), parse_ms(v).ok_or_else(bad)?.to_string())),
            "max" => env.push(("OTOJI_VAD_MAX_MS".into(), parse_ms(v).ok_or_else(bad)?.to_string())),
            "threshold" => {
                v.parse::<f32>().map_err(|_| bad())?;
                env.push(("OTOJI_VAD_THRESHOLD".into(), v.to_string()));
            }
            _ => return Err(format!("unknown vad option `{k}`")),
        }
    }
    Ok(env)
}

/// The listen child's environment for the current pipeline (sorted, so it
/// can be compared to restart listen when it changes).
pub fn listen_env() -> Vec<(String, String)> {
    let mut env = enabled_node(&pipeline(), "vad")
        .and_then(|(_, args)| vad_env_of(&args).ok())
        .unwrap_or_default();
    env.sort();
    env
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
    if let Some((id, _)) = polish {
        spawn_llm(Job::Polish, model_words(&p, &id), text.clone());
    }
    if let Some((id, args)) = translate {
        let lang = args.first().cloned().unwrap_or_else(|| "en".into());
        spawn_llm(Job::Translate(lang), model_words(&p, &id), text);
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

/// A resolved LLM: the client, a short label for the menu, and — for an
/// Ollama server — (base URL, model) to health-check.
#[derive(Clone)]
struct Llm {
    polisher: Arc<dyn otoji::polish::Polisher>,
    label: String,
    probe: Option<(String, String)>,
}
type Resolved = Result<Llm, String>;

const PROVIDERS: &[&str] = &["auto", "openai", "ollama", "local", "gemini", "anthropic"];
const OPENAI_URL: &str = "https://api.openai.com/v1";

fn env_key(k: &str) -> Option<String> {
    std::env::var(k).ok().filter(|v| !v.trim().is_empty())
}

fn host_of(url: &str) -> &str {
    url.split("://").nth(1).unwrap_or(url).split('/').next().unwrap_or(url)
}

/// Resolve the words of an `llm` line (or a polish/translate model word):
///
/// - `<provider> [url] [key=…] [model]` with provider `openai` (default URL
///   api.openai.com, OPENAI_API_KEY), `ollama` (= openai at
///   http://localhost:11434/v1, no key), `gemini`, `anthropic`, or `auto`
///   (first cloud key: gemini → openai → anthropic; never the local GPU).
///   A word starting with `http(s)://` is the base URL; `key=$VAR` reads the
///   key from the environment / `<data>/.env` (`key=literal` also works);
///   the remaining word is the model.
/// - a bare model word, routed by spelling: `gemini-*`, `gpt-*`/`o1*`/`o3*`/
///   `o4*`, `claude-*`, anything else (Ollama's `name:tag`) → ollama;
///   `provider/model` forces the provider.
fn resolve_llm(words: &[String]) -> Resolved {
    use otoji::polish::{AnthropicPolisher, GeminiPolisher, OpenAiPolisher};
    let words: Vec<String> = words.iter().map(|w| w.trim_matches('"').to_string()).collect();
    let first = words.first().map(String::as_str).unwrap_or("auto");
    if !PROVIDERS.contains(&first) {
        // A single model word.
        let route = |p: &str, m: &str| resolve_llm(&[p.to_string(), m.to_string()]);
        if let Some((p, m)) = first.split_once('/').filter(|(p, _)| PROVIDERS.contains(p)) {
            return route(p, m);
        }
        return match first {
            m if m.starts_with("gemini-") => route("gemini", m),
            m if m.starts_with("gpt-") || ["o1", "o3", "o4"].iter().any(|p| m.starts_with(p)) => {
                route("openai", m)
            }
            m if m.starts_with("claude-") => route("anthropic", m),
            m => route("ollama", m),
        };
    }
    let (mut url, mut key, mut model) = (None::<String>, None::<String>, None::<String>);
    for w in &words[1..] {
        if w.starts_with("http://") || w.starts_with("https://") {
            url = Some(w.trim_end_matches('/').to_string());
        } else if let Some(k) = w.strip_prefix("key=") {
            key = Some(match k.strip_prefix('$') {
                Some(var) => env_key(var).ok_or_else(|| format!("needs {var}: add it to otoji/.env"))?,
                None => k.to_string(),
            });
        } else if model.is_none() {
            model = Some(w.clone());
        } else {
            return Err(format!("unexpected word `{w}`"));
        }
    }
    let need = |k: &str| env_key(k).ok_or_else(|| format!("needs {k}: add it to otoji/.env"));
    let no_url = |p: &str| match &url {
        Some(_) => Err(format!("`{p}` takes no URL")),
        None => Ok(()),
    };
    match first {
        "auto" => ["gemini", "openai", "anthropic"]
            .iter()
            .find_map(|p| resolve_llm(&[p.to_string()]).ok())
            .ok_or_else(|| "needs an LLM API key: add OPENAI_API_KEY=… (or GEMINI_/ANTHROPIC_) to otoji/.env".into()),
        "openai" => {
            let base = url.clone().unwrap_or_else(|| OPENAI_URL.into());
            let official = base == OPENAI_URL;
            // Custom OpenAI-compatible servers may need no key.
            let key = match key {
                Some(k) => k,
                None if official => need("OPENAI_API_KEY")?,
                None => String::new(),
            };
            let m = match model {
                Some(m) => m,
                None if official => env_key("OTOJI_OPENAI_MODEL").unwrap_or_else(|| "gpt-4.1-mini".into()),
                None => return Err(format!("needs a model name for {}", host_of(&base))),
            };
            let label = if official { m.clone() } else { format!("{m} @ {}", host_of(&base)) };
            Ok(Llm { polisher: Arc::new(OpenAiPolisher::new(base, key, m)), label, probe: None })
        }
        "ollama" | "local" => {
            let base = url
                .or_else(|| env_key("OTOJI_POLISH_BASE_URL"))
                .unwrap_or_else(|| "http://localhost:11434/v1".into());
            let m = model.or_else(|| env_key("OTOJI_POLISH_MODEL")).unwrap_or_else(|| "gemma3:4b".into());
            let host = host_of(&base);
            let label = if host.starts_with("localhost") || host.starts_with("127.") {
                format!("{m} (local GPU)")
            } else {
                format!("{m} @ {host}")
            };
            let p = OpenAiPolisher::new(base.clone(), key.unwrap_or_default(), m.clone());
            Ok(Llm { polisher: Arc::new(p), label, probe: Some((base, m)) })
        }
        "gemini" => {
            no_url("gemini")?;
            let m = model.unwrap_or_else(|| "gemini-2.5-flash-lite".into());
            let k = key.map(Ok).unwrap_or_else(|| need("GEMINI_API_KEY"))?;
            Ok(Llm { polisher: Arc::new(GeminiPolisher::new(k, m.clone())), label: m, probe: None })
        }
        "anthropic" => {
            no_url("anthropic")?;
            let m = model.unwrap_or_else(|| "claude-haiku-4-5".into());
            let k = key.map(Ok).unwrap_or_else(|| need("ANTHROPIC_API_KEY"))?;
            Ok(Llm { polisher: Arc::new(AnthropicPolisher::new(k, m.clone())), label: m, probe: None })
        }
        _ => unreachable!(),
    }
}

/// [`resolve_llm`], cached by its words: the menu refreshes 10×/s and building
/// an HTTP client each time would be wasteful. Keys only change on restart.
fn resolve_cached(words: &[String]) -> Resolved {
    static CACHE: Mutex<Option<HashMap<String, Resolved>>> = Mutex::new(None);
    let mut g = CACHE.lock().unwrap();
    g.get_or_insert_with(HashMap::new)
        .entry(words.join(" "))
        .or_insert_with(|| resolve_llm(words))
        .clone()
}

/// For a local (Ollama) model: whether the server runs and has the model.
/// Probed in the background every 30 s (a cheap HTTP call; it never loads
/// the model onto the GPU). Cloud models → ready.
fn ollama_check(probe: &Option<(String, String)>) -> (NodeState, Option<String>) {
    let Some((base, model)) = probe.clone() else {
        return (NodeState::Idle, None);
    };
    static PROBES: Mutex<Option<HashMap<String, (Instant, Option<Result<Vec<String>, String>>)>>> = Mutex::new(None);
    let key = base.clone();
    let (stale, result) = {
        let mut g = PROBES.lock().unwrap();
        let m = g.get_or_insert_with(HashMap::new);
        let e = m.entry(key.clone()).or_insert((Instant::now() - Duration::from_secs(3600), None));
        let stale = e.0.elapsed() > Duration::from_secs(30);
        if stale {
            e.0 = Instant::now();
        }
        (stale, e.1.clone())
    };
    if stale {
        runtime().spawn(async move {
            let url = format!("{base}/models");
            let res = async {
                let r = reqwest::Client::new()
                    .get(&url)
                    .timeout(Duration::from_secs(2))
                    .send()
                    .await
                    .map_err(|_| format!("ollama not running at {}", base.trim_end_matches("/v1")))?;
                let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
                Ok(v["data"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|m| m["id"].as_str().map(String::from)).collect())
                    .unwrap_or_default())
            }
            .await;
            if let Some(m) = PROBES.lock().unwrap().as_mut() {
                if let Some(e) = m.get_mut(&key) {
                    e.1 = Some(res);
                }
            }
        });
    }
    match result {
        None => (NodeState::Loading, Some("checking ollama".into())),
        Some(Err(e)) => (NodeState::Error, Some(e)),
        Some(Ok(models)) => {
            // Ollama lists `name:tag`; a bare name means `:latest`.
            let want = if model.contains(':') { model.clone() } else { format!("{model}:latest") };
            if models.iter().any(|m| *m == want || *m == model) {
                (NodeState::Idle, Some("ready".into()))
            } else {
                (NodeState::NeedsUser, Some(format!("run: ollama pull {model}")))
            }
        }
    }
}

/// The LLM words a polish/translate node uses: its own model word
/// (`polish <model>`, `translate <lang> <model>`), else its `llm`
/// environment node's words (implicit: the first enabled `llm` line), else
/// `auto`.
fn model_words(p: &Pipeline, id: &str) -> Vec<String> {
    let auto = || vec!["auto".to_string()];
    let Some(n) = p.nodes().find(|n| n.id == id) else { return auto() };
    let own = if n.kind == "translate" { 1 } else { 0 };
    if let Some(m) = n.args.get(own) {
        return vec![m.clone()];
    }
    let llm = p.effective_inputs().get(id).and_then(|refs| {
        refs.iter().find_map(|(r, _)| p.nodes().find(|m| m.id == r.node && m.kind == "llm"))
    });
    match llm {
        Some(l) if !l.args.is_empty() => l.args.clone(),
        _ => auto(),
    }
}

fn spawn_llm(job: Job, words: Vec<String>, text: String) {
    let Ok(Llm { polisher: p, .. }) = resolve_cached(&words) else {
        return; // the status row shows why (`?` missing key, `!` bad spec)
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

/// Busy share shown only by the flashing symbol (duty cycle), no number.
fn duty(a: &mut Activity, now: Instant, busy: NodeState) -> NodeState {
    a.state_at(now, busy).0
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
                        let state = duty(&mut s.stt, now, NodeState::Chunk);
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
                    "vad" if !n.enabled => NodeState::Off,
                    "vad" => match vad_env_of(&n.args) {
                        Err(e) => {
                            detail.push(e);
                            NodeState::Error
                        }
                        Ok(_) if !listening => {
                            detail.push("stopped".into());
                            NodeState::Idle
                        }
                        Ok(_) => {
                            detail.push(format!(
                                "{} · {} segment{}",
                                if s.vad_speech { "speech" } else { "silence" },
                                s.vad_segments,
                                if s.vad_segments == 1 { "" } else { "s" }
                            ));
                            if s.vad_speech { NodeState::Streaming } else { NodeState::Idle }
                        }
                    },
                    "llm" => {
                        let words = if n.args.is_empty() { vec!["auto".to_string()] } else { n.args.clone() };
                        let users: Vec<String> = p
                            .effective_inputs()
                            .iter()
                            .filter(|(_, refs)| refs.iter().any(|(r, _)| r.node == n.id))
                            .filter(|(id, _)| p.nodes().any(|m| m.id == **id && m.enabled))
                            .map(|(id, _)| id.clone())
                            .collect();
                        if !n.enabled {
                            NodeState::Off
                        } else {
                            match resolve_cached(&words) {
                                Err(why) => {
                                    let st = if why.starts_with("needs") { NodeState::NeedsUser } else { NodeState::Error };
                                    detail.push(why);
                                    st
                                }
                                Ok(Llm { label, probe, .. }) => {
                                    let (st, note) = ollama_check(&probe);
                                    detail.push(label);
                                    if let Some(note) = note {
                                        detail.push(note);
                                    }
                                    if !users.is_empty() {
                                        detail.push(format!("for {}", users.join(", ")));
                                    }
                                    st
                                }
                            }
                        }
                    }
                    "overlay" => {
                        detail.push("captions on screen".into());
                        if st.live { NodeState::Streaming } else { NodeState::Idle }
                    }
                    "polish" | "translate" => {
                        let is_polish = n.kind == "polish";
                        let (err, done, last) = if is_polish {
                            (&s.polish_err, s.polish_done, &s.polish_last)
                        } else {
                            (&s.translate_err, s.translate_done, &s.translate_last)
                        };
                        let resolved = resolve_cached(&model_words(&p, &n.id));
                        if !n.enabled {
                            NodeState::Off
                        } else if let Err(why) = &resolved {
                            let missing_key = why.starts_with("needs");
                            detail.push(why.clone());
                            if missing_key { NodeState::NeedsUser } else { NodeState::Error }
                        } else if let Some(e) = err.clone() {
                            detail.push(short(&e, 40));
                            NodeState::Error
                        } else {
                            let a = if is_polish { &mut s.polish } else { &mut s.translate };
                            let state = duty(a, now, NodeState::Chunk);
                            if let Ok(l) = &resolved {
                                detail.push(l.label.clone());
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
        Head::Source => return kind == "mic" || kind == "llm",
        Head::Previous => return kind != "mic",
        Head::Refs(r) => r.iter().map(|r| r.node.clone()).collect(),
    };
    let kind_of = |id: &str| p.nodes().find(|n| n.id == id).map(|n| n.kind.clone());
    match kind {
        "mic" | "llm" => false,
        "vad" => inputs.iter().all(|i| kind_of(i).as_deref() == Some("mic")),
        "stt" => inputs.iter().all(|i| matches!(kind_of(i).as_deref(), Some("mic") | Some("vad"))),
        // polish/translate may also name their `llm` environment.
        _ => inputs.iter().all(|i| matches!(kind_of(i).as_deref(), Some("stt") | Some("llm"))),
    }
}

/// Menu rows: (text, node id if the row is a node line). Comment lines are
/// shown too (as plain rows); blank lines are dropped.
pub fn rows(mic_authorized: bool) -> Vec<(String, Option<String>)> {
    let p = pipeline();
    let rendered = p.render_with_status(&statuses(mic_authorized));
    let mut ids = p.lines.iter().filter_map(|l| match l {
        Line::Node(n) => Some(Some(n.id.clone())),
        Line::Comment(_) | Line::Invalid { .. } => Some(None),
        Line::Blank => None,
    });
    rendered
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| (l.to_string(), ids.next().flatten()))
        .collect()
}
