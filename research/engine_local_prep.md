# eraMuse エンジン ローカル同梱（方式A）準備メモ

作成：2026-11-08（読み取り専用調査。変更操作なし）
対象：試作 Space「eraMuse試作」（slug: `eramuseshi-zuo`、build `968401c2`）／殻スパイク `~/workspace/era_shell_spike/`
根拠：artifact.inspect（inspection_id `97e64ede-1ed4-4587-8f50-b4e72554fa44`、repair_authorized: false）＋ローカル実測。

---

## 1. 在庫インベントリ

### ローカル環境（実測 2026-11-08）
- Node **v24.22.1**（`/usr/bin/node`）、npm **10.9.4** — Node 子プロセス方式の下地はある。
- .NET 8 SDK **8.0.427** が `~/workspace/tools/dotnet8/` に在り（システム dotnet は不在のため、ビルド時はここの `dotnet` を使う）。
- 殻スパイク `~/workspace/era_shell_spike/` は4ファイルのみ：
  - `Program.cs`（12行、エントリポイント）
  - `MainForm.cs`（1334行。画面と流し込みフロー全部。埋め込み JS はこの中の定数）
  - `EraShellSpike.csproj`（net8.0-windows / WinForms / WebView2 1.0.2903.40）
  - `README.md`（構成・フロー・実機確定事項の記録）
  - UserDataFolder は `%LOCALAPPDATA%\EraShellSpike\WebView2` 固定（ログイン保持）。

### Space サーバ側（server/src、6件が完全集合）
| ファイル | サイズ | 役割 |
|---|---|---|
| `engine.ts` | 95,321B | **計算核**。import は `./gamedata` のみ。GameState 型、newGameState、normalizeState、executeCommand、purchaseInShop、proceedToNextDay、resolveEnding、extendPeriod、snapshotOf、visibleCommands/isUnlocked、pickKojo、式評価器、状態内 rngSeed/rngRolls からの決定的 roll()。地の文・口上は引数の Map で受け取る。DB/SDK への import 無し |
| `gamedata.ts` | 53,890B | **数値正本**（import 無し）。PARAM_DEFS、COMMANDS（sources/unlock/partStages/partBases/ejacB/costs）、CONVERSION、PALAMLV/EXPLV、JUEL_CURRENCIES と階段表、ABILITIES、SENSE_MULT、EJAC_* 倍率表、ADDICT_*、EVENTS、MARKS、DEFAULT_GOAL、DEFAULT_DAYS_LIMIT=14、ACTIONS_PER_DAY=3、ENDING_TEXTS、CATEGORY_COSTS |
| `actions.ts` | 55,650B | RPC/永続化層（糊付け）。`@hatch/space-sdk` の defineAction/z と drizzle-orm に依存。全18アクション定義、ensureSeeded（不足分のみ挿入）、loadNarrationMap/loadKojoMap（DB→Map）、parseDef/parseState/saveState（characters.state へ JSON.stringify で書戻し）、toView 等のビュー変換。**ローカルではアダプタに置き換える対象** |
| `schema.ts` | 3,347B | drizzle-orm/sqlite-core の3テーブル定義（characters / narration_entries / kojo_entries） |
| `narration-seed.ts` | 31,357B | 地の文の**初期投入専用**データ。実行時の正本は DB（ファイル冒頭コメント明記） |
| `character-seed.ts` | 773B | キャラの初期投入専用。base（素体タイプ）**1件のみ** |

- 付随：`server/tsconfig.json`、`package.json`、`tsconfig.base.json`、`drizzle/0001_initial.sql`・`0002_dictionary_tables.sql`・`0003_add_kojo_dictionary_and_personality.sql`・`meta/_journal.json`。package.json の build:server は actions.ts 入口で `bun build --target=bun`。
- 口上用の seed ファイルは server/src に**存在しない**。

### Space クライアント側（client/src、5件）
`App.tsx` / `api.ts` / `main.tsx` / `theme.css` / `globals.d.ts`。api.ts は型のみ import（verbatimModuleSyntax でサーバ runtime を引き込まない設計）。

### DB（正本データ、隔離DBで件数確認）
- `characters` **46件**：`data` = {init_overrides, traits, personality} の JSON 文字列、`state` = GameState の JSON 文字列。
- `narration_entries` **546件**。
- `kojo_entries` **2032件**：`texts` は文字列配列の JSON 文字列。
- **seed 系では現行辞書を再現できない**（キャラ1件、地の文は初期分のみ、口上 seed なし）。同梱のデータ源は DB 側でなければならない。

## 2. 確認済み事実

### (a) 辞書データの JSON 書き出し手段
- 公開アクションは全18件（buyAbility, deleteCharacter, executeCommand, extendPeriod, getCharacter, getState, listCharacters, listKojo, listNarration, resolveEnding, saveCharacter, seedDictionary, seedKojo, setDialogue, startNextDay, startSession, updateKojo, updateNarration）。**export / download / dump 等の書き出し専用アクションは無い。**
- **地の文**：`listNarration`（無引数）が全546件（commandId/commandLabel/category/band/repetition/text）をコマンド順で返す → 応答 JSON がそのまま辞書ファイルになる。
- **口上**：`listKojo`（personality 絞り込み任意）が全2032件（フルキー＋ parse 済み texts 配列＋性格別件数）を返す → 同様に書き出し可。seedKojo 形式とほぼ同形（空文字↔null の変換のみ注意）で往復できる見込み。
- **キャラは不完全**：
  - `listCharacters` は要約のみ。data は initOverrides / traitIds / personality のみで、**素質の src_mult・conv_mult を欠く**。progress は snapshot と recentLog（直近5件）抜粋のみ。
  - `getCharacter` は1件ずつ。定義はフル（initOverrides＋倍率付き traits＋personality）だが、state は **toView 変換後のビュー**（log/snapshot/commands/segments/dialogue 等）で、**生の GameState JSON ではない**。rngSeed/peaks/exp/珠換算ウォーターマーク等、ビューに含まれないフィールドは46件回しても復元できない（不可逆）。
  - 一括取得の手段自体が無い。進行 state を**復元する**アクションも無い（startSession は新規作成の上書き、saveCharacter は定義のみ1件ずつ、地の文の書き戻しは updateNarration の1セルずつ。口上の seedKojo だけが一括投入・冪等）。
- 非対称の理由（設計由来、actions.ts 冒頭コメント）：「永続する物は全部『辞書』側にある」「数値の計算はエンジン＋gamedata が正本」。

### (b) エンジン同梱に必要なもの
- **純粋な計算核は `engine.ts` + `gamedata.ts` の2ファイルのみ。** engine は DB/SDK 非依存で、辞書を Map 引数で受け取る構造 → ローカル側が JSON から narrationMap/kojoMap/GameState を供給し、実行後に state JSON を書き戻す薄いアダプタを用意すれば、計算は構造上そのまま動く（後述の通り Node 実走は未検証）。
- 差し替え対象は actions.ts 相当の糊付け層（defineAction/Ctx、ctx.db 経由 drizzle、invalidateQueries）。
- schema.ts と drizzle migration は「ローカルでも SQLite を使うか、JSON ファイル保存にするか」で要否が変わる。
- narration-seed.ts / character-seed.ts は空辞書時の初期投入用として任意同梱（**正本データではない**旨の明記が必要）。

### (c) クライアント側の計算ロジック
- **残っていない。** App.tsx にある算術は表示専用のみ：ゲージ類の割合 %（Math.min(100, value/max*100)）、疲労>=80・反発>=500 の警告色付け、kai_* の並び替え、カテゴリ grouping、購入ボタンの afford 判定（nextCost と snapshot 残高の比較。最終判定はサーバ buyAbility）。
- ソース→変換→パラメータ確定、帯域判定、絶頂/射精/潤滑/珠換算、解放条件評価は全てサーバ側。localStorage は選択中 characterId の保存のみ。
- → 同梱時にクライアントから計算を剥がす作業は不要。

## 3. 未確定事項（未検証として残る）

1. **Node 実走検証は未実施。** engine.ts + gamedata.ts をローカル Node/Bun で起動し、Space 版と入出力が一致するかは未確認（本調査は在庫・構造確認まで）。同梱の成否を決める最重要の未検証点。
2. list 系アクションを実際に invoke しての応答ペイロード実測は未実施（kojo 2032件分の実サイズ、state view の欠落フィールドの実地確認はスキーマと実装からの判断）。
3. engine.ts（約2,100行）の全行精読はしておらず、後半に想定外の外部 import が無いことは冒頭確認と TS の慣行に基づく推定を含む。
4. ビルド済みバンドル（.space-build/assets）への計算ロジック混入は未確認（結論は client/src ソースレベル）。
5. DATA-PLAN.md（82KB）は未精読（ファイル構成の結論は実ファイルと app-map.md に基づく）。
6. エンジン**ソースコード自体**（engine.ts / gamedata.ts のファイル内容）をローカルへ写す経路が未確定 — 次節の候補整理が本題。

## 4. 書き出し経路の候補（実現可能性順）

### 候補1：既存 list 系の応答 JSON をそのまま辞書ファイル化（地の文・口上のみ、今すぐ・変更ゼロ）
- `listNarration` と `listKojo` を invoke し、応答をそのまま `narration.json` / `kojo.json` として保存。ファイル分け方針（キャラ・状態・地の文・口上で分ける）とも合う。
- 限界：キャラの定義フルと生 state はこの経路では取れない（候補2が必要）。

### 候補2：一括エクスポート用アクションの新設（キャラ含め完全・要 artifact.edit＝変更承認）
- 例：`exportDictionary` アクションが `{ narration_entries: 全件, kojo_entries: 全件, characters: [{ id, name, note, data: 生JSON文字列, state: 生JSON文字列|null, created_at, updated_at }] }` を返す。特に characters はビュ
...[truncated 615 chars]