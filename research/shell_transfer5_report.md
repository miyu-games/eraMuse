# 殻転送・ビルド報告（第5回：2026-11-11）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（/4 画像検出の修正＝第2段調査 §5 の適用まで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合まで）。

## 今回の修正（/4 画像検出）

前提：第2段調査で、/4 投稿がクライアント側で「画像＝独立したプレゼンテーション」「キャプション＝別メッセージ」に分かれて描かれるため、従来の「キャプション末尾要素から祖先を辿って同居する img を探す」方式では構造的に届かず、検出段で無言に落ちていたことが裏付け済み（実機ログに「メディア:」行なし）。

適用内容（`MainForm.cs` の `JsExtractMedia`／`PollMediaAsync`／`JsStartGrab`）：

- **(a) 対応付けの拡張**：Stage A＝祖先（従来方式、候補集合だけ拡張）→ Stage B＝アンカーと各祖先の直前兄弟（最大12段上×4兄弟）→ Stage C＝文書順でアンカーより前にある直近の許容候補（別手番のタグ付き投稿が間にあれば却下。全体走査のため1手につき最大5回まで間引き）。
- **(b) 候補収集の拡張**：`img.currentSrc`／`srcset`／`data-src` 対応、CSS 背景画像、canvas（URLなしとして報告）、リンクは拡張子なしのメディア系パス（`/media/` 等）も対象化。選別は厳密（面積 ≥100×100）／緩和（兄弟・文書順段：自然寸法 ≥100×100 または面積 ≥2500）の2段。
- **(c) 段階ログ**：抽出結果に `debug {stage, detail, vstage, vdetail}` を同梱。`PollMediaAsync` は stage 変化時に「メディア診断 /4_NNN: stage=… detail…」をログ（重複抑制つき）。例外時も `stage=script-error` として残る。もう無言では終わらない。
- **(d) 取得段の小修正**：`JsStartGrab` の `fromPageImg` 照合に `currentSrc` を追加（抽出側が currentSrc を返す形でも一致する）。
- **音声（voice）側**：同じ対応付け拡張を適用。Stage A＝祖先 → Stage B＝直前兄弟（`voiceIn` 収集器を共用）。stage は `voice-ancestor`／`voice-prev-sibling`／`voice-none` として同じ診断行に載る。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック19件を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の WindowsBase MSB3277 のみ） |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261111_t5\engine\`** へ退避（26ファイル／117,011,481B、今夜の実機確認で生まれた `base_2` のセーブ・ログを含む）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点＋ engine\ 配下17点＝計21ファイル。差分の実体は `MainForm.cs` のみ（MD5 `3499aba8…`、転送④の `cd4dc64d…` から更新）。エンジン exe は `c5c86a68…` で不変。characters／logs／trainers_state.json は転送対象外 |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（警告1件＝既知の MSB3277、2.31秒）。dll は 306,688B に更新（2026-11-11 00:15、転送④の 278,016B から増加＝メディア検出拡張分） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（PROJ_MD5_BAD=0／OUT_MD5_BAD=0） |

## 実行時データの検証（復元不要だった）

ビルド後も出力側の実行時ファイルは転送前と全て MD5 一致（無傷）：

- `characters\base.json`（175,139B）0D67D89C…
- `characters\base_2.json`（30,282B）9FCAA5ED…（今夜の「名前を付けて新規」実機確認で生成されたもの）
- `characters\shiori.json`（108,735B）E36497BE…
- `logs\base.jsonl`（31,308B）113E5294…
- `logs\base_2.jsonl`（2,190B）39CC2CF6…
- `logs\shiori.jsonl`（26,320B）87B95E5E…
- `trainers_state.json`（203B）636FF516…

## 次回実機テストでの段の特定方法

殻の検証パネル（ログ欄）に「メディア診断 /4_NNN:」行が出る。見方は次の通り：

- `stage=media-prev-sibling`（または `media-ancestor`／`media-doc-order`）＋続いて「メディア: /4 の画像を表示しました」→ 検出・取得とも成功。その stage が、実 DOM で効いた対応付け段。
- `stage=anchor-missing` のまま → その手番の /4 投稿自体がページ側で見つかっていない（タグ末尾の形の問題）。
- `stage=media-none near=…` → アンカーは見つかったが候補が取れていない。`near=` の内訳（kind:面積:url有無）が次の診断の起点。
- `stage=script-error` → スクリプト例外。文言がそのまま残る。

## 残置事項

- バックアップ `era_runtime_backup_20261111_t5\` は当面そのまま保持（過去分 20261108／09／10／20261110_t3／20261110_t4 と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer5.ps1`・`build_verify_transfer5.ps1`・`transfer5_md5.txt` に保存）。
- 第2段調査報告（§5 の原典）は引き継ぎ文面でのみ存在し、research フォルダへのファイル保存はされていない（本報告が適用記録を兼ねる）。
