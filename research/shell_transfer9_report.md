# 殻転送・ビルド報告（第9回：2026-11-11）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（/2 音声再生の最終修正まで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合まで）。

## 修正内容：/2 音声再生の最終修正（吸い出し経路）

### 実機で確定していた切り分け（手022まで）

- テスト音（殻が自前の Audio 要素／WebAudio で生成したビープ）は聞こえた（複数回、ctx=running、ct 進行）。
- 要素直接経路（クライアントのプレイヤー要素＝video-element を殻側で操作）は、再生開始時に `muted=false` にしても、成否判定（約2秒後）の時点で `muted=True` に戻っていた。クライアント側の状態管理がミュートを再適用するため、currentTime が進んでも無音になる。

### 適用した修正（`MainForm.cs` のみ）

- **新経路「吸い出し」を blob: の主経路にした**（新 JS `JsPlayVoiceBlobFetch`）：抽出で得た blob: URL をページ内で `fetch` し、`URL.createObjectURL` で殻専用の object URL を作り直して、殻所有の Audio 要素（`window.__eraVoice`、テスト音と同系統）で再生する。fetch は非同期のため開始スクリプトはキックのみを行い、成否を共有ステータス（`st.fetch`: pending→ok／failed）に記録。C# 側は `JsVoiceStatus`（`fetch` フィールドを追加）で fetch の成否を確認してから通常の再生判定（Promise 結果＋ct 進行）に入る。
- **フォールバックは従来経路を残置**：吸い出しに失敗した場合のみ、要素直接（`JsPlayVoiceElement`）→ URL 経路（`JsPlayVoice`）の順に落とす。通常の http(s) URL は従来通り URL 経路（変更なし）。
- **診断の経路表記**：開始・成否ログの `経路` に `吸い出し` が出る（他は従来通り `要素直接`／`URL`）。ブラウザミュート（IsMuted）確認・解除、muted／vol の診断項目は維持。
- **object URL の revoke**：再生終了（`ended`）時と、次の音声が前の object URL を差し替える時に `URL.revokeObjectURL` する。あわせて fetch トークン（`window.__eraVoiceFetchSeq`）を全経路の開始時に進め、吸い出しの fetch が遅れて完了しても、別経路が開始済みの再生を上書きしないようにした。
- **二重発火抑止（手番ラッチ `_voiceFiredSeq`）は現行のまま維持**（変更なし）。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック24件（新規1件＝`JsPlayVoiceBlobFetch`）を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の MSB3277 のみ） |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261111_t9\engine\`** へ退避（27ファイル／117,114,396B）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点＋ engine\ 配下17点＝計21ファイル。差分の実体は `MainForm.cs`（`49b5d17e…`、転送⑧の `6170abe6…` から）のみ。エンジン exe は `d496bac4…` で不変。`data/characters_added.json` は転送対象に含めていない（実行時ファイル） |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（2.26秒）。dll は 376,832B に更新（2026-11-11 01:42） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（PROJ_MD5_BAD=0／OUT_MD5_BAD=0） |

## 実行時データの検証（復元不要だった）

ビルド後も出力側の実行時ファイルは転送前と全て MD5 一致（無傷）：

- `characters\base.json`（222,751B）E9D9AFA7…
- `characters\base_2.json`（39,353B）04E9D68D…（今夜の新規ラン進行分を含む）
- `characters\shiori.json`（108,735B）E36497BE…
- `logs\base.jsonl`（69,461B）C3A38433…
- `logs\base_2.jsonl`（4,530B）9B4D4E9E…
- `logs\shiori.jsonl`（26,320B）87B95E5E…
- `trainers_state.json`（203B）636FF516…
- `data\characters_added.json`（351B）C8678E2C… — ビルド後も出力側に現存（t9 バックアップにも収録）

## 次回セッションでの確認手順（マスター向け）

1. 通常プレイで音声つき /2 を流し込む → 自動再生が聞こえるか。ログの開始行が `経路 吸い出し` になっていること、成否行が `自動再生しています（経路 吸い出し、… ct=X→Y … muted=False …）` になることが成功の形。
2. もし `blob の吸い出しに失敗しました` が出た場合は、その回は従来経路（要素直接→URL）に落ちている。成否行とあわせてログを残してもらえると次手が切れる。

## 残置事項

- バックアップ `era_runtime_backup_20261111_t9\` は当面そのまま保持（過去分と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer9.ps1`・`build_verify_transfer9.ps1`・`transfer9_md5.txt` に保存）。
