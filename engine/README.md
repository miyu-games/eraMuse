# eraMuse engine/ — エンジン一式（殻プロジェクト内蔵）

殻（EraShellSpike）が子プロセスとして起動するローカルエンジン一式。
オンライン／オフラインで一式は完全に共通であり、違うのはチャット層
（流し込み＋/2 介入）が生きているかどうかだけ（`layout.json` 参照）。

## 構成

| 置き場 | 中身 |
|---|---|
| `era-engine.exe` | アダプタの standalone 実行ファイル（bun build --compile、Windows x64、追加ランタイム不要） |
| `src/cli.ts` | アダプタ本体（stdin/stdout の JSON 行往復） |
| `src/replay.ts` | 汎用リプレイヤー（セーブ＝初期シード＋opログ列 の再生・照合。下記「セーブ方式」参照）。テストは `src/replay.test.ts`（`bun test`） |
| `src/engine.ts` | エンジン核。もと Space 正本のコピーだが、セッション骨格改修（2026-11-09）でこちらが正になった（下記「改修による乖離」参照） |
| `src/gamedata.ts` | 数値・定義表。同上（unlock 欄のみ原作 COMABLE 形へ置換済み） |
| `data/narration.json` | 地の文辞書 492 件 |
| `data/kojo.json` | 口上辞書 2,032 件 |
| `data/characters.json` | キャラ定義（base / shiori） |
| `data/trainers.json` | 調教主プロフィール（default / myu。id・名前・初期資金と、調教師シート sheet＝性別・技巧Lv初期値・射精ゲージ上限・素質） |
| `data/trainer_traits.json` | 調教師素質マスター（シートの traits が持てる id の正本。効果は未配線） |
| `trainers_state.json` | 調教主ごとの永続進捗（技巧Lv・堕落人数・残高）。対象のセーブとは別ファイル（下記） |
| `characters/<id>.json` | キャラごとのセーブ（GameState JSON。そのままコピーして持ち運べる）。セーブ方式の確定（下記）では作業用スナップショット（キャッシュ）の位置づけ |
| `logs/<id>.jsonl` | キャラごとのオペレーションログ（1行1op。`commandId` キーで実行コマンド履歴が追える）。start レコードの `rngSeed` と合わせてセーブの正本（下記「セーブ方式」） |

## 起動方法（殻からの利用）

殻は起動時に次を子プロセスで実行する:

```
era-engine.exe --home <このフォルダの絶対パス>
```

- 入力: stdin に JSON を1行ずつ（例 `{"op":"start","characterId":"base"}`、
  `{"op":"execute","command":"talk"}`、`{"op":"end"}`（調教終了）、
  `{"op":"buy","abilityId":"sense_c"}`、`{"op":"next"}`（旧名 `nextday` も可）、
  `{"op":"ending","choice":"keep"}`、`{"op":"extend"}`、
  `{"op":"getstate"}`、`{"op":"setdialogue","text":"…"}`）
- 出力: stdout に応答 JSON が1行ずつ。応答には `snapshot`（区画4用）、
  `narration1` / `narration3`（区画1/3用）、`dialogue`（在庫口上、区画2用）、
  `commands`（id/label/category/unlocked）、`phase`（play/menu）、
  `day` / `slot`（0=午前・1=午後）/ `sessionSeq` / `collapsed` /
  `finished` / `ending` が含まれる。
- 状態は毎 op 後に `characters/<id>.json` へ保存され、`start`（fresh でない
  場合）で再開される。ログは `logs/<id>.jsonl` に追記される。
- `start` には `trainerId` を追加できる（未指定は `default`）。調教主
  プロフィールの一覧と現在値は op `trainers` で取得できる。

## 調教主（開始時に選ぶ側のキャラ）

原作の @FIRST_SETTING と同じく、調教主も開始時に選ぶキャラとして扱う。
プロフィール定義は `data/trainers.json`（id・名前・初期資金 fundsStart と、
調教師シート `sheet`）。シートはキャラデータとしての調教主の静的定義で、
性別 sex（male / female / futanari）・技巧Lv の初期値 skill・射精ゲージ
上限 ejacMax（既定 10000）・調教師素質 traits（id 配列、正本は
`data/trainer_traits.json`）を持つ。旧形式（sex / skillStart の直置き）も
読み込み時にシートへ寄せて互換を保つ。セッション開始時にシートは状態へ
作業コピーとして写り（trainerSex / trainerTraits / trainerEjacMax）、
スナップショットには `trainerSheet` としても出る。射精の発火判定・減算と
表示上限は trainerEjacMax を参照する（ゲージ現在値は従来どおり
resources.ejac）。素質は器のみで、効果（@PLAYER_SKILL_CHECK の相互作用
など）は未配線＝計算に影響しない。
原作では調教主（キャラ0）は対象を跨いで残る存在のため、進捗のうち
技巧Lv（ITEM:52 で上昇）と堕落人数（陥落素質の新規獲得で増加）と
お金の残高は、対象のセーブではなく調教主側の永続ストア
`trainers_state.json` が正本。セッション状態の同名フィールド
（allowance が残高の作業コピー）は、`start` 時にストアから流し込まれ、
保存のたびにストアへ書き戻される。対象を替えて新規開始しても、同じ
調教主なら技巧Lv・堕落人数・残高は引き継がれる。

- 再開時はセーブに記録された調教主が正で、開始リクエストの `trainerId`
  では差し替わらない。
- 調教主の性別はシート項目（sheet.sex）として正式化されセッションに
  保持されるが、現行エンジンに調教主の性別で分岐する判定は無い
  （装備前提のコマンド可否など、該当箇所自体が現行カタログに無いため
  作っていない）。
- お金（お小遣い）の置き場は調教主側。残高はストアの `funds` で、
  初回利用時にプロフィールの `fundsStart`（既定 1000）で種付けされる。
  セッション終了ごとの +100 付与はこの残高への加算になり、メニューの
  器具購入もこの残高から引かれる（区画4の残高表示＝調教主残高）。
- 開始前購入: op `buytrainerskill`（`{"op":"buytrainerskill","trainerId":"myu"}`）
  で、セッション開始前でも ITEM:52【技巧Lv】を調教主残高から買える。
  可否規則（価格 50、上限 Lv10 のみ。堕落人数ゲートは撤廃済み）は
  メニュー購入と共通。
  器具類の開始前購入はしない（所持 inventory がセッション側のため。
  開始前は ITEM:52 のみ）。

### 旧セーブの移行

調教主プロフィール導入前のセーブ（`trainerLinked` が無い／false）は、
初回読み込み時に一度だけ移行する: セーブに記録された調教主（旧形式で
調教主自体が記録されていない場合は、開始リクエストの `trainerId`、
無ければ `default`）のストア記録へ、セーブ側の技巧Lv・堕落人数を
**大きい方で** 合流させる（合算はしない＝二重計上にならない）。移行後は
ストアが正本になり、セーブ側はストアの値で上書きされる。
残高（funds）も同じ規則: funds 導入前のストア記録は初回に fundsStart
で種付けされ、未リンクの旧セーブについてはセーブ側のお小遣い残高と
大きい方で合流する（旧セーブの累積が消えたり二重になったりしない）。
調教師シート導入前のセーブ（trainerTraits / trainerEjacMax が無い）も
同じ枠組み: normalizeState が既定（素質なし・上限 10000）で補完し、
未リンクのセーブについては初回読み込み時にプロフィールのシート値
（性別と同じ規則）で上書きされる。

## セッション骨格（原作形、2026-11-09 改修）

- 1日 = 2セッション（午前・午後）。調教はコマンド回数の上限なく続き、
  調教終了（op `end`）でセッションが終わる。区切りは資源: 気力が 0 以下
  になると体力消費が ×2+80 になり、体力が 0 以下になると倒れて
  セッションが強制終了する（そのセッションの珠精算は無し）。
- 珠の精算は調教終了時にセッション単位で行う（旧: 1日3行動モデルの
  日次精算）。能力の購入は調教終了後のメニュー（phase `menu`）でのみ。
  メニューで `next` を選ぶと次の時間帯へ進み、体力は時間帯で
  最大/10（午前→午後）または最大/2（午後→翌日）回復、気力は全回復する。
- 期間は 14日 = 28セッション。最終日の午後が終わったメニューで `next`
  を選ぶと期間終了（finished）になり、延長（extend）か終了分岐を選ぶ。

## セーブ方式（確定: 初期シード＋opログ列、2026-11-10）

セーブの正本は「初期シード＋オペレーションログ列」と確定する。

- **正本**: `logs/<characterId>.jsonl` の op 列と、その先頭の start
  レコードに記録される `rngSeed`（および新規開始時の調教主の
  ハイドレーション結果 `trainerStart`）。エンジンの乱数は
  (rngSeed, rngRolls) のカウンタ式で全て決まるため、この2点と op 列
  があれば任意の時点の状態が完全に再現できる。再現の実装は
  `src/replay.ts`（汎用リプレイヤー）:
  `bun src/replay.ts --home <元のホーム> --log <logs/xxx.jsonl> --work <再生ホーム>`
  で、記録された op を本番 CLI へ順に流し、各 op の応答（ok・
  実行コマンド＝派生結果・位置）と最終スナップショット／状態ハッシュを
  元セーブと照合した判定 JSON を出す。
- **GameState JSON（`characters/<id>.json`）は併用する作業用
  スナップショット**（移行ではなく併用）: 再開の高速化と可読性のため
  従来どおり毎 op 保存され、`start` の再開は当面こちらから行う。
  位置づけはキャッシュであり、正味の正はログ列＋シード。JSON が
  失われてもログから再生成でき、逆にログの無い JSON も従来どおり
  再開に使える。
- **RNG 情報の置き場はセーブ（セッション）側**: `rngSeed` / `rngRolls`
  はキャラ定義（`data/characters.json`）には置かない。現在のロール
  位置はセッションの状態であってキャラの同一性ではなく、同一キャラの
  複数セーブ／分岐がそれぞれ独立に (seed, rolls) を持てるため競合
  しない。キャラ側に置くとしても初期シードの「種」までが自然な線引き
  （例: そのキャラはいつも同じ種で始まる、という同一性の一部として
  定義に固定種を持たせる場合）で、ロール位置や途中の検証値をキャラ側
  へ上げることはしない。再生検証は start レコードの seed と、再生後の
  rngRolls＋正規化ハッシュ（時刻フィールドを潰した安定文字列化の
  SHA-256）の照合で閉じる。
- **旧形式ログの再生範囲**: ログ拡張（2026-11-10）より前のログには
  `rngSeed` / `trainerStart` / extend の `days` / setdialogue の
  `text` が無い。シードは元セーブの `rngSeed` で補えるが、開始時点で
  トレーナーストアが素でなかったセッション、既定（14日）以外の
  extend を使ったセッションは完全再生できない（setdialogue の本文は
  復元不能で、dialogue のみが食い違う）。完全再生の前提は「ログが
  新規開始（fresh start）から揃っていること」。

## 改修による乖離（Space 正本との差）

セッション骨格改修で、engine/ 側が正になった（Space 試作には触っていない）:

- `src/engine.ts`: セッション形（1日2セッション・資源による区切り・
  倒壊判定）、精算タイミング（調教終了時）、購入のメニュー化、旧セーブの
  移行（normalizeState）を実装。数値テーブル類には触っていない。
- `src/gamedata.ts`: COMMANDS の `unlock` 欄のみ、パック側の数値ゲートから
  eraMaou COMABLE 形（状況条件）へ置換。その他の数値表は従来どおり。
- 詳細と実測根拠: `~/workspace/era_proto/research/session_restructure_report.md`。

## 再ビルド（exe の作り直し）

```
bun build src/cli.ts --compile --target=bun-windows-x64 --outfile era-engine.exe
```

（このフォルダで実行。改修は engine/ 側で行い、Space 側へは逆流させない。）

## 原作準拠レイヤー（2026-11-09 追加）

eraMaou JP 0.930 実測に基づく追加層。詳細と差分一覧は
`~/workspace/era_proto/research/engine_fidelity_report.md`。

- **刻印・経験**: `GameState.marksReal`（苦痛/快楽/屈服/反発、
  @MARK_GOT_CHECK 形）・`expReal`（調教/奉仕快楽/異常/V/A/性交/
  自慰/精液/絶頂の各経験）・`fallTraits`（愛/淫乱、
  @CHECK_SPECIALSKIL 形、調教終了時に判定）。スナップショットにも
  `marksReal` / `expReal` / `fallTraits` を追加した（表示は殻側の判断）。
- **コマンド実行判定**: `gamedata.ORDER_JUDGES` のあるコマンドは
  @COM_ORDER 方式の実行値ゲート（決定論）を通る。通らない手は
  実行自体が不成立（コスト・経験・初回消費なし）。
- **購入**: ABLUP 実測価格 + 経験/能力/異常経験/解放上限の各ゲートが
  機能する。`abl_buyoff` は ABLUP99 の反発刻印消去、`abl_addiction`
  （快楽中毒）は原作に無い能力のため購入対象外。
- **精算**: 習得の珠は習得（PALAM:7）蓄積から、否定の珠は
  反感・不快・抑鬱の3チャンネル階段合算から（不快は入力ソースが
  無く現状 0）。
- **欲情帯**: CUP の帯倍率は部位別（V/A は専用表）。
- **名称**: 道具系コマンドの表示名を一般名へ差し替え済み
  （ローター/ディルド/E・マッサージャー 等。id・数値は不変）。
  会話する（talk）のカテゴリは「コミュニケーション」。
- exe の再ビルドは未実施（PC 転送時に殻側と合わせて行う）。
