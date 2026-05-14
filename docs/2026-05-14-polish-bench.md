# 2026-05-14 STT polish パイプライン評価

[ASR モデル比較](./2026-05-14-asr-bench.md) の続編として、SenseVoice
の生(なま)出力に対する後段 polish の有効性を、ローカル LLM
(`ollama` 配下の Qwen 系) を用いて評価した。

加えて、(a) クリップ長 (短コマンド vs 長文) と (b) a11y/AX 風コンテ
キストを polish プロンプトに与えた場合の影響を測定した。

## 1. 評価軸とパイプライン

| パイプライン | 説明 |
|---|---|
| `SenseVoice raw` | int8-2024-07-17 の生出力 (句読点・大文字無し) |
| `+ qwen2.5:3b`   | Ollama 経由でローカル LLM polish |
| `+ qwen2.5:7b`   | 同上, 4× 規模 |
| `+ qwen2.5:7b (ax ctx)` | polish プロンプトに合成 AX 文脈を付与 |
| `Whisper-turbo`  | 内蔵 polish (whisper の punctuation 出力) |

スコアは厳格 CER/WER (句読点・大文字を保持したまま FLEURS 参照と比較)。
これは「polish 後の出力が参照ラベルとどれだけ近いか」を直接見るため。

## 2. クリーン長文 (FLEURS 30 サンプル × 4 言語)

```
pipeline                                ja      en      zh      ko    overall   ms/call
SenseVoice raw (no polish)           14.9%   25.7%   14.2%   13.4%    15.9%      0
SenseVoice + ollama qwen2.5:3b       28.1%   30.8%   16.1%   26.0%    25.1%    428
SenseVoice + ollama qwen2.5:7b       24.5%   21.0%   13.4%   42.8%    27.1%    778
Whisper-turbo (intrinsic polish)     17.5%   11.4%   33.9%   22.9%    22.0%      —
```

### 観察

1. **`SenseVoice raw` が overall 最良 (15.9 %)** — 句読点を含まない減点を受けつつも全パイプラインで 1 位。
2. **Polish は劣化を招く** — 3b で +9.2 pt、7b で +11.2 pt 悪化。
   過剰補正・書き換えが主因と推察。
3. **ko に対する 7b の壊滅** — 13.4 % → 42.8 %。Qwen 系列の韓国語訓練が
   弱いと推察。3b は ko に限り 7b より良い。
4. **Whisper-turbo の en は強い** (11.4 %) が zh で 33.9 % と崩壊。
5. polish レイテンシ: 3b 平均 428 ms (p95 637 ms)、7b 平均 778 ms
   (p95 1150 ms)。

## 3. クリップ長の影響 (短コマンド vs 長文)

短コマンド 30 件 × 4 言語を Kokoro / `say` で合成 (例: "open chrome",
"設定を開いて", "打开浏览器", "크롬 열어")。長文側は §2 と同じ FLEURS。

```
pipeline                              overall    ja     en     zh     ko
LONG  SenseVoice raw                   15.9%   14.9   25.7   14.2   13.4
LONG  Whisper-turbo                    22.0%   17.5   11.4   33.9   22.9
SHORT SenseVoice raw                   10.8%   12.2   16.1    3.8   12.7
SHORT Whisper-turbo                    38.4%   20.8   64.4   41.5   47.6
SHORT SV + qwen2.5:7b (no ctx)         63.6%   35.9   81.6   62.9   95.8
SHORT SV + qwen2.5:7b (ax ctx)        100.2%  109.8  100.0   32.7  150.6
```

### 観察

1. **SenseVoice は短い方が易しい** (15.9 → 10.8 %)。短コマンドは語彙が
   限定的でモデルの得意領域。
2. **Whisper-turbo は短文で大破綻** (22.0 → 38.4 %)。en は 11.4 → 64.4 %
   と特に悪化。Whisper の有名な hallucination (短い無音区間で
   「Thanks for watching」等を生成する現象) が再現された。
   → **PTT 用途で Whisper を採用してはならない**。
3. **短文への polish は逆効果** — 10.8 % → 63.6 %。文が短いほど polish
   モデルが書き換え (「open chrome」→「Open Google Chrome.」など補完)
   しやすく、参照と乖離する。
4. **ko は polish 後 95.8 %** — Qwen の韓国語弱点が短文で顕在化。

## 4. a11y/AX 文脈付与の影響

各短コマンドに対し合成 AX 文脈を付与 (例: "open chrome" →
`Foreground: Spotlight. Top result: 'Google Chrome.app'.`)。
polish プロンプトの先頭に挿入。

結果: **悪化** 63.6 % → 100.2 %。原因仮説:

- Qwen がコンテキスト文を「ユーザー発話の続き」と誤解し、出力に UI
  ラベル等を混入させる
- プロンプトが単一テキストブロックで system/user 分離が無いため
  指示遵守が崩れる

ただし zh のみ 62.9 → 32.7 % と改善しており、コンテキスト由来の
情報が中文の同音語選択に役立つ可能性は残る。プロンプト設計の余地大。

## 5. プロンプト再設計の検証 (v2)

§4 で AX 文脈付与が悪化した原因を「単一テキストブロックで指示遵守が
崩れる」と推測した。これを検証するため、`run_polish_v2_bench.py` で
Ollama Chat API を用い、system / user role 分離 + 厳格制約 + few-shot
の各組み合わせを試した。`qwen2.5:7b` 固定。

```
pipeline                       overall    ja      en      zh      ko    avg ms
SHORT SV raw (baseline)         10.8%   12.2    16.1     3.8    12.7      0
v1-noctx (naive prompt)         54.0%   57.1    83.9    24.5    62.0    166
v2-noctx (strict prompt)        76.6%   39.6    78.2    22.6   181.9    183
v2-ax-inline                   387.2%  375.9   267.8   444.0   412.0    405
v2-ax-sep   (system role)      104.1%  113.5    93.1    67.3   131.3    253
v2-ax-fewshot                   74.4%   85.7    83.9    42.8    83.1    242
```

### 観察

1. **「naive(v1)」が「strict(v2)」より良い** (54.0 % vs 76.6 %)。厳格な
   制約文が ko 出力を逆に暴走させる (181.9 %)。
2. **AX context インライン (387 %)** — 与えた UI ラベルをそのまま polish
   出力に書き写してしまう。最悪のケース。
3. **System role + 黙認応答** で 104 % まで改善するが、未だ raw の
   10 倍悪い。
4. **Few-shot を加えると 74.4 %** — 改善するが raw に到底届かない。
5. **§4 の v1 結果 (63.6 %) と本節の v1-noctx (54 %) は乖離**。前者は
   `ollama run` CLI の単一プロンプト、後者は Chat API の system + user
   分離。Chat API の方がやや良いが、結論は変わらない。

### 結論

短コマンド (1–3 s, 数語) への LLM polish は、プロンプト設計を尽くしても
SenseVoice raw を超えられなかった。原因:

- 短文ほど modal expansion が起きやすい
  (`open chrome` → `Open Google Chrome browser, please.`)
- 参照テキストが短いほど CER は語句追加に敏感 (1 語追加で +20–50 %)
- AX 文脈は 7 B 規模では handle 不能

## 6. 結論と推奨

| 用途 | 推奨パイプライン |
|---|---|
| PTT 短コマンド | **SenseVoice raw のみ** (CER 10.8 %, polish 完全に opt-out) |
| 長文ディクテーション | SenseVoice raw (15.9 %) — polish はリスク高 |
| 英語長文 | Whisper-turbo (en 11.4 %) — 短文は厳禁 |
| AX 文脈活用 | 現状無効。70 B+ クラス LLM 待ち or 別アプローチ要検討 |

`stt_polish_chain` 既定値の見直しを推奨:

- 現状: `mlx:qwen2.5-3b,llm-corrector,raw`
- **案**: `raw` を先頭にし polish を完全 opt-in、もしくは
  発話長 (秒数 / 文字数) によるフォールバックを実装

実装ヒント — 発話長によるルーティング (擬似コード):

```rust
let polished = if utterance.duration_ms < 5000 || raw_text.chars().count() < 15 {
    raw_text  // skip polish entirely for short commands
} else {
    polish_chain.run(raw_text, context)?
};
```

## 7. 残課題

- **より大きい polish モデル**: `qwen3:14b`, `gemma3:27b` 等で
  short-clip 暴走が抑えられるか測定 (M2 16 GB では tight)。
- **韓国語専用 LLM**: Qwen の ko 弱点を回避するため、`exaone3.5:7.8b`
  等の韓国語強モデルを試す。
- **実音声短コマンド**: TTS 合成では Whisper hallucination が過小評価
  される可能性。実マイク録音で再測定。
- **AX 文脈の別アプローチ**: 文脈を polish プロンプトではなく、
  ASR の hot-words ヒントとして渡す方向 (sherpa-onnx は
  `--hotwords-file` 対応)。

## 8. 再現

```bash
python3 ~/work/sensevoice-bench/run_polish_bench.py         # § 2
python3 ~/work/sensevoice-bench/run_short_context_bench.py  # § 3 + 4
python3 ~/work/sensevoice-bench/run_polish_v2_bench.py      # § 5
```

注意: macOS のシステムプロキシ (例: `127.0.0.1:8080`) が有効な場合
`requests.Session(trust_env=False)` 必須。`run_polish_v2_bench.py` は
対応済み。

Ollama サーバ (`brew services start ollama`) と
`ollama pull qwen2.5:{3b,7b}` が前提。
ハードウェア: Apple M2 / macOS 25.5.0 / sherpa-onnx v1.13.2。
