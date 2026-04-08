//! iFlytek TTS WebSocket client.
//!
//! Endpoint: `wss://tts-api.xfyun.cn/v2/tts`
//! Auth: HMAC-SHA256 signature over `host\ndate\nGET /v2/tts HTTP/1.1`
//! Output: base64-encoded MP3 (or PCM, configurable) chunks in JSON frames.
//! Docs: https://www.xfyun.cn/doc/tts/online_tts/API.html

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use base64::Engine;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::Sha256;
use tokio_tungstenite::tungstenite::Message;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct IflytekTtsConfig {
    pub host_url: String,
    pub app_id: String,
    pub api_key: String,
    pub api_secret: String,
    /// Voice id (e.g. `xiaoyan`, `aisjiuxu`).
    pub voice: String,
    /// Audio encoding: `lame` (mp3) | `raw` (pcm) | `speex-wb;7`.
    pub aue: String,
}

impl IflytekTtsConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            host_url: std::env::var("IFLYTEK_TTS_HOST")
                .unwrap_or_else(|_| "wss://tts-api.xfyun.cn/v2/tts".to_string()),
            app_id: std::env::var("IFLYTEK_APP_ID")
                .map_err(|_| OtojiError::Config("IFLYTEK_APP_ID not set".into()))?,
            api_key: std::env::var("IFLYTEK_TTS_API_KEY")
                .map_err(|_| OtojiError::Config("IFLYTEK_TTS_API_KEY not set".into()))?,
            api_secret: std::env::var("IFLYTEK_TTS_API_SECRET")
                .map_err(|_| OtojiError::Config("IFLYTEK_TTS_API_SECRET not set".into()))?,
            voice: std::env::var("IFLYTEK_TTS_VOICE").unwrap_or_else(|_| "xiaoyan".into()),
            aue: std::env::var("IFLYTEK_TTS_AUE").unwrap_or_else(|_| "lame".into()),
        })
    }
}

pub struct IflytekTts {
    cfg: IflytekTtsConfig,
}

impl IflytekTts {
    pub fn new(cfg: IflytekTtsConfig) -> Self {
        Self { cfg }
    }

    fn build_url(&self) -> Result<String> {
        let parsed = url::Url::parse(&self.cfg.host_url)
            .map_err(|e| OtojiError::Config(format!("bad TTS url: {e}")))?;
        let host = parsed
            .host_str()
            .ok_or_else(|| OtojiError::Config("TTS url missing host".into()))?
            .to_string();
        let path = parsed.path();
        let date = chrono::Utc::now()
            .format("%a, %d %b %Y %H:%M:%S GMT")
            .to_string();
        let signing_string =
            format!("host: {host}\ndate: {date}\nGET {path} HTTP/1.1");
        let mut mac = HmacSha256::new_from_slice(self.cfg.api_secret.as_bytes())
            .expect("hmac key");
        mac.update(signing_string.as_bytes());
        let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
        let authorization_origin = format!(
            "api_key=\"{}\", algorithm=\"hmac-sha256\", headers=\"host date request-line\", signature=\"{}\"",
            self.cfg.api_key, signature
        );
        let authorization =
            base64::engine::general_purpose::STANDARD.encode(authorization_origin.as_bytes());
        let q = format!(
            "authorization={}&date={}&host={}",
            urlencoding::encode(&authorization),
            urlencoding::encode(&date),
            urlencoding::encode(&host)
        );
        Ok(format!("{}?{}", self.cfg.host_url, q))
    }
}

#[async_trait]
impl TtsProvider for IflytekTts {
    fn name(&self) -> &'static str {
        "iflytek-tts"
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        let url = self.build_url()?;
        let (mut ws, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| OtojiError::Transport(format!("ws connect: {e}")))?;

        let frame = json!({
            "common": { "app_id": self.cfg.app_id },
            "business": {
                "aue": self.cfg.aue,
                "vcn": self.cfg.voice,
                "tte": "UTF8",
                "auf": "audio/L16;rate=16000",
            },
            "data": {
                "text": base64::engine::general_purpose::STANDARD.encode(text.as_bytes()),
                "status": 2,
            }
        });
        ws.send(Message::Text(frame.to_string().into()))
            .await
            .map_err(|e| OtojiError::Transport(format!("ws send: {e}")))?;

        while let Some(msg) = ws.next().await {
            let msg = msg.map_err(|e| OtojiError::Transport(format!("ws recv: {e}")))?;
            let text = match msg {
                Message::Text(t) => t.to_string(),
                Message::Close(_) => break,
                _ => continue,
            };
            let frame: TtsFrame = match serde_json::from_str(&text) {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!("tts decode failed: {e}");
                    continue;
                }
            };
            if frame.code != 0 {
                return Err(OtojiError::Provider(format!(
                    "tts error code={} message={}",
                    frame.code, frame.message
                )));
            }
            if let Some(data) = frame.data {
                if !data.audio.is_empty() {
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(&data.audio)
                        .map_err(|e| OtojiError::Decode(format!("base64: {e}")))?;
                    let _ = audio.send(Bytes::from(bytes)).await;
                }
                if data.status == 2 {
                    break;
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct TtsFrame {
    code: i32,
    message: String,
    #[serde(default)]
    data: Option<TtsData>,
}

#[derive(Debug, Deserialize, Serialize)]
struct TtsData {
    #[serde(default)]
    audio: String,
    #[serde(default)]
    status: i32,
}
