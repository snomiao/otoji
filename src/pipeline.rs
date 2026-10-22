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

/// The pipeline the tray writes on first run.
pub const DEFAULT_PIPELINE: &str = "\
# otoji pipeline: click a row to turn it on/off · docs/11-pipeline-language.md
.           mic
mic>        vad       silence=3s
vad>        stt       sensevoice
stt>        overlay
#.          llm       ollama gemma3:4b
#stt.final> polish
#stt.final> translate en
#stt.final> append    transcripts/$date.stt
";

/// Environment kinds a node kind needs. Each need is filled implicitly by
/// the first enabled node of that kind, unless the line names one in its
/// inputs (`llm2,stt.final> polish`). No special syntax: an environment node
/// is an ordinary source line (`. llm gemma3:4b`).
pub fn env_needs(kind: &str) -> &'static [&'static str] {
    match kind {
        "polish" | "translate" => &["llm"],
        _ => &[],
    }
}

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
    /// Node id: the explicit name (`log=append …`) or, if none, the kind.
    pub id: String,
    /// Whether the id was written explicitly (`name=kind`).
    pub named: bool,
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
    /// A line with an error. It is kept verbatim (the formatter never
    /// rewrites it) and left out of the graph; everything that doesn't
    /// depend on it keeps working.
    Invalid {
        raw: String,
        error: String,
        /// The node id, if the line parsed far enough to have one.
        id: Option<String>,
    },
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

/// Drop a trailing rendered status (`  # ! …`) from a raw line.
fn strip_status(raw: &str) -> &str {
    let mut cut = raw.len();
    for (i, _) in raw.match_indices(" #") {
        if is_status_comment(&raw[i + 2..]) {
            cut = i;
            break;
        }
    }
    raw[..cut].trim_end()
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
/// Split off a node head: `.` (source), or an input clause `refs>` / `>`
/// (previous line), optionally written with a leading `|`. `None` when the
/// text isn't a node line at all (e.g. a comment like `see a > b`).
fn split_head(body: &str, line: usize) -> Option<Result<(Head, &str), ParseError>> {
    let body = body.trim_start();
    if let Some(rest) = body.strip_prefix('.') {
        return Some(Ok((Head::Source, rest)));
    }
    let (piped, rest) = match body.strip_prefix('|') {
        Some(r) => (true, r),
        None => (false, body),
    };
    let Some(close) = rest.find('>') else {
        return piped.then(|| Err(ParseError { line, message: "`|` without a closing `>`".into() }));
    };
    let inner = rest[..close].trim();
    let head = if inner.is_empty() {
        Head::Previous
    } else {
        match inner.split(',').map(|r| parse_ref(r.trim(), line)).collect::<Result<Vec<_>, _>>() {
            Ok(refs) => Head::Refs(refs),
            // Without `|`, text that isn't a ref list just isn't a node line.
            Err(e) => return piped.then_some(Err(e)),
        }
    };
    Some(Ok((head, &rest[close + 1..])))
}

fn parse_node(head: Head, rest: &str, enabled: bool, line: usize) -> Result<NodeLine, ParseError> {
    let (mut tokens, comment) = tokenize(rest, line)?;
    let comment = comment.filter(|c| !is_status_comment(c));
    if tokens.is_empty() {
        return Err(ParseError { line, message: "missing node kind".into() });
    }
    // `kind` or `name=kind`; without a name the id is the kind.
    let tok = tokens.remove(0);
    let (id, kind, named) = match tok.split_once('=') {
        Some((id, kind)) => (id.to_string(), kind.to_string(), true),
        None => (tok.clone(), tok.clone(), false),
    };
    if !is_id(&id) || !is_id(&kind) {
        return Err(ParseError { line, message: format!("bad node `{tok}` (want `kind` or `name=kind`)") });
    }
    Ok(NodeLine { enabled, head, id, named, kind, args: tokens, comment })
}

/// How a control reference drives a node. Control references are
/// arguments, not inputs: `>` stays for data (audio, text) only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Control {
    /// `^x` / `on=x`: fire once per event of `x` (e.g. per speech onset).
    On,
    /// `?x` / `while=x`: the node runs only while `x` is active.
    While,
    /// `!x` / `unless=x`: the node is off while `x` is active.
    Unless,
}

impl Control {
    pub fn sugar(self) -> char {
        match self {
            Control::On => '^',
            Control::While => '?',
            Control::Unless => '!',
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Control::On => "on",
            Control::While => "while",
            Control::Unless => "unless",
        }
    }
    fn from_sugar(c: char) -> Option<Control> {
        [Control::On, Control::While, Control::Unless].into_iter().find(|k| k.sugar() == c)
    }
    fn from_key(k: &str) -> Option<Control> {
        [Control::On, Control::While, Control::Unless].into_iter().find(|c| c.key() == k)
    }
}

/// Parse one argument as a control reference: `^x`, `?x`, `!x` (sugar) or
/// `on=x`, `while=x`, `unless=x`, with an optional `.port`.
pub fn parse_control(arg: &str) -> Option<(Control, InputRef)> {
    let (ctl, target) = match arg.chars().next().and_then(Control::from_sugar) {
        Some(c) => (c, &arg[1..]),
        None => {
            let (k, v) = arg.split_once('=')?;
            (Control::from_key(k)?, v)
        }
    };
    let (node, port) = match target.split_once('.') {
        Some((n, p)) => (n, Some(p.to_string())),
        None => (target, None),
    };
    (is_id(node) && port.as_deref().is_none_or(is_id))
        .then(|| (ctl, InputRef { node: node.to_string(), port, policy: None }))
}

impl NodeLine {
    /// Control references among the arguments, in order.
    pub fn controls(&self) -> Vec<(Control, InputRef)> {
        self.args.iter().filter_map(|a| parse_control(a)).collect()
    }

    /// The node as written: `kind`, or `name=kind` whenever the id differs
    /// from the kind. That includes auto names (`mic2`): writing them down
    /// keeps them stable, so a node added later gets the next free number
    /// instead of renumbering existing ones.
    pub fn token(&self) -> String {
        if self.id != self.kind {
            format!("{}={}", self.id, self.kind)
        } else {
            self.kind.clone()
        }
    }
}

impl Pipeline {
    /// Strict parse: any error fails the whole file.
    pub fn parse(src: &str) -> Result<Pipeline, ParseError> {
        let p = Pipeline::parse_lenient(src);
        match p.errors().into_iter().next() {
            Some(e) => Err(e),
            None => Ok(p),
        }
    }

    /// Parse what can be parsed: a bad line becomes [`Line::Invalid`] (and so
    /// does any node fed by one), the rest forms a working partial graph.
    pub fn parse_lenient(src: &str) -> Pipeline {
        let mut lines = Vec::new();
        for (i, raw) in src.lines().enumerate() {
            let n = i + 1;
            let t = raw.trim();
            let invalid = |e: ParseError| Line::Invalid {
                raw: strip_status(raw.trim_end()).to_string(),
                error: e.message,
                id: None,
            };
            if t.is_empty() {
                lines.push(Line::Blank);
            } else if let Some(after) = t.strip_prefix('#') {
                // `#` + node = that node, turned off; anything else is a comment.
                match split_head(after, n) {
                    Some(Ok((head, rest))) => lines.push(
                        parse_node(head, rest, false, n).map(Line::Node).unwrap_or_else(invalid),
                    ),
                    Some(Err(e)) => lines.push(invalid(e)),
                    None => lines.push(Line::Comment(after.trim().to_string())),
                }
            } else {
                match split_head(t, n) {
                    Some(Ok((head, rest))) => lines.push(
                        parse_node(head, rest, true, n).map(Line::Node).unwrap_or_else(invalid),
                    ),
                    Some(Err(e)) => lines.push(invalid(e)),
                    None => lines.push(invalid(ParseError {
                        line: n,
                        message: "a node line starts with `.` (source) or `input>`".into(),
                    })),
                }
            }
        }
        let mut p = Pipeline { lines };
        p.settle();
        p
    }

    /// Number ids and drop broken lines until stable: a line that turns out
    /// invalid gives up its auto name (`append` stays free for the next one).
    fn settle(&mut self) {
        for _ in 0..self.lines.len() + 1 {
            self.assign_ids();
            let before = self.errors().len();
            self.check();
            if self.errors().len() == before {
                break;
            }
        }
    }

    /// Errors of all invalid lines, in line order.
    pub fn errors(&self) -> Vec<ParseError> {
        self.lines
            .iter()
            .enumerate()
            .filter_map(|(i, l)| match l {
                Line::Invalid { error, .. } => Some(ParseError { line: i + 1, message: error.clone() }),
                _ => None,
            })
            .collect()
    }

    /// Unnamed nodes take their kind as id; later unnamed nodes of the same
    /// kind get `kind2`, `kind3`, … in line order, skipping explicit names.
    fn assign_ids(&mut self) {
        let explicit: std::collections::HashSet<String> = self
            .lines
            .iter()
            .filter_map(|l| match l {
                Line::Node(n) if n.named => Some(n.id.clone()),
                _ => None,
            })
            .collect();
        let mut taken = explicit.clone();
        for l in &mut self.lines {
            let Line::Node(n) = l else { continue };
            if n.named {
                continue;
            }
            let mut k = 1;
            let mut id = n.kind.clone();
            while taken.contains(&id) {
                k += 1;
                id = format!("{}{k}", n.kind);
            }
            taken.insert(id.clone());
            n.id = id;
        }
    }

    /// Mark lines invalid until the rest is a consistent graph: duplicate
    /// names, `|>` without a valid previous node, and refs to unknown or
    /// invalid nodes (cascading to their consumers).
    fn check(&mut self) {
        loop {
            let mut bad: Option<(usize, String)> = None;
            let mut seen: HashMap<String, usize> = HashMap::new();
            let mut prev_valid: Option<bool> = None; // None = no node line yet
            let invalid_ids: std::collections::HashSet<String> = self
                .lines
                .iter()
                .filter_map(|l| match l {
                    Line::Invalid { id: Some(id), .. } => Some(id.clone()),
                    _ => None,
                })
                .collect();
            for (i, l) in self.lines.iter().enumerate() {
                match l {
                    Line::Invalid { .. } => continue,
                    Line::Node(n) => {
                        let err = if let Some(first) = seen.get(&n.id) {
                            Some(format!("duplicate node name `{}` (first on line {first})", n.id))
                        } else {
                            match &n.head {
                                // A bare `>` takes the nearest valid line above,
                                // skipping broken ones, so a half-typed line
                                // doesn't cut off everything after it.
                                Head::Previous => match prev_valid {
                                    None => Some("`>` with no previous node".to_string()),
                                    Some(_) => None,
                                },
                                Head::Refs(refs) => refs.iter().find_map(|r| {
                                    if r.node == n.id {
                                        Some(format!("node `{}` takes input from itself", n.id))
                                    } else if self.lines.iter().any(
                                        |l| matches!(l, Line::Node(m) if m.id == r.node),
                                    ) {
                                        None
                                    } else if invalid_ids.contains(&r.node) {
                                        Some(format!("input `{}` has an error", r.node))
                                    } else {
                                        Some(format!("unknown node `{}`", r.node))
                                    }
                                }),
                                Head::Source => None,
                            }
                        };
                        // Control references (`^x` / `?x` / `!x`) must name a node too.
                        let err = err.or_else(|| {
                            n.controls().into_iter().find_map(|(c, r)| {
                                let tok = format!("{}{}", c.sugar(), r.node);
                                if r.node == n.id {
                                    Some(format!("`{tok}`: a node can't control itself"))
                                } else if self.lines.iter().any(|l| matches!(l, Line::Node(m) if m.id == r.node)) {
                                    None
                                } else if invalid_ids.contains(&r.node) {
                                    Some(format!("`{tok}`: `{}` has an error", r.node))
                                } else {
                                    Some(format!("`{tok}`: unknown node `{}`", r.node))
                                }
                            })
                        });
                        if let Some(e) = err {
                            bad = Some((i, e));
                            break;
                        }
                        seen.insert(n.id.clone(), i + 1);
                        prev_valid = Some(true);
                    }
                    _ => {}
                }
            }
            let Some((i, error)) = bad else { break };
            let Line::Node(n) = &self.lines[i] else { unreachable!() };
            let raw = self.node_source(n);
            let id = Some(n.id.clone());
            self.lines[i] = Line::Invalid { raw, error, id };
        }
    }

    /// A node line as written (pre-format), for keeping an invalid line.
    fn node_source(&self, n: &NodeLine) -> String {
        let head = match &n.head {
            Head::Source => ".".to_string(),
            Head::Previous => ">".to_string(),
            Head::Refs(r) => format!("{}>", r.iter().map(|r| r.to_string()).collect::<Vec<_>>().join(",")),
        };
        let mut s = format!("{}{head} {}", if n.enabled { "" } else { "#" }, n.token());
        for a in &n.args {
            s.push(' ');
            s.push_str(a);
        }
        if let Some(c) = &n.comment {
            s.push_str("  # ");
            s.push_str(c);
        }
        s
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

    /// [`inputs`](Self::inputs) plus implicit environment inputs (see
    /// [`env_needs`]). The bool marks an implicit ref. Not written by the
    /// formatter; this is the graph that actually runs.
    pub fn effective_inputs(&self) -> BTreeMap<String, Vec<(InputRef, bool)>> {
        let kind_of: HashMap<&str, &str> = self.nodes().map(|n| (n.id.as_str(), n.kind.as_str())).collect();
        let mut out = BTreeMap::new();
        for (id, refs) in self.inputs() {
            let kind = kind_of.get(id.as_str()).copied().unwrap_or("");
            let mut all: Vec<(InputRef, bool)> = refs.into_iter().map(|r| (r, false)).collect();
            for need in env_needs(kind) {
                let named = all.iter().any(|(r, _)| kind_of.get(r.node.as_str()) == Some(need));
                if named {
                    continue;
                }
                if let Some(env) = self.nodes().find(|n| n.enabled && n.kind == *need) {
                    all.push((InputRef { node: env.id.clone(), port: None, policy: None }, true));
                }
            }
            out.insert(id, all);
        }
        out
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
            Head::Previous if !branching => ">".to_string(),
            Head::Previous | Head::Refs(_) => {
                let refs: Vec<String> = explicit[&n.id].iter().map(|r| r.to_string()).collect();
                format!("{}>", refs.join(","))
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
        let mut block: Vec<Option<Cells>> = Vec::new(); // None = verbatim row
        // Verbatim rows (comments, invalid lines), in order, with an optional
        // status that aligns with the block's status column.
        let mut comments: Vec<(String, Option<String>)> = Vec::new();
        let flush = |block: &mut Vec<Option<Cells>>, comments: &mut Vec<(String, Option<String>)>, out: &mut String| {
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
                        let (text, tail) = &comments[ci];
                        let text = text.trim_end();
                        match tail {
                            Some(t) => {
                                let col = wh + 1 + wi + if wb > 0 { 1 + wb } else { 0 };
                                let w = col.max(text.chars().count());
                                out.push_str(&format!("{text:w$}  # {t}"));
                            }
                            None => out.push_str(text),
                        }
                        ci += 1;
                    }
                    Some(c) => {
                        let mut line = format!("{:wh$} {:wi$} {}", c.head, c.id, c.body);
                        if let Some(t) = c.tail {
                            let line_w = line.trim_end().chars().count();
                            // Status column: after the widest args in the block (or
                            // after the node column when no row has args).
                            let col = wh + 1 + wi + if wb > 0 { 1 + wb } else { 0 };
                            line = format!("{:w$}  # {t}", line.trim_end(), w = col.max(line_w));
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
                    comments.push((format!("# {c}"), None));
                    block.push(None);
                }
                Line::Invalid { raw, error, .. } => {
                    comments.push((raw.clone(), status.map(|_| format!("! {error}"))));
                    block.push(None);
                }
                Line::Node(n) => {
                    let body = n.args.join(" ");
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
                        id: n.token(),
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
        let inputs = self.effective_inputs();
        let mut nodes = Map::new();
        let mut edges = Vec::new();
        for (row, n) in self.nodes().enumerate() {
            let mut config = Map::new();
            let mut device = Value::Null;
            let mut positional = Vec::new();
            for a in &n.args {
                if parse_control(a).is_some() {
                    continue; // becomes a control edge below
                }
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
            for (r, implicit) in &inputs[&n.id] {
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
                if *implicit {
                    e["implicit"] = json!(true);
                }
                edges.push(e);
            }
            for (c, r) in n.controls() {
                edges.push(json!({
                    "id": format!("{}-{}-{}", r.node, c.key(), n.id),
                    "source": r.node,
                    "sourceHandle": r.port.as_deref().unwrap_or("out"),
                    "target": n.id,
                    "targetHandle": "control",
                    "control": c.key(),
                }));
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
        let mut controls: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for e in &edges {
            let (Some(src), Some(dst)) = (e["source"].as_str(), e["target"].as_str()) else {
                return Err("edge without source/target".into());
            };
            if e["implicit"].as_bool() == Some(true) {
                continue; // environment edge: re-derived, never written
            }
            if e["targetHandle"].as_str() == Some("control") {
                let c = e["control"].as_str().and_then(Control::from_key).ok_or("control edge without a kind")?;
                let port = e["sourceHandle"].as_str().filter(|p| *p != "out");
                let tok = format!("{}{}{}", c.sugar(), src, port.map(|p| format!(".{p}")).unwrap_or_default());
                controls.entry(dst.to_string()).or_default().push(tok);
                continue;
            }
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
            args.extend(controls.get(id.as_str()).cloned().unwrap_or_default());
            let head = match ins.get(id.as_str()) {
                None => Head::Source,
                Some(r) => Head::Refs(r.clone()),
            };
            let kind = n["type"].as_str().unwrap_or("unknown").to_string();
            lines.push(Line::Node(NodeLine {
                enabled: cfg.get("enabled").and_then(|e| e.as_bool()).unwrap_or(true),
                head,
                named: *id != kind,
                id: id.clone(),
                kind,
                args,
                comment: None,
            }));
        }
        let mut p = Pipeline { lines };
        p.assign_ids();
        p.check();
        match p.errors().into_iter().next() {
            Some(e) => Err(e.to_string()),
            None => Ok(p),
        }
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
.          mic
mic>       stt        sensevoice vad=3s
stt.final> polish     gemini
stt.final> log=append $date.stt  # daily log
#stt>      dbg=append debug.txt
";

    #[test]
    fn canonical_sample_is_a_fixed_point() {
        let p = Pipeline::parse(SAMPLE).unwrap();
        assert_eq!(p.format(), SAMPLE);
    }

    #[test]
    fn default_pipeline_is_canonical() {
        let p = Pipeline::parse(DEFAULT_PIPELINE).unwrap();
        assert_eq!(p.format(), DEFAULT_PIPELINE);
    }

    #[test]
    fn leading_pipe_is_optional() {
        let p = Pipeline::parse(". mic\n|mic> stt\n| stt > overlay\n|> append x\n").unwrap();
        assert_eq!(p.format(), ".    mic\nmic> stt\nstt> overlay\n>    append  x\n");
        // Without `|`, text before `>` that isn't a ref list is not a node.
        assert!(Pipeline::parse(". mic\nsee a > b\n").is_err());
        let p = Pipeline::parse(". mic\n# see a > b\n").unwrap();
        assert_eq!(p.nodes().count(), 1);
        // `#` + a node is that node turned off.
        let p = Pipeline::parse(". mic\n#mic> stt\n").unwrap();
        assert!(!p.nodes().nth(1).unwrap().enabled);
    }

    #[test]
    fn bare_kind_is_a_complete_line() {
        let p = Pipeline::parse(". mic\n> stt\n").unwrap();
        let n: Vec<_> = p.nodes().map(|n| (n.id.as_str(), n.kind.as_str(), n.named)).collect();
        assert_eq!(n, vec![("mic", "mic", false), ("stt", "stt", false)]);
        assert_eq!(p.inputs()["stt"][0].node, "mic");
        assert_eq!(p.format(), ". mic\n> stt\n");
    }

    #[test]
    fn redundant_name_is_dropped_by_formatter() {
        let p = Pipeline::parse(". mic=mic default\n").unwrap();
        assert_eq!(p.format(), ". mic default\n");
    }

    #[test]
    fn same_kind_nodes_are_numbered_and_pinned() {
        let p = Pipeline::parse(". mic\n. mic\n. mic\n").unwrap();
        let ids: Vec<_> = p.nodes().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, ["mic", "mic2", "mic3"]);
        // The formatter writes the auto names down…
        let f = p.format();
        assert_eq!(f, ". mic\n. mic2=mic\n. mic3=mic\n");
        // …so a node added later gets the next free number, not a reshuffle.
        let p = Pipeline::parse(&format!("{f}. mic\n")).unwrap();
        let ids: Vec<_> = p.nodes().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, ["mic", "mic2", "mic3", "mic4"]);
        // (Known limit: a new unnamed line *above* the bare `mic` takes the
        // bare name, and the old one becomes the next number.)
        let p = Pipeline::parse(&format!(". mic\n{f}")).unwrap();
        let ids: Vec<_> = p.nodes().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, ["mic", "mic4", "mic2", "mic3"]);
        // Explicit names are never taken by auto numbering.
        let p = Pipeline::parse(". mic2=stt\n. mic\n. mic\n").unwrap();
        let ids: Vec<_> = p.nodes().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, ["mic2", "mic", "mic3"]);
    }

    #[test]
    fn broken_lines_leave_a_working_partial_graph() {
        let src = ". mic\nmic> stt\nnope> polish\npolish> append a.txt\nstt> overlay\nhello\n";
        let p = Pipeline::parse_lenient(src);
        let ok: Vec<_> = p.nodes().map(|n| n.id.as_str()).collect();
        assert_eq!(ok, ["mic", "stt", "overlay"]);
        let errs: Vec<_> = p.errors().into_iter().map(|e| (e.line, e.message)).collect();
        assert_eq!(
            errs,
            [
                (3, "unknown node `nope`".to_string()),
                (4, "input `polish` has an error".to_string()),
                (6, "a node line starts with `.` (source) or `input>`".to_string()),
            ]
        );
        // A broken line gives up its name: the next `append` is not `append2`.
        let p2 = Pipeline::parse_lenient("nope> append x\n. mic\nmic> append y\n");
        assert_eq!(p2.nodes().map(|n| n.id.as_str()).collect::<Vec<_>>(), ["mic", "append"]);
        // Broken lines are kept verbatim; status shows the error.
        let f = p.format();
        assert!(f.contains("\nnope> polish\n") && f.contains("\nhello\n"), "{f}");
        let shown = p.render_with_status(&HashMap::new());
        assert!(shown.contains("# ! unknown node `nope`"), "{shown}");
        // …and copying the rendered view back drops the status again.
        assert_eq!(Pipeline::parse_lenient(&shown).format(), f);
        // Strict parse reports the first error.
        assert_eq!(Pipeline::parse(src).unwrap_err().line, 3);
    }

    #[test]
    fn spaces_inside_input_clause_are_accepted() {
        assert!(Pipeline::parse(". mic\n|  stt . final > overlay\n").is_err());
        let p = Pipeline::parse(". mic\n| mic >  stt\n| stt.final:latest , mic > overlay\n").unwrap();
        assert_eq!(
            p.format(),
            ".                     mic\n\
             mic>                  stt\n\
             stt.final:latest,mic> overlay\n"
        );
    }

    #[test]
    fn previous_shorthand_made_explicit_once_branching() {
        let p = Pipeline::parse(". mic\n> stt\nstt> polish\nstt> translate en\n").unwrap();
        assert_eq!(
            p.format(),
            ".    mic\nmic> stt\nstt> polish\nstt> translate en\n"
        );
    }

    #[test]
    fn status_comments_are_stripped() {
        let p = Pipeline::parse(". mic default  # ~ ▁▃▇ · 3:42\n").unwrap();
        assert_eq!(p.format(), ". mic default\n");
        let p = Pipeline::parse(". mic  # off\n").unwrap();
        assert_eq!(p.format(), ". mic\n");
        let p = Pipeline::parse(". mic  # laptop mic\n").unwrap();
        assert_eq!(p.format(), ". mic  # laptop mic\n");
    }

    #[test]
    fn render_with_status_parses_back() {
        let p = Pipeline::parse(SAMPLE).unwrap();
        let mut st = HashMap::new();
        st.insert("mic".into(), NodeStatus { state: NodeState::Streaming, detail: "▁▃▇ · 3:42".into() });
        st.insert("stt".into(), NodeStatus { state: NodeState::Chunk, detail: "12% busy".into() });
        st.insert("polish".into(), NodeStatus { state: NodeState::NeedsUser, detail: "needs API key".into() });
        let shown = p.render_with_status(&st);
        assert_eq!(
            shown,
            "\
# otoji pipeline
.          mic                           # ~ ▁▃▇ · 3:42
mic>       stt        sensevoice vad=3s  # / 12% busy
stt.final> polish     gemini             # ? needs API key
stt.final> log=append $date.stt          # -
#stt>      dbg=append debug.txt          # off
"
        );
        let back = Pipeline::parse(&shown).unwrap();
        let strip = |p: &Pipeline| {
            p.nodes().map(|n| (n.id.clone(), n.kind.clone(), n.args.clone(), n.enabled)).collect::<Vec<_>>()
        };
        assert_eq!(strip(&back), strip(&p));
    }

    #[test]
    fn toggle_writes_hash_prefix() {
        let mut p = Pipeline::parse(SAMPLE).unwrap();
        assert!(p.set_enabled("polish", false));
        assert!(p.format().contains("\n#stt.final> polish     gemini\n"), "{}", p.format());
        assert!(p.set_enabled("dbg", true));
        assert!(p.format().contains("\nstt>        dbg=append debug.txt\n"), "{}", p.format());
        assert!(!p.set_enabled("nope", true));
    }

    #[test]
    fn errors_name_the_line() {
        let e = Pipeline::parse(". mic\nx> stt\n").unwrap_err();
        assert_eq!((e.line, e.message.as_str()), (2, "unknown node `x`"));
        let e = Pipeline::parse(". a=mic\n. a=mic\n").unwrap_err();
        assert_eq!(e.line, 2);
        assert!(e.message.contains("duplicate node name `a`"));
        let e = Pipeline::parse("> stt\n").unwrap_err();
        assert_eq!(e.line, 1);
        let e = Pipeline::parse(". mic\nhello\n").unwrap_err();
        assert_eq!(e.line, 2);
        let e = Pipeline::parse(".\n").unwrap_err();
        assert_eq!(e.message, "missing node kind");
        let e = Pipeline::parse(". append \"open\n").unwrap_err();
        assert!(e.message.contains("unterminated quote"));
    }

    #[test]
    fn quoted_args_keep_special_characters() {
        let p = Pipeline::parse(". append \"x | y > #z.stt\"  # note\n").unwrap();
        let n = p.nodes().next().unwrap();
        assert_eq!(n.args, vec!["\"x | y > #z.stt\""]);
        assert_eq!(n.comment.as_deref(), Some("note"));
        assert_eq!(p.format(), ". append \"x | y > #z.stt\"  # note\n");
    }

    #[test]
    fn graph_json_round_trip() {
        let src = ". mic default @iphone\nmic> stt sensevoice vad=3s\nstt.final:latest> pol=polish gemini\n#stt> dbg=append debug.txt\n";
        let p = Pipeline::parse(src).unwrap();
        let g = p.to_graph_json();
        assert_eq!(g["nodes"]["mic"]["device"], "iphone");
        assert_eq!(g["nodes"]["stt"]["config"]["vad"], "3s");
        assert_eq!(g["nodes"]["dbg"]["config"]["enabled"], false);
        assert_eq!(g["nodes"]["pol"]["type"], "polish");
        let pe = g["edges"].as_array().unwrap().iter().find(|e| e["target"] == "pol").unwrap();
        assert_eq!((pe["sourceHandle"].as_str(), pe["policy"].as_str()), (Some("final"), Some("latest")));
        let back = Pipeline::from_graph_json(&g).unwrap();
        assert_eq!(back.to_graph_json(), g);
        assert!(back.format().contains("pol=polish gemini"));
        let mic = back.nodes().find(|n| n.id == "mic").unwrap();
        assert_eq!((mic.token(), mic.args.clone()), ("mic".into(), vec!["default".into(), "@iphone".into()]));
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
        use std::time::Duration;
        let ms = Duration::from_millis;
        let mut a = Activity::new(ms(1000));
        let t0 = a.epoch;
        // Ten 80 ms decodes in one second = 80% busy, flickering 10×/s.
        for i in 0..10u64 {
            let s = t0 + ms(i * 100);
            a.record(s, s + ms(80));
        }
        assert!((a.fraction(t0 + ms(1000)) - 0.8).abs() < 0.01);
        let mut b = Activity::new(ms(1000));
        let t = b.epoch;
        b.record(t, t + ms(800));
        // At t+1000 the window holds 800 ms busy and the phase is 0 → busy.
        assert_eq!(b.state_at(t + ms(1000), NodeState::Chunk).0, NodeState::Chunk);
        // Once the work ages out of the window → idle.
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
    fn control_sugar_and_long_forms() {
        let src = ". mic\nmic> vad\n. drums hit=kick ^vad\n. groove=drums ?vad\n. piano unless=vad\n";
        let p = Pipeline::parse(src).unwrap();
        let ctl = |id: &str| {
            p.nodes().find(|n| n.id == id).unwrap().controls().into_iter().map(|(c, r)| (c, r.node)).collect::<Vec<_>>()
        };
        assert_eq!(ctl("drums"), [(Control::On, "vad".to_string())]);
        assert_eq!(ctl("groove"), [(Control::While, "vad".to_string())]);
        assert_eq!(ctl("piano"), [(Control::Unless, "vad".to_string())]);
        // The formatter keeps the spelling you wrote.
        let f = p.format();
        assert!(f.contains("hit=kick ^vad") && f.contains("unless=vad"), "{f}");
        // Graph JSON: dashed control edges, not data inputs or config.
        let g = p.to_graph_json();
        let e = g["edges"].as_array().unwrap().iter().find(|e| e["target"] == "drums").unwrap();
        assert_eq!((e["targetHandle"].as_str(), e["control"].as_str()), (Some("control"), Some("on")));
        assert!(g["nodes"]["piano"]["config"].get("unless").is_none());
        let back = Pipeline::from_graph_json(&g).unwrap();
        assert_eq!(back.to_graph_json(), g);
        // Unknown or self references break only that line.
        let p = Pipeline::parse_lenient(". mic\n. drums ?nope\n. piano !piano\n");
        let errs: Vec<_> = p.errors().into_iter().map(|e| (e.line, e.message)).collect();
        assert_eq!(errs, [(2, "`?nope`: unknown node `nope`".to_string()), (3, "`!piano`: a node can't control itself".to_string())]);
        assert_eq!(p.nodes().count(), 1);
    }

    #[test]
    fn bare_input_skips_broken_lines() {
        // The half-typed `>` line is broken; `> speaker` still takes reverb.
        let p = Pipeline::parse_lenient(". drums\n> reverb\n>\n> speaker\n");
        assert_eq!(p.errors().iter().map(|e| e.line).collect::<Vec<_>>(), [3]);
        assert_eq!(p.inputs()["speaker"][0].node, "reverb");
    }

    #[test]
    fn env_nodes_attach_to_nodes_that_need_them() {
        let src = ". mic\nmic> stt\n. llm gemma3:4b\n. llm2=llm gpt-4.1-mini\nstt.final> polish\nllm2,stt.final> translate en\n";
        let p = Pipeline::parse(src).unwrap();
        let eff = p.effective_inputs();
        let ids = |id: &str| eff[id].iter().map(|(r, i)| (r.node.clone(), *i)).collect::<Vec<_>>();
        // polish: implicit first llm; translate: the named llm2, nothing implicit.
        assert_eq!(ids("polish"), [("stt".into(), false), ("llm".into(), true)]);
        assert_eq!(ids("translate"), [("llm2".into(), false), ("stt".into(), false)]);
        assert_eq!(ids("stt"), [("mic".into(), false)]);
        // The implicit input is never written back.
        assert!(p.format().contains("\nstt.final>      polish\n"), "{}", p.format());
        // Graph JSON marks it, and reading it back drops it again.
        let g = p.to_graph_json();
        let imp = g["edges"].as_array().unwrap().iter().filter(|e| e["implicit"] == true).count();
        assert_eq!(imp, 1);
        assert_eq!(Pipeline::from_graph_json(&g).unwrap().to_graph_json(), g);
        // A disabled llm is skipped; the next enabled one is used.
        let p = Pipeline::parse("#. llm a\n. llm2=llm b\n. x\nx> polish\n").unwrap();
        assert_eq!(p.effective_inputs()["polish"].last().unwrap().0.node, "llm2");
    }

    #[test]
    fn vars_expand() {
        let vars = HashMap::from([("date", "2026-10-23".to_string())]);
        assert_eq!(expand_vars("$date.stt", &vars), "2026-10-23.stt");
        assert_eq!(expand_vars("log-${date}x", &vars), "log-2026-10-23x");
        assert_eq!(expand_vars("$nope/$5", &vars), "$nope/$5");
    }
}
