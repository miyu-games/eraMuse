# 殻転送・ビルド報告（第6回：2026-11-11）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（/2 音声検出の修正＝音声調査 §3 の適用まで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合まで）。

## 今回の修正（/2 音声検出）

前提：音声調査で、音声投稿は記録上 kind=audio の独立 presentation で、画像と同型だがキャプションの**後方**（next sibling 側）に描かれることが判明。現行の音声対応付けは祖先 climb＋直前兄弟しか探さないため、後方の presentation サブツリーに到達できず voice-none になっていた（実機ログ「メディア診断 /4_019: … voice=voice-none」で裏付け済み）。

適用内容（`MainForm.cs` の `JsExtractMedia`）：

- **(a) 対応付けに後方段を追加**：音声 Stage B2＝`scanNextSiblings`（アンカーと各祖先の next sibling、最大12段上×4 hop）→ Stage C＝文書順でアンカー**直後**の最寄り候補（`docOrderVoice`。別手番のタグ付き投稿が間にあれば却下。全体走査のため1手につき最大5回まで間引き、予算は画像段と独立に `__eraDocScanV` で管理）。画像段にも対称に Stage B2（next siblings、`media-next-sibling`）を追加——受理条件は Stage B と同じ面積バーで、誤爆リスクは従来段と同水準。
- **(b) 候補収集 `voiceCandidatesIn` を新設**：`<audio>`／`<video>` は currentSrc／src／子 `<source>` を**拡張子条件なし**で受理（blob: 可）。リンクはパス末尾の音声拡張子に加え、`.mp3?`／`.mp3&` 形（拡張子がURL途中にある形）とメディア系パス（`/media/`・`/audio/`・`/voice/` 等）まで緩和。報告専用候補（URLなし）として play-button（再生／play／音声／voice を含むボタン）と filename-text（音声拡張子を含む末端テキスト／"Voice message"）も収集し、診断にだけ出す。選別は `voicePick`（要素系をリンクより優先）。旧 `voiceIn` はこの収集器のラッパとして再実装。
- **(c) 診断 detail の同等化**：voice-none 時に `vdetail = 'near=' + …` を画像段と同形式で残す（アンカーの祖父要素サブツリー＋前後兄弟サブツリーの候補内訳：kind と url/nourl、報告専用候補を含む）。成功段は `vstage = voice-next-sibling`／`voice-doc-order` 等、vdetail に `up=/hop=` または `kind=` が載る。
- **(d) 再生側（JsPlayVoice）は無変更**。クリック収穫のような侵襲的な段は今回入れていない。報告専用候補しか無い（＝URLがDOMに存在しない）場合は DOM 抽出では原理的に取れず、その時は near= の内訳（play-button の有無）が次の判断材料になる。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック19件を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の WindowsBase MSB3277 のみ） |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261111_t6\engine\`** へ退避（26ファイル／117,052,000B、今夜の試遊続行で育った base のセーブ・ログを含む）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点＋ engine\ 配下17点＝計21ファイル。差分の実体は `MainForm.cs` のみ（MD5 `cc379108…`、転送⑤の `3499aba8…` から更新）。エンジン exe は `c5c86a68…` で不変。characters／logs／trainers_state.json は転送対象外 |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（警告1件＝既知の MSB3277、2.09秒）。dll は 332,800B に更新（2026-11-11 00:33、転送⑤の 306,688B から増加＝音声検出拡張分） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（PROJ_MD5_BAD=0／OUT_MD5_BAD=0） |

## 実行時データの検証（復元不要だった）

ビルド後も出力側の実行時ファイルは転送前と全て MD5 一致（無傷）：

- `characters\base.json`（203,626B）73F0558C…
- `characters\base_2.json`（30,282B）9FCAA5ED…
- `characters\shiori.json`（108,735B）E36497BE…
- `logs\base.jsonl`（43,761B）8463AE76…
- `logs\base_2.jsonl`（2,190B）39CC2CF6…
- `logs\shiori.jsonl`（26,320B）87B95E5E…
- `trainers_state.json`（203B）636FF516…

## 次回実機テストでのログの読み方

殻の検証パネル（ログ欄）の「メディア診断 /4_NNN:」行の voice 側（` | voice=…` 以降）を見る：

- `voice=voice-next-sibling up=X hop=Y`（または `voice-doc-order`／`voice-ancestor`／`voice-prev-sibling`）＋続いて音声再生のログ → 検出成功。その vstage が、実 DOM で効いた対応付け段。
- `voice=voice-none near=…` → アンカーは見つかったが再生可能な URL が取れていない。`near=` の内訳を見る：`play-button:nourl` や `filename-text:nourl` だけなら「プレイヤーはそこにあるが URL が DOM に無い」形で、次手はクリック収穫の要否判断。`audio-element:nourl` があれば要素はあるが URL 未生成（遅延生成）の形。

## 残置事項

- バックアップ `era_runtime_backup_20261111_t6\` は当面そのまま保持（過去分 20261108／09／10／20261110_t3／20261110_t4／20261111_t5 と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer6.ps1`・`build_verify_transfer6.ps1`・`transfer6_md5.txt` に保存）。
- 音声調査報告（§3 の原典）は引き継ぎ文面でのみ存在し、research フォルダへのファイル保存はされていない（本報告が適用記録を兼ねる）。
