# 殻転送・ビルド報告（第8回：2026-11-11）

対象：EraShellSpike（PC `C:\Users\Monte\era_shell_spike\`）。転送元はローカルの現行マスター（新規開始バグの修正＋音声診断の次段まで）。殻の起動・ログイン操作はしていない（確認はビルド成功＋ファイル整合＋PC側隔離スモークまで）。

## 件1：新規で開始できないバグ — 原因特定と修正

### 原因（特定できた）

マスターの見立て（「新規作成キャラのデータが足りない」）が方向として正しかった。実体はフィールド不足ではなく、**作成キャラの定義エントリそのものが辞書から消えていた**こと。

- charcopy で作った base_2 の定義は、エンジンが `data/characters.json` に書き込んでいた。しかし characters.json は殻の転送ファイルでもあり、**転送⑤⑥⑦のたびにローカル正本（base・栞のみ、MD5 `40f01b49…`）で上書き**されていた。転送⑤（00:16頃）で base_2 の定義が消失。
- base_2 のセーブとログは転送対象外のため残存。再開リストにはセーブが出るのに、エンジンの start は定義が無いため `unknown character: base_2` で失敗し、新規リストにも出ない状態になっていた（base_2 の開始成功記録は定義消失前の 23:57:45Z が最後）。
- フィールド単位の比較も実施：charcopy の複製形（definitionCopyOf）は base の定義（id／name／note／personality／traits／initOverrides、look は元にある場合のみ）と過不足なし。プール候補（poolgen）のレコードも開始に必要な項目を欠いていない。欠けていたのは「エントリの存在」自体だった。

### 修正（エンジン＋殻）

- **定義の置き場を分離**（`engine/src/cli.ts`）：配布辞書 `characters.json` はエンジンが決して書き換えない。実行時に生まれる定義（charcopy の複製・poolgen の候補・poolregister の昇格上書き）は新設の **`data/characters_added.json`** を正本とし、読み込み時にマージする（同 id は added が置換、tombstone `deleted` 対応）。`persistChars` は実行時差分だけを added へ書く形に変更。
- **base_2 の定義を復旧**：charcopy の複製形そのまま（base の定義コピー＋名前「素体タイプ（2）」）を PC 出力側の `data/characters_added.json` として配置（MD5 `C8678E2C…`）。t8 バックアップにも含まれている。ローカル正本の data には入れていない（転送対象にすると同じ事故が再発するため）。
- **殻側の追随**（`MainForm.cs`）：開始ダイアログの辞書読み込みも characters.json＋characters_added.json のマージに変更（エンジンと同じ規則）。
- **観測性の追加**：
  - 開始ダイアログで「セーブはあるのに定義が無い」キャラを名指しで警告（`エンジン: 注意: …のセーブはありますが、定義が辞書にありません`）。
  - エンジン start の失敗理由を区別（セーブが残っている場合は `unknown character: X（セーブは存在しますが定義がありません）`）。
  - `StartEngineSessionAsync` は応答なし（null）の場合も開始失敗としてログに残す（従来は無言で戻っていた）。

### 検証（隔離ホーム・ソース実行、全29項目パス）

- 経路別 start：base の新規（セーブなし／破棄新規）・再開、charcopy→base_2 の新規、2代目 charcopy（base_2_2）の新規、poolgen→未登録のまま開始は正しく失敗→poolregister→新規、栞の新規、孤児セーブ／未知 id の失敗理由。
- **転送再現テスト**：エンジンプロセスを再起動した状態（＝辞書が配布形に戻った状況）でも、base_2／base_2_2／登録済み候補の再開・新規が全て成功。characters.json は最後まで配布形（base,shiori）のまま無変更、実行時エントリは characters_added.json に保持されることを確認。
- 既存回帰：`bun test` 11/11 パス（charcopy のリプレイ統合テスト含む）。

## 件2：音声が聞こえない問題の次段（診断材料の実装）

手021では要素直接再生が ct 進行まで確認できたのに聞こえなかった。追加した切り分け材料：

- **要素の volume を診断に追加**：両経路の状態読み（JsVoiceStatus／JsVoiceElementStatus）が `volume` を返すようになり、成否ログの診断文字列に `muted=… vol=…` が入る。あわせて URL 経路でも再生前に `muted=false／volume=1` を明示する（要素直接経路は従来から実施）。
- **ブラウザ側ミュート（CoreWebView2.IsMuted）**：音声の発火ごとに読み、開始ログに `ブラウザミュート=false／true→解除` として残す。効いていた場合は解除してその事実をログに残す（要素ミュートとは別物で、こちらが効いていると要素側で何をしても無音になる）。
- **検証パネルに「テスト音」ボタンを追加**（音声の行）：ページ内で 880Hz・約0.6秒のビープを AudioContext で生成して鳴らす。成否は通常の音声診断と同じ形式でログに残る（`ボイス診断: テスト音を開始しました（ctx=…、ブラウザミュート=…）` → `テスト音が再生されました（ctx=running promise=resolved ct=X→Y）。殻（ページ）から音は出ます。`／`テスト音が進んでいません（無音の可能性）`／`テスト音が拒否されました`）。AudioContext が suspended のままなら、要素以前にページの音声自体がポリシーで止まっていることが分かる。

## 手順の実施結果

| 段取り | 結果 |
|---|---|
| 殻の停止確認 | `EraShellSpike`／`era-engine` プロセス数ともに 0（未起動）を確認してから着手。kill はしていない |
| ローカル検証 | JS 生文字列ブロック23件（新規2件＝テスト音を含む）を抽出し `node --check` 全通過。ローカル dotnet8 ビルド **0エラー**（警告は既知の MSB3277 のみ）。エンジン exe を再ビルド（MD5 `c5c86a68…` → `d496bac4…`） |
| 実行時データのバックアップ | ビルド出力 `bin\Release\net8.0-windows\engine\` 一式を **`C:\Users\Monte\era_runtime_backup_20261111_t8\engine\`** へ退避（27ファイル／117,097,176B、復旧した characters_added.json を含む）。MD5 マニフェストを同フォルダの `md5_manifest.txt` に保存 |
| 転送 | プロジェクト直下4点＋ engine\ 配下17点＝計21ファイル。差分の実体は `MainForm.cs`（`6170abe6…`）／`engine/src/cli.ts`（`ec95b468…`）／`engine/era-engine.exe`（`d496bac4…`）／`engine/README.md`（`a1fa7912…`）。**`data/characters_added.json` は転送対象に含めていない**（実行時データとして出力側にのみ存在） |
| PC ビルド | 前景 `dotnet build -c Release`、**0エラー**（2.29秒）。dll は 363,520B に更新（2026-11-11 01:20） |
| 転送整合 | プロジェクト側21ファイル・ビルド出力側 engine 17ファイル、全てローカル正本と MD5 一致（PROJ_MD5_BAD=0／OUT_MD5_BAD=0） |
| PC 隔離スモーク | 出力一式のコピーで新 exe を実行：base_2 の新規開始→talk 実行→charcopy（base_2_2 生成）→base_2_2 の新規開始→base_2 の再開、全て ok。スモーク側の characters_added.json に base_2＋base_2_2 が入り、characters.json は配布形のまま。スモーク用コピーは除去済み |

## 実行時データの検証（復元不要だった）

ビルド後も出力側の実行時ファイルは転送前と全て MD5 一致（無傷）：

- `characters\base.json`（222,751B）E9D9AFA7…
- `characters\base_2.json`（30,282B）9FCAA5ED…
- `characters\shiori.json`（108,735B）E36497BE…
- `logs\base.jsonl`（69,461B）C3A38433…
- `logs\base_2.jsonl`（2,190B）39CC2CF6…
- `logs\shiori.jsonl`（26,320B）87B95E5E…
- `trainers_state.json`（203B）636FF516…
- `data\characters_added.json`（復旧分）C8678E2C… — ビルド後も出力側に現存

## 次回セッションでの確認手順（マスター向け）

1. **開始まわり**：エンジン開始ダイアログで「名前を付けて新規」や base_2 の再開／新規が普通に通ること。ついでに新規で作ったエントリが、殻を再起動しても開始リストに残っていること。
2. **音声は順番に**：
   1. 検証パネルの「テスト音を鳴らす」を押す → ビープが聞こえるか＋ログの `ボイス診断: テスト音…` 行（ctx と ct の進行）。
   2. チャット画面で /2 のプレイヤーを直接クリック → 聞こえるか（音そのものと出力経路の確認）。
   3. 通常プレイで音声つき /2 の自動再生 → 聞こえるか＋成否ログの `muted=／vol=／ブラウザミュート=` を確認。

## 残置事項

- バックアップ `era_runtime_backup_20261111_t8\` は当面そのまま保持（過去分と同格）。
- 検証用スクリプトは PC 側から除去済み（ローカル `~/workspace/pc_ssh/prep_transfer8.ps1`・`build_verify_transfer8.ps1`・`smoke_transfer8.ps1`・`transfer8_md5.txt` に保存）。
- 辞書の正本が2ファイル（characters.json＋characters_added.json）に分かれたため、配布パック側の構成に characters_added.json をどう位置づけるかは未決（パックは初期状態の配布物なので、実行時ファイルは含めないのが自然。判断はマスター）。
- テスト音でも鳴らない場合の次手は診断ログ次第（ctx の状態とブラウザミュートの値が起点）。
