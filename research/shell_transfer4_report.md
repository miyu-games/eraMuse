# 殻転送・ビルド報告（第4回：2026-11-10）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（「名前を付けて新規」charcopy 実装まで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合＋隔離スモークまで）。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック19件を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の WindowsBase MSB3277 のみ）。era-engine.exe MD5 が charcopy 報告の新ビルド `c5c86a68…` と一致することを転送前に確認 |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261110_t4\engine\`** へ退避（24ファイル／116,962,946B、.gitkeep 2件を含む）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点（MainForm.cs／Program.cs／csproj／README.md）＋ engine\ 配下（era-engine.exe・layout.json・README.md・src 6点・data 8点）＝計21ファイル。characters／logs／trainers_state.json は転送対象外 |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（警告1件＝既知の MSB3277、2.28秒）。dll は 278,016B に更新（2026-11-10 23:56、転送③の 273,408B から増加＝charcopy の UI 追加分） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（era-engine.exe は `c5c86a68…`） |

## 実行時データの検証（復元不要だった）

ビルド後も出力側の実行時ファイルは転送前と全て MD5 一致（無傷）：

- `characters\base.json`（175,139B）0D67D89C…（転送③以降、今夜の試遊で進行した分だけ増加）
- `characters\shiori.json`（108,735B）E36497BE…（転送②時から不変）
- `logs\base.jsonl`（31,308B）113E5294…
- `logs\shiori.jsonl`（26,320B）87B95E5E…（同上、不変）
- `trainers_state.json`（203B）636FF516…

## charcopy スモーク（PC・隔離コピー）

ビルド出力 engine 一式を `C:\Users\Monte\era_smoke_t4\` へコピーし、同梱 exe（MD5 `c5c86a68…` を確認）で実施。本番の実行時データには触れていない。スモーク用コピーは検証後に除去済み。

- `{"op":"charcopy","characterId":"base"}` → `{"ok":true,"characterId":"base_2","sourceId":"base","name":"素体タイプ（2）"}`（自動付番・既定名とも設計通り）
- `{"op":"start","characterId":"base_2"}` → `{"ok":true,"resumed":false, …}`。Day 1 午前・初期値の新規セッションとして開始でき、`characters\base_2.json` がコピー側に生成された
- コピー側でも元の `characters\base.json` の MD5 は本番と同一（0D67D89C…）＝charcopy が元セーブを書き換えていないことを PC 側でも確認

## マスターの実機確認項目（転送④で新たに増えた分）

1. 開始ダイアログで登録済みキャラ選択時に「名前を付けて新規」ボタンが有効になること。小ダイアログで自動 id と提案名が出て、作成後に新エントリが選択状態になること
2. 作成したエントリ（例：base_2）をそのまま「開始」でき、破棄確認が出ずに新規開始できること。元の base の試遊（Day 2）が無傷で再開できること

## 残置事項

- バックアップ `era_runtime_backup_20261110_t4\` は当面そのまま保持（過去分 20261108／20261109／20261110／20261110_t3 と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer4.ps1`・`build_verify_transfer4.ps1`・`smoke_transfer4.ps1`・`transfer4_md5.txt` に保存）。
- 転送③で残っていた実機確認項目（表示バッチ・派生発火・メディア枠ほか）は引き続き未実施分として残る。
