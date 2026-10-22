//! Line-based pipeline language (`*.otoji`): one node per line.
//!
//! ```text
//! .           mic  mic default
//! |mic>       stt  stt sensevoice vad=3s
//! |stt.final> pol  polish gemini
//! |stt.final> log  append $date.stt
//! #|stt>      dbg  append debug.txt
//! ```
//!
//! - `.` starts a source node (no input); `|refs>` takes input from `refs`
//!   (`|>` = the previous node line). Spaces inside `| … >` are allowed.
//! - `ref` = `id[.port][:policy]`; several refs (`|mic,pc>`) fan in.
//! - After the head: node id, node kind, then arguments (`word`, `key=value`
//!   or `"quoted"`). `@device` places the node on a device.
//! - `#` before the head turns the node off; `# …` after it is a comment.
//! - Live status (`~ - / . ! ?`) is never part of the source: it is rendered
//!   after `# ` by [`render_with_status`], and the formatter strips such
//!   status comments so a line copied out of the menu is valid source.
//!
//! Spec: docs/11-pipeline-language.md.

use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::fmt;

/// One `ref` inside `| … >`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InputRef {
    pub node: String,
    pub port: Option<String>,
    pub policy: Option<String>,
}

impl fmt::Display for InputRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.node)?;
        if let Some(p) = &self.port {
            write!(f, ".{p}")?;
        }
        if let Some(p) = &self.policy {
            write!(f, ":{p}")?;
        }
        Ok(())
    }
}

/// Where a node's input comes from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Head {
    /// `.` — a source node.
    Source,
    /// `|>` — the previous node line.
    Previous,
    /// `|a,b.port>` — explicit references.
    Refs(Vec<InputRef>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeLine {
    pub enabled: bool,
    pub head: Head,
    pub id: String,
    pub kind: String,
    /// Arguments as written (quotes kept so formatting round-trips).
    pub args: Vec<String>,
    /// User comment after the node, without the leading `#`.
    pub comment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Line {
    Blank,
    /// Full-line comment, without the leading `#`.
    Comment(String),
    Node(NodeLine),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pipeline {
    pub lines: Vec<Line>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    /// 1-based line number.
    pub line: usize,
    pub message: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "line {}: {}", self.line, self.message)
    }
}

impl std::error::Error for ParseError {}

/// Live state of a node, rendered as the first character of its status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeState {
    /// `~` processing, streaming (output keeps pace with each frame).
    Streaming,
    /// `/` processing a chunk (a sentence, a request in flight).
    Chunk,
    /// `-` ready, nothing to process.
    Idle,
    /// `.` loading (model, connection, download).
    Loading,
    /// `!` failed; only this node is affected.
    Error,
    /// `?` waiting on the user (permission, API key).
    NeedsUser,
    /// The line is turned off (`#`).
    Off,
}

impl NodeState {
    pub fn symbol(self) -> &'static str {
        match self {
            NodeState::Streaming => "~",
            NodeState::Chunk => "/",
            NodeState::Idle => "-",
            NodeState::Loading => ".",
            NodeState::Error => "!",
            NodeState::NeedsUser => "?",
            NodeState::Off => "off",
        }
    }
}

/// A node's live status: state plus a short human description.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeStatus {
    pub state: NodeState,
    pub detail: String,
}

fn is_id(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

/// A trailing `# …` comment is a rendered status (not user text) when it
/// starts with a status symbol or is exactly `off`.
fn is_status_comment(c: &str) -> bool {
    let c = c.trim();
    c == "off"
        || ["~", "-", "/", ".", "!", "?"]
            .iter()
            .any(|s| c == *s || c.starts_with(&format!("{s} ")))
}

/// Split `s` into whitespace-separated tokens, keeping `"quoted strings"`
/// (with `\"` escapes) intact. Stops at an unquoted `#` that starts a token
/// and returns the rest as the comment.
fn tokenize(s: &str, line: usize) -> Result<(Vec<String>, Option<String>), ParseError> {
    let mut tokens = Vec::new();
    let mut chars = s.char_indices().peekable();
    while let Some(&(i, c)) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }
        if c == '#' {
            return Ok((tokens, Some(s[i + 1..].trim().to_string())));
        }
        let mut tok = String::new();
        let mut quoted = false;
        while let Some(&(_, c)) = chars.peek() {
            if !quoted && c.is_whitespace() {
                break;
            }
            chars.next();
            tok.push(c);
            if c == '\\' && quoted {
                if let Some((_, n)) = chars.next() {
                    tok.push(n);
                }
            } else if c == '"' {
                quoted = !quoted;
            }
        }
        if quoted {
            return Err(ParseError { line, message: format!("unterminated quote in {tok}") });
        }
        tokens.push(tok);
    }
    Ok((tokens, None))
}

fn parse_ref(s: &str, line: usize) -> Result<InputRef, ParseError> {
    let (rest, policy) = match s.split_once(':') {
        Some((r, p)) => (r, Some(p.to_string())),
        None => (s, None),
    };
    let (node, port) = match rest.split_once('.') {
        Some((n, p)) => (n, Some(p.to_string())),
        None => (rest, None),
    };
    let bad = |what: &str| ParseError { line, message: format!("bad {what} in input ref `{s}`") };
    if !is_id(node) {
        return Err(bad("node id"));
    }
    if port.as_deref().is_some_and(|p| !is_id(p)) {
        return Err(bad("port"));
    }
    if policy.as_deref().is_some_and(|p| !is_id(p)) {
        return Err(bad("policy"));
    }
    Ok(InputRef { node: node.to_string(), port, policy })
}

/// Parse a node line body (after an optional leading `#` for "off").
fn parse_node(body: &str, enabled: bool, line: usize) -> Result<NodeLine, ParseError> {
    let body = body.trim_start();
    let (head, rest) = if let Some(rest) = body.strip_prefix('.') {
        (Head::Source, rest)
    } else if let Some(rest) = body.strip_prefix('|') {
        let close = rest.find('>').ok_or(ParseError {
            line,
            message: "`|` without a closing `>`".into(),
        })?;
        let inner = rest[..close].trim();
        let head = if inner.is_empty() {
            Head::Previous
        } else {
            Head::Refs(
                inner
                    .split(',')
                    .map(|r| parse_ref(r.trim(), line))
                    .collect::<Result<_, _>>()?,
            )
        };
        (head, &rest[close + 1..])
    } else {
        unreachable!("caller checks the head");
    };
    let (mut tokens, comment) = tokenize(rest, line)?;
    let comment = comment.filter(|c| !is_status_comment(c));
    if tokens.is_empty() {
        return Err(ParseError { line, message: "missing node id".into() });
    }
    let id = tokens.remove(0);
    if !is_id(&id) {
        return Err(ParseError { line, message: format!("bad node id `{id}`") });
    }
    // A mode/status marker copied from the menu (`mic ~ mic`) is dropped:
    // the mode is derived from the node, never stored.
    if tokens.first().is_some_and(|t| ["~", "-", "/"].contains(&t.as_str())) {
        tokens.remove(0);
    }
    if tokens.is_empty() {
        return Err(ParseError { line, message: format!("node `{id}` has no kind") });
    }
    let kind = tokens.remove(0);
    Ok(NodeLine { enabled, head, id, kind, args: tokens, comment })
}

impl Pipeline {
    pub fn parse(src: &str) -> Result<Pipeline, ParseError> {
        let mut lines = Vec::new();
        for (i, raw) in src.lines().enumerate() {
            let n = i + 1;
            let t = raw.trim();
            if t.is_empty() {
                lines.push(Line::Blank);
            } else if let Some(after) = t.strip_prefix('#') {
                let a = after.trim_start();
                if a.starts_with('.') || a.starts_with('|') {
                    lines.push(Line::Node(parse_node(a, false, n)?));
                } else {
                    lines.push(Line::Comment(after.trim().to_string()));
                }
            } else if t.starts_with('.') || t.starts_with('|') {
                lines.push(Line::Node(parse_node(t, true, n)?));
            } else {
                return Err(ParseError {
                    line: n,
                    message: "a node line starts with `.` or `|…>`".into(),
                });
            }
        }
        let p = Pipeline { lines };
        p.validate()?;
        Ok(p)
    }

    pub fn nodes(&self) -> impl Iterator<Item = &NodeLine> {
        self.lines.iter().filter_map(|l| match l {
            Line::Node(n) => Some(n),
            _ => None,
        })
    }

    /// Resolved inputs per node id: `|>` becomes the previous node line.
    pub fn inputs(&self) -> BTreeMap<String, Vec<InputRef>> {
        let mut out = BTreeMap::new();
        let mut prev: Option<&str> = None;
        for n in self.nodes() {
            let refs = match &n.head {
                Head::Source => vec![],
                Head::Previous => prev
                    .map(|p| vec![InputRef { node: p.to_string(), port: None, policy: None }])
                    .unwrap_or_default(),
                Head::Refs(r) => r.clone(),
            };
            out.insert(n.id.clone(), refs);
            prev = Some(&n.id);
        }
        out
    }

    fn validate(&self) -> Result<(), ParseError> {
        let mut seen: HashMap<&str, usize> = HashMap::new();
        let mut first_node = true;
        for (i, l) in self.lines.iter().enumerate() {
            let Line::Node(n) = l else { continue };
            if let Some(prev) = seen.insert(&n.id, i + 1) {
                return Err(ParseError {
                    line: i + 1,
                    message: format!("duplicate node id `{}` (first on line {prev})", n.id),
                });
            }
            if first_node && n.head == Head::Previous {
                return Err(ParseError { line: i + 1, message: "`|>` with no previous node".into() });
            }
            first_node = false;
        }
        for (i, l) in self.lines.iter().enumerate() {
            let Line::Node(n) = l else { continue };
            if let Head::Refs(refs) = &n.head {
                for r in refs {
                    if !seen.contains_key(r.node.as_str()) {
                        return Err(ParseError {
                            line: i + 1,
                            message: format!("unknown node `{}`", r.node),
                        });
                    }
                    if r.node == n.id {
                        return Err(ParseError {
                            line: i + 1,
                            message: format!("node `{}` takes input from itself", n.id),
                        });
                    }
                }
            }
        }
        Ok(())
    }

    /// Canonical text: `|>` made explicit once the graph branches, columns
    /// aligned per block (blank-line separated), status comments dropped.
    /// Idempotent.
    pub fn format(&self) -> String {
        self.render(None)
    }

    fn head_text(&self, n: &NodeLine, explicit: &BTreeMap<String, Vec<InputRef>>, branching: bool) -> String {
        let head = match &n.head {
            Head::Source => ".".to_string(),
            Head::Previous if !branching => "|>".to_string(),
            Head::Previous | Head::Refs(_) => {
                let refs: Vec<String> = explicit[&n.id].iter().map(|r| r.to_string()).collect();
                format!("|{}>", refs.join(","))
            }
        };
        if n.enabled { head } else { format!("#{head}") }
    }

    fn render(&self, status: Option<&HashMap<String, NodeStatus>>) -> String {
        let inputs = self.inputs();
        // Branching = some node feeds more than one consumer.
        let mut fanout: HashMap<&str, usize> = HashMap::new();
        for refs in inputs.values() {
            for r in refs {
                *fanout.entry(r.node.as_str()).or_default() += 1;
            }
        }
        let branching = fanout.values().any(|&c| c > 1);

        // Pre-render node cells, then pad columns per block.
        struct Cells {
            head: String,
            id: String,
            body: String,
            tail: Option<String>,
        }
        let mut out = String::new();
        let mut block: Vec<Option<Cells>> = Vec::new(); // None = full-line comment
        let mut comments: Vec<String> = Vec::new();
        let flush = |block: &mut Vec<Option<Cells>>, comments: &mut Vec<String>, out: &mut String| {
            let wh = block.iter().flatten().map(|c| c.head.chars().count()).max().unwrap_or(0);
            let wi = block.iter().flatten().map(|c| c.id.chars().count()).max().unwrap_or(0);
            let wb = block
                .iter()
                .flatten()
                .filter(|c| c.tail.is_some())
                .map(|c| c.body.chars().count())
                .max()
                .unwrap_or(0);
            let mut ci = 0;
            for c in block.drain(..) {
                match c {
                    None => {
                        out.push_str(&format!("# {}", comments[ci]).trim_end().to_string());
                        ci += 1;
                    }
                    Some(c) => {
                        let mut line = format!("{:wh$} {:wi$}  {}", c.head, c.id, c.body);
                        if let Some(t) = c.tail {
                            line = format!("{:w$}  # {t}", line, w = wh + wi + wb + 3);
                        }
                        out.push_str(line.trim_end());
                    }
                }
                out.push('\n');
            }
            comments.clear();
        };
        for l in &self.lines {
            match l {
                Line::Blank => {
                    flush(&mut block, &mut comments, &mut out);
                    out.push('\n');
                }
                Line::Comment(c) => {
                    comments.push(c.clone());
                    block.push(None);
                }
                Line::Node(n) => {
                    let mut body = n.kind.clone();
                    for a in &n.args {
                        body.push(' ');
                        body.push_str(a);
                    }
                    let st = status.map(|m| {
                        if !n.enabled {
                            "off".to_string()
                        } else {
                            match m.get(&n.id) {
                                Some(s) if s.detail.is_empty() => s.state.symbol().to_string(),
                                Some(s) => format!("{} {}", s.state.symbol(), s.detail),
                                None => "-".to_string(),
                            }
                        }
                    });
                    // Status replaces the user comment in the rendered view.
                    let tail = st.or_else(|| n.comment.clone().filter(|c| !c.is_empty()));
                    block.push(Some(Cells {
                        head: self.head_text(n, &inputs, branching),
                        id: n.id.clone(),
                        body,
                        tail,
                    }));
                }
            }
        }
        flush(&mut block, &mut comments, &mut out);
        out
    }

    /// The canonical lines with a live `# <symbol> <detail>` status column,
    /// as shown in the tray menu. Parses back to the same pipeline.
    pub fn render_with_status(&self, status: &HashMap<String, NodeStatus>) -> String {
        self.render(Some(status))
    }

    /// Turn a node on or off (the `#` prefix). Returns false if no such id.
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> bool {
        for l in &mut self.lines {
            if let Line::Node(n) = l {
                if n.id == id {
                    n.enabled = enabled;
                    return true;
                }
            }
        }
        false
    }

    /// Convert to the web editor's `VoiceGraph` JSON (web/src/graph/model.ts).
    /// Node `kind` → `type`; `@device` → `device`; `key=value` args →
    /// `config[key]`; other args → `config.args`. Edges use `out` / `in` when
    /// no port is named; `enabled: false` is kept in `config`.
    pub fn to_graph_json(&self) -> Value {
        let inputs = self.inputs();
        let mut nodes = Map::new();
        let mut edges = Vec::new();
        for (row, n) in self.nodes().enumerate() {
            let mut config = Map::new();
            let mut device = Value::Null;
            let mut positional = Vec::new();
            for a in &n.args {
                if let Some(d) = a.strip_prefix('@') {
                    device = json!(d);
                } else if let Some((k, v)) = a.split_once('=').filter(|(k, _)| is_id(k)) {
                    config.insert(k.to_string(), json!(v));
                } else {
                    positional.push(json!(a));
                }
            }
            if !positional.is_empty() {
                config.insert("args".into(), Value::Array(positional));
            }
            if !n.enabled {
                config.insert("enabled".into(), json!(false));
            }
            nodes.insert(
                n.id.clone(),
                json!({
                    "id": n.id,
                    "type": n.kind,
                    "device": device,
                    "pos": { "x": 0, "y": row * 120 },
                    "config": config,
                }),
            );
            for r in &inputs[&n.id] {
                let mut e = json!({
                    "id": format!("{}-{}", r.node, n.id),
                    "source": r.node,
                    "sourceHandle": r.port.as_deref().unwrap_or("out"),
                    "target": n.id,
                    "targetHandle": "in",
                });
                if let Some(p) = &r.policy {
                    e["policy"] = json!(p);
                }
                edges.push(e);
            }
        }
        json!({ "version": 0, "nodes": nodes, "edges": edges })
    }

    /// Inverse of [`to_graph_json`] (comments and blank lines are not kept).
    /// Nodes are ordered so every node comes after its inputs.
    pub fn from_graph_json(v: &Value) -> Result<Pipeline, String> {
        let nodes = v["nodes"].as_object().ok_or("graph has no `nodes` object")?;
        let edges = v["edges"].as_array().cloned().unwrap_or_default();
        let mut ins: BTreeMap<&str, Vec<InputRef>> = BTreeMap::new();
        for e in &edges {
            let (Some(src), Some(dst)) = (e["source"].as_str(), e["target"].as_str()) else {
                return Err("edge without source/target".into());
            };
            let port = e["sourceHandle"].as_str().filter(|p| *p != "out").map(String::from);
            let policy = e["policy"].as_str().map(String::from);
            ins.entry(dst).or_default().push(InputRef { node: src.into(), port, policy });
        }
        // Stable topological order: by original row (pos.y), inputs first.
        let mut order: Vec<&String> = nodes.keys().collect();
        order.sort_by_key(|k| nodes[k.as_str()]["pos"]["y"].as_f64().unwrap_or(0.0) as i64);
        let mut placed: Vec<String> = Vec::new();
        while placed.len() < order.len() {
            let before = placed.len();
            for k in &order {
                if placed.contains(k) {
                    continue;
                }
                let ready = ins
                    .get(k.as_str())
                    .is_none_or(|r| r.iter().all(|r| placed.contains(&r.node)));
                if ready {
                    placed.push((*k).clone());
                }
            }
            if placed.len() == before {
                return Err("graph has a cycle".into());
            }
        }
        let mut lines = Vec::new();
        for id in &placed {
            let n = &nodes[id];
            let cfg = n["config"].as_object().cloned().unwrap_or_default();
            let mut args: Vec<String> = cfg
                .get("args")
                .and_then(|a| a.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            for (k, val) in &cfg {
                if k == "args" || k == "enabled" {
                    continue;
                }
                let val = val.as_str().map(String::from).unwrap_or_else(|| val.to_string());
                args.push(format!("{k}={val}"));
            }
            if let Some(d) = n["device"].as_str() {
                args.push(format!("@{d}"));
            }
            let head = match ins.get(id.as_str()) {
                None => Head::Source,
                Some(r) => Head::Refs(r.clone()),
            };
            lines.push(Line::Node(NodeLine {
                enabled: cfg.get("enabled").and_then(|e| e.as_bool()).unwrap_or(true),
                head,
                id: id.clone(),
                kind: n["type"].as_str().unwrap_or("unknown").to_string(),
                args,
                comment: None,
            }));
        }
        let p = Pipeline { lines };
        p.validate().map_err(|e| e.to_string())?;
        Ok(p)
    }
}

/// Duty-cycle (占空比) activity meter for one node. Busy intervals are
/// recorded as they happen; the display shows the busy share of the last
/// `window` as a steady rhythm — within each `window`-long display period,
/// the busy symbol for the first `fraction` of it and `-` for the rest — so
/// a stage that flickers busy/idle many times a second still reads clearly.
#[derive(Debug, Clone)]
pub struct Activity {
    window: std::time::Duration,
    epoch: std::time::Instant,
    /// Finished busy intervals, oldest first (pruned to the window).
    done: std::collections::VecDeque<(std::time::Instant, std::time::Instant)>,
    busy_since: Option<std::time::Instant>,
}

impl Activity {
    pub fn new(window: std::time::Duration) -> Self {
        Activity {
            window,
            epoch: std::time::Instant::now(),
            done: Default::default(),
            busy_since: None,
        }
    }

    pub fn begin(&mut self, now: std::time::Instant) {
        self.busy_since.get_or_insert(now);
    }

    pub fn end(&mut self, now: std::time::Instant) {
        if let Some(start) = self.busy_since.take() {
            self.record(start, now);
        }
    }

    /// Record a busy interval that already happened (e.g. "decode took 80 ms").
    pub fn record(&mut self, start: std::time::Instant, end: std::time::Instant) {
        self.done.push_back((start, end));
        while self.done.len() > 4096 {
            self.done.pop_front();
        }
    }

    /// Busy share of the last `window` (0.0 ..= 1.0).
    pub fn fraction(&mut self, now: std::time::Instant) -> f32 {
        let from = now.checked_sub(self.window).unwrap_or(self.epoch);
        while self.done.front().is_some_and(|&(_, e)| e <= from) {
            self.done.pop_front();
        }
        let clip = |s: std::time::Instant, e: std::time::Instant| {
            e.min(now).saturating_duration_since(s.max(from))
        };
        let mut busy: std::time::Duration = self.done.iter().map(|&(s, e)| clip(s, e)).sum();
        if let Some(s) = self.busy_since {
            busy += clip(s, now);
        }
        (busy.as_secs_f32() / self.window.as_secs_f32()).min(1.0)
    }

    /// The state to draw at `now`: `busy` for the busy share of each display
    /// period, `Idle` for the rest. Fractions under 1% count as idle.
    pub fn state_at(&mut self, now: std::time::Instant, busy: NodeState) -> (NodeState, f32) {
        let frac = self.fraction(now);
        let period = self.window.as_secs_f32();
        let phase = now.saturating_duration_since(self.epoch).as_secs_f32() % period / period;
        let state = if frac >= 0.01 && phase < frac { busy } else { NodeState::Idle };
        (state, frac)
    }
}

/// Expand `$name` / `${name}` in an argument from `vars`; unknown names are
/// left as written.
pub fn expand_vars(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = String::new();
    let mut rest = arg;
    while let Some(i) = rest.find('$') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let (name, used) = if let Some(b) = after.strip_prefix('{') {
            match b.find('}') {
                Some(j) => (&b[..j], j + 2),
                None => ("", 0),
            }
        } else {
            let j = after
                .find(|c: char| !(c.is_alphanumeric() || c == '_'))
                .unwrap_or(after.len());
            (&after[..j], j)
        };
        match vars.get(name) {
            Some(v) if !name.is_empty() => {
                out.push_str(v);
                rest = &after[used..];
            }
            _ => {
                out.push('$');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
# otoji pipeline
.           mic  mic default
|mic>       stt  stt sensevoice vad=3s
|stt.final> pol  polish gemini
|stt.final> log  append $date.stt  # daily log
#|stt>      dbg  append debug.txt
";

    #[test]
    fn canonical_sample_is_a_fixed_point() {
        let p = Pipeline::parse(SAMPLE).unwrap();
        assert_eq!(p.format(), SAMPLE);
    }

    #[test]
    fn spaces_inside_input_clause_are_accepted() {
        let loose = ". mic mic\n| mic >  stt stt\n|  stt . final : latest > out overlay\n";
        let p = Pipeline::parse(loose);
        // `stt . final` has spaces inside the ref itself: not allowed.
        assert!(p.is_err());
        let loose = ". mic mic\n| mic >  stt stt\n| stt.final:latest , mic > out overlay\n";
        let p = Pipeline::parse(loose).unwrap();
        assert_eq!(
            p.format(),
            ".                      mic  mic\n\
             |mic>                  stt  stt\n\
             |stt.final:latest,mic> out  overlay\n"
        );
    }

    #[test]
    fn previous_line_shorthand() {
        let p = Pipeline::parse(". a mic\n|> b stt\n| > c overlay\n").unwrap();
        let ins = p.inputs();
        assert_eq!(ins["b"][0].node, "a");
        assert_eq!(ins["c"][0].node, "b");
        // Linear chain: `|>` stays short.
        assert_eq!(p.format(), ".  a  mic\n|> b  stt\n|> c  overlay\n");
    }

    #[test]
    fn previous_shorthand_made_explicit_once_branching() {
        let p = Pipeline::parse(". a mic\n|> b stt\n|b> c polish\n|b> d translate en\n").unwrap();
        assert_eq!(
            p.format(),
            ".   a  mic\n|a> b  stt\n|b> c  polish\n|b> d  translate en\n"
        );
    }

    #[test]
    fn status_markers_and_status_comments_are_stripped() {
        // A row copied out of the menu.
        let p = Pipeline::parse(". mic ~ mic default  # ~ ▁▃▇ · 3:42 captured\n").unwrap();
        assert_eq!(p.format(), ". mic  mic default\n");
        let p = Pipeline::parse(". mic mic  # off\n").unwrap();
        assert_eq!(p.format(), ". mic  mic\n");
        // A real comment survives.
        let p = Pipeline::parse(". mic mic  # laptop mic\n").unwrap();
        assert_eq!(p.format(), ". mic  mic  # laptop mic\n");
    }

    #[test]
    fn render_with_status_parses_back() {
        let p = Pipeline::parse(SAMPLE).unwrap();
        let mut st = HashMap::new();
        st.insert("mic".into(), NodeStatus { state: NodeState::Streaming, detail: "▁▃▇ · 3:42".into() });
        st.insert("stt".into(), NodeStatus { state: NodeState::Chunk, detail: "decoding 2.1 s".into() });
        st.insert("pol".into(), NodeStatus { state: NodeState::NeedsUser, detail: "needs API key".into() });
        let shown = p.render_with_status(&st);
        assert!(shown.contains("# ~ ▁▃▇ · 3:42\n"), "{shown}");
        assert!(shown.contains("# / decoding 2.1 s"));
        assert!(shown.contains("# ? needs API key"));
        assert!(shown.contains("# -\n")); // log: no status reported → idle
        assert!(shown.contains("debug.txt       # off\n"), "{shown}");
        let back = Pipeline::parse(&shown).unwrap();
        // Statuses replace user comments in the view, so compare structure.
        let strip = |p: &Pipeline| {
            p.nodes().map(|n| (n.id.clone(), n.kind.clone(), n.args.clone(), n.enabled)).collect::<Vec<_>>()
        };
        assert_eq!(strip(&back), strip(&p));
    }

    #[test]
    fn toggle_writes_hash_prefix() {
        let mut p = Pipeline::parse(SAMPLE).unwrap();
        assert!(p.set_enabled("pol", false));
        assert!(p.format().contains("#|stt.final> pol  polish gemini\n"));
        assert!(p.set_enabled("dbg", true));
        assert!(p.format().contains("\n|stt>        dbg  append debug.txt\n"));
        assert!(!p.set_enabled("nope", true));
    }

    #[test]
    fn errors_name_the_line() {
        let e = Pipeline::parse(". a mic\n|x> b stt\n").unwrap_err();
        assert_eq!((e.line, e.message.as_str()), (2, "unknown node `x`"));
        let e = Pipeline::parse(". a mic\n. a mic\n").unwrap_err();
        assert_eq!(e.line, 2);
        let e = Pipeline::parse("|> a stt\n").unwrap_err();
        assert_eq!(e.line, 1);
        let e = Pipeline::parse(". a mic\nhello\n").unwrap_err();
        assert_eq!(e.line, 2);
        let e = Pipeline::parse(". a append \"open\n").unwrap_err();
        assert!(e.message.contains("unterminated quote"));
    }

    #[test]
    fn quoted_args_keep_special_characters() {
        let p = Pipeline::parse(". a append \"x | y > #z.stt\"  # note\n").unwrap();
        let n = p.nodes().next().unwrap();
        assert_eq!(n.args, vec!["\"x | y > #z.stt\""]);
        assert_eq!(n.comment.as_deref(), Some("note"));
        assert_eq!(p.format(), ". a  append \"x | y > #z.stt\"  # note\n");
    }

    #[test]
    fn graph_json_round_trip() {
        let src = ". mic mic default @iphone\n|mic> stt stt sensevoice vad=3s\n|stt.final:latest> pol polish gemini\n#|stt> dbg append debug.txt\n";
        let p = Pipeline::parse(src).unwrap();
        let g = p.to_graph_json();
        assert_eq!(g["nodes"]["mic"]["device"], "iphone");
        assert_eq!(g["nodes"]["stt"]["config"]["vad"], "3s");
        assert_eq!(g["nodes"]["dbg"]["config"]["enabled"], false);
        let pe = g["edges"].as_array().unwrap().iter().find(|e| e["target"] == "pol").unwrap();
        assert_eq!((pe["sourceHandle"].as_str(), pe["policy"].as_str()), (Some("final"), Some("latest")));
        let back = Pipeline::from_graph_json(&g).unwrap();
        assert_eq!(back.to_graph_json(), g);
    }

    #[test]
    fn from_graph_json_rejects_cycles() {
        let g = json!({"nodes": {
            "a": {"id":"a","type":"x","device":null,"pos":{"x":0,"y":0}},
            "b": {"id":"b","type":"y","device":null,"pos":{"x":0,"y":1}}},
          "edges": [
            {"id":"1","source":"a","sourceHandle":"out","target":"b","targetHandle":"in"},
            {"id":"2","source":"b","sourceHandle":"out","target":"a","targetHandle":"in"}]});
        assert!(Pipeline::from_graph_json(&g).unwrap_err().contains("cycle"));
    }

    #[test]
    fn duty_cycle_renders_busy_share_steadily() {
        use std::time::{Duration, Instant};
        let ms = Duration::from_millis;
        let mut a = Activity::new(ms(1000));
        let t0 = a.epoch;
        // Ten 80 ms decodes in one second = 80% busy, flickering 10×/s.
        for i in 0..10u64 {
            let s = t0 + ms(i * 100);
            a.record(s, s + ms(80));
        }
        let now = t0 + ms(1000);
        assert!((a.fraction(now) - 0.8).abs() < 0.01);
        let mut b = Activity::new(ms(1000));
        let t = b.epoch;
        b.record(t, t + ms(800));
        let at = |b: &mut Activity, off: u64| b.state_at(t + ms(1000) + ms(off), NodeState::Chunk).0;
        // At t+1000 the window [0,1000] holds 800 ms busy; phase 0 → busy.
        assert_eq!(at(&mut b, 0), NodeState::Chunk);
        // Idle work ages out of the window entirely → idle.
        assert_eq!(b.state_at(t + ms(5000), NodeState::Chunk), (NodeState::Idle, 0.0));
        // An open interval counts until now.
        let mut c = Activity::new(ms(1000));
        let t = c.epoch;
        c.begin(t);
        assert!((c.fraction(t + ms(1000)) - 1.0).abs() < 0.01);
        c.end(t + ms(1000));
        assert!(c.fraction(t + ms(1500)) > 0.49);
    }

    #[test]
    fn vars_expand() {
        let vars = HashMap::from([("date", "2026-10-23".to_string())]);
        assert_eq!(expand_vars("$date.stt", &vars), "2026-10-23.stt");
        assert_eq!(expand_vars("log-${date}x", &vars), "log-2026-10-23x");
        assert_eq!(expand_vars("$nope/$5", &vars), "$nope/$5");
    }
}
