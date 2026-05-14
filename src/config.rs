//! otoji 設定 — `~/Library/Application Support/otoji/config.json` に永続化。
//!
//! CLX の voice 関連設定を一元管理する。CLX は API キーや
//! トリガーキー設定を引き続き保持し、音声処理に関する設定はこちらに集約する。

use crate::notes::data_dir;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtojiConfig {
    // ── STT ──────────────────────────────────────────────────────────────────
    /// STT エンジン: "sherpa" (SenseVoice) または "whisper" (whisper.cpp)
    #[serde(default = "default_stt_engine")]
    pub stt_engine: String,

    /// SenseVoice モデルバンドル名 (sherpa-onnx releases の asset basename, 拡張子なし)。
    /// 例: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2025-09-09"
    /// 設定パネルから変更可能。空文字 = ビルトインデフォルト。
    #[serde(default = "default_sherpa_model_variant")]
    pub sherpa_model_variant: String,

    /// sherpa-onnx TTS モデル (Kokoro) バンドル名。
    /// 例: "kokoro-int8-multi-lang-v1_1"
    /// 空文字 = ビルトインデフォルト。tts_chain で `sherpa` プロバイダー使用時に参照。
    #[serde(default = "default_kokoro_model_variant")]
    pub kokoro_model_variant: String,

    /// VAD ベース PTT 自動解除の無音閾値 (ms)。0 = 無効。
    #[serde(default)]
    pub ptt_vad_auto_release_ms: u64,

    /// PTT ポリッシュ LLM プロバイダー: "gemini" | "openai" | "anthropic" | "auto"
    #[serde(default = "default_ptt_polish_provider")]
    pub ptt_polish_provider: String,

    /// PTT ポリッシュモデル上書き。空 = otoji デフォルト。
    #[serde(default)]
    pub ptt_polish_model: String,

    /// whisper.cpp GGML モデルファイルパス。空 = 自動検出。
    #[serde(default)]
    pub whisper_model_path: String,

    /// whisper-cli --language に渡す BCP-47 言語コード。
    #[serde(default = "default_whisper_language")]
    pub whisper_language: String,

    /// LLM による STT 誤り訂正を有効にする。
    #[serde(default)]
    pub stt_correction: bool,

    /// TTS フォールバックチェーン (カンマ区切りプロバイダー名)。
    #[serde(default = "default_tts_chain")]
    pub tts_chain: String,

    /// STT ポリッシュフォールバックチェーン (カンマ区切りステージ名)。
    #[serde(default = "default_stt_polish_chain")]
    pub stt_polish_chain: String,

    // ── AEC / VAD 詳細設定 ────────────────────────────────────────────────
    #[serde(default = "default_aec_gain")]
    pub aec_gain: f32,

    #[serde(default = "default_noise_gate")]
    pub noise_gate: f32,

    #[serde(default = "default_speech_start_prob")]
    pub speech_start_prob: f32,

    #[serde(default = "default_speech_end_prob")]
    pub speech_end_prob: f32,

    #[serde(default = "default_speech_start_frames")]
    pub speech_start_frames: usize,

    #[serde(default = "default_silence_end_frames")]
    pub silence_end_frames: usize,

    /// VPIO AEC モード: "off" | "dual-only" | "always"
    #[serde(default = "default_aec_mode")]
    pub aec_mode: String,

    // ── オーバーレイ ──────────────────────────────────────────────────────
    /// オーバーレイをスクリーンショット・画面共有に表示する。
    #[serde(default)]
    pub overlay_sharing: bool,

    // ── 音声翻訳 ─────────────────────────────────────────────────────────
    #[serde(default)]
    pub translate_enabled: bool,

    /// プリセット: "off" | "learning" | "interpreter" | "chat" | "conversation" | "custom"
    #[serde(default = "default_translate_preset")]
    pub translate_preset: String,

    /// 翻訳先言語 BCP-47 (direction=one_way 時)。
    #[serde(default = "default_translate_target")]
    pub translate_target: String,

    /// direction=between 時の第二言語。
    #[serde(default = "default_translate_other")]
    pub translate_other: String,

    /// "one_way" または "between"。
    #[serde(default = "default_translate_direction")]
    pub translate_direction: String,

    /// 出力内容: "original" | "translated" | "both"
    #[serde(default = "default_translate_type")]
    pub translate_type: String,

    /// "both" モード用テンプレート。プレースホルダー: __ORIGINAL__, __TRANSLATION__
    #[serde(default = "default_translate_both_template")]
    pub translate_both_template: String,

    /// TTS 音声ソース: "original" | "translated" | "off"
    #[serde(default = "default_translate_tts_source")]
    pub translate_tts_source: String,

    /// ポリッシュ/翻訳用 LLM プロバイダー。
    #[serde(default = "default_translate_polish_provider")]
    pub translate_polish_provider: String,

    /// TTS プロバイダー: "gemini" | "openai" | "elevenlabs" | "piper" | "iflytek"
    #[serde(default = "default_translate_tts_provider")]
    pub translate_tts_provider: String,

    // ── ノートモード翻訳 ──────────────────────────────────────────────────
    #[serde(default)]
    pub note_translate_enabled: bool,

    #[serde(default)]
    pub note_translate_target: String,
}

// デフォルト値関数
fn default_stt_engine() -> String {
    "sherpa".to_string()
}
/// Best SenseVoice multilingual bundle by accuracy on our ja/en/zh/ko TTS
/// benchmark (1.2% overall vs 54% for the 2025-09-09 retrain). int8 is
/// strictly smaller + faster with no accuracy loss vs fp32.
pub const DEFAULT_SHERPA_VARIANT: &str = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17";
fn default_sherpa_model_variant() -> String {
    DEFAULT_SHERPA_VARIANT.to_string()
}
/// Latest stable Kokoro multilingual TTS (int8, ~140MB). Includes en/ja/zh/ko/fr/it/es/hi/pt-br.
pub const DEFAULT_KOKORO_VARIANT: &str = "kokoro-int8-multi-lang-v1_1";
fn default_kokoro_model_variant() -> String {
    DEFAULT_KOKORO_VARIANT.to_string()
}
fn default_ptt_polish_provider() -> String {
    "openai".to_string()
}
fn default_whisper_language() -> String {
    "ja".to_string()
}
fn default_tts_chain() -> String {
    "elevenlabs:rachel,gemini-2.5-flash-preview-tts,openai:tts-1,msedge,native".to_string()
}
fn default_stt_polish_chain() -> String {
    "mlx:qwen2.5-3b,llm-corrector,raw".to_string()
}
fn default_aec_gain() -> f32 {
    15.0
}
fn default_noise_gate() -> f32 {
    0.003
}
fn default_speech_start_prob() -> f32 {
    0.8
}
fn default_speech_end_prob() -> f32 {
    0.6
}
fn default_speech_start_frames() -> usize {
    10
}
fn default_silence_end_frames() -> usize {
    20
}
fn default_aec_mode() -> String {
    "always".to_string()
}
fn default_translate_preset() -> String {
    "off".to_string()
}
fn default_translate_target() -> String {
    "English".to_string()
}
fn default_translate_other() -> String {
    "Japanese".to_string()
}
fn default_translate_direction() -> String {
    "one_way".to_string()
}
fn default_translate_type() -> String {
    "translated".to_string()
}
fn default_translate_both_template() -> String {
    "__ORIGINAL__\n__TRANSLATION__".to_string()
}
fn default_translate_tts_source() -> String {
    "original".to_string()
}
fn default_translate_polish_provider() -> String {
    "gemini".to_string()
}
fn default_translate_tts_provider() -> String {
    "gemini".to_string()
}

impl Default for OtojiConfig {
    fn default() -> Self {
        Self {
            stt_engine: default_stt_engine(),
            sherpa_model_variant: default_sherpa_model_variant(),
            kokoro_model_variant: default_kokoro_model_variant(),
            ptt_vad_auto_release_ms: 0,
            ptt_polish_provider: default_ptt_polish_provider(),
            ptt_polish_model: String::new(),
            whisper_model_path: String::new(),
            whisper_language: default_whisper_language(),
            stt_correction: false,
            tts_chain: default_tts_chain(),
            stt_polish_chain: default_stt_polish_chain(),
            aec_gain: default_aec_gain(),
            noise_gate: default_noise_gate(),
            speech_start_prob: default_speech_start_prob(),
            speech_end_prob: default_speech_end_prob(),
            speech_start_frames: default_speech_start_frames(),
            silence_end_frames: default_silence_end_frames(),
            aec_mode: default_aec_mode(),
            overlay_sharing: false,
            translate_enabled: false,
            translate_preset: default_translate_preset(),
            translate_target: default_translate_target(),
            translate_other: default_translate_other(),
            translate_direction: default_translate_direction(),
            translate_type: default_translate_type(),
            translate_both_template: default_translate_both_template(),
            translate_tts_source: default_translate_tts_source(),
            translate_polish_provider: default_translate_polish_provider(),
            translate_tts_provider: default_translate_tts_provider(),
            note_translate_enabled: false,
            note_translate_target: String::new(),
        }
    }
}

/// `~/Library/Application Support/otoji/config.json`
pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

pub fn load() -> OtojiConfig {
    let path = config_path();
    if let Ok(data) = std::fs::read_to_string(&path) {
        match serde_json::from_str::<OtojiConfig>(&data) {
            Ok(cfg) => cfg,
            Err(e) => {
                eprintln!("[otoji] config parse error: {} — using defaults", e);
                OtojiConfig::default()
            }
        }
    } else {
        OtojiConfig::default()
    }
}

pub fn save(cfg: &OtojiConfig) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_string_pretty(cfg) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                eprintln!("[otoji] config save error: {}", e);
            }
        }
        Err(e) => eprintln!("[otoji] config serialize error: {}", e),
    }
}
