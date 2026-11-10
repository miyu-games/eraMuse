# 殻転送・ビルド報告（第14回：2026-11-11）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（/2 音声検出の最終修正：アバター除外＋行ベース対応付けまで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合まで）。

## 実装内容（`MainForm.cs` のみ）

前提（転送⑬の DOM 採取で確定）：今まで音声候補として掴んでいた `<video>`（blob、dur=5.00、muted、video/mp4 682946B）は音声ウィジェットではなく**ミューのアバター動画**だった（div.relative.z-10.aspect-square.rounded-full.pointer-events-none、128x128 の中の video.absolute.object-cover）。/2 キャプション投稿の単位内にはメディアもボタンも無く、音声 presentation は独立した投稿行としてキャプション行の後に来る。実音声はクリック後に初めて audio 要素として出現する（手024で確認）。

### 1. アバター除外

- 新規ヘルパー `isAvatarMedia(el)`：要素から祖先を最大6段たどり、`aspect-square`＋`rounded-full`＋`pointer-events-none` を全て持つラッパーがあればアバター内メディアと判定。
- 画像候補（`candidatesIn` の img／背景画像／canvas、`selfCand`）と音声候補（`voiceCandidatesIn` の media／link）の両方から除外。
- あわせて `object-cover` クラスの `<video>` は音声の再生可能候補にしない（`kind='video-cover'`、URL なしの報告専用候補として診断には残る）。

### 2. 音声対応付けの組み直し（Stage R を主段に）

- 新規 `scanVoiceRows(anchor)`：キャプションのアンカーから投稿行（class トークンが `group` または `group/<名前>` の要素＝採取での `group/msg` 行レベル）まで上がり、文書順で**後続の兄弟行を最大3行**、音声 presentation の単位として探索する。
  - 別の手のタグ付き投稿を含む行で走査を打ち切る。この手自身のタグ（/1・/3 のテキスト投稿）を含む行は読み飛ばす。
  - タグの無い行で、再生可能メディア（`voiceIn`）かボタンが見つかればその行が presentation 単位。**メディア要素が無くても、行内にボタンがあればウィジェット再生の対象として当てる**（実音声はクリック後にしか現れないため）。
- 行内の再生コントロール候補は新規 `findRowControls(row)`：行全体を box として、転送⑫のランク付け（ラベル付き優先＋スコア順、上限4件）を流用。手掛かりの採点 `controlClue` と整列 `rankControlList` を `findPlayControls` から共有関数に切り出した（従来のメディア起点探索はフォールバックとして現行維持）。
- Stage R がメディア／ボタンのどちらかで当たれば対応付けはそこで確定し、従来段（祖先→前兄弟→次兄弟→文書順）は走らない。外れた場合も行走査の結果（`rows: N scanned, …`／`+1 foreign-tag stop`）が voice-none の vdetail に残る。
- 診断：`voice=voice-row row=+1 media=audio-element btn=2`（メディアあり）／`voice=voice-row-button row=+2 media=none btn=1`（ボタンのみ）の形で、後続何行目で何が見つかったか分かる。

### 3. C# 側の追随

- `PollMediaAsync`：発火条件を「URL あり」から「URL あり **または** ボタン候補あり（btn > 0）」に拡張。ボタンだけの音声結果（url=''、kind='widget-only'）でも手番ラッチを消費して `PlayVoiceAsync` を起動する。
- `PlayVoiceAsync`：ボタンだけの結果でウィジェット再生でも音声が始まらなかった場合、空 URL のまま URL 経路へ降りず、「再生できる経路がありませんでした」と記録して正直に終えるガードを追加。
- 過去のコメント類に残っていた「波形動画」説（実体はアバター動画だった）を、採取で確定した事実に合わせて訂正。

### 4. 維持したもの

- 吸い出しの正直化（audio でない blob は再生しない、転送⑬）、手番ラッチ（二重発火抑止）、候補ループ（クリック後に実音声が動き出したかで当たり判定）、出現メディアの [単位内]/[単位外] 判定（二重の単位は行 box に対して判定される）。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック27件を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の MSB3277 のみ） |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261111_t14\engine\`** へ退避（27ファイル／117,234,615B、手027までの進行分を含む）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点＋ engine\ 配下17点＝計21ファイル。差分の実体は `MainForm.cs`（`0d489011…`、転送⑬の `dc7fbc13…` から）のみ。エンジン exe は `d496bac4…` で不変。`data/characters_added.json` は転送対象に含めていない（実行時ファイル）。宛先は IP 側（`monte@<tailscale-ip>`）を使用 |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（2.21秒）。dll は 499,712B に更新（2026-11-11 02:51） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（PROJ_MD5_BAD=0／OUT_MD5_BAD=0） |

## 実行時データの検証（復元不要だった）

転送前（prep 時）とビルド後で全て MD5 一致（無傷）：

- `characters\base.json`（270,303B）2D24CA29…（今夜の手027までの進行分を含む）
- `characters\base_2.json`（39,353B）04E9D68D…
- `characters\shiori.json`（108,735B）E36497BE…
- `logs\base.jsonl`（142,128B）931300C2…
- `logs\base_2.jsonl`（4,530B）9B4D4E9E…
- `logs\shiori.jsonl`（26,320B）87B95E5E…
- `trainers_state.json`（203B）636FF516…
- `data\characters_added.json`（351B）C8678E2C… — ビルド後も出力側に現存（t14 バックアップにも収録）

## 次回セッションでの確認手順（マスター向け）

1. 通常プレイで音声つき /2 が届いた手まで進める。
2. 成功の形：メディア診断に `voice=voice-row` または `voice=voice-row-button` と `row=+N` が出て、ボイス側で「候補N（…）: audio が開始しました」→自動再生の成否行が続くこと。アバター動画が候補に混ざることはもう無い（診断に video-element が出たら、それはアバター以外の本物のメディアのはず）。
3. 外れた場合も、vdetail の `rows:`／`row=+N` の行と候補ごとの診断行で、どの行のどのボタンを試したか追える。

## 残置事項

- バックアップ `era_runtime_backup_20261111_t14\` は当面そのまま保持（過去分と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer14.ps1`・`build_verify_transfer14.ps1`・`transfer14_md5.txt` に保存）。
- 行の識別は `group/` 系 class トークンに依存する。クライアントのマークアップが変わった場合は、祖先フォールバック（行が見つからなければ最上位要素）＋従来段で劣化動作する。
