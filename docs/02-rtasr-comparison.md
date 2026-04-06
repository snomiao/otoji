# 02 — RT ASR プラン比較

ListenHub のドキュメント ([asr skills](https://listenhub.ai/docs/en/skills/asr)) と本プロジェクトの実測を踏まえ、現実的に採用可能な RT ASR を比較します。

## 比較対象

| # | プラン | 提供形態 | モデル本体 |
|---|---|---|---|
| A | **iFlytek IAT** (現状) | クラウド API | 非公開 |
| B | **iFlytek RTASR** (現状) | クラウド API | 非公開 |
| C | **CoLi ASR** (ListenHub 経由) | クラウド API | 非公開 (中文特化) |
| D | **SenseVoice** (Alibaba / FunASR) | OSS + セルフホスト or API | SenseVoice-Small / Large |
| E | **Whisper / faster-whisper** | OSS セルフホスト | Whisper large-v3 等 |
| F | **Deepgram Nova-2** | クラウド API | 非公開 |

> C/D は ListenHub の skill ページに記載されている本命候補です。E/F は比較軸を立てるための参考プランです。

## 観点別マトリクス

| 観点 | A. iFlytek IAT | B. iFlytek RTASR | C. CoLi ASR | D. SenseVoice | E. Whisper | F. Deepgram |
|---|---|---|---|---|---|---|
| ストリーミング | ◯ (短文) | ◎ (長文) | ◎ | △ (チャンク疑似ストリーム) | △ (chunked) | ◎ |
| 中間結果 (partial) | ◯ | ◎ | ◎ | △ | △ | ◎ |
| 初回レイテンシ | ~300ms | ~300ms | ~300ms | 500ms〜 | 700ms〜 | ~250ms |
| 中文精度 | ◎ | ◎ | ◎ (特化) | ◎ | ◯ | ◯ |
| 英語精度 | △ | ◯ | ◯ | ◎ | ◎ | ◎ |
| 多言語 (50+) | × | × | △ | ◎ (50+) | ◎ (99) | ◯ |
| コードスイッチ (中英混在) | △ | ◯ | ◯ | ◎ | ◯ | ◯ |
| 句読点 / 数字正規化 | △ | ◯ | ◯ | ◯ (ITN 同梱) | △ | ◎ |
| 感情 / イベント検出 | × | × | × | ◎ (笑い・拍手等) | × | △ |
| 話者分離 | × | △ | △ | △ | 別途 pyannote | ◎ |
| セルフホスト | × | × | × | ◎ | ◎ | × |
| 料金感 | 中 | 中 | 中 | GPU 償却 / 低 | GPU 償却 / 低 | やや高 |
| データ主権 | 中国本土 | 中国本土 | 中国本土 | 自由 | 自由 | US/EU |
| SDK 整備 | ◯ (Node 既存) | ◯ (Node 既存) | ◯ (HTTP/WS) | ◯ (Python 中心、Node は薄め) | ◯ | ◎ |

凡例: ◎ 強い / ◯ 普通 / △ 弱い / × 非対応

## それぞれの所感

### A. iFlytek IAT (現状)
- 短文ディクテーション向け。`iat-stream/` で動作中。
- 1 セッションあたり 60 秒程度を想定した API。長時間の連続会議には不向き。

### B. iFlytek RTASR (現状)
- 長時間ストリーミング対応。`rtasr-ws-node.js` で動作中。
- `seg_id` ベースで部分結果を出してくれるので UI に流しやすい。
- iFlytek 共通の弱点として、海外リージョンからのレイテンシと、英語/多言語性能の弱さがある。

### C. CoLi ASR (ListenHub の skill 推奨)
- 中文特化、低レイテンシをうたう。RTASR の代替として最も移行コストが低い。
- ListenHub 経由で叩く場合、署名処理を ListenHub 側に寄せられる利点がある。
- 英語混在、固有名詞の弱さは依然残るので、後段の LLM polish と組み合わせる前提で評価したい。

### D. SenseVoice (FunASR)
- Alibaba DAMO の OSS。SenseVoice-Small で 50 言語、感情・音響イベント検出付き。
- 真の意味での「ストリーミング」ではなく **chunked streaming** (例: 300〜500ms の窓で逐次推論)。中間結果の粒度は iFlytek より粗くなる。
- セルフホストできる = データ主権・固定費・カスタム辞書を全部コントロールできるのが最大のメリット。
- Node からは FunASR を Python サービスとして立て、gRPC か WS でブリッジするのが現実的。

### E. Whisper / faster-whisper
- 比較ベースライン。large-v3 は精度高いが本当のストリーミングではない。
- VAD + 1〜2 秒のチャンク投入で擬似ストリームにするのが定番。会議録向け。

### F. Deepgram Nova-2
- 商用 RT ASR の中ではレイテンシ・話者分離・句読点の総合点が高い。
- 中文の精度は iFlytek/CoLi/SenseVoice に劣る。多国籍プロダクト向け。

## 本プロジェクトでの初期スコアリング

ユースケース「ブラウザマイク → 中文/中英ミックスのリアルタイム文字起こし」を想定:

| プラン | 精度 | レイテンシ | 移行コスト | 運用コスト | 拡張性 | 合計 (25 点満点) |
|---|---|---|---|---|---|---|
| B. iFlytek RTASR (現状) | 4 | 5 | 5 | 3 | 2 | **19** |
| C. CoLi ASR | 4 | 5 | 4 | 3 | 3 | **19** |
| D. SenseVoice (セルフホスト) | 5 | 3 | 2 | 5 | 5 | **20** |
| E. Whisper セルフホスト | 4 | 2 | 2 | 4 | 4 | **16** |
| F. Deepgram | 3 | 5 | 3 | 2 | 4 | **17** |

短期的には **B → C** の差し替えが最も低リスク、中期的には **D (SenseVoice)** をセルフホストして固定費化するのが筋が良い、というのが現時点の結論です。詳細は [04-recommendation.md](./04-recommendation.md)。
