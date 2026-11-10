# 汎用リプレイヤー実装報告（2026-11-10）

対象: `~/workspace/era_shell_spike/engine/`。Space・PC転送・実セーブデータの改変はしていない（検証は全て隔離ホームのコピー側）。

## 結論

- **実装完了**。`src/replay.ts`（汎用リプレイヤー）＋ `src/cli.ts` の op ログ記録拡張。exe 再ビルド済み。
- **検証は完全一致**：本番 CLI で実セッションを1本通して生成した実ログ（119レコード）を使い、再生→最終スナップショット比較を2回実施。2回とも全 op の軌跡照合で不一致0、最終状態の正規化ハッシュ一致、rngRolls 45＝45、調教主レコード一致。
- **非決定性はエンジン内に実質なし**：乱数は全て (rngSeed, rngRolls) のカウンタ式 `roll()` 経由。残る時刻依存はメタデータ（ログエントリの `at`、状態の `createdAt`）だけで、ゲーム計算は読まない。エンジン本体の計算ロジックには手を入れていない（変更はログ記録の拡張のみ）。

## 実装の形

### リプレイヤー（`src/replay.ts`）

```
bun src/replay.ts --home <元のホーム> --log <logs/xxx.jsonl> --work <再生ホーム>
```

- ログを読み、start レコードの `rngSeed`（欠ければ元セーブの `rngSeed`）で新規 state を作り、記録された op 列を本番 CLI（`src/cli.ts`、別プロセス・再生専用ホーム）へ順に流す。
- 再生ホームの辞書（`data/`）は元ホームからコピー。トレーナーストアは start レコードの `trainerStart`（開始時の調教主ハイドレーション結果）で種付けする——開始前購入など「セッション外で起きたストア変更」を起点の一点に集約するため。
- 対応 op：start（新規／再開の別も再現）/ execute / end / buy / buyitem / next・nextday / extend / ending / setdialogue / buytrainerskill / poolgen / poolregister / pooldelete / poolshow / traitflags / settraitflag / trainers / pool / getstate。実ログに現れる一式をカバーする。
- 照合は3段: ①各 op の応答（ok、実行コマンド＝派生結果 `executedCommandId`／`derivedFrom`、位置フィールド day/phase/slot/sessionSeq/finished）を記録と突合、②最終スナップショット（`snapshotOf`）の一致、③セーブ全体の正規化ハッシュ（キーソート＋時刻フィールド無効化の SHA-256）の一致＋調教主レコードの一致。判定は JSON で出す（exit 0＝一致）。

### ログ記録の拡張（`src/cli.ts` の `appendOpLog`）

再生に必要な入力が従来は記録から漏れていたため、後方互換を保ちながら追加した（新フィールドは全て任意）:

- start: `characterId` / `fresh` / `rngSeed`（開始後の実シード）/ `trainerStart`（新規開始時の trainerSkill・fallenCount・funds）
- setdialogue: `text`（従来は未記録で復元不能だった）
- extend: `days`（従来は未記録。既定14日以外の延長が再生で化けていた）
- poolgen: `generatedSeeds` / `count`、settraitflag: `traitId` / `random`、pool 系: `candidateId`、共通: `requestSeed`

## 検証

### 検証セッション（実ログの生成）

PC へ
...[truncated 3391 chars]