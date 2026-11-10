# 調教主プロフィール実装 報告書（2026-11-09）

対象: `~/workspace/era_shell_spike/`（engine/ が正＋殻）。Space・PC転送には不触。
前提: `engine/data/trainers.json`（default=あなた／myu=ミュー、sex・skillStart）は新設済みだった分。

## 実装内容

### 1. 調教主の永続ストア（本課題の核）
- 新設 `<home>/trainers_state.json`：調教主IDごとに `{ trainerSkill, fallenCount }` を保持する、対象セーブとは別ファイル。
- セッション状態（GameState）の `trainerSkill` / `fallenCount` は**作業コピー**に位置づけ直した（エンジン内部の参照箇所＝namespaceOf の `trainer_skill`、shopItemsOf、purchaseItem、checkFallTraits は無変更）。
  - `start` 時：ストア（無ければプロフィールの skillStart）から作業コピーへ流し込む。
  - 保存時（アダプタの persist が全 op をカバー）：作業コピーをストアへ書き戻す。ITEM:52 購入・陥落素質獲得のどちらも、この経路で永続側へ効く。
- GameState に `trainerId` / `trainerName` / `trainerSex` / `trainerLinked` を追加。snapshot にも `trainerId` / `trainerName` / `trainerSex` を追加（表示側が使える）。

### 2. start op の trainerId
- `{"op":"start","characterId":…,"trainerId":"myu"}` で開始時に調教主を選べる。未指定は `default`、未知の id は明示エラー（`unknown trainer: …`）。
- 新規開始時のみ有効。**再開時はセーブに記録された調教主が正**で、リクエストの trainerId では差し替わらない（進行中セーブの調教主は固定）。
- 新規 op `trainers`：プロフィール一覧＋現在の永続値（trainerSkill / fallenCount）を返す。
- oplog の各レコードに `trainerId`（実効値）を追加、リクエスト値は `requestTrainerId` として残す。

### 3. 旧セーブの移行（engine/README.md にも明記）
- 調教主仕組み導入前のセーブ（`trainerLinked` が無い／false）は初回読み込み時に一度だけ移行する。
- 移行先は「そのセーブが使っていた調教主」。旧形式では調教主自体が記録されていないため、その場合のみ開始リクエストの trainerId（無ければ default）を使う。
- 合流規則は**大きい方（max)**：セーブ側と既存ストア記録のうち進んでいる方を残す。合算はしないので、同じ進捗が二重に計上されることはない。移行後はストアが正本となり、セーブ側の作業コピーはストア値で上書きされる（`trainerLinked = true` を記録）。
- ストアファイルが失われた場合も、同規則でセーブ側から復元される（linked なセーブでも記録が無ければ再合流する）。

### 4. 性別（sex）の接続
- セッションに `trainerSex` として保持し、snapshot・セーブに残る。
- **接続先は無し（保持のみ）**：エンジン／gamedata を走査した結果、調教主の性別で分岐する処理は存在しない（解放条件の式名前空間にも該当識別子は無く、COMABLE の調教者項は `trainer_skill` のみ）。原作側の性別分岐は主に調教者素質・対象側の反応に寄るもので、受け皿が無い分の扱いは従来の欠け整理と同じ。

### 5. 殻側（最小限）
- エンジン行に調教主コンボボックスを追加。候補は `engine/data/trainers.json` から読み込む（読めなければ default のみで開始可能）。
- 開始ボタン（素体／栞＝対象の選択）は従来どおり残し、start 送信に `trainerId` を同梱。開始ログに trainer を記録。
- 区画4ヘッダの「調教者：あなた」を snapshot の `trainerName` 表示に切替（ミュー選択時は「調教者：ミュー」になる）。

## お小遣いについての所感（判断材料）
原作では所持金は主人（キャラ0）側の持ち物で、対象を跨いで残る。eraMuse のお小遣いは §9.1 設計で「セッション終了ごとに +100 の付与」であり、財布というより調教1件ごとの予算に近い。寄せるなら**残高だけ調教主ストアへ移し、付与は現行維持**が原作形に近い。ただし現行でも残高は対象セーブ内で累積・継続するため、実際に困るのは対象を替えたときに残高が置いていかれる点だけ。今回は範囲外として不触。

## 差分整理（一致／欠け／余計）

**一致**
- 調教主が対象を跨いで残る存在になった（原作のキャラ0 の形）。技巧Lv・堕落人数が対象を替えても引き継がれる。
- 開始時に調教主を選ぶ形が @FIRST_SETTING の写像になった（対象選択と調教主選択が別軸）。
- ITEM:52 の上限（Lv10 かつ fallenCount+2、買えるのは Lv ≤ fallenCount+1 の間）は無変更のまま、根拠の fallenCount が永続側から供給される形になった。

**欠け**
- 調教主の性別分岐：接続先が無いため保持のみ（上記4）。
- 陥落素質獲得（実プレイ）→ fallenCount の永続化は、購入と同一の persist 同期経路で検証（機構として確認）。陥落条件を満たす通しプレイでの実測は未実施。
- 殻の調教主選択はコンボのみ（プロフィールの note や現在 Lv の事前表示は無い）。`trainers` op の応答には含まれるので、表示は今後の殻側の判断。
- exe 再ビルドは未実施（従来どおり PC 転送時に殻と合わせて実施）。

**余計**
- なし。移行の max 合流規則は原作に対応物が無い eraMuse 側の決め事（移行仕様として README に明記済み）。

## 検証
- tsc 0エラー（engine/src 全4ファイル）。
- 機能テスト 45件 全合格（アダプタを実プロセスで起動し、使い捨て home で実施）:
  - S1: 対象A（base／ミュー）で ITEM:52 を2回購入し技巧Lv 2 → プロセス再起動後、対象B（栞／ミュー）の新規セッションで Lv2 を引き継ぎ。default は別枠（Lv0）であることも確認。購入3回目は堕落人数ゲートで不成立。
  - S2: ストアに fallenCount=2 を種付け → Lv3 から購入可、Lv4（= fallen+2）到達後の次は「堕落人数が足りない」で不成立。上限の fallenCount 連動を確認。
  - S3: 旧形式セーブ（調教主フィールド無し、技巧3・堕落1）を用意 → 初回読み込みで default へ移行、ストア記録 {3,1}、再読み込みで二重計上なし、別対象でも引き継ぎ。
  - S4: trainerId=myu 記録済み・未リンクのセーブ → myu 側へ移行。再開リクエストで default を指定してもセーブ側の調教主が勝つ。
  - S5: 未知の trainerId は明示エラー。
- 通常プレイスモーク（start → execute ×2 → end → next → poolgen → getstate）正常。
- 殻：JS 生文字列 14ブロック全て `node --check` 合格。C# ローカルビルド 0エラー（警告1件は従来の WindowsBase 統合警告で無関係）。
- bun バンドル（target=bun）成功。

## 変更ファイル
- `engine/src/engine.ts`：GameState／StatusSnapshot への調教主フィールド追加、`TrainerAssignment` と newGameState の引数追加、normalizeState の補完。
- `engine/src/cli.ts`：プロフィール読み込み、永続ストア（load／flush／同期／移行）、start の trainerId、`trainers` op、oplog への trainerId 記録。
- `engine/README.md`：調教主セクションと移行仕様を追記。構成表に `data/trainers.json` / `trainers_state.json` を追加。
- `MainForm.cs`：調教主コンボ、start への trainerId 同梱、ヘッダの調教者名表示。
- 実行時に生成：`<home>/trainers_state.json`（初回 persist 時）。
