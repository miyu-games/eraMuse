# リポジトリ更新報告（第3回：2026-11-10）

対象：kisaragi101/eraMuse（PC `C:\Users\Monte\eraMuse_repo\`）。

## 研究レポート置き場の新設

- ルートに `research/` を新設し、開発レポート＋設計メモ **35件** を収録（era_pack／era_repo_tree 両方に同内容で配置、PCへ転送後にMD5全件一致を確認）。
- 安全確認：候補35件を実名（本人の姓名）・認証情報・キー類のパターンで走査し、混入なし。除外ファイルは **なし**（パスワードへの言及は方針記述のみで実値なし、`monte`／`C:\Users\Monte` のパスは既存パックと同範囲として可）。
- 対象外として残したもの：接頭辞セット外の解析メモ類（eramaou_structure.md、eraten_*.md、addiction_transplant.md 等）と、外部投稿用ドラフト（tech_room_*_draft.md）、angel_style_profile.md。これらは今回の指定範囲外のため未収録（必要なら追加指定で入れる）。

## 配布側 characters.json の整理（同日追加決定）

- `engine/data/characters.json` から base（素体タイプ）と shiori（栞）を除外し、プール候補4件（凛 cand_20261109・遥 cand_20261110・オリガ cand_20261111・弥生 cand_20261112）のみを `registered: 0` の初期状態で収録。comment はプール専用である旨に更新。
- 検証（隔離コピーでソース起動）：`pool` で候補4件が返り、`start base`／`start shiori` は unknown character で不成立＝配布側から消えていることを確認。
- 触っていないもの：PC側の殻のセーブ（base 試遊 Day 2・栞）、ローカル正本 `era_shell_spike/engine/` の characters／data（base・栞の定義は正本側に現存）。

## Git

- commit **`0da6a5b` "eraMuse pack"**（36 files changed：research 35件新規＋characters.json 変更）。
- push は従来どおり SSH からは資格情報ストアが開けず未実施。現在 **ahead 2**（aa356a3＋0da6a5b）で、本人が `push_eramuse.cmd` をダブルクリックすれば両方とも push される。
