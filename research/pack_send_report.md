# eraMuse パック更新・PC 送付報告（2026-11-10）

GitHub への push・公開操作はしていない。push は本人の対話セッション専用として .cmd の用意まで。

## 1. パック更新（~/workspace/era_pack/）

エンジンを現行形（調教師シート実装込み）へ差し替え：

| 差し替え物 | 内容 |
|---|---|
| `engine/era-engine.exe` | 再ビルド済み現行 exe（115,437,056 バイト）。正本と MD5 一致 |
| `engine/src/*.ts`（4ファイル） | cli.ts / engine.ts 含め現行形。MD5 一致 |
| `engine/data/trainers.json` | シート形（sheet: sex / skill / ejacMax / traits）。MD5 一致 |
| `engine/data/trainer_traits.json` | 新設の調教師素質マスタを追加 |
| `engine/README.md` | シート形に更新された現行版へ。MD5 一致 |

保持したもの：`engine/data/characters.json` はパック側（base・栞＋プール候補4件＝凛・遥・オリガ・弥生、registered: 0）をそのまま維持（シート実装は characters.json に変更なし）。narration / kojo / traits / trait_master / charroll / layout.json は元々同一で変更なし。`characters/_readme.txt`・`logs/_readme.txt` のパック形も維持。状態ファイル（trainers_state.json 等）はパック内に無し（無垢）。

README（~/workspace/era_pack/README.md）の追記・修正：

- `era-engine.exe` の項目に「リポジトリでは `era-engine.zip` に圧縮して収録。解凍して使う（zip のままでは動かない）」を明記。
- `data/trainer_traits.json` の項目を追加。
- 「現状（正直なところ）」の調教主素質の記述を差し替え：旧「受け皿は未実装」→ 新「器はある（シート＋マスタ、技巧Lv と射精ゲージ上限は実効）が、**素質の効果は未配線で、付けても数値は変わらない**」という正直な書き方のまま更新。

## 2. リポ形ツリー（~/workspace/era_repo_tree/）

- era_pack のコピーから `engine/era-engine.exe` を取り除き、`engine/era-engine.zip`（zip -9、55,428,897 バイト≒53MB、解凍すると exe 115,437,056 バイト）として収録。
- `.gitignore` を追加：実行時状態（engine/trainers_state.json、engine/characters/*.json、engine/logs/*.jsonl）と push_eramuse.cmd を除外。
- 全体：**575 ファイル / 64,822,628 バイト**。
- 隔離検証（コピーを /tmp に展開）：zip 解凍→exe のサイズと PE ヘッダ（MZ）を確認。エンジンをソース起動し基本フロー完通——trainers（両枠とも sheet 付き）→ start（base、trainerId=myu、コマンド82件、スナップショットに trainerSheet）→ execute×2 → end（menu 遷移）→ next（次セッション）→ execute → getstate、全応答 ok。検証用コピーは除去済み、ツリー自体は無垢。
- exe の Windows 実機起動確認は未実施（従来方針どおり、PC での試遊段とセットで担保）。

## 3. PC 側の配置（C:\Users\Monte\eraMuse_repo\）

- clone：`git clone https://github.com/kisaragi101/eraMuse.git` が資格情報なしで成功（公開リポ）。branch は main、HEAD はリモートの Initial commit（f3d165e、Web 作成時の README 9 バイト）。同梱 README はパックの README で上書き済み。
- 転送：pc_scp.sh でツリー一式（README.md / additions / engine / reference / .gitignore）を eraMuse_repo へ配置し、続けて push_eramuse.cmd を配置。
- 照合：PC 側（.git 除く）**575 ファイル / 64,822,628 バイト**でローカルツリーと完全一致。era-engine.zip と README.md は MD5 も一致（zip: e288e2ef50c576071db446a34c5be6f6）。
- git status は5エントリ（README.md 変更＋additions / engine / reference / .gitignore の新規）で、push_eramuse.cmd は .gitignore により除外されることを確認済み。

## 4. push 用 .cmd と本人の次の操作

`C:\Users\Monte\eraMuse_repo\push_eramuse.cmd`（ハコニワの push_hakoniwa_web.cmd の流儀、CRLF）を置いた。中身：

1. credential-manager で GitHub ログイン
2. `git add -A` → `git commit -m "eraMuse pack"`
3. `git push -u origin HEAD`
4. ログを `C:\Users\Monte\push_eramuse_log.txt` に残して表示、pause で止まる

**本人の次の操作は、この .cmd のダブルクリックだけ。** push 自体は実行していない。
