//! iFlytek RTASR provider.
//!
//! Wire protocol (see https://www.xfyun.cn/doc/asr/rtasr/API.html):
//! - URL: `wss://rtasr.xfyun.cn/v1/ws?appid=...&ts=...&signa=...`
//! - signa = base64( HMAC_SHA1( MD5(appid + ts), api_key ) )
//! - Audio: raw 16k mono 16-bit PCM, ~40ms frames (1280 bytes), sent as binary.
//! - End frame: text `{"end": true}`.
//! - Result frames: JSON with `action: "result"` and a nested `data` JSON string.

use crate::{AsrEventTx, AsrProvider};
use async_trait::async_trait;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use otoji_audio::AudioRx;
use otoji_core::{AsrEvent, OtojiError, Result, Word};
use serde::Deserialize;
use sha1::Sha1;
use tokio_tungstenite::tungstenite::Message;

type HmacSha1 = Hmac<Sha1>;

#[derive(Debug, Clone)]
pub struct IflytekRtasrConfig {
    pub host: String,
    pub app_id: String,
    pub api_key: String,
}

impl IflytekRtasrConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            host: std::env::var("IFLYTEK_RTASR_HOST")
                .unwrap_or_else(|_| "wss://rtasr.xfyun.cn/v1/ws".to_string()),
            app_id: std::env::var("IFLYTEK_APP_ID")
                .map_err(|_| OtojiError::Config("IFLYTEK_APP_ID not set".into()))?,
            api_key: std::env::var("IFLYTEK_API_KEY")
                .map_err(|_| OtojiError::Config("IFLYTEK_API_KEY not set".into()))?,
        })
    }
}

pub struct IflytekRtasr {
    cfg: IflytekRtasrConfig,
}

impl IflytekRtasr {
    pub fn new(cfg: IflytekRtasrConfig) -> Self {
        Self { cfg }
    }

    fn build_url(&self) -> String {
        let ts = chrono::Utc::now().timestamp().to_string();
        let md5 = hex::encode(md5::Md5::digest_str(&format!("{}{ts}", self.cfg.app_id)));
        let mut mac = HmacSha1::new_from_slice(self.cfg.api_key.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(md5.as_bytes());
        let sig = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
        let signa = urlencoding::encode(&sig).into_owned();
        format!(
            "{}?appid={}&ts={}&signa={}",
            self.cfg.host, self.cfg.app_id, ts, signa
        )
    }
}

/// Tiny shim so we can write `md5::Md5::digest_str(...)` symmetrically with sha1.
mod md5 {
    pub use ::md5::Md5;
    use ::md5::Digest;
    pub trait DigestExt {
        fn digest_str(input: &str) -> Vec<u8>;
    }
    impl DigestExt for Md5 {
        fn digest_str(input: &str) -> Vec<u8> {
            let mut h = Md5::new();
            h.update(input.as_bytes());
            h.finalize().to_vec()
        }
    }
}
use md5::DigestExt;

#[async_trait]
impl AsrProvider for IflytekRtasr {
    fn name(&self) -> &'static str {
        "iflytek-rtasr"
    }

    async fn run(&self, mut audio: AudioRx, events: AsrEventTx) -> Result<()> {
        let url = self.build_url();
        tracing::debug!(%url, "connecting to iflytek rtasr");
        let (ws, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| OtojiError::Transport(format!("ws connect: {e}")))?;
        let (mut sink, mut stream) = ws.split();
        let _ = events.send(AsrEvent::Open).await;

        // Sender task: forward PCM frames as binary, then end frame.
        let send_task = tokio::spawn(async move {
            while let Some(chunk) = audio.recv().await {
                if sink
                    .send(Message::Binary(chunk.pcm.to_vec().into()))
                    .await
                    .is_err()
                {
                    return;
                }
            }
            let _ = sink.send(Message::Text("{\"end\": true}".into())).await;
            let _ = sink.close().await;
        });

        // Receiver loop: parse RTASR JSON, emit AsrEvent.
        while let Some(msg) = stream.next().await {
            let msg = msg.map_err(|e| OtojiError::Transport(format!("ws recv: {e}")))?;
            let text = match msg {
                Message::Text(t) => t.to_string(),
                Message::Binary(b) => String::from_utf8_lossy(&b).to_string(),
                Message::Close(_) => break,
                _ => continue,
            };
            match serde_json::from_str::<RtasrFrame>(&text) {
                Ok(frame) => match frame.action.as_str() {
                    "started" => tracing::info!(sid = ?frame.sid, "rtasr started"),
                    "error" => {
                        let _ = events
                            .send(AsrEvent::Error {
                                message: format!(
                                    "code={} desc={}",
                                    frame.code.unwrap_or_default(),
                                    frame.desc.unwrap_or_default()
                                ),
                            })
                            .await;
                    }
                    "result" => {
                        if let Some(data_str) = frame.data {
                            if let Some(ev) = parse_result_payload(&data_str) {
                                let _ = events.send(ev).await;
                            }
                        }
                    }
                    _ => {}
                },
                Err(e) => tracing::warn!("rtasr decode failed: {e}; raw={text}"),
            }
        }

        let _ = send_task.await;
        let _ = events.send(AsrEvent::Closed).await;
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct RtasrFrame {
    action: String,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    desc: Option<String>,
    #[serde(default)]
    sid: Option<String>,
    #[serde(default)]
    data: Option<String>,
}

/// Parse the nested `data` JSON of a `result` frame into an `AsrEvent`.
/// Schema (abridged):
/// `{ "seg_id": N, "cn": { "st": { "type": "0"|"1", "rt": [{ "ws": [{ "cw": [{ "w": "..." }] }] }] } } }`
fn parse_result_payload(raw: &str) -> Option<AsrEvent> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    let seg_id = v.get("seg_id")?.as_u64()?;
    let st = v.pointer("/cn/st")?;
    let kind = st.get("type")?.as_str()?;
    let mut text = String::new();
    let mut words: Vec<Word> = Vec::new();
    if let Some(rt) = st.get("rt").and_then(|x| x.as_array()) {
        for r in rt {
            if let Some(ws) = r.get("ws").and_then(|x| x.as_array()) {
                for w in ws {
                    if let Some(cw) = w.get("cw").and_then(|x| x.as_array()) {
                        for c in cw {
                            if let Some(s) = c.get("w").and_then(|x| x.as_str()) {
                                text.push_str(s);
                                words.push(Word {
                                    text: s.to_string(),
                                    start_ms: None,
                                    end_ms: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    Some(if kind == "0" {
        AsrEvent::Final {
            seg_id,
            text,
            words,
        }
    } else {
        AsrEvent::Partial { seg_id, text }
    })
}
