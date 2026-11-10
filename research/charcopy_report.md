# 名前を付けて新規（charcopy）実装報告（2026-11-10）

対象：ローカル正本 `~/workspace/era_shell_spike/` のみ。**PC転送はしていない**（殻はマスター使用中のため、転送は次回＝転送④の残作業）。

## 背景

殻の新規開始は1キャラ=1セーブの上書きで、既存セーブの破棄が必須だった。別名で新しいランを作る導線が無いことが問題の本体（マスター指摘）。従来の新規（破棄を伴う確認ダイアログ）は現状維持とし、別の導線を追加した。

## 実装

### エンジン側：op `charcopy`（src/cli.ts）

- リクエスト：`{"op":"charcopy","characterId":"base"}` → 応答 `{"ok":true,"characterId":"base_2","sourceId":"base","name":"素体タイプ（2）"}`。
- 複製されるのは「定義」だけ：名前・備考・性格・素質（id/src_mult/conv_mult）・初期値上書き（initOverrides）・見た目（look）。状態（セーブ）は複製せず、新エントリはセーブ無しで生まれ、そのまま新規開始できる。元キャラの定義・セーブには一切触らない。対象は登録済みキャラのみ（候補プールは「先に poolregister」エラーで案内）。
- **ID付番規則**：既定は自動で `<元id>_<n>`（n は 2 から。登録済み定義・候補プール・既存セーブファイルのどれとも重ならない最初の番号。孤児セーブのある id も避ける）。`newId` での明示指定も可（英数・`_`・`-` のみ、セーブファイル名になるため）。
- **表示名**：`newName` で微調整可。省略時の既定は `<元の名前>（<n>）`（n は id 末尾の番号と一致）。
- **冪等判定**：明示 id が既存で、その定義が「作ろうとしたコピー」と一致する場合は成功扱い（`alreadyExisted: true`）。中身の違う同名 id は衝突として失敗。リプレイの軌跡一致のための措置（下記）。

### リプレイヤー対応（src/replay.ts / cli.ts の op ログ）

- セッション中に実行された charcopy は op ログへ記録（要求フィールド `characterId`（＝複製元）・`newId`・`newName` ＋ 解決済み id `copiedId`）。
- 再生側 `reconstructMessage` に charcopy ケースを追加：copiedId を明示 id として作り直すため、自動付番の結果が再生環境の辞書状態に左右されず決定的。起点データにコピーが含まれている場合はエンジン側の冪等判定で成功扱いになり、軌跡（ok）が一致する。
- セッション外（開始ダイアログ）での実行はログに残らないが、定義は data/characters.json に残るため、新エントリ自身のログは start から完全再生できる（開始前購入 buytrainerskill と同じ扱い）。

### 殻側：開始ダイアログの導線（MainForm.cs）

- 「エンジン開始」ダイアログ下部に「名前を付けて新規」ボタンを追加。新規モードで登録済みキャラを選択中のみ有効（候補選択時は無効）。
- 押すと小ダイアログ（元キャラ名・自動 id の表示・名前入力欄）が出る。名前欄の初期値は提案名 `<元名>（<n>）`（n は殻側で既存 id から推定）。提案名のまま作成すると名前はエンジンへ送らず、エンジン既定名（実際の付番と一致）を使い、書き換えた場合だけ `newName` として送る。
- 作成成功後はキャラ一覧を読み直して新しいエントリを選択状態にする。そのまま「開始」を押せば新規開始できる（新エントリにセーブは無いため破棄確認は出ない）。
- 従来の新規（破棄確認ダイアログ）は無変更。キャラ一覧の読み込みは ReloadCharacters 化（作成後の再読込のため）。

### ドキュメント

- engine/README.md に「名前を付けて新規（op `charcopy`）」節を追加。cli.ts のヘッダ op 一覧にも追加。

## 検証（全て隔離コピー／ローカル）

- **エンジン統合スモーク**（`src/replay.test.ts` に追加）：隔離ホームで charcopy（自動付番 base→base_2→base_3、明示 id＋改名 shiori→shiori_b、冪等再実行、衝突・未知元の失敗）→ コピー先を開始して定義継承を確認（セーブの characterName・traitIds に kaifuku_hayai、元キャラのセーブは作られない）→ base_2 を新規開始（seed 固定）→ execute 2手 → セッション中 charcopy（base_2_2、op ログに copiedId 記録を確認）→ setdialogue → end → **リプレイ判定 ok（mismatches 0、snapshot/state 一致）**。
- bun test 全 11 件通過（既存の実セッション完全再生テスト含む、回帰なし）。
- JS 生文字列ブロック 19 件を抽出し `node --check` 全通過。
- C# ローカルビルド（dotnet8）**0 エラー**（警告は既知の MSB3277 のみ）。
- era-engine.exe を再ビルド（`bun build --compile --target=bun-windows-x64`、MD5 `c5c86a68…`、旧 `47e6a4a9…` から更新）。
- 正本の実データ無傷を確認：engine/data/characters.json は base・栞のみ、engine/characters・logs は空のまま。PC 側の base 試遊 Day 2・栞のセーブには一切触れていない。

## 残作業

- **PC転送④**：殻（MainForm.cs）とエンジン一式（cli.ts／replay.ts／replay.test.ts／README／era-engine.exe）を PC へ転送し、PC 側でビルド・実機確認（ダイアログの導線・作成→開始の流れ）。殻が閉じている時に実施する。
- リポジトリ反映（eraMuse パック側）も転送④と合わせて判断。
