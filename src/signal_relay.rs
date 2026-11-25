use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::{handshake::server::Request, Message};
use uuid::Uuid;

type Rooms = Arc<Mutex<HashMap<String, RoomState>>>;

#[derive(Default)]
struct RoomState {
    peers: HashMap<String, ConnectedPeer>,
    graph: Value,
}

struct ConnectedPeer {
    meta: PeerMeta,
    connection_id: Uuid,
    sender: mpsc::UnboundedSender<Message>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PeerMeta {
    peer_id: String,
    device_id: String,
    name: String,
    role: String,
    has_mic: bool,
    runtime: String,
    net: String,
}

pub async fn run(host: &str, port: u16) -> Result<()> {
    let listener = TcpListener::bind((host, port))
        .await
        .with_context(|| format!("bind signaling relay on {host}:{port}"))?;
    let port = listener.local_addr()?.port();
    print_urls(host, port);
    serve(listener, Arc::new(Mutex::new(HashMap::new()))).await
}

async fn serve(listener: TcpListener, rooms: Rooms) -> Result<()> {
    loop {
        let (stream, _) = listener.accept().await.context("accept signaling client")?;
        let rooms = rooms.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_connection(stream, rooms).await {
                eprintln!("[otoji-signal] connection: {error:#}");
            }
        });
    }
}

async fn handle_connection(stream: TcpStream, rooms: Rooms) -> Result<()> {
    let request_uri = Arc::new(std::sync::Mutex::new(None));
    let captured_uri = request_uri.clone();
    let ws = tokio_tungstenite::accept_hdr_async(stream, move |req: &Request, response| {
        *captured_uri.lock().expect("request URI lock") = Some(req.uri().clone());
        Ok(response)
    })
    .await
    .context("WebSocket handshake")?;
    let uri = request_uri
        .lock()
        .expect("request URI lock")
        .take()
        .context("missing request URI")?;
    let parsed = url::Url::parse(&format!("ws://localhost{uri}"))?;
    let room_name = parsed.path().trim_matches('/');
    if room_name.is_empty() || room_name.contains('/') {
        anyhow::bail!("expected WebSocket path /{{room}}");
    }
    let room_name = urlencoding::decode(room_name)?.into_owned();
    let params: HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    let requested_id = params
        .get("peerId")
        .filter(|id| Uuid::parse_str(id).is_ok());
    let peer_id = requested_id
        .cloned()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let meta = PeerMeta {
        peer_id: peer_id.clone(),
        device_id: clipped(&params, "deviceId", &Uuid::new_v4().to_string(), 100),
        name: clipped(&params, "name", "device", 64),
        role: clipped(&params, "role", "general", 16),
        has_mic: params.get("hasMic").map(String::as_str) != Some("0"),
        runtime: clipped(&params, "runtime", "browser", 16),
        net: clipped(&params, "net", "", 8),
    };
    let connection_id = Uuid::new_v4();
    let (sender, mut outgoing) = mpsc::unbounded_channel();
    let (mut ws_tx, mut ws_rx) = ws.split();
    let writer = tokio::spawn(async move {
        while let Some(message) = outgoing.recv().await {
            if ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    {
        let mut all = rooms.lock().await;
        let room = all.entry(room_name.clone()).or_default();
        let peers: Vec<_> = room.peers.values().map(|p| p.meta.clone()).collect();
        let hello = json!({"type":"hello", "peerId":peer_id, "peers":peers, "graph":room.graph});
        let _ = sender.send(Message::Text(hello.to_string().into()));
        broadcast(
            room,
            &json!({"type":"peer-joined", "peer":meta}),
            Some(&peer_id),
        );
        if let Some(old) = room.peers.insert(
            peer_id.clone(),
            ConnectedPeer {
                meta: meta.clone(),
                connection_id,
                sender: sender.clone(),
            },
        ) {
            let _ = old.sender.send(Message::Close(None));
        }
    }

    while let Some(message) = ws_rx.next().await {
        match message {
            Ok(Message::Text(text)) if text.len() <= 256 * 1024 => {
                if let Ok(message) = serde_json::from_str::<Value>(&text) {
                    handle_message(&rooms, &room_name, &peer_id, &sender, message).await;
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

    {
        let mut all = rooms.lock().await;
        if let Some(room) = all.get_mut(&room_name) {
            let is_current =
                room.peers.get(&peer_id).map(|p| p.connection_id) == Some(connection_id);
            if is_current {
                room.peers.remove(&peer_id);
                broadcast(
                    room,
                    &json!({"type":"peer-left", "peerId":peer_id, "deviceId":meta.device_id}),
                    None,
                );
            }
            if room.peers.is_empty() && room.graph.is_null() {
                all.remove(&room_name);
            }
        }
    }
    writer.abort();
    Ok(())
}

async fn handle_message(
    rooms: &Rooms,
    room_name: &str,
    peer_id: &str,
    sender: &mpsc::UnboundedSender<Message>,
    message: Value,
) {
    match message.get("type").and_then(Value::as_str) {
        Some("signal") => {
            if let Some(to) = message.get("to").and_then(Value::as_str) {
                let all = rooms.lock().await;
                if let Some(target) = all.get(room_name).and_then(|r| r.peers.get(to)) {
                    send_json(
                        &target.sender,
                        &json!({"type":"signal", "from":peer_id, "data":message.get("data").cloned().unwrap_or(Value::Null)}),
                    );
                }
            }
        }
        Some("graph-patch") => {
            let graph = message.get("graph").cloned().unwrap_or(Value::Null);
            if serde_json::to_vec(&graph).map_or(false, |v| v.len() <= 128 * 1024)
                && graph
                    .get("nodes")
                    .and_then(Value::as_object)
                    .map_or(0, |n| n.len())
                    <= 200
            {
                let mut all = rooms.lock().await;
                if let Some(room) = all.get_mut(room_name) {
                    room.graph = graph.clone();
                    broadcast(
                        room,
                        &json!({"type":"graph", "graph":graph, "by":peer_id}),
                        Some(peer_id),
                    );
                }
            }
        }
        Some("graph-get") => {
            let all = rooms.lock().await;
            let graph = all
                .get(room_name)
                .map(|r| r.graph.clone())
                .unwrap_or(Value::Null);
            send_json(sender, &json!({"type":"graph", "graph":graph}));
        }
        Some("ping") => send_json(sender, &json!({"type":"pong"})),
        Some("pipe") => {
            let mut payload = message;
            if let Some(object) = payload.as_object_mut() {
                object.remove("to");
            }
            let all = rooms.lock().await;
            if let Some(room) = all.get(room_name) {
                broadcast(room, &payload, Some(peer_id));
            }
        }
        _ => {}
    }
}

fn clipped(params: &HashMap<String, String>, key: &str, default: &str, max: usize) -> String {
    params
        .get(key)
        .map(String::as_str)
        .unwrap_or(default)
        .chars()
        .take(max)
        .collect()
}

fn send_json(sender: &mpsc::UnboundedSender<Message>, value: &Value) {
    let _ = sender.send(Message::Text(value.to_string().into()));
}

fn broadcast(room: &RoomState, value: &Value, except: Option<&str>) {
    for (id, peer) in &room.peers {
        if except != Some(id.as_str()) {
            send_json(&peer.sender, value);
        }
    }
}

fn print_urls(host: &str, port: u16) {
    let mut ips: Vec<_> = local_ip_address::list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .map(|(_, ip)| ip)
        .filter(|ip| !ip.is_loopback() && !ip.is_unspecified())
        .collect();
    ips.sort();
    ips.dedup();
    if host != "0.0.0.0" && host != "::" {
        ips = host.parse().into_iter().collect();
    }
    if ips.is_empty() {
        eprintln!("signal ready: ws://{host}:{port}/");
    }
    for ip in ips {
        let authority = if ip.is_ipv6() {
            format!("[{ip}]")
        } else {
            ip.to_string()
        };
        let tracker = format!("http://{authority}:{port}");
        eprintln!(
            "signal ready: ws://{authority}:{port}/  — open https://otoji.org/?tr={}",
            urlencoding::encode(&tracker)
        );
    }
    eprintln!("[otoji-signal] in-memory only; room state is not persisted");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::connect_async;

    async fn recv_json<S>(ws: &mut tokio_tungstenite::WebSocketStream<S>) -> Value
    where
        S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
    {
        serde_json::from_str(ws.next().await.unwrap().unwrap().to_text().unwrap()).unwrap()
    }

    #[tokio::test]
    async fn two_peers_presence_signal_and_graph_round_trip() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(serve(listener, Arc::new(Mutex::new(HashMap::new()))));
        let (mut a, _) = connect_async(format!("ws://127.0.0.1:{port}/room?name=A"))
            .await
            .unwrap();
        let hello_a = recv_json(&mut a).await;
        let a_id = hello_a["peerId"].as_str().unwrap().to_owned();
        let (mut b, _) = connect_async(format!("ws://127.0.0.1:{port}/room?name=B"))
            .await
            .unwrap();
        let hello_b = recv_json(&mut b).await;
        let b_id = hello_b["peerId"].as_str().unwrap().to_owned();
        let joined = recv_json(&mut a).await;
        assert_eq!(joined["type"], "peer-joined");
        assert_eq!(joined["peer"]["peerId"], b_id);

        a.send(Message::Text(
            json!({"type":"signal","to":b_id,"data":{"sdp":"offer"}})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
        let signal = recv_json(&mut b).await;
        assert_eq!(
            signal,
            json!({"type":"signal","from":a_id,"data":{"sdp":"offer"}})
        );

        b.send(Message::Text(
            json!({"type":"graph-patch","graph":{"nodes":{"n1":{}}}})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
        let graph = recv_json(&mut a).await;
        assert_eq!(graph["type"], "graph");
        assert_eq!(graph["by"], b_id);
        assert_eq!(graph["graph"]["nodes"]["n1"], json!({}));
    }
}
