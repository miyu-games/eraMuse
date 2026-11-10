# eraMuse リポジトリ更新報告（第2回・2026-11-10）

前回 push（commit `e1904a5` "eraMuse pack"）以降の成果物——表示修正バッチ／複合派生再構築／メディア枠スパイク（エンジン側 layout）／リプレイヤー対応——を含む最新エンジンを、パックとリポ形ツリーへ反映し、PC 側へ転送した。**commit は PC 側で完了（`aa356a3`）、push は認証のため本人のダブルクリック待ち**。

## 1. ローカル更新（era_pack / era_repo_tree）

正本 `~/workspace/era_shell_spike/engine/`（exe MD5 `47e6a4a9…`＝リプレイヤー対応ビルド）から差し替え。

| ファイル | 扱い |
|---|---|
| engine/era-engine.exe（パック側）／ era-engine.zip（ツリー側） | 最新 exe から再構築。zip は単一ファイル収録・zip -9、54,567,801 バイト。解凍した exe の MD5 が正本と一致 |
| engine/src/cli.ts / engine.ts / gamedata.ts | 差し替え（派生再構築・ローター統合・リプレイヤー記録拡張を含む） |
| engine/src/replay.ts / replay.test.ts | **新規追加** |
| engine/data/kojo.json / narration.json | 差し替え（ローター統合のセル張り替え等） |
| engine/layout.json | 差し替え（区画6＝メディア枠、セーブ方式の記述を含む） |
| engine/README.md | 差し替え（セーブ方式＝正本は初期シード＋opログ列、等） |

保持したもの：

- `engine/data/characters.json` はパック版（base・栞＋プール候補4件）を維持。base・栞のエントリが現行正本とバイト単位で同一であることを照合済み。
- ルート `README.md` は**無変更**（マスターの最終確認待ちのため文面に触れていない）。
- additions/・reference/・.gitignore・その他の data ファイルは変更なし。
- 状態ファイル（trainers_state.json 等）はツリー内に無し（無垢を維持）。

## 2. 検証（隔離コピーで実施）

- MD5 照合：ツリー／パックのエンジン系ファイル全件が正本と一致。
- ソース起動スモーク：trainers（2枠・sheet 付き）→ start（base／myu、表示コマンド63件＝カタログ82−マスク19）→ execute（talk×3、地の文・口上応答あり）→ end → next → execute → getstate、全て ok。低ステータスでの kiss は原作形の実行値ゲートで不成立（正常挙動）。
- リプレイ照合：上記セッションの実ログ（9 records）を `src/replay.ts` で再生し、mismatch 0・最終ハッシュ一致（ok: true）。

## 3. PC 側（C:\Users\Monte\eraMuse_repo）

- 差分10ファイルを pc_scp で転送（eraMuse_repo 配下のみ）。PC 側 MD5 はローカルと全件一致。転送前の git status はクリーン、HEAD は `e1904a5` だった。
- `push_eramuse.cmd` を pc_ssh 前景で実行：SSH 切断後も .cmd は継続し、**add／commit は成功**（新 commit `aa356a3` "eraMuse pack"、10 files changed, +1008/−115、replay.ts／replay.test.ts 作成）。**push は失敗**：`Unable to persist credentials with the 'wincredman' credential store` / `could not read Username`（exit 128）。SSH セッションから資格情報ストアが開けないという従来どおりの制約。
- 現在の状態：`main...origin/main [ahead 1]`。**残る操作は本人が push_eramuse.cmd をダブルクリックして push するだけ**（commit は済んでいるので、.cmd 内の commit 手順は空振りして push が通る）。

## 4. 判断に残した点

1. **研究レポート類はリポジトリへ入れていない**：現行のパック構成（pack_assembly_report.md）にレポートの置き場が無く、レポートには内部のパスや作業手順が含まれるため、構成変更として独断しなかった。入れる場合は置き場（例：`docs/` か `research/`）の指定が要る。
2. **ルート README の現状記述**：今回の更新で「セーブ方式（リプレイ）」と「メディア枠（区画6）」がエンジン側 README／layout には入った。ルート README の「現状（正直なところ）」にこの2点を追記するかは、最終確認と合わせてマスター判断。
3. **engine/layout.json の文言**：data/ の項に「正本は当面 Space 側、書き出し同期」という配布前提と合わない記述が正本側に残ったまま同梱されている（pack_assembly_report からの継続の判断待ち。機能影響なし）。
4. 殻アーカイブ（パスワード付き）は既定方針どおり今回も含めていない（試遊通過後）。
