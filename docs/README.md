# otoji — 設計・ベンチマーク資料

otoji は現在、**端末上 (on-device) で動作する分散ボイスグラフ**へ発展している
([otoji.org](https://otoji.org))。マイク → STT → 翻訳 → 音声合成を**ノードグラフ**として
配線し、各ノードはブラウザ内 (transformers.js / onnxruntime-web / WebGPU / WASM) で実行される。
複数端末は**ルーム**で接続し、端末間エッジは WebRTC の P2P メッシュ、グラフ状態は
Cloudflare Durable Object 経由で同期される。現状の全体像とマイルストーンは
リポジトリ直下の [`../TODO.md`](../TODO.md) と [`ROADMAP.md`](./ROADMAP.md) を参照。

このディレクトリは、そこへ至るまでの**設計判断とベンチマークの記録**を残したものである。
初期は「ブラウザマイクの音声をサーバ経由で PCM 化し、クラウドの RT ASR API
(iFlytek IAT / RTASR) へ流す」構成を起点に、CoLi ASR や SenseVoice 等の選択肢を比較した
([ListenHub ASR docs](https://listenhub.ai/docs/en/skills/asr))。その比較の結論として、
現在は端末上 SenseVoice を既定とし、クラウドは任意のフォールバックという**ローカルファースト**へ移行している。

## 目次

- [ROADMAP](./ROADMAP.md) — ローカルファースト原則と Rust コア + アダプタ構想
- [01 — 初期アーキテクチャ](./01-current-architecture.md)
- [02 — RT ASR プラン比較](./02-rtasr-comparison.md)
- [03 — LLM Polish レイヤ](./03-llm-polish-layer.md)
- [04 — 推奨構成と移行ステップ](./04-recommendation.md)
- [05 — マルチモーダル Polish](./05-multimodal-polish.md)
- [06 — モデルベンチマーク](./06-model-benchmark.md)
- [07 — otoji listen Q&A](./07-otoji-listen-qa.md)
- [08 — PTT 統合](./08-ptt-integration.md)
- [09 — Polish ベンチマーク](./09-polish-benchmarks.md)
- [10 — npm リリース](./10-npm-release.md)
- [ASR ベンチ (2026-05-14)](./2026-05-14-asr-bench.md)
- [Polish ベンチ (2026-05-14)](./2026-05-14-polish-bench.md)
