# RT ASR プラン比較ドキュメント

本プロジェクト `iat` はブラウザマイクからの音声をサーバ経由で PCM に変換し、リアルタイム音声認識 (RT ASR) API に流すという構成です。現状は iFlytek の IAT / RTASR を採用していますが、ListenHub のドキュメント ([https://listenhub.ai/docs/en/skills/asr](https://listenhub.ai/docs/en/skills/asr)) で紹介されている **CoLi ASR** や **SenseVoice** など他の選択肢も検討対象になります。

このディレクトリには各 RT ASR プランの比較と、後段に「LLM polish (整形) レイヤ」を組み合わせる場合の設計指針をまとめます。

## 目次

- [01 — 現状アーキテクチャ](./01-current-architecture.md)
- [02 — RT ASR プラン比較](./02-rtasr-comparison.md)
- [03 — LLM Polish レイヤ](./03-llm-polish-layer.md)
- [04 — 推奨構成と移行ステップ](./04-recommendation.md)
