# 殻転送・ビルド報告（第7回：2026-11-11）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（/2 音声「検出は通るのに音が出ない」問題の修正まで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合まで）。

## 実機で起きていた問題（手020、2026-11-11 00:34）

「メディア診断 /4_020: voice=voice-doc-order kind=video-element」→「ボイス: /2 の音声を自動再生しています」が 00:34:42 と :43 に**2回**出たが、実際には音が鳴らなかった。その後 voice=voice-none near=（空）に復帰。音声 presentation は `<video>` 要素として描かれていた。

### 修正前の成否判定の実態（コード確認）

- `PlayVoiceAsync(url)` は `JsPlayVoice` で専用 Audio に URL を流し、`play()` してから**固定 700ms 後に状態を1回だけ**読み、`state == 'playing'` なら「自動再生しています」と記録していた。play() Promise の解決は状態判定に使われておらず（拒否だけが非同期に 'blocked' へ記録される）、**currentTime の進行は一切見ていなかった**。つまり「'playing' イベントが一度発火した」ことを「鳴っている」とみなす単発スナップショット判定で、700ms より後に届くエラー／拒否は永遠に見えなかった。
- 二重発火の仕組み：発火ラッチが `(手番, URL文字列)` キーだった。同じ声でもポーリングごとに URL の綴りが変わりうる（src → currentSrc、連想段の勝者交代）ため、別キーとして2回発火した。`_voiceBusy` は同時実行の抑止だけで、逐次2回は素通りした。

## 今回の修正（MainForm.cs）

- **(a) 再生の実態をログに残す**：発火時に URL の形（scheme・拡張子・長さのみ。URL 自体は記録しない）を記録。play() の Promise 結果（resolved／rejected＋エラー名・メッセージ）を `__eraVoiceStatus` に記録するよう JsPlayVoice を拡張。開始後は ~400/1100/2000ms の3点で状態を読み、currentTime の進行・paused・readyState・networkState・error コード・duration まで含めた診断文字列を成否すべてのログ行に付ける。判定は「進行した or 終了した」→再生、「rejected」→拒否、「error」→エラー、それ以外は「再生が進んでいません（無音の可能性）」と正直に分ける。
- **(b) 再生方式の改善（要素直接経路）**：抽出側 `JsExtractMedia` が勝者候補の要素参照をページ内に stash（`window.__eraVoiceEl` ＋手番）するよう変更（要素参照自体は C# へ渡らない）。候補が要素由来（kind `*-element`／`*-source`）で URL が `blob:` の場合は、その要素自体を play() する経路を優先する——widget が自分のプレイヤー用に発行した blob は、別要素への付け替えが効かない（MediaSource 系）ことがあり、手020の「'playing' なのに無音」はこの形と符合する。要素がミュートされていた場合は解除してから再生し、その事実もログに残す。http(s) 等の通常 URL は従来通り専用 Audio。要素経路が使えない（stash が古い・手番不一致・要素が DOM から外れた）場合は URL 経路へ自動で切り替え、切り替えたこともログに残る。どちらの経路で鳴らしたかは開始ログと成否ログの両方に記録される。
- **(c) 二重発火の抑止**：ラッチを手番単位（`_voiceFiredSeq`）に変更し、1手につき再生は最大1回。再生済みの手でポーリングが voice-none に戻っても再発火しない。前手の成否確認が長引いた場合は次の声を落とさず最大4秒待つ。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック21件（新規2件＝要素直接再生とその状態読みを含む）を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の WindowsBase MSB3277 のみ） |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261111_t7\engine\`** へ退避（26ファイル／117,074,267B、今夜の試遊続行分を含む）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点＋ engine\ 配下17点＝計21ファイル。差分の実体は `MainForm.cs` のみ（MD5 `e731dda1…`、転送⑥の `cc379108…` から更新）。エンジン exe は `c5c86a68…` で不変。characters／logs／trainers_state.json は転送対象外 |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（警告1件＝既知の MSB3277、2.14秒）。dll は 350,208B に更新（2026-11-11 00:43、転送⑥の 332,800B から増加＝再生検証まわりの実装分） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（PROJ_MD5_BAD=0／OUT_MD5_BAD=0） |

## 実行時データの検証（復元不要だった）

ビルド後も出力側の実行時ファイルは転送前と全て MD5 一致（無傷）：

- `characters\base.json`（213,271B）EBE47707…
- `characters\base_2.json`（30,282B）9FCAA5ED…
- `characters\shiori.json`（108,735B）E36497BE…
- `logs\base.jsonl`（56,383B）0620319A…
- `logs\base_2.jsonl`（2,190B）39CC2CF6…
- `logs\shiori.jsonl`（26,320B）87B95E5E…
- `trainers_state.json`（203B）636FF516…

## 次回実機テストで見るべきログ行

殻の検証パネル（ログ欄）で、音声つき /2 が届いた手について：

1. `ボイス: /2_NNN の再生を開始しました（経路 要素直接|URL、kind=…、URL scheme=… ext=… len=…）` —— まず経路と URL 形式。手020と同じ形（video-element＋blob:）なら「要素直接」になるはず。
2. 続く成否行のどれか1つだけが出る：
   - `ボイス: /2_NNN の音声を自動再生しています（経路 …、state=… promise=resolved ct=X.XX→Y.YY …）` —— **ct が増えていれば本当に再生が進んだ**裏付け。耳でも鳴っているはず。
   - `自動再生が拒否されました（NotAllowedError …）` —— ポリシー拒否。Promise の拒否として確定記録される。
   - `再生エラーになりました（… errCode=N …）` —— リソース側の失敗。errCode と net=/ready= が切り分け材料。
   - `再生が進んでいません（無音の可能性）` —— 開始はしたが ct が動いていない。診断文字列（paused／ready／net）を見る。
3. `プレイヤー要素がミュート状態だったため、解除して再生します` が出たら、手020の無音の一因はミュートだった可能性が高い。
4. 発火は1手1回だけのはず（開始ログが同じ手番で2回出たら、それ自体がバグ報告になる）。

## 残置事項

- バックアップ `era_runtime_backup_20261111_t7\` は当面そのまま保持（過去分と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer7.ps1`・`build_verify_transfer7.ps1`・`transfer7_md5.txt` に保存）。
- 要素直接経路でも鳴らない場合の次手は診断ログ次第（特に Promise 拒否の有無と errCode）。クリック収穫のような侵襲的な段は今回も入れていない。
