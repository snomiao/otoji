//! Node.js / Bun bindings via napi-rs.
//!
//! Build with:
//!   cargo build --release --features node
//!   bun run build           # uses @napi-rs/cli to package the .node file
//!
//! Exposes:
//! - `polishText({ apiKey, model?, raw, prev? }) -> Promise<string>`
//! - `transcribePcm({ modelDir, samples, language? }) -> Promise<string>`

use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;

use crate::polish::{AnthropicPolisher, PolishInput, Polisher};

#[napi(object)]
pub struct PolishOptions {
    pub api_key: String,
    pub model: Option<String>,
    pub raw: String,
    pub prev: Option<String>,
}

#[napi]
pub async fn polish_text(opts: PolishOptions) -> Result<String> {
    let model = opts
        .model
        .unwrap_or_else(|| "claude-haiku-4-5-20251001".into());
    let polisher = AnthropicPolisher::new(opts.api_key, model);
    polisher
        .polish(PolishInput {
            text: &opts.raw,
            prev: opts.prev.as_deref(),
            audio: None,
            context: None,
            translate_to: None,
        })
        .await
        .map_err(|e| Error::from_reason(format!("polish: {e}")))
}

#[napi(object)]
pub struct TranscribeOptions {
    /// Directory containing `model.int8.onnx` and `tokens.txt`.
    pub model_dir: String,
    /// 16-bit-mono PCM samples as f32 in [-1.0, 1.0]. Sample rate is fixed
    /// to 16 kHz to match the SenseVoice model.
    pub samples: Float32Array,
    /// "auto" | "zh" | "en" | "ja" | "ko" | "yue".
    pub language: Option<String>,
}

pub struct TranscribeTask {
    model_dir: String,
    samples: Vec<f32>,
    language: String,
}

impl Task for TranscribeTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        use sherpa_onnx::{
            OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
        };
        let mut config = OfflineRecognizerConfig::default();
        config.model_config.tokens = Some(format!("{}/tokens.txt", self.model_dir));
        config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
            model: Some(format!("{}/model.int8.onnx", self.model_dir)),
            language: Some(self.language.clone()),
            use_itn: true,
        };
        config.model_config.num_threads = 2;
        let recognizer = OfflineRecognizer::create(&config)
            .ok_or_else(|| Error::from_reason("OfflineRecognizer::create returned None"))?;
        let stream = recognizer.create_stream();
        stream.accept_waveform(16_000, &self.samples);
        recognizer.decode(&stream);
        Ok(stream
            .get_result()
            .map(|r| r.text.trim().to_string())
            .unwrap_or_default())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn transcribe_pcm(opts: TranscribeOptions) -> AsyncTask<TranscribeTask> {
    AsyncTask::new(TranscribeTask {
        model_dir: opts.model_dir,
        samples: opts.samples.to_vec(),
        language: opts.language.unwrap_or_else(|| "auto".into()),
    })
}
