# eraMuse ローカル同梱（方式A）実装試行レポート

実施：2026-11-08（本人の許可「実装、いけるなら試しておいて」に基づく試行）
成果物：`~/workspace/era_local_engine/`（src / data / tools / tests）

## 結論

- **Node 系ランタイム（Bun 1.4.4）で実走できた。** エンジン核は **verbatim**（再構成ゼロ）。
- 回帰ベクトルA（接触9手）は **Space 版と完全一致**。ベクトルBは **クンニ解放条件が不足し Space 側参照が途中まで**（中止手順どおり代替なしで停止）。ただし B の中止地点までの全区間（初期上書き・会話3手・精算・購入5回・Day2 の可否）はローカル再生と **完全一致**。
- チェック総数 **57件・全合格**（`tests/replay.ts`、`tests/replay_result.json`）。

## 何が verbatim で、何が再構成か

| 対象 | 方式 | 検証 |
|---|---|---|
| `src/engine.ts`（95,321 bytes） | 正本ディレクトリからのバイトコピー | sha256 `056134ee…d3fd6`、正本と一致 |
| `src/gamedata.ts`（53,890 bytes） | 同上 | sha256 `9d69366f…0048`、正本と一致 |
| `data/narration.json`（546件） | listNarration 全件応答をそのままファイル化 | Map 構築で 546 キー |
| `data/kojo.json`（2,032件） | listKojo 全件応答をそのままファイル化 | Map 構築で 2,032 キー |
| `data/characters.json` | base は getCharacter 実物、shiori は作成時記録から転記 | 定義のみ（生 state は含まない） |
| `src/cli.ts`（アダプタ） | **新規作成**（エンジン本体ではない） | 下記 |
| `tools/probe.ts` / `tests/replay.ts` | 新規作成（検証用） | — |

- 再構成した計算・定数は **ゼロ**。推測で埋めた数値もゼロ。
- artifact.inspect の結論どおり、移送の正規経路は「正本ディレクトリからのバイトコピー＋ハッシュ照合」。検査チャネル経由の全文転記は不可だった。
- エンジンの公開 API（実測）：`newGameState(characterId, name, note, def)`（def は `init_overrides` 等の snake_case）、`executeCommand(state, cmdId, narrationMap, kojoMap?)` は `{ok}` のみを返し、結果は state.log / state 本体に残る。`purchaseInShop` / `proceedToNextDay` / `resolveEnding` / `extendPeriod` が Space の各アクションに対応。

## アダプタ（src/cli.ts）

- stdin/stdout の JSON 行往復。op：`start`（状態ファイルがあれば再開、`fresh` で新規、`seed` で乱数固定可）／`execute`／`buy`／`nextday`／`ending`／`extend`／`getstate`／`setdialogue`。
- 辞書は data/*.json から Map 化して供給（ファイル分け方針どおり）。状態は `data/state_<characterId>.json` に毎手保存。
- 応答：`{ok, snapshot, dialogue, newLog, day, phase, actionsLeft, finished, ending}`。区画1／3 は newLog の mark 付きエントリから組み立て可能（text=1、summary/event=3）。
- 実走確認：start→pat→talk で参照ランAの1・2手目と一致（信頼21・反発93 → 信頼39）。

## ベクトルごとの一致結果

### (a) 接触回帰9手 — 一致（完全）

- ローカル再生（seed 12345 固定）：9手全てのパラメータ推移、精算3回（Day1 恭順+1／Day2 恭順+1／Day3 恭順+2・恥情+1）、最終状態（Day 4・信頼217・従順51・欲望37・屈服34・安心110・満足52、珠 恭順4・恥情1、累積ソース 情愛723・恥情155・快楽170・疲労140）が Space 参照（`tests/reference_vec_a.json`）と完全一致。
- Space 側の乱数 seed は固定できないが、この軌道は成功判定・否定相殺の抽選に依存しないため、seed 固定のローカル再生とビット単位で一致した。

### (b) クンニ絶頂ベクトル — 欠け（Space 参照が未完）

- Space 側ランB（使い捨て `local_vec_b`、desire 600・快楽の珠 100000 で開始）：Day 1 の talk×3 と精算（恭順+1）、購入画面で C感覚を Lv5 まで購入（×1／×20／×400／×5000／×15000、残高 79579）まで実施。
- **Day 2 開始時点でも cunni が available:false**。指示どおり代替コマンドへ置き換えず中止。**クンニの解放条件は desire 600＋C感覚 Lv5 でも不足**（条件そのものは未確認のまま）。
- したがって「クンニ絶頂→精算内訳」の Space 参照は取得できていない。過去メモの受け入れ値（恭順+1/屈服+1/恐怖+1/恥情+10/快楽+1010/苦痛+1）との突き合わせは未実施。
- 代替の自己検証（ローカル単独、Space 参照なし）：
  - B と同条件のローカル再生は中止地点まで完全一致（初期上書きの適用、peak_desire Lv2 の開始時付与、ev_desire_1 発火、購入残高の推移、Day 2 の cunni 不可／com12 可）。
  - 絶頂機構：kai_c 9500 開始＋com12 で EX1 発生（残量 2500）、精算は **1020 = staircase(2500) 20 + EX×1000** で式どおり。
  - com12 単独の快C は 3800（B 条件）で、精算 staircase(3800)=100 も確認。

## 差分分類

- **一致**：エンジン／定数の verbatim 性（ハッシュ）、辞書件数、ベクトルA 全区間、ベクトルB 中止地点までの全区間、絶頂・精算の計算式（ローカル実測）。
- **欠け**：
  1. ベクトルB の絶頂区間（Space 参照なし）。原因はクンニ解放条件の不足で、条件の特定が先。
  2. キャラの **生 state**（rngSeed 等を含む完全な状態）の書き出し・復元経路は Space 側に無いまま。ローカル側は状態 JSON の保存・再開まで実装済みなので、移行は「ローカルで新規開始」か「セーブデータ式の採用待ち」。
  3. shiori の getCharacter が Space 側で応答スキーマエラー（旧 snapshot 互換の問題）。本作業では本番に触れていない。
- **余計**：なし。数値仕様の変更は一切なし。本番キャラ（base・shiori）への変更操作もゼロ。

## 後片付け

- 使い捨てキャラ `local_vec_a` / `local_vec_b` は deletecharacter で削除済み（いずれも existed: true を確認）。
- CLI テストで生成した `data/state_base.json` は削除済み。

## 残課題（次にやるなら）

1. クンニ等のコマンド解放条件の特定（gamedata の unlock 式の実読＋Space での再検証）。それが済めばベクトルB の絶頂区間を Space 参照つきで完走できる。
2. 殻（EraShellSpike）から cli.ts を子プロセスで起動する接続部の実装（方式A の残り半分）。
3. セーブデータ式（種＋履歴の再生）の採用可否は本人の判断待ち。現行の状態 JSON 方式でもローカル完結はする。
