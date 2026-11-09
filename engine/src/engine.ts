// era式エンジン（eraMuse 殻のコア）
// 元: ~/workspace/era_proto/pack/engine.py の do_command / end_day / marks /
// resolve_ending の核部分の TypeScript 移植（コンソール試作 erashi-konsorushi-zuo
// の engine.ts と計算仕様は同一）。コマンド→ソース→変換式→パラメータの2段計算、
// 帯域判定、実行判定、疲労ガード、閾値イベント、到達記録（刻印）、終了時の
// ランク判定を再現する。
//
// 地の文はここには持たない。実行時に辞書（narration_entries）から
// コマンドID × 帯域 × 初回/反復 で引いた文を受け取ってログに流すだけ。
// ログ行の末尾印: 地の文・イベント文 = ",1"、数値サマリー・日付/終了通知 = ",3"。

import {
ABILITIES,
ADDICT_CONV_M0,
ADDICT_CONV_M1,
CATEGORY_COSTS,
COMMANDS,
CONSUMABLE_USE,
CONVERSION,
DEFAULT_DAYS_LIMIT,
DEFAULT_GOAL,
ENDING_TEXTS,
EJAC_ANAL_LUBRICATION_MULT,
EJAC_DESIRE_MULT,
EJAC_LUBRICATION_MULT,
EJAC_OBEDIENCE_MULT,
EJAC_SERVICE_MULT,
EJAC_SKILL_MULT,
DIRTY_DISCOMFORT_OBED,
DIRTY_HATE_OBED,
DIRTY_SERVICE_MULT,
DIRTY_SOURCES,
EVENTS,
EXP_GAINS,
ITEM_DEFS,
JUEL_CURRENCIES,
JUEL_STAIR_THRESHOLDS,
JUEL_STAIR_VALUES,
LEARN_STAGES,
MARKS,
MAST_ADDICT_SOURCE,
MAST_PLEASURE_MULT,
ORDER_JUDGES,
PARAM_DEFS,
PART_SENSE_ABILITY,
SEMEN_ADDICT_EJAC,
SEMEN_EJAC_GAUGE_MULT,
SENSE_MULT,
SERVICE_FLAG_COMMANDS,
SOURCE_IDS,
SOURCE_LABELS,
YIELD_MARKS,
type AbilityDef,
type CommandDef,
type ItemDef,
type OrderJudgeDef,
} from "./gamedata";

// ---------------------------------------------------------------- types

export interface StatusSnapshot {
day: number;
daysLimit: number;
/** 時間帯スロット: 0 = 午前 / 1 = 午後（原作 TIME）。1日 = 2セッション。 */
slot: number;
/** 時間帯ラベル（"午前" / "午後"） */
slotLabel: string;
/** セッション通し番号（1始まり。精算ガードのキー） */
sessionSeq: number;
/** 直前のセッションが倒れて終わったか（原作の死亡判定の eraMuse 形） */
collapsed: boolean;
/** 素質IDの一覧（能力表示シートの素質欄用） */
traits: string[];
params: { id: string; label: string; value: number; max: number | null}[];
goal: { id: string; label: string; value: number; target: number; met: boolean}[];
marks: { id: string; label: string; lv: number}[];
/** ソース累計（srcGain）。旧形式の保存スナップショットには無いので任意。 */
sources?: { id: string; label: string; value: number}[];
/** 珠（8通貨、パック定義順）。旧形式の保存スナップショットには無いので任意。 */
jewels?: { id: string; label: string; value: number}[];
/** リソース（体力/気力/射精）。旧形式の保存スナップショットには無いので任意。 */
resources?: {
vital: number; vitalMax: number;
energy: number; energyMax: number;
ejac: number; ejacMax: number;
};
/** 能力一覧（カタログ順）: 現在Lv と次Lvの価格。旧形式には無いので任意。
 * nextCost は現在Lvに対する価格（購入は調教終了後のメニューで
 * 即時成立するため先読みは不要）。queued は互換フィールドで常に 0。 */
abilities?: {
id: string; label: string; lv: number; maxLv: number; queued: number;
nextCost: { juelId: string; juelLabel: string; amount: number }[] | null;
}[];
/** EX:部位絶頂（永続カウント、C/V/A/B/F）。旧形式には無いので任意。 */
exClimax?: { kai_c: number; kai_v: number; kai_a: number; kai_b: number; kai_f: number };
/** 絶頂経験（永続、倍率適用前の強度合計）。旧形式には無いので任意。 */
climaxExp?: number;
/** 快楽刻印（永続、0〜3）。旧形式には無いので任意。 */
pleasureMark?: number;
/** 原作刻印（苦痛/快楽/屈服/反発、@MARK_GOT_CHECK 由来）。任意。 */
marksReal?: { pain: number; pleasure: number; submission: number; rejection: number };
/** 経験カウンタ（train/service/abnormal/v/a/sex/mast/semen/climax）。任意。 */
expReal?: Record<string, number>;
/** 陥落素質（"ai" = 愛 / "inran" = 淫乱）。任意。 */
fallTraits?: string[];
/** 射精回数カウンタ（原作の射精経験相当。発火時に段位分増える）。旧形式には無いので任意。 */
ejacCount?: number;
/** 潤滑（PALAM:3 相当のプレイ内変数。パラメータでも珠でもない）。
 * 旧形式の保存スナップショットには無いので任意。 */
lubrication?: { value: number; label: string };
/** お小遣い（アイテム購入の通貨、§9.1 設計）。任意。 */
allowance?: number;
/** 所持アイテム（アイテムID → 個数。技巧Lv は含まない）。任意。 */
inventory?: { itemId: number; label: string; count: number; consumable: boolean }[];
/** 調教者の技巧Lv（ITEM:52【技巧Lv】で上がる主人側能力）。任意。 */
trainerSkill?: number;
/** 堕落人数（陥落素質の獲得数。技巧Lv の購入ゲートは撤廃済みで記録のみ）。任意。 */
fallenCount?: number;
/** 調教主プロフィール（開始時に選んだ側のキャラ、data/trainers.json）。
 * trainerSkill / fallenCount の正本は調教主側の永続ストア
 * （<home>/trainers_state.json）にあり、ここの値はセッション中の
 * 作業コピー。任意。 */
trainerId?: string;
trainerName?: string;
/** 調教主の性別（male / female / futanari）。調教師シート
 * （trainers.json の sheet.sex）の写しで、シート項目として正式化
 * 済み。現行エンジンに性別で分岐する判定は無い（実在しないゲートは
 * 作らない方針）。任意。 */
trainerSex?: string;
/** 調教師素質の id 配列（調教師シートの写し、trainer_traits.json が
 * 正本）。器のみで、素質の効果（@PLAYER_SKILL_CHECK 等の相互作用）
 * は未配線。任意。 */
trainerTraits?: string[];
/** 調教師シート全体の写し（性別・技巧Lv・射精ゲージ上限・素質）。
 * 技巧Lv はセッションの作業コピー（trainerSkill）と同値。任意。 */
trainerSheet?: { sex: string; skill: number; ejacMax: number; traits: string[] };
/** 購入可能な品目の一覧（メニュー表示用。値段と所持数を併記する形）。
 * canBuy が false の理由は reason に入る。任意。 */
shopItems?: {
itemId: number; label: string; price: number; count: number;
consumable: boolean; special: boolean; canBuy: boolean; reason: string;
}[];
/** 見た目データ（キャラ定義の look の写し。能力表示2枚目用）。
 * 定義が無いキャラでは null。任意。 */
look?: LookData | null;
/** 媚薬まわり（残留度と媚薬中毒フラグ）。任意。 */
aphro?: { residue: number; addict: boolean };
/** 精飲絶頂まわり（強制回数・精飲経験・精飲絶頂回数・精愛味覚）。任意。 */
seiin?: { count: number; exp: number; climax: number; taste: boolean };
}

/** 見た目データ（eraMaou @GET_LOOK_INFO の軸の受け皿）。
 * 全軸任意で、定義にある分だけを持つ（無い軸は表示しない）。
 * 機械可読性優先のキー設計（読み手は主にミューズ）。 */
export interface LookData {
age?: number;
pronoun?: string;
heightCm?: number;
build?: string;
race?: string;
formerRace?: string;
personalityText?: string;
job?: string;
family?: string;
marriage?: string;
upbringing?: string;
trigger?: string;
hairColor?: string;
hairLength?: string;
hairCut?: string;
hairSet?: string;
hairState?: string;
eyes?: string;
pupilColor?: string;
lips?: string;
bodyDetails?: string[];
habits?: string[];
charmPoints?: string[];
likes?: string[];
outfit?: string;
}

/** リソースの最大値。体力・気力はパック正本に無い殻側の新規定義
 * （gamedata の CATEGORY_COSTS と対でデータ寄りに置く最小定義）。
 * 射精は原作 B テーブル方式で駆動する調教者側ゲージ（上限 10000。
 * 加算時はクランプせず、超過分を段位判定が読む）。
 * ここの vital / energy = 1000 は旧形式の保存状態（最大値を保持して
 * いない）に対する互換既定値で、新規セッションの最大値ではない。 */
export const RESOURCE_MAX = { vital: 1000, energy: 1000, ejac: 10000 } as const;

/** 新規セッションの体力・気力最大値の基準（素質換算の土台）。
 * 最大値はセッション開始時にだけ決めて状態へ保持し、読み込み時に
 * 再計算はしない（旧形式の保存値はそのまま尊重する）。 */
export const RESOURCE_BASE_MAX = 2000;
/** 最大値の下限（素質換算で割り込まない）。 */
export const RESOURCE_MAX_FLOOR = 500;
/** 最大値への素質換算表（キャラ定義の traitIds を見る）。
 * 体力・気力の両方へ同じ量を加減する。表に無い素質は換算しない。 */
export const RESOURCE_MAX_TRAIT_DELTA: Record<string, number> = {
kaifuku_hayai: 500, // 回復早い: 体力最大 +500・気力最大 +500
kaifuku_osoi: -500, // 回復遅い: 体力最大 −500・気力最大 −500
};

/** セッション開始時に traitIds から体力・気力の最大値を決める。
 * 換算は合算し（両方あれば相殺）、結果は下限 500 を割り込まない。 */
export function resourceMaxOf(traitIds: readonly string[]): { vitalMax: number; energyMax: number } {
let delta = 0;
for (const id of traitIds) delta += RESOURCE_MAX_TRAIT_DELTA[id]?? 0;
const max = Math.max(RESOURCE_MAX_FLOOR, RESOURCE_BASE_MAX + delta);
return { vitalMax: max, energyMax: max };
}

/** パラメータ（0〜1000）→ レベルの換算規則（試作側の対応づけ）。
 * 倍率表の値そのものは全て原作実測値で、この換算だけが試作側の決め事。 */
export function paramLevel(value: number): number {
return Math.min(5, Math.floor(Math.max(0, value) / 200));
}

/**
 * 射精ゲージ加算の倍率チェーン（原作 ejac_chain.md §3）。
 * B に 調教者技巧 × 対象の従順 × 対象の欲望（× 奉仕系のみ奉仕精神）を
 * 順に掛け、最後に一度だけ切り捨てて整数化する（CUP チェーンと同型）。
 * 潤滑倍率（lubMult）は性交系コマンドにのみ、呼び出し側が手開始時点の
 * 潤滑帯で引いて渡す（膣系 EJAC_LUBRICATION_MULT / アナル系
 * EJAC_ANAL_LUBRICATION_MULT。原版 COMF_VAGINASEX / COMF_ANALSEX の
 * B 倍率ブロック）。未接続（データ保持のみ、ここでは使わない）:
 * 調教者C感覚倍率（gamedata の EJAC_C_SENSE_MULT）。
 */
export function ejacChain(base: number, opts: {
skillLv: number; obedienceLv: number; desireLv: number; serviceLv?: number;
lubMult?: number;
}): number {
let v = base;
v *= EJAC_SKILL_MULT[Math.min(5, Math.max(0, opts.skillLv))]?? 1;
v *= EJAC_OBEDIENCE_MULT[Math.min(5, Math.max(0, opts.obedienceLv))]?? 1;
v *= EJAC_DESIRE_MULT[Math.min(5, Math.max(0, opts.desireLv))]?? 1;
if (opts.serviceLv !== undefined) {
v *= EJAC_SERVICE_MULT[Math.min(5, Math.max(0, opts.serviceLv))]?? 1;
}
if (opts.lubMult !== undefined) v *= opts.lubMult;
return Math.floor(v);
}

/** 射精の段位語（index = 段位 1〜5） */
export const EJAC_TIER_WORDS: Record<number, string> = {
1: "通常", 2: "大量", 3: "超大量", 4: "最強", 5: "究極",
};

/**
 * 射精の発火判定とゲージ減算（原作 SHOOT.ERB @EJAC_CHECK / @SAMEN_SHOOT
 * の字面どおり）。ejac > max で発火し、段位は上限の超過倍数で決まる。
 * 減算は ejac -= max、段位2のときだけ更に -= max（段位3〜5でも
 * 追加減算は無い）。その後 ejac >= max なら max - 1 にクランプする。
 * max は調教師シートの射精ゲージ上限（sheet.ejacMax、既定 10000 =
 * 原作の字面どおり）。max = 10000 のとき従来と完全に同じ結果になる。
 */
export function ejacShoot(ejac: number, max: number = RESOURCE_MAX.ejac): { tier: number; after: number } {
const tier = ejac > max * 5? 5: ejac > max * 4? 4: ejac > max * 3? 3: ejac > max * 2? 2: ejac > max? 1: 0;
if (tier === 0) return { tier: 0, after: ejac };
let after = ejac - max;
if (tier === 2) after -= max;
if (after >= max) after = max - 1;
return { tier, after };
}

// ---------------------------------------------------------------- 潤滑
// eraMaou JP原版 0.930 の PALAM:3（潤滑）の移植。潤滑はパラメータでも
// 珠でもないプレイ内変数で、その場限りの値（珠換算 @JUEL_CHECK_MAIN
// でも「保有する珠として計算されないパラメータ」として対象外）。
// 事前の刺激で溜まり（@LOVE_MOIST_CHECK_UP + @SOURCE_CHECK_UP_MOIST）、
// 挿入系コマンドが手開始時点の確定値で帯判定して参照する。
// リセットはセッション開始時と日送り時（日を跨いで持ち越さない）。
// 原版 TALENT:271（常時発情）の開始値 3000 は、パックの特性カタログ
// （traits.json）に「常時発情」が存在しないため実装しない（欠け）。

/** 潤滑の帯（PALAMLV と同じ境界）: 帯0 <100 / 帯1 <500 / 帯2 <3000 /
 * 帯3 <10000 / 帯4 >=10000 */
export function lubBandOf(value: number): number {
return value < 100? 0: value < 500? 1: value < 3000? 2: value < 10000? 3: 4;
}

/** 帯ラベル（原版 @PALAM_MESSAGE の潤滑の文言、境界は PALAMLV:2 / :4） */
export function lubLabelOf(value: number): string {
return value < 500? "あまり濡れていません"
: value < 10000? "程よく濡れています"
: "充分に濡れています";
}

/**
 * 挿入時の潤滑参照（コマンド別の原版 COMF の潤滑ブロック）。
 * 適用位置は原版どおり: 快倍率は感覚段階表で決まった基礎値に対して
 * （欲情帯などの後段倍率より前）、苦痛は「既存の苦痛基礎値に加算して
 * から倍率」の順で、その手のソース確定時に適用する。
 * 【スケール】苦痛の加算値とソース加算値は、試作の既存の苦痛/ソース
 * 定義が置かれているスケール（原版 SOURCE の ×0.1、第9弾の写像規則）
 * に合わせて入れる。倍率はスケール不変で原版の値そのまま。
 * partMult のキーは部位パラメータID、srcMult / srcAdd のキーは
 * 試作の中間ソースID（屈従→fear、情愛→affection、欲情追加→pleasure）。
 * srcAddPost は、原版ブロック内で苦痛の倍率より後に行われる加算の置き場
 * （原版では苦痛とは別ソースへの加算だが、試作の写像では同じソースに
 * 落ちる場合に、倍率へ巻き込まれないよう後段で加える）。
 */
export interface LubRule {
partMult?: Record<string, number[]>;
painAdd?: number[];
painMult?: number[];
srcMult?: Record<string, number[]>;
srcAdd?: Record<string, number[]>;
srcAddPost?: Record<string, number[]>;
}

const LUB_A_PART = [0.4, 0.8, 1.0, 1.4, 1.8]; // A 系共通の快A倍率
const LUB_A_PAIN_ADD = [1000, 360, 120, 20, 10]; // A 系共通の苦痛加算（原版 +10000/+3600/+1200/+200/+100 の ×0.1）

export const LUB_RULES: Record<string, LubRule> = {
// COMF20 正常位: 快V ×0.10/0.40/1.00/1.40/1.80、苦痛 (+1000)×3.00/(+300)×1.00/×0.50/×0.20/×0.10
sex_v: { partMult: { kai_v: [0.1, 0.4, 1.0, 1.4, 1.8] }, painAdd: [100, 30, 0, 0, 0], painMult: [3.0, 1.0, 0.5, 0.2, 0.1] },
// COMF21 後背位: 快V 同上、苦痛 (+900)×3.00/(+250)×1.00/×0.50/×0.20/×0.10
com21: { partMult: { kai_v: [0.1, 0.4, 1.0, 1.4, 1.8] }, painAdd: [90, 25, 0, 0, 0], painMult: [3.0, 1.0, 0.5, 0.2, 0.1] },
// COMF22 対面座位: 快V ×0.50/0.80/1.00/1.20/1.50、苦痛 (+1000)×2.50/(+300)×1.00/×0.50/×0.20/×0.10
com22: { partMult: { kai_v: [0.5, 0.8, 1.0, 1.2, 1.5] }, painAdd: [100, 30, 0, 0, 0], painMult: [2.5, 1.0, 0.5, 0.2, 0.1] },
// COMF23 背面座位: 快V ×0.40/0.70/1.00/1.20/1.60、苦痛 (+600)×2.60/(+180)×1.00/×0.50/×0.20/×0.10
com23: { partMult: { kai_v: [0.4, 0.7, 1.0, 1.2, 1.6] }, painAdd: [60, 18, 0, 0, 0], painMult: [2.6, 1.0, 0.5, 0.2, 0.1] },
// A 系共通表（COMF26/27/28/29/36 ソース計算部/82）: 快A ×0.40/0.80/1.00/1.40/1.80、
// 苦痛は加算のみ +10000/+3600/+1200/+200/+100（倍率なし）
sex_a: { partMult: { kai_a: LUB_A_PART }, painAdd: LUB_A_PAIN_ADD },
com27: { partMult: { kai_a: LUB_A_PART }, painAdd: LUB_A_PAIN_ADD },
com28: { partMult: { kai_a: LUB_A_PART }, painAdd: LUB_A_PAIN_ADD },
com29: { partMult: { kai_a: LUB_A_PART }, painAdd: LUB_A_PAIN_ADD },
com36: { partMult: { kai_a: LUB_A_PART }, painAdd: LUB_A_PAIN_ADD },
com82: { partMult: { kai_a: LUB_A_PART }, painAdd: LUB_A_PAIN_ADD },
// COMF8 指挿入れ: 快V ×0.10/0.20/0.60/1.00/2.00、苦痛 (+700)×3.00/(+200)×1.00/×0.80/×0.50/×0.10
com8: { partMult: { kai_v: [0.1, 0.2, 0.6, 1.0, 2.0] }, painAdd: [70, 20, 0, 0, 0], painMult: [3.0, 1.0, 0.8, 0.5, 0.1] },
// COMF11 バイブ（本計算ブロック）: 快V ×0.10/0.40/1.00/1.40/1.80、
// 苦痛 (+1000)×3.00/(+400)×1.00/×0.50/×0.20/×0.10
com11: { partMult: { kai_v: [0.1, 0.4, 1.0, 1.4, 1.8] }, painAdd: [100, 40, 0, 0, 0], painMult: [3.0, 1.0, 0.5, 0.2, 0.1] },
// COMF13 アナルワーム / COMF46 浣腸器＋プラグ / COMF49 アナル電極:
// 快A ×0.40/0.80/1.00/1.40/1.80、苦痛加算のみ +800/+500/+300/+120/+100
com13: { partMult: { kai_a: LUB_A_PART }, painAdd: [80, 50, 30, 12, 10] },
com46: { partMult: { kai_a: LUB_A_PART }, painAdd: [80, 50, 30, 12, 10] },
com49: { partMult: { kai_a: LUB_A_PART }, painAdd: [80, 50, 30, 12, 10] },
// COMF19 アナルビーズ: 快A 同上、苦痛加算のみ +1200/+700/+400/+150/+100
com19: { partMult: { kai_a: LUB_A_PART }, painAdd: [120, 70, 40, 15, 10] },
// COMF2 アナル愛撫: 快A と屈従（SOURCE:13→fear）に同率 ×0.10/0.20/0.60/1.00/2.00、
// 苦痛は倍率のみ ×3.00/2.00/1.00/0.50/0.10（加算なし）。
// 試作の com2 は屈従ソースの値を持たない（0）ため fear 倍率は実効なし。
com2: {
partMult: { kai_a: [0.1, 0.2, 0.6, 1.0, 2.0] },
srcMult: { fear: [0.1, 0.2, 0.6, 1.0, 2.0] },
painMult: [3.0, 2.0, 1.0, 0.5, 0.1],
},
// COMF33 素股: 快C ×0.30/0.60/1.00/1.50/2.00（原版には ≥30000 で ×2.50 の
// LV5 段もあるが、試作の帯は LV4 までしかないため未接続＝欠け）、
// 情愛（SOURCE:4→affection）×0.60/0.80/1.00/1.20/1.40。苦痛の加算・倍率はなし。
// 快C 倍率は partMult として表にあり、エンジンの適用位置も他コマンドと
// 共通の配線（部位の基礎値に対して、欲情帯などの後段倍率より前）まで
// 通っている。駆動（C感覚段階表 [0,10,50,200,600,2000] の partStages）は
// 奉仕快楽経験の修理（受け入れ試走フォロー）で gamedata 側へ接続済み。
// 原版 COMF33 の射精 B 加算（帯3 +300 / 帯4 +600 / ≥30000 +1000）は、
// 試作の com33 に射精ゲージ加算の受け口（ejacB）が無いため未接続（欠け）。
com33: {
partMult: { kai_c: [0.3, 0.6, 1.0, 1.5, 2.0] },
srcMult: { affection: [0.6, 0.8, 1.0, 1.2, 1.4] },
},
// COMF34 騎乗位（ソース計算部の ;PALAM:潤滑 ブロック。判定部の
// 「潤滑不足」スコア -5 は成功判定側の話で従来どおり接続しない）:
// 快V ×0.20/0.60/1.00/1.30/1.60/2.00、苦痛 (+900)×3.00/(+250)×1.00/
// ×0.50/×0.30/×0.20/×0.10、逸脱（SOURCE:12→pain）+2000/+400/0/0/0/0。
// 試作の帯は LV4（>=10000）までしかないため添字5（原版 >=30000 の段）は
// 現状届かないが、原典どおりの値として表に含める。SOURCE:12 の加算は
// 原版ブロック内で苦痛の倍率より後に行われ（苦痛とは別ソース）、試作で
// 同じ pain に写像される分は倍率に巻き込まれないよう srcAddPost に置く。
com34: {
partMult: { kai_v: [0.2, 0.6, 1.0, 1.3, 1.6, 2.0] },
painAdd: [90, 25, 0, 0, 0, 0], painMult: [3.0, 1.0, 0.5, 0.3, 0.2, 0.1],
srcAddPost: { pain: [200, 40, 0, 0, 0, 0] },
},
// COMF83 両穴フィスト: 快V ×0.20/0.60/1.00/1.30/1.60、快A ×0.20/0.40/0.60/1.00/1.30、
// 欲情追加（SOURCE:11→pleasure）+1000/+800/+600/+200/0、
// 苦痛 (+1900)×9.00/(+1250)×3.00/(+1000)×1.50/(+200)×0.30/×0.10
com83: {
partMult: { kai_v: [0.2, 0.6, 1.0, 1.3, 1.6], kai_a: [0.2, 0.4, 0.6, 1.0, 1.3] },
painAdd: [190, 125, 100, 20, 0], painMult: [9.0, 3.0, 1.5, 0.3, 0.1],
srcAdd: { pleasure: [100, 80, 60, 20, 0] },
},
// 接続しないもの（原版に潤滑ブロックが無い／試作に同種の受け口が無い）:
// com24 逆レイプ・com25 逆アナルレイプ（原版 COMF に潤滑ブロック無し）、
// COMF7 秘貝開帳・COMF36 の判定部の潤滑不足（成功判定スコア。試作に
// 同種の判定が無い）、COMF3 自慰の装備条件付きブロック（装備システム
// が無い）、COMF84 Gスポット刺激（カタログに無い）、
// 露出への (UP:3 − SOURCE:10)/2 の残滓（原版 Maou 形では実質 0）。
};

/** 射精チェーンの潤滑倍率の対象グループ（原版で COM_EJAC_PLAYER_SEX /
 * COM_EJAC_PLAYER_ANALSEX を呼ぶコマンド）。キス・フェラチオには
 * 付けない（原版フェラに潤滑倍率は無い）。 */
export const EJAC_LUB_V_COMMANDS = new Set(["sex_v", "com21", "com22", "com23", "com34"]);
export const EJAC_LUB_A_COMMANDS = new Set(["sex_a", "com27", "com28", "com29", "com36"]);

/** 潤滑の発生倍率の素質（パック特性カタログ traits.json に実在する
 * フラグ型素質。原版 TALENT:42 / 43 に対応する id）。 */
export const LUB_TRAIT_WET = "nure_yasui"; // 濡れやすい: G ×3.00
export const LUB_TRAIT_DRY = "nure_nikui"; // 濡れにくい: G ×0.40

/** 快楽系パラメータ */
export const KAI_PARAM_IDS = ["kai_c", "kai_v", "kai_a", "kai_b", "kai_f"] as const;

/** 絶頂判定の対象部位（C/V/A/B/F の5部位。F にも絶頂があるのが
 * eraMaou 形。従来の試作は F 絶頂なしだった） */
export const CLIMAX_PART_IDS = KAI_PARAM_IDS;
export type ClimaxPartId = (typeof CLIMAX_PART_IDS)[number];

/** 絶頂の閾値（PALAMLV:4 = 10000） */
export const CLIMAX_THRESHOLD = 10000;
/** 強度語（キーは EX の値 1/2/4/9。eraMaou @EX_CHECK_UP の表示語） */
export const CLIMAX_WORDS: Record<number, string> = {
1: "絶頂", 2: "強絶頂", 4: "超絶頂", 9: "最強絶頂",
};

export type ExMap = Record<ClimaxPartId, number>;
export function emptyExMap(): ExMap {
return { kai_c: 0, kai_v: 0, kai_a: 0, kai_b: 0, kai_f: 0 };
}
export type ClimaxFirstMap = Record<ClimaxPartId, boolean>;
export function emptyClimaxFirst(): ClimaxFirstMap {
return { kai_c: false, kai_v: false, kai_a: false, kai_b: false, kai_f: false };
}

/** eraMaou @EX_CHECK_UP の絶頂階段（閾値→EX・消費）。PALAMLV:4=10000 の
 * ×32/×8/×2/×1 で、消費は各閾値 −1000。 */
const EX_STEPS: { min: number; ex: number; cdown: number }[] = [
{ min: 320000, ex: 9, cdown: 319000 },
{ min: 80000, ex: 4, cdown: 79000 },
{ min: 20000, ex: 2, cdown: 19000 },
{ min: 10000, ex: 1, cdown: 9000 },
];

/**
 * 絶頂の確定処理（eraMaou JP原版 SYSTEM_SOURCE.ERB @EX_CHECK_UP の字面どおり）。
 * 合計 = 現在の蓄積 + その手の増分（CUP）で EX を判定し、階段の消費を
 * 差し引く。消費後に残量がなお 10000 以上なら、残量が 9999 になるよう
 * 消費を再調整する（ピン留め）。
 * 【置換の明記】従来の era天形（強度 = 10000 到達数 1〜5、消費 = 9000 × 強度、
 * 同時絶頂の EX 乗算 ×2/×4…）は廃し、部位ごとに独立計算して合算する
 * Maou 形に置き換えた。同時絶頂の乗算は行わない。
 * 戻り値の intensity は EX の値（1/2/4/9）そのもの。
 */
export function climaxStep(current: number, cup: number): { intensity: number; cdown: number; remainder: number } {
const total = current + cup;
const step = EX_STEPS.find((r) => total >= r.min);
if (!step) return { intensity: 0, cdown: 0, remainder: total };
let cdown = step.cdown;
if (total - cdown >= CLIMAX_THRESHOLD) cdown = total - CLIMAX_THRESHOLD + 1;
return { intensity: step.ex, cdown, remainder: total - cdown };
}

/**
 * CUP 補正チェーン（部位蓄積への加算分にのみ適用。主パラメータ変換に使う
 * pleasure ソース量には掛けない）。適用順序は原作 §1 の並び:
 * (a) 起点 = 駆動値（コマンド×部位の基礎定数に素質倍率・失敗倍率を適用した値）
 * (b) 欲情帯倍率: 手の開始時点の desire で帯判定（eraMaou 実測形。
 *     境界は PALAMLV の LV1〜LV4）。倍率は部位別（@SOURCE_CHECK の
 *     各部位節の実測）: C/B/F は [0.50, 0.70, 1.00, 1.30, 1.80]、
 *     V は [0.30, 0.50, 1.00, 1.50, 2.00]、A は [0.60, 0.80, 1.00,
 *     1.20, 1.40]。従来は C の表を全部位へ適用していた（部位別化で
 *     置換）。F の原作表は未確定のため C の表を使う。
 * (c) 部位感覚倍率: 対応する感覚能力Lvの倍率（SENSE_MULT、原作
 *     SOURCE_CHECK 実測。Lv0 の ×0.50 も含む）。快F に対応する感覚は
 *     原作に無いため ×1 のまま。ただし感覚段階表（partStages）で
 *     駆動する部位には掛けない（段階表自体が感覚Lv別の値のため
 *     二重がけになる。Maou の COMF 移植コマンドが該当）。
 * (d) 同一コマンド連続実行 → /2
 * (e) 気力0（開始時点 energy <= 0）→ /2
 * (f) 最後に一度だけ切り捨てて整数化
 * 乗算要素どうしは可換なので、積の関係は順序に依らない。
 * 見送った倍率: 難易度倍率・欲望倍率チャンネル（abl_desire の倍率データは
 * 定義として保持するが、試作に欲情の蓄積チャンネルが無く未接続）・
 * 薬物/素質系（試作に対応する体系が無いため新造しない）。
 */
/** 欲情帯倍率の部位別表（帯0〜4。境界は PALAMLV の LV1〜LV4） */
export const CUP_BAND_TABLES: Record<string, number[]> = {
kai_v: [0.3, 0.5, 1.0, 1.5, 2.0],
kai_a: [0.6, 0.8, 1.0, 1.2, 1.4],
};
export const CUP_BAND_DEFAULT = [0.5, 0.7, 1.0, 1.3, 1.8];

export function cupChain(drive: number, opts: { desireAtStart: number; consecutive: boolean; energyAtStart: number; senseMult?: number; partId?: string }): number {
let v = drive;
const d = opts.desireAtStart;
const bandIdx = d < 100? 0: d < 500? 1: d < 3000? 2: d < 10000? 3: 4;
const bandTable = (opts.partId? CUP_BAND_TABLES[opts.partId]: undefined)?? CUP_BAND_DEFAULT;
v *= bandTable[bandIdx]?? 1;
v *= opts.senseMult?? 1;
if (opts.consecutive) v /= 2;
if (opts.energyAtStart <= 0) v /= 2;
return Math.floor(v);
}

/**
 * 絶頂時の波及ソース（強度 k 比例）。原作ソース→試作ソースの対応:
 * 露出 → shame（恥情）／ 欲情 → pleasure（欲望への変換係数が最大のチャンネル）
 * 恭順 → fear（従順への変換係数 0.24 が最大）／ 屈従 → fear（屈服への変換係数
 * 0.30 が最大）／ 反感 → pain（反発への変換係数 0.06、fear と同点のため苦痛側）。
 * 体力・気力分はリソースへの追加消費として別に返す。
 */
export const CLIMAX_WAVE: Record<ClimaxPartId, { src: Record<string, number>; vital: number; energy: number }> = {
// C: 露出+500k, 屈従+200k, 反感+150k, 体力+20k, 気力+10k
kai_c: { src: { shame: 500, fear: 200, pain: 150 }, vital: 20, energy: 10 },
// V: 欲情+800k, 恭順+500k, 露出+700k, 屈従+400k, 反感+300k, 体力+40k, 気力+20k
kai_v: { src: { pleasure: 800, fear: 900, shame: 700, pain: 300 }, vital: 40, energy: 20 },
// A: 欲情+500k, 恭順+700k, 露出+900k, 屈従+500k, 反感+400k, 体力+60k, 気力+30k
kai_a: { src: { pleasure: 500, fear: 1200, shame: 900, pain: 400 }, vital: 60, energy: 30 },
// B: 露出+500k, 屈従+200k, 反感+150k, 体力+20k, 気力+10k
kai_b: { src: { shame: 500, fear: 200, pain: 150 }, vital: 20, energy: 10 },
// F: eraMaou @EX_CHECK_UP では F の波及は A と同形（露出1200k, 屈従4500k,
// 欲情3500k, 恭順1500k, 体力+60k, 気力+30k）のため、試作側の A の
// 波及配分をそのまま F にも使う。
kai_f: { src: { pleasure: 500, fear: 1200, shame: 900, pain: 400 }, vital: 60, energy: 30 },
};

// ---------------------------------------------------------------- 珠の階段
// eraMaou JP原版 TRAIN_MAIN.ERB @JUEL_CHECK_MAIN の階段（Maou 形）。
// 【置換の明記】従来の天形（入力 ×100 スケーリング＋最大1000000 の階段）
// から置換した。入力は日次の残量そのままの生値で、天井は 12000。
// 階段: <100 → 0 / <300 → 1 / <500 → 2 / <1500 → 10 / <3000 → 20 /
// <6000 → 100 / <10000 → 200 / <30000 → 1000 / <60000 → 2000 /
// <100000 → 3000 / <150000 → 5000 / <250000 → 8000 / ≥250000 → 12000。
// 境界は PALAMLV の [lv1, lv1×3, lv2, lv2×3, lv3, lv3×2, lv4…lv9]。

/** 残量から階段値を引く: 境界未満の間は対応する値、全部以上で末尾 */
export function staircase(value: number): number {
const th = JUEL_STAIR_THRESHOLDS;
const vals = JUEL_STAIR_VALUES;
let i = 0;
while (i < th.length && value >= (th[i]?? 0)) i++;
return vals[i]?? 0;
}

/** 珠換算の1回分の結果: 獲得が正の珠（通貨ID→獲得数、相殺前の値）と、
 * 否定の珠による相殺の総量。 */
export interface JewelSettlement {
gains: Record<string, number>;
offset: number;
}

/**
 * 否定の珠の相殺（eraMaou @DENIAL_CHECK の原版形）。プール = 否定の珠の
 * 現在残高（今回の獲得分を含む）で、保有残高全体が対象。
 * 第1グループ {devotion, lust, yield}、続いて第2グループ {shame, pain,
 * terror} の順に: プール>0 かつ グループ合計>0 の間、3種からランダムに
 * 1種を選び（残高0の珠を引いたら引き直す）、相殺量 = プール/2 の整数
 * 除算（プール>0 で 0 になる場合は 1）をその珠の残高でキャップし、
 * その珠とプールの双方から引く。残ったプールは否定残高として残る。
 * 戻り値は相殺総量。
 */
export function applyDenialOffset(s: GameState): number {
if (!s.jewels || typeof s.jewels !== "object") s.jewels = {};
let pool = s.jewels["denial"] ?? 0;
if (pool <= 0) return 0;
let total = 0;
const groups: string[][] = [
["devotion", "lust", "yield"],
["shame", "pain", "terror"],
];
for (const group of groups) {
for (;;) {
const sum = group.reduce((a, id) => a + (s.jewels[id] ?? 0), 0);
if (pool <= 0 || sum <= 0) break;
// 3種からランダムに1種。残高0の珠を引いたら引き直す（グループ
// 合計>0 なので残高のある珠は必ず存在し、ループは終わる）。
let pick = group[Math.floor(roll(s) * group.length)] ?? "";
while ((s.jewels[pick] ?? 0) <= 0) {
pick = group[Math.floor(roll(s) * group.length)] ?? "";
}
let amt = Math.floor(pool / 2);
if (amt <= 0) amt = 1;
amt = Math.min(amt, s.jewels[pick] ?? 0);
s.jewels[pick] = (s.jewels[pick] ?? 0) - amt;
pool -= amt;
total += amt;
}
}
s.jewels["denial"] = pool;
return total;
}

/**
 * セッションの珠確定（eraMaou @JUEL_CHECK_MAIN の全体形）。調教終了時に
 * セッションにつき1回だけ実行する（settledSessions にセッション番号を
 * 記録し、済んだセッションは再実行しない）。換算チャンネル（入力は
 * すべて「そのセッションの増分」、階段は全チャンネル共通）:
 * - pleasure（快楽の珠）: kai 残量の階段合計 ＋ そのセッションの EX × 1000
 *   （換算後に5種と exSession をリセット）
 * - devotion（恭順の珠）← 情愛（affection）ソースのセッション増分
 * - lust（欲情の珠）← 欲情（PALAM:5）のセッション蓄積（desireSession）
 *   （原作 @JUEL_CHECK_MAIN の形。従来の「欲望パラメータ増加量」は
 *   パラメータ上限1000・減少ありのため収入がほぼ死んでいた——
 *   受け入れ試走の実測で生涯10〜20個。手ごとの UP:5 蓄積へ置換）
 * - yield（屈服の珠）← 屈服（PALAM:6）のセッション蓄積（yieldSession）
 *   （同上。従順ABL の価格ルートと ABLUP99 の原資がここ）
 * - learning（習得の珠）← 習得（PALAM:7）のセッション蓄積
 *   （性行動ソース由来。原作準拠改良で置換）
 * - shame（恥情の珠）← 恥情（shame）ソースのセッション増分
 * - pain（苦痛の珠）← 苦痛（pain）ソースのセッション増分
 * - terror（恐怖の珠）← 恐怖（fear）ソースのセッション増分
 * - denial（否定の珠）← 反感・不快・抑鬱の3チャンネルの階段合算
 *   （原作準拠改良で置換。旧: 反発パラメータの正増分プロキシ）
 * 対象外（原版どおり換算しない）: 潤滑（PALAM:3 は「保有する珠として
 * 計算されないパラメータ」で、原版でも計算はされるが所持に加算されない）、
 * 疲労ソース、中毒充足ソース、快楽ソース（快楽の珠は kai 残量経由のみ）。
 * 【原版との対応】原版は PALAM がセッション内累積であるため、その
 * 絶対値を読む。試作のソース（srcGain）とパラメータはセッションを
 * 跨いで累積・永続するため、増分はセッション開始時点に置いた
 * ウォーターマーク（juelSrcMark / juelParamMark）との差分で取る
 * （実質は「セッションの累積を読む」のと同じ入力になる）。
 * ウォーターマークが未初期化（換算拡張前の保存状態）の初回精算では、
 * その時点の累積値・パラメータ値で初期化して差分を 0 とし、過去分は
 * 換算しない。
 * 獲得分を残高へ加算した直後に否定の珠の相殺（applyDenialOffset）を
 * 実行する。戻り値は獲得（相殺前）と相殺総量で、記録行の生成に使う。
 * 【置換の明記】従来の日次精算（1日3行動の最終手で日送りと同時に実行、
 * 入力は日次増分）から、調教終了時・セッション増分へ移した。
 */
export function settleSessionJewels(s: GameState): JewelSettlement {
const none: JewelSettlement = { gains: {}, offset: 0 };
if (!Array.isArray(s.settledSessions)) s.settledSessions = [];
if (s.settledSessions.includes(s.sessionSeq)) return none;
s.settledSessions.push(s.sessionSeq);
if (!s.jewels || typeof s.jewels !== "object") s.jewels = {};

const gains: Record<string, number> = {};

// 快楽の珠: 部位ごとに staircase（残量）+ そのセッションの EX
// 合計 × 1000 を合計する。5種すべてと exSession を 0 にリセットする。
let pleasure = 0;
for (const id of KAI_PARAM_IDS) {
const rem = s.params[id] ?? 0;
if (rem > 0) pleasure += staircase(rem);
pleasure += (s.exSession?.[id as ClimaxPartId] ?? 0) * 1000;
s.params[id] = 0;
}
s.exSession = emptyExMap();
if (pleasure > 0) gains["pleasure"] = pleasure;

// ウォーターマーク未初期化なら、その時点の値で初期化する（この
// セッションの差分は 0 になり、過去分は遡って換算されない）。
if (!s.juelSrcMark || typeof s.juelSrcMark !== "object") {
s.juelSrcMark = { ...(s.srcGain ?? {}) };
}
if (!s.juelParamMark || typeof s.juelParamMark !== "object") {
s.juelParamMark = {
desire: s.params["desire"] ?? 0,
submission: s.params["submission"] ?? 0,
skill: s.params["skill"] ?? 0,
};
}
const srcMark = s.juelSrcMark;
const paramMark = s.juelParamMark;
const srcDelta = (id: string) =>
Math.max(0, (s.srcGain?.[id] ?? 0) - (srcMark[id] ?? 0));
const paramDelta = (id: string) =>
Math.max(0, (s.params[id] ?? 0) - (paramMark[id] ?? 0));

const channels: [string, number][] = [
["devotion", srcDelta("affection")],
// 欲情・屈服は PALAM 蓄積（desireSession / yieldSession）の絶対値を
// 階段換算する（原作 @JUEL_CHECK_MAIN が PALAM:5 / PALAM:6 の
// セッション累積を読む形）。パラメータ増分（paramDelta）は上限と
// 減少に潰されるため使わない。
["lust", Math.max(0, Math.floor(s.desireSession?? 0))],
["yield", Math.max(0, Math.floor(s.yieldSession?? 0))],
// 習得の珠 ← 習得（PALAM:7）のセッション蓄積（原作 @JUEL_CHECK_MAIN
// の形。従来の「技巧パラメータ増分」は intake が無く恒常 0 だった
// ため、性行動ソース由来の蓄積（learnSession）へ置換した）
["learning", Math.max(0, Math.floor(s.learnSession?? 0))],
["shame", srcDelta("shame")],
["pain", srcDelta("pain")],
["terror", srcDelta("fear")],
];
for (const [juelId, input] of channels) {
const g = staircase(input);
if (g > 0) gains[juelId] = g;
}
// 否定の珠 ← 反感・不快・抑鬱（PALAM:11/12/13）の3チャンネル各自の
// 階段値を合算する（原作 @JUEL_CHECK_MAIN の形。従来の「反発パラ
// メータの正増分」プロキシから置換）。相殺は従来どおりこの後段の
// applyDenialOffset が原作形で行う。
{
const d = s.denialSession?? { hate: 0, discomfort: 0, gloom: 0 };
const denialGain = staircase(Math.floor(d.hate))
+ staircase(Math.floor(d.discomfort))
+ staircase(Math.floor(d.gloom));
if (denialGain > 0) gains["denial"] = denialGain;
}

// 獲得分を残高へ加算し、直後に否定の珠の相殺を実行する。
for (const [juelId, g] of Object.entries(gains)) {
s.jewels[juelId] = (s.jewels[juelId] ?? 0) + g;
}
const offset = applyDenialOffset(s);

// ウォーターマークを今回の精算時点へ進め、セッションカウンタを戻す。
s.juelSrcMark = { ...(s.srcGain ?? {}) };
s.juelParamMark = {
desire: s.params["desire"] ?? 0,
submission: s.params["submission"] ?? 0,
skill: s.params["skill"] ?? 0,
};
s.stressPosSession = 0;
s.learnSession = 0;
s.desireSession = 0;
s.yieldSession = 0;
s.denialSession = { hate: 0, discomfort: 0, gloom: 0 };

return { gains, offset };
}

// ---------------------------------------------------------------- 能力購入
// パック engine.py の _discount_mult / ability_cost / buy_ability の移植
// を土台に、原作準拠改良で eraMaou ABLUP の形へ寄せた:
// - 価格は各 ABLUP の実測表（gamedata 側で置換済み）
// - ゲートを機能化: 経験ゲート（expGate / ルート別 gateExp）、能力
//   ゲート（abilityGates）、異常経験ゲート（abnormalTable）、解放
//   上限（capGate）。素質別価格倍率は eraMuse に Maou TALENT が
//   無いため未接続（欠け）。旧 discounts（fall_hist_*）は条件が常に
//   不成立だったため ABLUP 価格への置換時に除去した。
// - abl_buyoff は能力ではなく ABLUP99 の反発刻印消去として実装。
// - abl_addiction（快楽中毒）は原作に無い能力のため購入対象外。

export function juelLabel(juelId: string): string {
return JUEL_CURRENCIES.find((c) => c.id === juelId)?.label?? juelId;
}

/** 割引倍率（パック _discount_mult）: 通貨が一致し条件式が真の割引のうち最小 */
export function discountMult(s: GameState, def: AbilityDef, juelId: string): number {
let mult = 1.0;
const ns = namespaceOf(s);
for (const d of def.discounts?? []) {
if (d.juel === juelId && evalExpr(d.when, ns)!== 0) mult = Math.min(mult, d.mult);
}
return mult;
}

/**
 * 次Lvの価格を [{juelId, amount}] で返す（割引適用後、パック ability_cost）。
 * single はその通貨、or は juelChoice 指定があればその通貨（価格 null なら
 * null）、無ければ割引後価格で払える通貨を優先し、どれも払えなければ
 * 先頭の通貨、and は全通貨を同時に払う。買えない形状なら null。
 */
export function abilityCost(
s: GameState,
def: AbilityDef,
lv: number,
juelChoice?: string,
): { juelId: string; amount: number }[] | null {
const price = def.price;
let raw: { juel: string; amount: number }[];
if (price.type === "single") {
const a = price.table[lv];
if (a == null) return null;
raw = [{ juel: price.juel, amount: a }];
} else if (price.type === "or") {
const opts = price.options
.map((o) => ({ juel: o.juel, amount: o.table[lv], gateExp: o.gateExp }))
.filter((o): o is { juel: string; amount: number; gateExp: { exp: string; orExp?: string; table: number[] } | undefined } => o.amount != null)
.filter((o) => routeGateSatisfied(s, o.gateExp, lv));
if (juelChoice != null) {
const chosen = opts.filter((o) => o.juel === juelChoice);
if (chosen.length === 0) return null;
raw = chosen.slice(0, 1);
} else {
if (opts.length === 0) return null;
const afford = opts.filter(
(o) => Math.trunc(o.amount * discountMult(s, def, o.juel)) <= (s.jewels?.[o.juel]?? 0),
);
raw = (afford.length > 0? afford: opts).slice(0, 1);
}
} else {
raw = [];
for (const e of price.entries) {
const a = e.table[lv];
if (a == null) return null;
raw.push({ juel: e.juel, amount: a });
}
}
return raw.map((r) => ({
juelId: r.juel,
amount: Math.trunc(r.amount * discountMult(s, def, r.juel)),
}));
}

/** 経験カウンタの表示名（ゲート不成立の理由文用） */
export const EXP_LABELS: Record<string, string> = {
train: "調教経験", service: "奉仕快楽経験", abnormal: "異常経験",
v: "V経験", a: "A経験", sex: "性交経験", mast: "自慰経験",
semen: "精液経験", climax: "絶頂経験",
};

/** ルート別経験ゲート（ABLUP16 の [0] 屈服ルート等）の充足判定。
 * exp が table[lv] 以上、または orExp が同値以上で充足（原作の OR）。 */
export function routeGateSatisfied(
s: GameState,
gateExp: { exp: string; orExp?: string; table: number[] } | undefined,
lv: number,
): boolean {
if (!gateExp) return true;
const need = gateExp.table[lv];
if (need == null) return true;
if ((s.expReal?.[gateExp.exp]?? 0) >= need) return true;
if (gateExp.orExp && (s.expReal?.[gateExp.orExp]?? 0) >= need) return true;
return false;
}

/**
 * 購入ゲートの検査（eraMaou ABLUP の可否判定の機能化）。不成立なら
 * 理由文を返し、すべて通れば null。検査順は定義レベルのゲート
 * （解放上限・異常経験・経験・能力）→ ルート別ゲートの順。
 */
export function abilityGateReason(
s: GameState,
def: AbilityDef,
lv: number,
juelChoice?: string,
): string | null {
if (def.capGate && lv >= def.capGate.max) {
const released = def.capGate.traits.some((t) => (s.fallTraits?? []).includes(t));
if (!released) {
return def.capGate.traits.length > 0
? `（${def.label} は Lv${def.capGate.max} まで。解放には陥落素質が必要）`
: `（${def.label} は Lv${def.capGate.max} が上限）`;
}
}
if (def.abnormalTable) {
const need = def.abnormalTable[lv];
if (need != null && need > 0) {
const exempt = (def.abnormalExemptTraits?? [])
.some((t) => (s.fallTraits?? []).includes(t));
if (!exempt && (s.expReal?.["abnormal"]?? 0) < need) {
return `（異常経験が足りない: ${need} 以上必要）`;
}
}
}
if (def.expGate) {
const need = def.expGate.table[lv];
if (need != null && (s.expReal?.[def.expGate.exp]?? 0) < need) {
return `（${EXP_LABELS[def.expGate.exp]?? def.expGate.exp}が足りない: ${need} 以上必要）`;
}
}
for (const g of def.abilityGates?? []) {
if ((s.abilities?.[g.ability]?? 0) < lv + g.plus) {
const gLabel = ABILITIES.find((a) => a.id === g.ability)?.label?? g.ability;
return `（${gLabel}が足りない: Lv${lv + g.plus} 以上必要）`;
}
}
if (def.price.type === "or") {
const priced = def.price.options.filter((o) => o.table[lv] != null);
const targets = juelChoice != null
? priced.filter((o) => o.juel === juelChoice)
: priced;
if (targets.length > 0
&& targets.every((o) => !routeGateSatisfied(s, o.gateExp, lv))) {
const g = targets[0]?.gateExp;
if (g) {
return `（${EXP_LABELS[g.exp]?? g.exp}が足りない: ${g.table[lv]} 以上必要）`;
}
}
}
return null;
}

/**
 * 反発刻印の消去（eraMaou @ABLUP99 の形）。能力ではなく刻印への
 * 操作で、購入メニューから abl_buyoff として呼ぶ。
 * - コスト: 現在の反発刻印Lvで 屈服の珠 5000 / 10000 / 50000
 *   （素質倍率: [愛] ×0.50 のみ写像。他の気丈 ×3.00・生意気 ×1.50・
 *   素直 ×0.50 は eraMuse に該当素質が無いため欠け）
 * - 前提: 屈服刻印 ≥ 反発刻印、従順ABL ≥ 反発刻印Lv + 2
 * - 効果: 反発刻印 −1。ガード（MARK:4）は原作どおり残る。
 */
export function eraseRejectionMark(s: GameState): BuyAbilityResult {
normalizeState(s);
const lv = s.marksReal?.rejection?? 0;
if (lv <= 0) return { ok: false, message: "（反発刻印は無い）"};
const baseCost = [0, 5000, 10000, 50000][lv]?? 0;
const mult = (s.fallTraits?? []).includes("ai")? 0.5: 1.0;
const cost = Math.trunc(baseCost * mult);
if ((s.marksReal?.submission?? 0) < lv) {
return { ok: false, message: "（屈服刻印が反発刻印以上でないと消せない）"};
}
if ((s.abilities?.["abl_obedience"]?? 0) < lv + 2) {
return { ok: false, message: `（従順が足りない: Lv${lv + 2} 以上必要）`};
}
if ((s.jewels?.["yield"]?? 0) < cost) {
return { ok: false, message: `（屈服の珠が足りない: ${cost} 個必要）`};
}
s.jewels["yield"] = (s.jewels["yield"]?? 0) - cost;
s.marksReal.rejection = lv - 1;
return { ok: true, message: `【刻印】反発刻印 Lv${lv} → Lv${lv - 1}（屈服の珠×${cost}）`};
}

export interface BuyAbilityResult {
ok: boolean;
message: string;
}

/**
 * 能力購入の実適用（パック buy_ability の意味論）。失敗時は状態を一切変えず
 * 結果メッセージだけを返す。成功時は珠を差し引いて Lv+1 する。
 * 直接は呼ばず、調教終了後メニューの purchaseInMenu から使う。
 * 購入は行動数を消費せず、日・残り行動・パラメータ・蓄積には触れない。
 */
export function buyAbility(s: GameState, abilityId: string, juelChoice?: string): BuyAbilityResult {
normalizeState(s);
const def = ABILITIES.find((a) => a.id === abilityId);
if (!def) return { ok: false, message: "（その能力は登録されていない）"};
if (def.special === "buy_off_stress") {
// 反発の払拭は能力ではなく ABLUP99 の刻印消去（原作形へ置換）
return eraseRejectionMark(s);
}
if (def.blocked) {
return { ok: false, message: `（${def.blocked}）`};
}
const lv = s.abilities[abilityId]?? 0;
if (lv >= def.maxLv) return { ok: false, message: `（${def.label} は最大Lv）`};
const gateReason = abilityGateReason(s, def, lv, juelChoice);
if (gateReason) return { ok: false, message: gateReason };
const costs = abilityCost(s, def, lv, juelChoice);
if (costs === null) {
return {
ok: false,
message: def.price.type === "or"? "（その通貨では買えない）": "（そのLvの価格がない）",
};
}
for (const c of costs) {
if ((s.jewels[c.juelId]?? 0) < c.amount) {
return { ok: false, message: `（${juelLabel(c.juelId)} が足りない: ${c.amount} 個必要）`};
}
}
for (const c of costs) s.jewels[c.juelId] = (s.jewels[c.juelId]?? 0) - c.amount;
s.abilities[abilityId] = lv + 1;
const paid = costs.map((c) => `${juelLabel(c.juelId)}×${c.amount}`).join("、");
return { ok: true, message: `【能力】${def.label} Lv${lv} → Lv${lv + 1}（${paid}）`};
}

/**
 * 調教終了後のメニュー（phase === "menu"）での即時購入。原作では
 * @JUEL_CHECK（調教終了処理）の中に ABLUP の選択ループがあり、購入は
 * 調教の外側でのみ行う。セッションの珠は精算済みなので、支払い・
 * Lv 上昇はこの場で成立する（buyAbility の意味論そのまま）。成功時は
 * 結果行をログへ ,3 のサマリー行として残す。調教中（phase "play"）と、
 * 終了分岐の選択後（ending 確定後）は購入できない。期間終了後の
 * メニュー（finished）でも、分岐を選ぶ前なら購入できる（原作でも
 * 最終セッションの EVENTEND で JUEL_CHECK が回る）。
 */
/** お小遣いの付与量（§9.1 設計: セッション終了ごとに 100。
 * 付与先は調教主の残高＝このセッションの allowance 作業コピーで、
 * 保存のたびに調教主ストアへ書き戻される） */
export const ALLOWANCE_PER_SESSION = 100;

/** ITEM:52【技巧Lv】の購入可否（セッション内メニューと開始前購入で
 * 共通の規則）。上限は Lv10 のみで、原作 @SALEITEM_CHECK の
 * 堕落人数ゲート（Lv > FLAG:30 + 1 で販売停止）は本人判断
 * （2026-11-09）で撤廃した——制限は書かず、原作形のペースは
 * 配布ガイド側に「推奨」と書くに留める。価格は ITEM_DEFS の
 * 固定価格で、残高（お小遣い）が足りなければ買えない。
 * fallenCount 引数は呼び出し側の互換のため残す（判定には使わない）。 */
export interface TrainerSkillShopInfo { price: number; canBuy: boolean; reason: string }
export function trainerSkillShopInfo(trainerSkill: number, fallenCount: number, funds: number): TrainerSkillShopInfo {
const def: ItemDef | undefined = ITEM_DEFS[52];
const price = def?.price?? 50;
if (trainerSkill >= 10) return { price, canBuy: false, reason: "最大Lv" };
if (funds < price) return { price, canBuy: false, reason: "お小遣いが足りない" };
return { price, canBuy: true, reason: "" };
}

/** 購入可能な品目の一覧（原作 @SHOP_ITEM の品揃え規則の写像）:
 * - 非消耗品は所持済みなら並ばない（原作の販売停止）
 * - ITEM:28 記録メディアは ITEM:6 ビデオカメラ所持でのみ並ぶ
 *   （原作: ITEM:6 所持で ITEM:28 の販売が開く）
 * - ITEM:52【技巧Lv】は上限 Lv10 のみ（原作 @SALEITEM_CHECK の
 *   堕落人数ゲートは本人判断で撤廃。trainerSkillShopInfo の注記参照）
 * 価格で差がつく要素は原作に無い（Item.csv の固定価格のみ）。 */
export function shopItemsOf(s: GameState): StatusSnapshot["shopItems"] {
normalizeState(s);
const out: NonNullable<StatusSnapshot["shopItems"]> = [];
for (const [idStr, def] of Object.entries(ITEM_DEFS)) {
const itemId = Number(idStr);
const isSkill = def.special === "trainer_skill";
const count = isSkill? (s.trainerSkill?? 0): (s.inventory?.[idStr]?? 0);
let canBuy = true;
let reason = "";
if (!def.consumable && !isSkill && count >= 1) { canBuy = false; reason = "所持済み"; }
if (itemId === 28 && (s.inventory?.["6"]?? 0) < 1) { canBuy = false; reason = "ビデオカメラが必要"; }
if (isSkill) {
// 技巧Lv の可否は開始前購入と共通の規則（trainerSkillShopInfo）。
// 残高チェックもそちらに含まれる（従来の後段チェックと等価）。
const info = trainerSkillShopInfo(s.trainerSkill?? 0, s.fallenCount?? 0, s.allowance?? 0);
if (!info.canBuy) { canBuy = false; reason = info.reason; }
} else if (canBuy && (s.allowance?? 0) < def.price) { canBuy = false; reason = "お小遣いが足りない"; }
out.push({
itemId, label: def.label, price: def.price, count,
consumable: def.consumable?? false, special: isSkill, canBuy, reason,
});
}
return out;
}

export interface BuyItemResult { ok: boolean; message: string }

/** アイテム購入（メニューフェーズのみ。原作 @EVENTBUY / @SHOP_ITEM）。
 * お小遣いを価格と交換し、非消耗品は在庫フラグ、消耗品は個数、
 * ITEM:52 は調教者技巧Lv +1（在庫に入らない）になる。 */
export function purchaseItem(s: GameState, itemId: number): BuyItemResult {
normalizeState(s);
if (s.phase!== "menu") {
return { ok: false, message: "（購入は調教終了後のメニューでのみできる）"};
}
if (s.ending) {
return { ok: false, message: "（終了分岐は選択済み。購入はできない）"};
}
const def: ItemDef | undefined = ITEM_DEFS[itemId];
if (!def) return { ok: false, message: "（その品目は扱っていない）"};
const entry = (shopItemsOf(s)?? []).find((e) => e.itemId === itemId);
if (!entry) return { ok: false, message: "（その品目は扱っていない）"};
if (!entry.canBuy) return { ok: false, message: `（${entry.reason}）`};
s.allowance = (s.allowance?? 0) - def.price;
if (def.special === "trainer_skill") {
s.trainerSkill = (s.trainerSkill?? 0) + 1;
const msg = `【購入】${def.label} → 調教者の技巧Lv ${s.trainerSkill}（お小遣い残高 ${s.allowance}）`;
pushLog(s, "summary", msg, { mark: 3 });
return { ok: true, message: msg };
}
s.inventory = s.inventory?? {};
s.inventory[String(itemId)] = (s.inventory[String(itemId)]?? 0) + 1;
const msg = `【購入】${def.label}（お小遣い残高 ${s.allowance}）`;
pushLog(s, "summary", msg, { mark: 3 });
return { ok: true, message: msg };
}

export function purchaseInMenu(s: GameState, abilityId: string, juelChoice?: string): BuyAbilityResult {
normalizeState(s);
if (s.phase!== "menu") {
return { ok: false, message: "（購入は調教終了後のメニューでのみできる）"};
}
if (s.ending) {
return { ok: false, message: "（終了分岐は選択済み。購入はできない）"};
}
const r = buyAbility(s, abilityId, juelChoice);
if (r.ok) pushLog(s, "summary", r.message, { mark: 3 });
return r;
}

/** 時間帯ラベル（原作 @SHOW_STATUS の TIME 表示） */
export function slotLabelOf(slot: number): string {
return slot === 1 ? "午後" : "午前";
}

/**
 * 調教終了（原作 USERCOM の 調教終了[200] → BEGIN AFTERTRAIN →
 * @EVENTEND の形）。セッションの珠精算（settleSessionJewels）を実行し、
 * phase を "menu" へ移す。日付・時間帯は進めない（次へ進むのは
 * proceedToNextSession）。倒れて終わったセッションは executeCommand
 * 側で精算なしに直接 "menu" へ移るため、ここには来ない。
 * 回復（applySessionEndRecovery）は精算の後にこの時点で適用する
 * （適用点を終了時点へ寄せた経緯は同関数のコメント参照）。
 */
export function endSession(s: GameState): { ok: boolean; reason?: string } {
normalizeState(s);
if (s.finished) return { ok: false, reason: "期間は終了している" };
if (s.phase!== "play") return { ok: false, reason: "調教は既に終了している" };
const settlement = settleSessionJewels(s);
// 陥落素質の獲得判定（原作の EVENT_TURNEND での @CHECK_SPECIALSKIL
// 呼び出し位置。調教終了時に評価する）
const acquiredTraits = checkFallTraits(s);
// お小遣いの付与（§9.1 設計: セッション終了ごとに 100）。
// allowance は調教主残高の作業コピーなので、これは調教主側への
// 加算であり、保存時にストアへ書き戻され対象を跨いで残る。
// 倒れて終わったセッションは endSession を通らないため付与されない
s.allowance = (s.allowance?? 0) + ALLOWANCE_PER_SESSION;
// 回復は精算・付与の後に適用する（精算はリソースを読まないため
// 回復の影響は受けない）。メニューの表示は回復後の値になる。
applySessionEndRecovery(s);
s.phase = "menu";
pushLog(s, "echo", "> 調教終了");
for (const c of JUEL_CURRENCIES) {
const g = settlement.gains[c.id] ?? 0;
if (g > 0) pushLog(s, "summary", `【珠】${c.label} +${g}`, { mark: 3 });
}
if (settlement.offset > 0) {
pushLog(s, "summary", `【珠】否定の珠による相殺 −${settlement.offset}`, { mark: 3 });
}
for (const t of acquiredTraits) {
pushLog(s, "event", `${s.characterName}は【${t === "ai"? "愛": "淫乱"}】を得た`, { mark: 1 });
}
pushLog(s, "day", `―― 第${s.day}日（${slotLabelOf(s.slot)}）調教終了 ――`, { mark: 3 });
pushLog(s, "summary", `【お小遣い】+${ALLOWANCE_PER_SESSION}（残高 ${s.allowance}）`, { mark: 3 });
pushLog(s, "notice", "調教を終了しました。メニューで能力を購入できる。次へ進むと次の時間帯へ移る。", { mark: 3 });
pushLog(s, "status", "", { snapshot: snapshotOf(s) });
return { ok: true };
}

/**
 * セッション終了時点の回復（原作 @EVENTTURNEND の式の形）:
 * 体力が 1 未満なら 1 に引き上げ、午前で終わったセッションは
 * 体力最大/10、午後で終わったセッション（夜の休みが入る）は
 * 体力最大/2 を回復する（上限クランプ）。気力は毎セッション全回復。
 * 区切り種別は、終了したセッションの時間帯（現在の s.slot）で判定する。
 *
 * 適用点の経緯: 以前は次のセッション開始時（beginNextSession）に
 * 適用していたが、マスター判断で終了時点へ移した。原作が回復を
 * ターン終了に置くのは全キャラ一括処理の都合だが、eraMuse は
 * 対象1人制で他のキャラの回復を待つ理由が無く、「終わったら回復」
 * でよい、という整理。呼び出しは endSession（精算の後）と
 * executeCommand の倒壊パス（強制終了）の2か所のみで、
 * beginNextSession 側では二度と適用しない。
 * 射精ゲージの 0 リセットは回復ではなく @EVENTTRAIN の開始時処理
 * なので、従来どおり beginNextSession に残してある。
 */
function applySessionEndRecovery(s: GameState): void {
const endedSlot = s.slot;
if (s.resources.vital < 1) s.resources.vital = 1;
const heal = endedSlot === 1
? Math.floor(s.resources.vitalMax / 2)
: Math.floor(s.resources.vitalMax / 10);
s.resources.vital = Math.min(s.resources.vitalMax, s.resources.vital + heal);
s.resources.energy = s.resources.energyMax;
}

/**
 * 次のセッションの開始処理（原作の TRAIN 開始時リセットの形）。
 * 呼び出し側で期間終了の判定を済ませてから呼ぶ。回復はここでは
 * 行わない（終了時点で applySessionEndRecovery が適用済み）。
 * - 射精ゲージは @EVENTTRAIN どおり 0 に戻す。
 * - 日送り（午後→翌日）のときだけ: 日数+1、疲労 -45・反発 -10
 *   （従来の日次緩和を日境界に残したもの）、当日EXPのリセット。
 * - セッション内変数のリセット: 潤滑 0、前手リセット、快部位の残量と
 *   セッションEX の破棄（PALAM のセッション内スコープの形。精算済み
 *   なら残量は既に 0 で、倒れたセッションの分はここで捨てる）。
 * - 精算のウォーターマークをセッション開始時点へ置き直す。
 */
function beginNextSession(s: GameState): { dayRolled: boolean } {
const endedSlot = s.slot;
s.resources.ejac = 0;
let dayRolled = false;
if (endedSlot === 1) {
s.day += 1;
s.slot = 0;
s.params["fatigue"] = Math.max(0, (s.params["fatigue"] ?? 0) - 45);
s.params["stress"] = Math.max(0, (s.params["stress"] ?? 0) - 10);
s.dailyExp = {};
dayRolled = true;
} else {
s.slot = 1;
}
// 媚薬の週次処理（eraMaou @APHRODISIAC_ADDICT の写像）: 日が替わり
// 新しい日が7の倍数なら、残留度 −1。媚薬中毒なら禁断症状チェック:
// 回避フラグ（期間内の使用）が無ければ禁断症状が出たことを記録する
// （原作の禁断症状は素質の付与だが、試作に素質付与の系が無いため
// 通知まで = 欠け）。残留度が 0 になれば媚薬中毒は消失する。
if (dayRolled && s.day % 7 === 0) {
if ((s.aphroResidue?? 0) > 0) s.aphroResidue = (s.aphroResidue?? 0) - 1;
if (s.aphroAddict) {
if (s.aphroDosed) {
s.aphroDosed = false;
} else {
pushLog(s, "notice", `${s.characterName}に媚薬の禁断症状が出ている……`, { mark: 3 });
}
if ((s.aphroResidue?? 0) === 0) {
s.aphroAddict = false;
pushLog(s, "notice", `${s.characterName}は媚薬への依存から脱した`, { mark: 3 });
}
}
}
s.lub = 0;
s.prevCommandId = null;
s.prev = null;
for (const p of KAI_PARAM_IDS) s.params[p] = 0;
s.exSession = emptyExMap();
s.juelSrcMark = { ...(s.srcGain ?? {}) };
s.juelParamMark = {
desire: s.params["desire"] ?? 0,
submission: s.params["submission"] ?? 0,
skill: s.params["skill"] ?? 0,
};
s.stressPosSession = 0;
// 精算されなかったセッション（倒れた場合）の蓄積はここで破棄する
// （PALAM のセッション内スコープの形。精算済みなら既に 0）。
s.learnSession = 0;
s.desireSession = 0;
s.yieldSession = 0;
s.denialSession = { hate: 0, discomfort: 0, gloom: 0 };
s.filmedSession = false;
s.toolInsertedV = false; // TEQUIP はセッション内スコープ
s.sessionSeq += 1;
s.collapsed = false;
s.phase = "play";
updatePeaks(s);
pushLog(s, "day", `―― 第${s.day}日（${slotLabelOf(s.slot)}） ――`, { mark: 3 });
pushLog(s, "status", "", { snapshot: snapshotOf(s) });
return { dayRolled };
}

/**
 * メニューから「次へ進む」。次の時間帯のセッションを開始する。
 * 最終日の午後が終わっている状態で進もうとすると、セッションは
 * 開始せず期間終了（finished）になる（終了分岐はメニューに残る）。
 * 日が替わった場合は日送り挨拶の口上（greeting / day2plus）を
 * セリフ欄へ先行表示する（従来の受け皿を日境界に移したもの）。
 * メニューが開いていないときは失敗し、状態は変えない。
 */
export function proceedToNextSession(
s: GameState,
kojo?: ReadonlyMap<string, string[]>,
): { ok: boolean; reason?: string } {
normalizeState(s);
if (s.phase!== "menu") return { ok: false, reason: "メニューは開いていない" };
if (s.finished) return { ok: false, reason: "期間は終了している" };
if (s.ending) return { ok: false, reason: "終了分岐は選択済み" };
if (s.slot === 1 && s.day >= s.daysLimit) {
s.finished = true;
pushLog(s, "day", `―― 第${s.day}日 終了 ――`, { mark: 3 });
pushLog(s, "notice", "期日が来た。「続ける」で期間を延ばすか、終了分岐を選べる: 手放す / 手元に残す", { mark: 3 });
pushLog(s, "status", "", { snapshot: snapshotOf(s) });
return { ok: true };
}
const { dayRolled } = beginNextSession(s);
if (dayRolled && kojo) {
const picked = pickKojo(s, kojo, {
personality: normalizePersonality(s.personality),
kind: "greeting", timing: "day2plus",
});
if (picked !== null) s.dialogue = picked;
}
return { ok: true };
}

/** 手に紐づく判別イベント（セリフより先に拾うための機械可読な印）。
 * 絶頂: part は絶頂した部位、intensity は強度（1〜5）、first は部位別の
 * 初回か（永続フラグ climaxFirst で判定）、simultaneous はその手で
 * 絶頂した部位数。部位ごとに1件ずつ付く。 */
export interface HandEvent {
type: "climax" | "ejac";
part: string | null;
intensity: number;
first: boolean;
simultaneous: number;
/** 射精イベント（type: "ejac"）の段位（1〜5）。絶頂イベントには付かない。 */
tier?: number;
}

export interface LogEntry {
id: number;
at: number; // epoch ms
/** 手の開始行（echo）にだけ付く判別イベント */
events?: HandEvent[];
kind:
| "system" // 開始・管理系の行（印なし）
| "echo" // > [n] コマンド の反響行（印なし）
| "text" // 地の文（辞書から引いた文。末尾,1）
| "summary" // 数値サマリー（末尾,3）
| "event" // 閾値イベント文（末尾,1）
| "notice" // 期間終了などの通知（末尾,3）
| "status" // 状態ブロック（snapshot を描画）
| "day"; // 日付区切り（末尾,3）
text: string;
snapshot?: StatusSnapshot;
}

export interface CharacterDefData {
init_overrides: Record<string, number>;
traits: { id: string; src_mult?: Record<string, number>; conv_mult?: Record<string, number>}[];
/** 性格（会話タイプ）。未設定なら "sunao" として扱う。 */
personality?: string;
/** 見た目データ（任意）。新規セッションの状態へそのまま写す。 */
look?: LookData | null;
}

// ---------------------------------------------------------------- 性格と口上
// 性格（会話タイプ）は4種。キャラ定義側の属性で、口上辞書の引き当てに使う。
// 既存キャラ（personality 未設定）は "sunao" として扱う。

export const PERSONALITIES = [
{ id: "sunao", label: "素直" },
{ id: "tsuyoki", label: "強気" },
{ id: "yowaki", label: "弱気" },
{ id: "majime", label: "真面目" },
] as const;
export type PersonalityId = (typeof PERSONALITIES)[number]["id"];

export function normalizePersonality(v: unknown): PersonalityId {
return (PERSONALITIES as readonly { id: string }[]).some((p) => p.id === v)
? (v as PersonalityId)
: "sunao";
}

export function personalityLabel(id: string): string {
return PERSONALITIES.find((p) => p.id === id)?.label?? "素直";
}

/** 口上辞書のキー部品。kind ごとに使うサブキーが違う（schema.ts の表定義参照）。 */
export interface KojoKeyParts {
personality: string;
kind: "command" | "climax" | "ejac" | "greeting" | "ending" | "mark";
commandId?: string;
band?: string;
repetition?: string;
part?: string;
tierGroup?: string;
timing?: string;
branch?: string;
markId?: string;
}

/** 口上辞書キー: personality | kind | サブキー全部（未使用は空文字） */
export function kojoKey(k: KojoKeyParts): string {
return [
k.personality, k.kind,
k.commandId?? "", k.band?? "", k.repetition?? "",
k.part?? "", k.tierGroup?? "", k.timing?? "",
k.branch?? "", k.markId?? "",
].join("|");
}

/**
 * 口上を1本選ぶ。該当セルが辞書に無い／空なら null（呼び出し側で
 * 「空文字にする」か「変更なし」かを決める）。
 * バリアントが複数のセルでは、前回そのセルで選んだ index と違うものを
 * 優先する簡易ローテーション（次 index を回す）。前回の選択キーと
 * index は state.kojoLast に保持する。
 */
export function pickKojo(
s: GameState,
kojo: ReadonlyMap<string, string[]> | undefined,
parts: KojoKeyParts,
): string | null {
if (!kojo) return null;
const key = kojoKey(parts);
const texts = kojo.get(key);
if (!texts || texts.length === 0) return null;
let idx = 0;
if (texts.length > 1 && s.kojoLast && s.kojoLast.key === key) {
idx = (s.kojoLast.index + 1) % texts.length;
}
s.kojoLast = { key, index: idx };
return texts[idx]?? texts[0]?? null;
}

export interface GameState {
v: 1;
characterId: string;
characterName: string;
characterNote: string;
genreId: string;
genreLabel: string;
worldId: string;
worldLabel: string;
day: number;
daysLimit: number;
/** 時間帯スロット: 0 = 午前 / 1 = 午後（原作 TIME）。1日 = 2セッション
 * （午前・午後）で、1回の調教が1スロットを消費する。旧形式の保存状態
 * （1日3行動モデル）には無いので normalizeState が 0 で補完する。 */
slot: number;
/** セッション通し番号（1始まり）。精算ガードとセッション境界の識別に使う。 */
sessionSeq: number;
/** 直前のセッションが「倒れて」終わったか（体力 0 以下での強制終了。
 * 原作の死亡判定の eraMuse 形で、キャラは消えず精算なしで終わる）。
 * 次のセッション開始で false に戻る。 */
collapsed: boolean;
params: Record<string, number>;
peaks: Record<string, number>;
/** 現在の手のセリフ（区画2）。新しい手の地文1が出る段で口上辞書からの
 * 既定値に置き換わる（該当セルが無ければ ''） */
dialogue: string;
/** 性格（会話タイプ）の id。定義側の値の写しで、口上選択に使う。
 * 旧形式の保存状態には無いので normalizeState が "sunao" で補完する。 */
personality: string;
/** 口上の前回選択（セルキーとバリアント index）。簡易ローテーション用。
 * 旧形式の保存状態には無いので normalizeState が null で補完する。 */
kojoLast: { key: string; index: number } | null;
/** リソース: 体力/気力（コマンド costs で消費。回復はセッション終了の
 * 時点：気力は全回復、体力は時間帯で MAX/10 または MAX/2）＋射精ゲージ
 * （セッション開始時に 0 へ戻る）。体力は 0 以下（マイナス）にもなり、
 * その場合は倒れてセッションが強制終了する（原作の死亡判定の形）。
 * 最大値（vitalMax / energyMax）はセッション開始時に基準2000±素質換算で
 * 決めてここへ保持する。旧形式の保存状態には無いので normalizeState が
 * 旧既定値（1000）で補完する（2000 へは再計算しない）。 */
resources: { vital: number; vitalMax: number; energy: number; energyMax: number; ejac: number };
/** 潤滑（eraMaou PALAM:3 相当のプレイ内変数）。パラメータでも珠でも
 * なく、珠換算にも混ぜない。セッション開始で 0 に戻る（PALAM の
 * セッション内スコープの形）。旧形式の保存状態には無いので
 * normalizeState が 0 で補完する。 */
lub: number;
/** 珠: 通貨IDキー（devotion/lust/yield/terror/shame/pleasure/learning/denial/pain）の
 * 疎な辞書（パック準拠＋苦痛の珠）。既定は空で、無いキーは 0 として読む。 */
jewels: Record<string, number>;
/** 能力Lv: 能力IDキーの疎な辞書（パック準拠）。無いキーは Lv0 として読む。 */
abilities: Record<string, number>;
/** 旧・購入予約（能力IDの列）。購入画面フェーズ制への移行で廃止。
 * 予約は未払いだったため破棄しても珠・Lv への影響はなく、
 * normalizeState が常に [] へ戻す（フィールド自体は互換のため残置）。 */
pendingPurchases: string[];
/** 進行フェーズ: "play" = 調教中（コマンド実行可、回数上限なし）、
 * "menu" = 調教終了後のメニュー（購入・次へ進む・終了分岐の選択肢が
 * ある状態。原作の @JUEL_CHECK〜SHOP の位置）。日付・時間帯は
 * メニューで「次へ進む」を選ぶまで進まない。旧形式の保存状態の
 * "shop"（購入画面フェーズ）は normalizeState が "menu" へ読み替える。 */
phase: "play" | "menu";
/** 珠の確定が済んだセッション番号（セッションにつき1回だけ確定させる
 * ガード。旧・日次版の jewelsSettled はセッション化で置き換えた）。 */
settledSessions: number[];
/** 珠換算のウォーターマーク: 前回精算時点の累積ソース値（srcGain の写し）。
 * ソースはセッション累積で日送りでもリセットされないため、精算入力は
 * この値からの差分で取る。null = 未初期化（換算拡張前の保存状態）で、
 * 初回精算時にその時点の累積値で初期化し、過去分は換算しない。 */
juelSrcMark: Record<string, number> | null;
/** 珠換算のウォーターマーク: 前回精算時点のパラメータ値
 * （desire / submission / skill の増加量を取るための保持）。セッション
 * 開始ごとに置き直す（セッション増分が精算入力になる）。null の扱いは
 * juelSrcMark と同じ。 */
juelParamMark: Record<string, number> | null;
/** 反発（stress）のセッション内「正の増分」合計。手の実行ごとに、その手で
 * stress が増えた分だけを累積する（減少は差し引かない）。否定の珠の
 * 換算入力で、精算時とセッション開始時に 0 へ戻す。 */
stressPosSession: number;
/** 射精回数カウンタ（原作の射精経験相当）。発火時に段位分だけ増える。 */
ejacCount: number;
/** 絶頂手の回数（旧パック climax_count 由来の互換フィールド）。
 * 現在は絶頂が起きた手の数を数えるだけで、初回判定には使わない
 * （初回判定は climaxFirst が正本）。 */
climaxCount: number;
/** EX:部位絶頂（永続カウント）。部位ごとに 強度 × 同時倍率 を加算する。 */
exClimax: ExMap;
/** そのセッションの EX 増分（調教終了時の珠換算ボーナス用。換算後にリセット）。 */
exSession: ExMap;
/** 絶頂経験（永続）。倍率適用前の強度合計を加算する。 */
climaxExp: number;
/** 部位別の初絶頂フラグ（永続）。部位別 first の判定はこれが正本。 */
climaxFirst: ClimaxFirstMap;
/** 快楽刻印（永続、0〜3）。marksReal.pleasure の鏡（スナップショット
 * 互換のため保持し、@MARK_GOT_CHECK 側で同期する）。旧・強度 R 式は
 * 原作形（手ごとの快UP階段）へ置換した。 */
pleasureMark: number;
/** 原作刻印（eraMaou MARK:0〜3）: 苦痛 / 快楽 / 屈服 / 反発。
 * @MARK_GOT_CHECK の形で手ごとに進行する。旧形式の保存状態には
 * 無いので normalizeState が pleasureMark から快楽だけ引き継いで補完。 */
marksReal: { pain: number; pleasure: number; submission: number; rejection: number };
/** 反発刻印のガード（eraMaou MARK:4 相当）: 過去に付いた最大Lv。
 * 原作ではどこでもリセットされず、ABLUP99 で消去した後も残るため、
 * 一度付いたLvを超える再取得は起きない（原作の癖として再現）。 */
markGuardRejection: number;
/** 経験カウンタ（eraMaou EXP / CFLAG:2 の写像）: train = 調教経験
 * （CFLAG:2）、service = 奉仕快楽経験（EXP:21）、abnormal = 異常経験
 * （EXP:50）、v/a/sex/mast/semen/climax = EXP:0/1/5/10/20/2。
 * ABLUP ゲートと陥落条件（@CHECK_SPECIALSKIL）が参照する。 */
expReal: Record<string, number>;
/** 否定の珠の3チャンネル蓄積（セッション内、PALAM スケール）:
 * hate = 反感（PALAM:11）、discomfort = 不快（PALAM:12）、
 * gloom = 抑鬱（PALAM:13）。精算で各自の階段値を否定プールへ合算する。
 * discomfort の入力は不潔ソース（DIRTY_SOURCES、Y=0 評価）で接続済み。
 * Y>0 の汚れ連動分は STAIN が無いため欠け。 */
denialSession: { hate: number; discomfort: number; gloom: number };
/** 習得（PALAM:7）のセッション蓄積。精算で習得の珠へ換算する。 */
learnSession: number;
/** 欲情（PALAM:5）のセッション蓄積（PALAM スケール）。手ごとに
 * UP:5（@SOURCE_CHECK の欲情分: 部位快UP×欲望倍率＋欲情ソース＋
 * 情愛の欲情分＋中毒充足換算）を加算し、精算で階段換算して
 * 欲情の珠にする。原作の PALAM はセッション内累積で上限なしの
 * ため、試作の欲望パラメータ（上限1000・減少あり）の増分では
 * 代替できない——受け入れ試走で収入がほぼ死んだ主因。 */
desireSession: number;
/** 屈服（PALAM:6）のセッション蓄積（PALAM スケール）。手ごとに
 * UP:6（屈従ソース ×10 × 従順倍率 @SOURCE_CHECK_UP_SUBMIT）を
 * 加算し、精算で階段換算して屈服の珠にする。 */
yieldSession: number;
/** 陥落素質（@CHECK_SPECIALSKIL の獲得分）: "ai" = 愛、"inran" = 淫乱。
 * キャラ定義の traitIds とは別系統（プレイで獲得する素質）。 */
fallTraits: string[];
/** 異常経験の「撮影中の自慰」分を取得済みか（原作 CFLAG:3 相当。
 * COMF3 自慰と COMF7 秘貝開帳で共有される原作フラグ）。 */
abnormalMastDone: boolean;
/** 異常経験の浣腸分（原作 CFLAG:4 相当の状態機械）:
 * 0 = 未実施、1 = 排泄済み（非撮影で初回分取得済み）、
 * 2 = 撮影中の排泄で取得済み。 */
abnormalEnemaState: number;
/** 異常経験の野外プレイ分を取得済みか（原作 CFLAG:5 相当）。 */
abnormalOutdoorDone: boolean;
/** 異常経験の V 拡張分（原作 EXP:52 == 0 の初回判定相当）。 */
expansionVDone: boolean;
/** 異常経験の A 拡張分（原作 EXP:53 == 0 の初回判定相当）。 */
expansionADone: boolean;
/** 異常経験のピアシング分を取得済みか（原作 CFLAG:7 相当。
 * 試作の com87 に装着部位の選択が無いため「初回実行で一度だけ」
 * の近似——原作はへそ以外への初回装着で +1）。 */
abnormalPierceDone: boolean;
/** このセッションで撮影（com53）が実行されたか（原作 TEQUIP:53 の
 * セッション内写像。セッション開始で false に戻る）。 */
filmedSession: boolean;
/** お小遣い（アイテム購入の通貨）。正本は調教主側の残高
 * （<home>/trainers_state.json の funds）で、このフィールドは
 * trainerSkill と同じ作業コピー（開始時にストアから流し込み、
 * 保存のたびに書き戻す）。セッション終了ごとに 100 付与される
 * （§9.1 設計）のは、この残高への加算として行われる。パックの
 * funds（世界内通貨）とは別系統。 */
allowance: number;
/** 所持アイテム（アイテムID文字列 → 個数）。非消耗品は 1 で所持を
 * 表す。ITEM:52【技巧Lv】は在庫に入らず trainerSkill へ直接入る。 */
inventory: Record<string, number>;
/** 調教者（主人）の技巧Lv（eraMaou ABL:MASTER:12 の受け皿）。
 * 購入は ITEM:52 経由のみ（原作に ABLUP の主人側項目は存在しない）。
 * 原作では調教主（キャラ0）は対象を跨いで残る存在のため、正本は
 * 調教主側の永続ストア（<home>/trainers_state.json、アダプタ管理）。
 * このフィールドはセッション中の作業コピーで、アダプタが開始時に
 * ストアから流し込み、保存のたびにストアへ書き戻す。 */
trainerSkill: number;
/** 堕落人数（eraMaou FLAG:30 の写像）。陥落素質の新規獲得で +1。
 * 以前は技巧Lv の購入ゲートの根拠だったが、その制限は本人判断
 * （2026-11-09）で撤廃済み。今は記録として保持するのみ。
 * trainerSkill と同じく正本は調教主側の永続ストア。 */
fallenCount: number;
/** このセッションの調教主プロフィールID（data/trainers.json の id）。
 * 対象のセーブに記録され、再開時はこの調教主に固定される（開始時に
 * 別の調教主を指定しても、進行中セーブの調教主は差し替わらない）。 */
trainerId: string;
/** 調教主の表示名（プロフィールの写し）。 */
trainerName: string;
/** 調教主の性別（male / female / futanari）。調教師シート
 * （trainers.json の sheet.sex）の写しで、シート項目として正式化
 * 済み。現行エンジンに性別で分岐する判定は無い（実在しない
 * 装備前提ゲート等は作らない）。 */
trainerSex: string;
/** 調教師素質の id 配列（調教師シート sheet.traits の作業コピー、
 * trainer_traits.json が正本）。器のみ: 素質の効果
 * （@PLAYER_SKILL_CHECK の相互作用・@COM_ORDER の実行値項など）は
 * 未配線で、この配列は計算に一切影響しない。 */
trainerTraits: string[];
/** 射精ゲージの上限（調教師シート sheet.ejacMax の作業コピー、
 * 既定 10000）。射精の発火判定・減算・表示上限がこの値を参照する
 * （ejacShoot の max 引数）。ゲージの現在値自体は従来どおり
 * resources.ejac（セッション内変数）。 */
trainerEjacMax: number;
/** 調教主の永続ストアへ接続済みか。旧形式の保存状態（この仕組みより
 * 前のセーブ）は false で、アダプタが初回読み込み時にセーブ側の
 * trainerSkill / fallenCount をストアへ移行して true にする。 */
trainerLinked: boolean;
/** TEQUIP:11（バイブ挿入中）の最小写像。com11 の実行でトグルし、
 * セッション開始で false に戻る。挿入系コマンドの COMABLE が参照。 */
toolInsertedV: boolean;
/** 体内媚薬残留度（eraMaou CFLAG:31）。com51 の使用で +1、
 * 7日ごとの処理で −1（@APHRODISIAC_ADDICT）。 */
aphroResidue: number;
/** 媚薬中毒（eraMaou TALENT:46 の状態写像）。残留度 12 以上で取得、
 * 残留度が 0 になると消失する。 */
aphroAddict: boolean;
/** 禁断症状の回避フラグ（eraMaou CFLAG:32）。媚薬中毒の状態で
 * com51 を使うと立ち、7日ごとの判定で消費される。 */
aphroDosed: boolean;
/** 強制精飲絶頂の回数（eraMaou CFLAG:600、パブロフカウンター） */
seiinCount: number;
/** 精飲経験（eraMaou EXP:8） */
seiinExp: number;
/** 精飲絶頂の回数（eraMaou EX:13） */
seiinClimax: number;
/** 精愛味覚（eraMaou TALENT:47 の状態写像）。強制精飲絶頂が
 * 規定回数に達すると獲得する。 */
seiinTaste: boolean;
/** 見た目データ（キャラ定義 look の写し）。定義が無いキャラは null。 */
look: LookData | null;
/** 実行済みコマンドIDの集合（永続）。辞書の first/repeat 判定の根拠。
 * 成否を問わず、初めて実行した手で消費される。 */
usedCommands: string[];
/** 前手のコマンドID（CUPチェーンの連続実行判定用）。セッション開始でリセット。 */
prevCommandId: string | null;
exp: Record<string, number>;
dailyExp: Record<string, number>;
prev: string | null;
fired: Record<string, boolean>;
srcGain: Record<string, number>;
goal: Record<string, number>;
finished: boolean;
ending: { choice: string; rank: string; met: boolean | null; text: string} | null;
rngSeed: number;
rngRolls: number;
funds: number;
traitSrcMult: Record<string, number>;
traitConvMult: Record<string, number>;
traitIds: string[];
log: LogEntry[];
nextEntryId: number;
createdAt: number;
}

// ---------------------------------------------------------------- expression evaluator
// パックの式は四則・比較・&&/||・括弧・識別子のみ。小さな再帰下降パーサで
// 安全に評価する。未知の識別子は 0（circ_* など未移植の名前空間も 0 になる）。

type Tok =
| { t: "num"; v: number}
| { t: "id"; v: string}
| { t: "op"; v: string};

function tokenize(expr: string): Tok[] {
const toks: Tok[] = [];
let i = 0;
while (i < expr.length) {
const c = expr[i]?? "";
if (c === " " || c === "\t") { i++; continue;}
if (/[0-9.]/.test(c)) {
let j = i;
while (j < expr.length && /[0-9.]/.test(expr[j]?? "")) j++;
toks.push({ t: "num", v: parseFloat(expr.slice(i, j))});
i = j; continue;
}
if (/[A-Za-z_]/.test(c)) {
let j = i;
while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j]?? "")) j++;
toks.push({ t: "id", v: expr.slice(i, j)});
i = j; continue;
}
const two = expr.slice(i, i + 2);
if (["&&", "||", ">=", "<=", "==", "!="].includes(two)) {
toks.push({ t: "op", v: two}); i += 2; continue;
}
if ("+-*/%()<>!".includes(c)) { toks.push({ t: "op", v: c}); i++; continue;}
i++; // 未知の文字は読み飛ばす
}
return toks;
}

export function evalExpr(expr: string, ns: Record<string, number>): number {
const toks = tokenize(expr);
let pos = 0;
const peek = (): Tok | undefined => toks[pos];
const next = (): Tok | undefined => toks[pos++];

function parseOr(): number {
let v = parseAnd();
while (peek()?.v === "||") { next(); const r = parseAnd(); v = v!== 0 || r!== 0? 1: 0;}
return v;
}
function parseAnd(): number {
let v = parseCmp();
while (peek()?.v === "&&") { next(); const r = parseCmp(); v = v!== 0 && r!== 0? 1: 0;}
return v;
}
function parseCmp(): number {
let v = parseAdd();
for (;;) {
const op = peek()?.v;
if (op === ">=" || op === "<=" || op === ">" || op === "<" || op === "==" || op === "!=") {
next(); const r = parseAdd();
v = op === ">="? (v >= r? 1: 0)
: op === "<="? (v <= r? 1: 0)
: op === ">"? (v > r? 1: 0)
: op === "<"? (v < r? 1: 0)
: op === "=="? (v === r? 1: 0)
: (v!== r? 1: 0);
} else return v;
}
}
function parseAdd(): number {
let v = parseMul();
for (;;) {
const op = peek()?.v;
if (op === "+") { next(); v += parseMul();}
else if (op === "-") { next(); v -= parseMul();}
else return v;
}
}
function parseMul(): number {
let v = parseUnary();
for (;;) {
const op = peek()?.v;
if (op === "*") { next(); v *= parseUnary();}
else if (op === "/") { next(); const r = parseUnary(); v = r === 0? 0: v / r;}
else if (op === "%") { next(); const r = parseUnary(); v = r === 0? 0: v % r;}
else return v;
}
}
function parseUnary(): number {
const tk = peek();
if (tk?.v === "-") { next(); return -parseUnary();}
if (tk?.v === "!") { next(); return parseUnary() === 0? 1: 0;}
return parseAtom();
}
function parseAtom(): number {
const tk = next();
if (!tk) return 0;
if (tk.t === "num") return tk.v;
if (tk.t === "id") {
if (tk.v === "true") return 1;
if (tk.v === "false") return 0;
return ns[tk.v]?? 0;
}
if (tk.v === "(") {
const v = parseOr();
if (peek()?.v === ")") next();
return v;
}
return 0;
}
try {
return parseOr();
} catch {
return 0;
}
}

/** Godot の round（.5 は絶対値方向へ）に合わせる */
export function godotRound(x: number): number {
return x >= 0? Math.floor(x + 0.5): -Math.floor(-x + 0.5);
}

// ---------------------------------------------------------------- helpers

export function paramDef(id: string) {
return PARAM_DEFS.find((p) => p.id === id);
}

export function marksOf(s: GameState): Record<string, number> {
const out: Record<string, number> = {};
for (const m of MARKS) {
const peak = s.peaks[m.param]?? s.params[m.param]?? 0;
let lv = 0;
for (const th of m.thresholds) if (peak >= th) lv++;
out[m.id] = lv;
}
return out;
}

/** 式評価用の名前空間: パラメータ＋ exp_<cmd> / prev_<cmd> / mark_<id> / peak_<param> */
export function namespaceOf(s: GameState): Record<string, number> {
const ns: Record<string, number> = {};
for (const [k, v] of Object.entries(s.params)) ns[k] = v;
// 能力Lv（COMABLE 形の解放条件が abl_* / sense_* で引く）と潤滑。
// 能力IDはそのままの名前で公開する（abl_obedience / sense_c 等）。
for (const def of ABILITIES) ns[def.id] = s.abilities?.[def.id] ?? 0;
ns["lub"] = s.lub ?? 0;
for (const c of COMMANDS) {
ns[`exp_${c.id}`] = s.exp[c.id]?? 0;
ns[`prev_${c.id}`] = s.prev === c.id? 1: 0;
}
const marks = marksOf(s);
for (const [k, v] of Object.entries(marks)) ns[`mark_${k}`] = v;
for (const [k, v] of Object.entries(s.peaks)) ns[`peak_${k}`] = v;
// 陥落素質（@CHECK_SPECIALSKIL の獲得分。式から fall_ai / fall_inran で引く）
ns["fall_ai"] = (s.fallTraits?? []).includes("ai")? 1: 0;
ns["fall_inran"] = (s.fallTraits?? []).includes("inran")? 1: 0;
// 経験カウンタ（COMABLE の経験ゲートが exp_v / exp_a で引く）
// s.exp（コマンド別実行回数）の exp_<commandId> とは別系統
ns["exp_v"] = s.expReal?.["v"]?? 0;
ns["exp_a"] = s.expReal?.["a"]?? 0;
// アイテム所持（COMABLE の所持ゲートが item_<アイテムID> で引く）
for (const idStr of Object.keys(ITEM_DEFS)) {
ns[`item_${idStr}`] = s.inventory?.[idStr]?? 0;
}
// 調教者の技巧Lv（COMABLE の ABL:PLAYER:12 ゲートの写像）
ns["trainer_skill"] = s.trainerSkill?? 0;
// TEQUIP:11（バイブ挿入中）の写像
ns["tool_v"] = s.toolInsertedV? 1: 0;
// 種族（COM135 セルフクンニの TALENT:314 写像。look.race で判定）
ns["race_dullahan"] = s.look?.race === "デュラハン"? 1: 0;
return ns;
}

/** PALAM の帯（PALAMLV 境界の 0〜5。@COM_ORDER の PALAM Lv 換算） */
export function palamBandOf(value: number): number {
return value < 100? 0: value < 500? 1: value < 3000? 2: value < 10000? 3: value < 30000? 4: 5;
}

/**
 * コマンド実行判定の実行値（eraMaou @COM_ORDER の共通項 + コマンド
 * 固有項）。共通項のうち試作で表現できるもの:
 * 従順ABL ×4 / 苦痛刻印 ×5 / 屈服刻印 ×3×T（T はプライド係数で、
 * 試作に該当素質が無いため通常値 2）/ 反発刻印 −×2×T /
 * 恭順PALAM帯 ×3 / 恐怖PALAM帯 ×3。
 * PALAM 帯の入力はセッション開始時点のウォーターマークからの
 * ソース増分（恭順 ≙ 情愛ソース、恐怖 ≙ 恐怖ソース）で取る写像。
 * 【欠け】マゾっ気・レズ系・素質項・調教者素質・相性は、試作に
 * 対応する能力・素質が無いため落とした。
 * 固有項の palam_lust（欲情帯）は快楽ソースのセッション増分の帯。
 */
export function orderScore(s: GameState, judge: OrderJudgeDef): { score: number; auto: boolean } {
const ns = namespaceOf(s);
if (judge.auto && evalExpr(judge.auto, ns)!== 0) {
return { score: Number.POSITIVE_INFINITY, auto: true };
}
const m = s.marksReal?? { pain: 0, pleasure: 0, submission: 0, rejection: 0 };
const srcMark = s.juelSrcMark?? {};
const srcDelta = (id: string) =>
Math.max(0, (s.srcGain?.[id]?? 0) - (srcMark[id]?? 0));
let a = 0;
a += (s.abilities?.["abl_obedience"]?? 0) * 4;
a += (m.pain?? 0) * 5;
a += (m.submission?? 0) * 3 * 2;
a -= (m.rejection?? 0) * 2 * 2;
a += palamBandOf(srcDelta("affection")) * 3;
a += palamBandOf(srcDelta("fear")) * 3;
const lustBand = palamBandOf(srcDelta("pleasure"));
for (const t of judge.terms) {
const val = t.key === "mark_pleasure"? (m.pleasure?? 0)
: t.key === "mark_submission"? (m.submission?? 0)
: t.key === "palam_lust"? lustBand
: (s.abilities?.[t.key]?? 0);
a += val * t.mult;
}
return { score: a, auto: false };
}

/** 苦痛ソース → 反感（UP:11）の従順倍率（@SOURCE_CHECK_UP_PAIN の
 * LOCAL:2 の ABL:10 表。ABL 6 以上は 0。マゾっ気倍率は能力が無い
 * ため欠け） */
export const PAIN_HATE_OBED = [0.8, 0.6, 0.5, 0.4, 0.2, 0.05];
/** UP:5（欲情）への部位快UPの変換倍率（eraMaou @SOURCE_CHECK_UP_C/V/B
 * 実測、欲望ABL 0〜5・6以上は末尾）。快C/V/B 共通。 */
export const DESIRE_PART_MULT_CVB = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5];
/** UP:5（欲情）への快A UPの変換倍率（@SOURCE_CHECK_UP_A 実測。
 * A だけ表が異なる: 高Lvで 1 を超える）。 */
export const DESIRE_PART_MULT_A = [0.05, 0.1, 0.4, 0.8, 1.2, 1.8, 2.0];
/** UP:5（欲情）への情愛ソースの変換倍率（@SOURCE_CHECK_UP_LOVE 実測、
 * 欲望ABL 別）。 */
export const LOVE_DESIRE_MULT = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5];
/** UP:6（屈服）への屈従ソースの変換倍率（@SOURCE_CHECK_UP_SUBMIT
 * 実測、従順ABL 0〜7）。LOCAL:1 側（抑鬱側は SUBMIT_GLOOM_OBED）。 */
export const SUBMIT_YIELD_OBED = [0.5, 0.8, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
/** 調教者技巧（ABL:PLAYER:12）の全体倍率（eraMaou SYSTEM_SOURCE_SUB1
 * @PLAYER_SKILL_CHECK 実測）。@SOURCE_CHECK が全コマンドのソース確定後・
 * UP 変換前に掛ける: 快C・快V・快A・快B のソースへ Lv 別倍率
 * [0.50, 0.80, 1.00, 1.20, 1.50, 2.00]（Lv0〜4、Lv5 以上は末尾）。
 * 快F（SOURCE:18）は原作でも対象外。試作では部位駆動値（partBases /
 * partStages の drive。原作の SOURCE:0/1/2/17 に対応）へ掛ける。
 * 索引は min(技巧Lv, 5)。 */
export const TECH_SOURCE_MULT = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0];
/** 全体倍率の対象部位（快F は原作 @PLAYER_SKILL_CHECK の対象外） */
export const TECH_SOURCE_PARTS: ReadonlySet<string> = new Set([
"kai_c", "kai_v", "kai_a", "kai_b",
]);
export function techMultOf(partId: string, trainerSkill: number): number {
if (!TECH_SOURCE_PARTS.has(partId)) return 1;
const lv = Math.min(5, Math.max(0, trainerSkill));
return TECH_SOURCE_MULT[lv]?? 1;
}
/** 調教者技巧 → 情愛ソース増分（COMF6 キス / COMF22・23・28・29 の
 * SOURCE:3 梯子 [100, 150, 200, 300, 500, 800] の共通形。キスでは
 * 代入＝基礎値そのもの、座位系では加算。試作では基礎値に含まれる
 * 梯子 Lv0 分（100）を除いた増分をパック尺度 1/10 で加える。
 * 技巧Lv 0〜5 索引（Lv5 以上は末尾） */
export const TECH_AFFECTION_ADD = [0, 5, 10, 20, 40, 70];
/** 情愛梯子の対象コマンド（COMF6 / COMF22 / COMF23 / COMF28 / COMF29） */
export const TECH_AFFECTION_COMMANDS: ReadonlySet<string> = new Set([
"kiss", "com22", "com23", "com28", "com29",
]);
/** 調教者技巧 → 液体追加（SOURCE:10）の梯子（原値そのまま。潤滑の
 * 発生へ合算する）。キス（COMF6）は [0, 0, 0, 50, 100, 200]、
 * 座位系（COMF22/23/28/29）は [0, 50, 100, 150, 250, 400]。
 * 技巧Lv 0〜5 索引（Lv5 以上は末尾） */
export const TECH_LIQUID: Record<string, number[]> = {
kiss: [0, 0, 0, 50, 100, 200],
com22: [0, 50, 100, 150, 250, 400],
com23: [0, 50, 100, 150, 250, 400],
com28: [0, 50, 100, 150, 250, 400],
com29: [0, 50, 100, 150, 250, 400],
};
/** 調教者技巧 → 座位系の A 値（COMF22/23/28/29 共通の梯子
 * [0, 0, 0, 50, 100, 300] を部位駆動の尺度 1/10 にしたもの）。
 * A は 快C へ常時加算され、主部位（快V／快A）へは経験条件つきで
 * 加算されるが、その SIF は原作では定数評価になる（下記
 * TECH_A_PARTS の注記）。キス（COMF6）にも同じ A 梯子があるが、
 * 原作では設定後に消費されず実効が無いため接続しない。 */
export const TECH_A_ADD = [0, 0, 0, 5, 10, 30];
/** A の加算先（コマンド → 部位）。原作の SIF の実効で確定した形:
 * - com22 対面座位: 快V 分の `SIF EXPLV:0 >= 3` は EXPLV が静的閾値
 *   配列（初期値 0/1/4/20/…）のため 0 >= 3 で常時不成立 → 快C のみ
 * - com23 背面座位: 快V 分の `SIF EXPLV:10 >= 3` は 2000 >= 3 で
 *   常時成立 → 快C・快V の両方
 * - com28 対面座位アナル: 主部位への SIF 自体が無い → 快C のみ
 * - com29 背面座位アナル: 快A 分の `SIF EXPLV:1 >= 3` は 1 >= 3 で
 *   常時不成立 → 快C のみ
 * （COMF120/121 にも同型の A があるが、技巧ブロック全体が
 * PREVCOM == 612 分岐内で、試作に COM612 が無いため未接続） */
export const TECH_A_PARTS: Record<string, string[]> = {
com22: ["kai_c"],
com23: ["kai_c", "kai_v"],
com28: ["kai_c"],
com29: ["kai_c"],
};
/** 口内射精が成立するコマンド（eraMaou SEIIN の TFLAG:0 が立つ
 * フェラ系。精飲絶頂の発動条件） */
export const ORAL_EJAC_COMMANDS: ReadonlySet<string> = new Set([
"fellatio", "com80", "com123", "com124", "com125", "com126", "com127",
]);
/** 精飲絶頂: 強制精飲絶頂の規定回数 P の基礎値（eraMaou @SEIIN_CHECK）。
 * 素質による増減のうち試作で表現できるのは [淫乱] の −20 のみ
 * （他は該当素質が無いため欠け） */
export const SEIIN_BASE_COUNT = 50;
export const SEIIN_INRAN_DELTA = -20;
/** 媚薬中毒（eraMaou EVENT_ADDICT / COMF51）: 残留度の取得閾値。
 * [中毒しやすい] があれば 9 だが、試作に該当素質は無いため 12 のみ */
export const APHRO_ADDICT_THRESHOLD = 12;
/** 屈従 → 抑鬱（UP:13）の従順倍率（@SOURCE_CHECK_UP_SUBMIT の
 * LOCAL:0 の ABL:10 表。ABL 4 以上は 0） */
export const SUBMIT_GLOOM_OBED = [0.12, 0.1, 0.05, 0.02];

/**
 * 刻印の取得判定（eraMaou @MARK_GOT_CHECK の形）。入力はその手の
 * PALAM 増加分（UP）: 快楽 = 部位CUP合計、苦痛/反感は試作ソースを
 * PALAM スケールへ戻した値（ソースは第9弾の写像で原作 SOURCE の
 * 約 1/10 のため ×10）、屈服は YIELD_MARKS の固定値（TFLAG:200）。
 * 刻印に付随する従順ABLの増減も原作どおり適用する（素質ガードは
 * 試作に該当素質が無いため無条件適用 = 欠けとして注記）。
 * 反発刻印はガード（markGuardRejection = MARK:4）が過去最大Lvを
 * 保持し、それを超える再取得は起きない（原作の癖）。
 * 戻り値は記録行（サマリー）に出す文の列。
 */
export function applyMarkCheck(
s: GameState,
hand: { upPleasure: number; upPain: number; upHate12: number; yieldMark: number; filmedMast: boolean },
): string[] {
const lines: string[] = [];
const m = s.marksReal;
const obed = () => s.abilities?.["abl_obedience"]?? 0;
const setObed = (v: number) => { if (s.abilities) s.abilities["abl_obedience"] = v; };
// 快楽刻印 MARK:1 ← UP:0+UP:1+UP:2+UP:14
const plv = hand.upPleasure >= 3000? 3: hand.upPleasure >= 1500? 2: hand.upPleasure >= 500? 1: 0;
if (plv > (m.pleasure?? 0)) {
m.pleasure = plv;
s.pleasureMark = plv;
lines.push(`快楽刻印LV${plv}を取得`);
if (plv === 3 && obed() === 0) setObed(1);
}
// 苦痛刻印 MARK:0 ← UP:9
const palv = hand.upPain >= 3000? 3: hand.upPain >= 1500? 2: hand.upPain >= 500? 1: 0;
if (palv > (m.pain?? 0)) {
m.pain = palv;
lines.push(`苦痛刻印LV${palv}を取得`);
if (palv >= 2 && obed() === 0) setObed(1);
// 異常経験 +1（調教者が[サド]のとき）は調教者素質が無いため欠け
}
// 屈服刻印 MARK:2 ← TFLAG:200
if (hand.yieldMark > (m.submission?? 0)) {
m.submission = hand.yieldMark;
lines.push(`屈服刻印LV${m.submission}を取得`);
if (m.submission === 2 && obed() === 0) setObed(1);
if (m.submission === 3 && obed() <= 1) setObed(2);
}
// 反発刻印 MARK:3 ← UP:11+UP:12（TFLAG:150 の回避は処女喪失系の
// 仕組みが無いため欠け）
const rlv = hand.upHate12 >= 3000? 3: hand.upHate12 >= 1200? 2: hand.upHate12 >= 500? 1: 0;
if (rlv > (m.rejection?? 0) && rlv > (s.markGuardRejection?? 0)) {
m.rejection = rlv;
s.markGuardRejection = rlv;
lines.push(`反発刻印LV${rlv}を取得`);
const ob = obed();
if (rlv === 2 && (ob === 1 || ob === 2)) setObed(ob - 1);
if (rlv === 3) setObed(ob <= 2? 0: 2);
}
// 異常経験: 撮影中の自慰（COMF3 の TEQUIP:53 分岐。一度だけ）
if (hand.filmedMast && !s.abnormalMastDone) {
s.abnormalMastDone = true;
s.expReal["abnormal"] = (s.expReal["abnormal"]?? 0) + 1;
lines.push("異常経験＋１");
}
return lines;
}

/** 奉仕快楽経験の階段（@EXP_GOT_CHECK の +16/12/8/4/2/1 梯子） */
export function expGotLadder(local: number): number {
return local >= 12000? 16: local >= 8000? 12: local >= 5000? 8
: local >= 3000? 4: local >= 2000? 2: local >= 1000? 1: 0;
}

/**
 * 陥落素質の獲得判定（eraMaou @CHECK_SPECIALSKIL の愛/淫乱分）。
 * セッション終了時（原作の EVENT_TURNEND 呼び出し位置）に評価する。
 * 前提: 反発刻印なし・調教経験（CFLAG:2 写像）≥ 1000。
 * - 愛: 従順 ≥ 3 かつ 奉仕快楽経験 ≥ 200（EXPLV:5）かつ 屈服刻印 = 3
 *   かつ 奉仕精神 ≥ 3、淫乱・愛とも未所持
 * - 淫乱: 欲望 ≥ 3 かつ C/V/A/B感覚の合計 ≥ 10 かつ 異常経験 ≥ 3
 *   かつ 快楽刻印 = 3 かつ 屈服刻印 = 3、愛 未所持
 * 【欠け】調教経験 ≥ 2000 の売却・助手解放分（試作に無い仕組み）、
 * 獲得に伴う素質の消失・否定の珠半減（試作に該当素質が無い）。
 */
export function checkFallTraits(s: GameState): string[] {
const acquired: string[] = [];
const has = (t: string) => (s.fallTraits?? []).includes(t);
if ((s.marksReal?.rejection?? 0)!== 0) return acquired;
if ((s.expReal?.["train"]?? 0) < 1000) return acquired;
if (!has("ai") && !has("inran")) {
if ((s.abilities?.["abl_obedience"]?? 0) >= 3
&& (s.expReal?.["service"]?? 0) >= 200
&& (s.marksReal?.submission?? 0) === 3
&& (s.abilities?.["abl_service"]?? 0) >= 3) {
s.fallTraits.push("ai");
acquired.push("ai");
s.fallenCount = (s.fallenCount?? 0) + 1; // FLAG:30（堕とした人数）
}
}
if (!has("inran") && !has("ai")) {
const senseSum = ["sense_c", "sense_v", "sense_a", "sense_b"]
.reduce((acc, id) => acc + (s.abilities?.[id]?? 0), 0);
if ((s.abilities?.["abl_desire"]?? 0) >= 3
&& senseSum >= 10
&& (s.expReal?.["abnormal"]?? 0) >= 3
&& (s.marksReal?.pleasure?? 0) === 3
&& (s.marksReal?.submission?? 0) === 3) {
s.fallTraits.push("inran");
acquired.push("inran");
s.fallenCount = (s.fallenCount?? 0) + 1; // FLAG:30（堕とした人数）
}
}
return acquired;
}

/** 固定の開始条件（素体タイプ／調教／現代）で見えるコマンド */
export function visibleCommands(s: GameState): CommandDef[] {
return COMMANDS.filter((c) =>!c.world || c.world === s.worldId);
}

export function isUnlocked(s: GameState, cmd: CommandDef): boolean {
if (cmd.world && cmd.world!== s.worldId) return false;
return evalExpr(cmd.unlock, namespaceOf(s))!== 0;
}

const BAND_KEY: Record<string, string> = {
train_light: "obedience",
breast_caress: "kai_b",
cunni: "kai_c",
fellatio: "kai_f",
sex_v: "kai_v",
sex_a: "kai_a",
com2: "kai_a",
com3: "kai_c",
com4: "kai_c",
com8: "kai_v",
com9: "kai_a",
com10: "kai_c",
com11: "kai_v",
com12: "kai_c",
com13: "kai_a",
com14: "kai_c",
com15: "kai_b",
com16: "kai_b",
com17: "kai_c",
com19: "kai_a",
com21: "kai_v",
com22: "kai_v",
com23: "kai_v",
com24: "kai_c",
com25: "kai_c",
com27: "kai_a",
com28: "kai_a",
com29: "kai_a",
com32: "kai_b",
com34: "kai_v",
com35: "kai_c",
com36: "kai_a",
com46: "kai_a",
com48: "kai_c",
com49: "kai_a",
com81: "kai_v",
com82: "kai_a",
com83: "kai_v",
com90: "kai_b",
com120: "kai_v",
com121: "kai_v",
com123: "kai_b",
com124: "kai_f",
com125: "kai_c",
com126: "kai_f",
com127: "kai_f",
com128: "kai_v",
com129: "kai_v",
com130: "kai_v",
com131: "kai_v",
com132: "kai_v",
com133: "kai_v",
com134: "kai_v",
com135: "kai_c",
};
export function bandOf(s: GameState, cmdId: string): "low" | "mid" | "high" {
const key = BAND_KEY[cmdId]?? "trust";
const v = s.params[key]?? 0;
return v < 150? "low": v < 400? "mid": "high";
}

function roll(s: GameState): number {
let x = (s.rngSeed * 1000003 + s.rngRolls * 2654435761) >>> 0;
s.rngRolls++;
x ^= x >>> 15; x = Math.imul(x, 2246822519);
x ^= x >>> 13; x = Math.imul(x, 3266489917);
x ^= x >>> 16;
return (x >>> 0) / 4294967296;
}

function updatePeaks(s: GameState) {
for (const [k, v] of Object.entries(s.params)) {
if (v > (s.peaks[k]?? v)) s.peaks[k] = v;
}
}

export function snapshotOf(s: GameState): StatusSnapshot {
const marks = marksOf(s);
const markList = MARKS.filter((m) => (marks[m.id]?? 0) > 0).map((m) => ({
id: m.id, label: m.label, lv: marks[m.id]?? 0,
}));
// 快楽刻印（永続フィールド由来）は level > 0 のときだけ marks に含める。
if ((s.pleasureMark?? 0) > 0) {
markList.push({ id: "pleasure_mark", label: "快楽刻印", lv: s.pleasureMark?? 0 });
}
// 原作刻印（苦痛/屈服/反発）も level > 0 のときだけ含める。
if ((s.marksReal?.pain?? 0) > 0) {
markList.push({ id: "mark_pain", label: "苦痛刻印", lv: s.marksReal?.pain?? 0 });
}
if ((s.marksReal?.submission?? 0) > 0) {
markList.push({ id: "mark_submission", label: "屈服刻印", lv: s.marksReal?.submission?? 0 });
}
if ((s.marksReal?.rejection?? 0) > 0) {
markList.push({ id: "mark_rejection", label: "反発刻印", lv: s.marksReal?.rejection?? 0 });
}
return {
day: s.day,
daysLimit: s.daysLimit,
slot: s.slot ?? 0,
slotLabel: slotLabelOf(s.slot ?? 0),
sessionSeq: s.sessionSeq ?? 1,
collapsed: s.collapsed ?? false,
/** 素質IDの一覧（能力表示シートの素質欄用。ラベル化は表示側の責務） */
traits: s.traitIds ?? [],
params: PARAM_DEFS.map((d) => ({
id: d.id, label: d.label, value: s.params[d.id]?? 0,
// 快楽系は「セッションの中だけの蓄積・上限なし」なので max は null。
max: (KAI_PARAM_IDS as readonly string[]).includes(d.id)? null: d.max,
})),
goal: Object.entries(s.goal).map(([id, target]) => ({
id,
label: paramDef(id)?.label?? id,
value: s.params[id]?? 0,
target,
met: (s.params[id]?? 0) >= target,
})),
marks: markList,
sources: SOURCE_IDS.map((id) => ({
id, label: SOURCE_LABELS[id]?? id, value: godotRound(s.srcGain[id]?? 0),
})),
jewels: JUEL_CURRENCIES.map((c) => ({
id: c.id, label: c.label, value: s.jewels?.[c.id]?? 0,
})),
resources: {
vital: s.resources?.vital?? RESOURCE_MAX.vital,
vitalMax: s.resources?.vitalMax?? RESOURCE_MAX.vital,
energy: s.resources?.energy?? RESOURCE_MAX.energy,
energyMax: s.resources?.energyMax?? RESOURCE_MAX.energy,
ejac: s.resources?.ejac?? 0,
ejacMax: s.trainerEjacMax?? RESOURCE_MAX.ejac,
},
abilities: ABILITIES.map((def) => {
const lv = s.abilities?.[def.id]?? 0;
const queued = 0;
// 購入は調教終了後のメニューで即時成立するため、価格表示は現在Lvに
// 対する次Lv価格でよい（queued は互換フィールドとして 0 固定）。
const projectedLv = lv;
let nextCost: { juelId: string; juelLabel: string; amount: number }[] | null = null;
// abl_buyoff は ABLUP99 の刻印消去: 価格は能力Lvではなく現在の
// 反発刻印Lvで決まる（屈服の珠 5000/10000/50000、[愛] で ×0.50）。
if (def.special === "buy_off_stress") {
const rejLv = s.marksReal?.rejection?? 0;
if (rejLv > 0) {
const base = [0, 5000, 10000, 50000][rejLv]?? 0;
const mult = (s.fallTraits?? []).includes("ai")? 0.5: 1.0;
nextCost = [{ juelId: "yield", juelLabel: juelLabel("yield"), amount: Math.trunc(base * mult) }];
}
} else if (def.blocked) {
nextCost = null;
} else if (projectedLv < def.maxLv) {
const costs = abilityCost(s, def, projectedLv);
if (costs && costs.length > 0) {
nextCost = costs.map((c) => ({
juelId: c.juelId, juelLabel: juelLabel(c.juelId), amount: c.amount,
}));
}
}
return { id: def.id, label: def.label, lv, maxLv: def.maxLv, queued, nextCost };
}),
exClimax: {
kai_c: s.exClimax?.kai_c?? 0,
kai_v: s.exClimax?.kai_v?? 0,
kai_a: s.exClimax?.kai_a?? 0,
kai_b: s.exClimax?.kai_b?? 0,
kai_f: s.exClimax?.kai_f?? 0,
},
climaxExp: s.climaxExp?? 0,
pleasureMark: s.pleasureMark?? 0,
marksReal: {
pain: s.marksReal?.pain?? 0,
pleasure: s.marksReal?.pleasure?? 0,
submission: s.marksReal?.submission?? 0,
rejection: s.marksReal?.rejection?? 0,
},
expReal: {...(s.expReal?? {})},
fallTraits: [...(s.fallTraits?? [])],
ejacCount: s.ejacCount?? 0,
lubrication: {
value: s.lub?? 0,
label: lubLabelOf(s.lub?? 0),
},
allowance: s.allowance?? 0,
inventory: Object.entries(s.inventory?? {})
.filter(([, n]) => n > 0)
.map(([idStr, n]) => ({
itemId: Number(idStr),
label: ITEM_DEFS[Number(idStr)]?.label?? idStr,
count: n,
consumable: ITEM_DEFS[Number(idStr)]?.consumable?? false,
})),
trainerSkill: s.trainerSkill?? 0,
fallenCount: s.fallenCount?? 0,
trainerId: s.trainerId?? "default",
trainerName: s.trainerName?? "あなた",
trainerSex: s.trainerSex?? "female",
trainerTraits: [...(s.trainerTraits?? [])],
trainerSheet: {
sex: s.trainerSex?? "female",
skill: s.trainerSkill?? 0,
ejacMax: s.trainerEjacMax?? RESOURCE_MAX.ejac,
traits: [...(s.trainerTraits?? [])],
},
shopItems: shopItemsOf(s),
look: s.look?? null,
aphro: { residue: s.aphroResidue?? 0, addict: s.aphroAddict?? false },
seiin: {
count: s.seiinCount?? 0, exp: s.seiinExp?? 0,
climax: s.seiinClimax?? 0, taste: s.seiinTaste?? false,
},
};
}

/** 末尾印: mark=1 は地の文系、mark=3 は結果・状態系 */
function pushLog(
s: GameState,
kind: LogEntry["kind"],
text: string,
opts?: { mark?: 1 | 3; snapshot?: StatusSnapshot},
): LogEntry {
const marked = opts?.mark? `${text},${opts.mark}`: text;
const e: LogEntry = { id: s.nextEntryId++, at: Date.now(), kind, text: marked, snapshot: opts?.snapshot};
s.log.push(e);
return e;
}

/** コマンド後の現在値要約（1行） */
const SUMMARY_ORDER = ["trust", "obedience", "desire", "submission", "relief", "satisfaction", "fatigue", "stress"];

export function summaryLine(s: GameState, kaiGains?: { id: string; delta: number }[]): string {
const parts = SUMMARY_ORDER.map((id) => `${paramDef(id)?.label?? id} ${s.params[id]?? 0}`);
let text = parts.join("・");
const marks = marksOf(s);
const reached = MARKS
.filter((m) => (marks[m.id]?? 0) > 0)
.map((m) => `${paramDef(m.param)?.label?? m.label}Lv${marks[m.id]?? 0}`);
if (reached.length > 0) text += `　到達：${reached.join("・")}`;
// 快楽系の増分は「//」の後に動いた分だけを「/」区切りで追記する
if (kaiGains && kaiGains.length > 0) {
text += "//" + kaiGains
.map((g) => `${paramDef(g.id)?.label?? g.id}+${g.delta}`)
.join("/");
}
return text;
}

/**
 * 旧形式の保存状態（快楽系パラメータ追加前に作られた JSON）の互換補完。
 * PARAM_DEFS にあるのに params / peaks に無いキーを初期値で埋める。
 * 既存の値・ログには一切触れない。
 */
export function normalizeState(s: GameState): GameState {
for (const d of PARAM_DEFS) {
if (!(d.id in s.params)) s.params[d.id] = d.init;
if (!(d.id in s.peaks)) s.peaks[d.id] = s.params[d.id] ?? d.init;
}
// リソース/セリフ追加前の保存状態の補完: 体力・気力はフル、射精は0、セリフは空。
if (typeof s.dialogue!== "string") s.dialogue = "";
// 性格/口上追加前の保存状態の補完: personality 未設定は "sunao"、
// kojoLast は null。既存の数値・進行・ログには一切触れない。
s.personality = normalizePersonality(s.personality);
if (!s.kojoLast || typeof s.kojoLast!== "object"
|| typeof s.kojoLast.key!== "string" || typeof s.kojoLast.index!== "number") {
s.kojoLast = null;
}
if (!s.resources || typeof s.resources!== "object") {
s.resources = {
vital: RESOURCE_MAX.vital, vitalMax: RESOURCE_MAX.vital,
energy: RESOURCE_MAX.energy, energyMax: RESOURCE_MAX.energy, ejac: 0,
};
} else {
if (typeof s.resources.vital!== "number") s.resources.vital = RESOURCE_MAX.vital;
if (typeof s.resources.energy!== "number") s.resources.energy = RESOURCE_MAX.energy;
if (typeof s.resources.ejac!== "number") s.resources.ejac = 0;
// 最大値を保持していない旧形式の保存状態は、旧既定値（最大1000）の
// まま補完して尊重する。新規セッションの基準2000へは再計算しない。
// 既に保存された最大値には一切触れない。
if (typeof s.resources.vitalMax!== "number") s.resources.vitalMax = RESOURCE_MAX.vital;
if (typeof s.resources.energyMax!== "number") s.resources.energyMax = RESOURCE_MAX.energy;
}
// 珠追加前の保存状態の補完: jewels は空の疎辞書、確定済みセッションは
// 空配列。既存の珠・確定記録には触れない。
if (!s.jewels || typeof s.jewels!== "object" || Array.isArray(s.jewels)) s.jewels = {};
if (!Array.isArray(s.settledSessions)) s.settledSessions = [];
// 珠換算の全体化（第11弾）追加前の保存状態の補完: ウォーターマークは
// null（未初期化）のままにし、初回精算時にその時点の値で初期化させる
// （過去分を遡って換算しないため、ここで現在値を入れてはいけない）。
// stressPosSession は 0 で補完する（旧・日次版 stressPosToday は移行しない:
// 日の途中の累積をセッション増分として読み替える根拠が無いため破棄し、
// 0 から数え直す）。既存の珠・数値・進行には触れない。
if (s.juelSrcMark !== null
&& (typeof s.juelSrcMark !== "object" || Array.isArray(s.juelSrcMark))) {
s.juelSrcMark = null;
}
if (s.juelParamMark !== null
&& (typeof s.juelParamMark !== "object" || Array.isArray(s.juelParamMark))) {
s.juelParamMark = null;
}
if (typeof s.stressPosSession !== "number") s.stressPosSession = 0;
// 潤滑追加前の保存状態の補完: lub は既定値 0 で読めるようにする。
// 既存の数値・進行・ログには一切触れない。
if (typeof s.lub !== "number") s.lub = 0;
if (typeof s.climaxCount!== "number") s.climaxCount = 0;
if (typeof s.ejacCount!== "number") s.ejacCount = 0;
// 絶頂処理（第4弾）追加前の保存状態の補完: 新フィールドを既定値で埋める。
// usedCommands は既存の保持構造 exp（実行回数、永続）から移行する:
// 1回以上実行されたコマンドは「実行済み」として first を消費済みにする。
// 既存の数値・進行・ログには一切触れない。
if (!s.exClimax || typeof s.exClimax!== "object") s.exClimax = emptyExMap();
else for (const p of CLIMAX_PART_IDS) if (typeof s.exClimax[p]!== "number") s.exClimax[p] = 0;
if (!s.exSession || typeof s.exSession!== "object") {
// 旧・日次版 exToday があれば、その日の EX 増分として引き継ぐ
// （どちらも「まだ精算されていない EX の蓄積」という意味で同型）。
const legacy = (s as unknown as { exToday?: unknown }).exToday;
s.exSession = (legacy && typeof legacy === "object") ? (legacy as ExMap) : emptyExMap();
}
for (const p of CLIMAX_PART_IDS) if (typeof s.exSession[p]!== "number") s.exSession[p] = 0;
if (typeof s.climaxExp!== "number") s.climaxExp = 0;
if (!s.climaxFirst || typeof s.climaxFirst!== "object") s.climaxFirst = emptyClimaxFirst();
else for (const p of CLIMAX_PART_IDS) if (typeof s.climaxFirst[p]!== "boolean") s.climaxFirst[p] = false;
if (typeof s.pleasureMark!== "number") s.pleasureMark = 0;
// 原作準拠レイヤー（刻印・経験・否定チャンネル・陥落素質）追加前の
// 保存状態の補完: marksReal の快楽だけは旧 pleasureMark（旧・強度式の
// 到達Lv）を引き継ぎ、他は 0 から数え直す（過去分は遡らない。
// ウォーターマークと同じ方針）。既存の数値・進行には触れない。
if (!s.marksReal || typeof s.marksReal!== "object") {
s.marksReal = { pain: 0, pleasure: s.pleasureMark?? 0, submission: 0, rejection: 0 };
} else {
for (const k of ["pain", "pleasure", "submission", "rejection"] as const) {
if (typeof s.marksReal[k]!== "number") s.marksReal[k] = 0;
}
}
if (typeof s.markGuardRejection!== "number") s.markGuardRejection = s.marksReal?.rejection?? 0;
if (!s.expReal || typeof s.expReal!== "object" || Array.isArray(s.expReal)) s.expReal = {};
if (!s.denialSession || typeof s.denialSession!== "object") {
s.denialSession = { hate: 0, discomfort: 0, gloom: 0 };
} else {
for (const k of ["hate", "discomfort", "gloom"] as const) {
if (typeof s.denialSession[k]!== "number") s.denialSession[k] = 0;
}
}
if (typeof s.learnSession!== "number") s.learnSession = 0;
if (typeof s.desireSession!== "number") s.desireSession = 0;
if (typeof s.yieldSession!== "number") s.yieldSession = 0;
if (!Array.isArray(s.fallTraits)) s.fallTraits = [];
if (typeof s.abnormalMastDone!== "boolean") s.abnormalMastDone = false;
if (typeof s.abnormalEnemaState!== "number") s.abnormalEnemaState = 0;
if (typeof s.abnormalOutdoorDone!== "boolean") s.abnormalOutdoorDone = false;
if (typeof s.expansionVDone!== "boolean") s.expansionVDone = false;
if (typeof s.expansionADone!== "boolean") s.expansionADone = false;
if (typeof s.abnormalPierceDone!== "boolean") s.abnormalPierceDone = false;
if (typeof s.filmedSession!== "boolean") s.filmedSession = false;
// アイテム購入レイヤー追加前の保存状態の補完: お小遣い 0・在庫なし・
// 調教者技巧 0・堕落人数は獲得済み陥落素質の数で初期化（過去に堕とした
// 人数はそれ以外に数えようがないため）。look は定義側のデータなので
// 保存状態に無ければ null（キャラ定義からの再取得は start 側の責務）。
if (typeof s.allowance !== "number") s.allowance = 0;
if (!s.inventory || typeof s.inventory !== "object" || Array.isArray(s.inventory)) s.inventory = {};
if (typeof s.trainerSkill !== "number") s.trainerSkill = 0;
if (typeof s.fallenCount !== "number") s.fallenCount = (s.fallTraits?? []).length;
// 調教主プロフィール追加前の保存状態の補完: 調教主は default（あなた、
// 女性）として読み、永続ストアへの移行は未了（trainerLinked = false）
// としてアダプタ側の初回読み込み処理に任せる。
if (typeof s.trainerId !== "string" || !s.trainerId) s.trainerId = "default";
if (typeof s.trainerName !== "string" || !s.trainerName) s.trainerName = "あなた";
if (typeof s.trainerSex !== "string" || !s.trainerSex) s.trainerSex = "female";
if (typeof s.trainerLinked !== "boolean") s.trainerLinked = false;
// 調教師シート追加前の保存状態の補完: 素質は空（器のみで効果が無い
// ため過去分の遡及は不要）、射精ゲージ上限は既定 10000。シート値
// （ejacMax / traits）のプロフィールからの再取得は、未接続セーブに
// ついてアダプタの linkTrainerToStore が名前・性別と同じ規則で行う。
if (!Array.isArray(s.trainerTraits)) s.trainerTraits = [];
if (typeof s.trainerEjacMax !== "number" || !(s.trainerEjacMax > 0)) s.trainerEjacMax = RESOURCE_MAX.ejac;
if (typeof s.toolInsertedV !== "boolean") s.toolInsertedV = false;
if (s.look !== null && (typeof s.look !== "object" || Array.isArray(s.look))) s.look = null;
// 精飲絶頂・媚薬中毒レイヤー追加前の保存状態の補完（全て 0 / false
// から数え直す。過去分は遡らない）
if (typeof s.aphroResidue !== "number") s.aphroResidue = 0;
if (typeof s.aphroAddict !== "boolean") s.aphroAddict = false;
if (typeof s.aphroDosed !== "boolean") s.aphroDosed = false;
if (typeof s.seiinCount !== "number") s.seiinCount = 0;
if (typeof s.seiinExp !== "number") s.seiinExp = 0;
if (typeof s.seiinClimax !== "number") s.seiinClimax = 0;
if (typeof s.seiinTaste !== "boolean") s.seiinTaste = false;
if (!Array.isArray(s.usedCommands)) {
s.usedCommands = Object.keys(s.exp?? {}).filter((k) => (s.exp?.[k]?? 0) > 0);
}
// 能力追加前の保存状態の補完: abilities は空の疎辞書（欠けは Lv0）。
// 既存の能力Lv・数値・進行・ログには一切触れない。
if (!s.abilities || typeof s.abilities!== "object" || Array.isArray(s.abilities)) {
s.abilities = {};
}
// セッション骨格（原作形）追加前の保存状態の補完:
// phase の "shop"（旧・購入画面フェーズ）は "menu"（調教終了後メニュー）
// へ読み替え、それ以外で不正な値は "play"。slot（時間帯）は 0（午前）、
// sessionSeq は 1、collapsed は false で補完する。旧形式（1日3行動
// モデル）の day はそのまま引き継ぎ、次のセッション境界から新モデルで
// 進む。旧・購入予約は予約制の廃止に伴い破棄する（予約は未払いだった
// ため珠・Lv への影響はない）。
// 既存の能力Lv・数値・進行・ログには一切触れない。
if ((s.phase as string) === "shop") s.phase = "menu";
if (s.phase!== "menu") s.phase = "play";
if (typeof s.slot !== "number" || (s.slot !== 0 && s.slot !== 1)) s.slot = 0;
if (typeof s.sessionSeq !== "number" || s.sessionSeq < 1) s.sessionSeq = 1;
if (typeof s.collapsed !== "boolean") s.collapsed = false;
s.pendingPurchases = [];
if (s.prevCommandId!== null && typeof s.prevCommandId!== "string") s.prevCommandId = null;
return s;
}

/** コマンドのリソース消費: 個別 costs が無ければカテゴリ既定値で補完する */
export function costsOf(cmd: CommandDef): { vital: number; energy: number } {
return cmd.costs?? CATEGORY_COSTS[cmd.category]?? { vital: 0, energy: 0 };
}

// ---------------------------------------------------------------- session creation

/** 辞書のキャラ定義から新規セッションを作る。開始条件は固定:
* ジャンル=調教（目標 従順600・欲望600・屈服400）、世界=現代、期間14日・1日2セッション（午前/午後）。
* キャラ定義（素質・初期値の上書き）は辞書側のデータがそのまま効く。
* 既定の「素体タイプ」は素質も上書きも持たないので初期値は反発100・その他0。 */
/** 新規セッションに割り当てる調教主。skill / fallen は調教主側の
 * 永続ストア（またはプロフィールの初期値）からアダプタが渡す作業
 * コピーの初期値。未指定なら default プロフィール相当（あなた・
 * 女性・技巧Lv 0・堕落人数 0）。 */
export interface TrainerAssignment {
id: string;
name: string;
/** 調教師シートの性別（sheet.sex）。 */
sex: string;
skill?: number;
fallen?: number;
/** 調教主の残高（お小遣い）の作業コピー初期値。ストアから渡す。 */
funds?: number;
/** 調教師シートの射精ゲージ上限（sheet.ejacMax）。未指定は 10000。 */
ejacMax?: number;
/** 調教師シートの素質 id 配列（sheet.traits）。未指定は空。 */
traits?: string[];
}

export function newGameState(characterId: string, name: string, note: string, def: CharacterDefData, trainer?: TrainerAssignment): GameState {
const params: Record<string, number> = {};
for (const d of PARAM_DEFS) params[d.id] = d.init;
for (const [k, v] of Object.entries(def.init_overrides)) if (k in params) params[k] = v;

// 珠IDキーの初期値上書きはセッション開始時の珠残高として適用する
// （パラメータキーとは別系統。珠キーを持たない定義では空のまま＝全種0）。
const jewelIds = new Set(JUEL_CURRENCIES.map((c) => c.id));
const jewels: Record<string, number> = {};
for (const [k, v] of Object.entries(def.init_overrides)) if (jewelIds.has(k)) jewels[k] = v;

const traitSrcMult: Record<string, number> = {};
const traitConvMult: Record<string, number> = {};
for (const t of def.traits) {
for (const [k, m] of Object.entries(t.src_mult?? {})) traitSrcMult[k] = (traitSrcMult[k]?? 1) * m;
for (const [k, m] of Object.entries(t.conv_mult?? {})) traitConvMult[k] = (traitConvMult[k]?? 1) * m;
}

// 体力・気力の最大値はセッション開始時にだけ決める（基準2000±素質換算、
// 下限500）。開始時の現在値は最大値（満タン）。
const resMax = resourceMaxOf(def.traits.map((t) => t.id));

const s: GameState = {
v: 1,
characterId,
characterName: name,
characterNote: note,
genreId: "training",
genreLabel: "調教",
worldId: "modern",
worldLabel: "現代",
day: 1,
daysLimit: DEFAULT_DAYS_LIMIT,
slot: 0,
sessionSeq: 1,
collapsed: false,
params,
peaks: {...params},
dialogue: "",
personality: normalizePersonality(def.personality),
kojoLast: null,
resources: { vital: resMax.vitalMax, vitalMax: resMax.vitalMax, energy: resMax.energyMax, energyMax: resMax.energyMax, ejac: 0 },
lub: 0,
jewels,
abilities: {},
pendingPurchases: [],
phase: "play",
settledSessions: [],
juelSrcMark: Object.fromEntries(SOURCE_IDS.map((id) => [id, 0])),
juelParamMark: {
desire: params["desire"] ?? 0,
submission: params["submission"] ?? 0,
skill: params["skill"] ?? 0,
},
stressPosSession: 0,
ejacCount: 0,
climaxCount: 0,
exClimax: emptyExMap(),
exSession: emptyExMap(),
climaxExp: 0,
climaxFirst: emptyClimaxFirst(),
pleasureMark: 0,
marksReal: { pain: 0, pleasure: 0, submission: 0, rejection: 0 },
markGuardRejection: 0,
expReal: {},
denialSession: { hate: 0, discomfort: 0, gloom: 0 },
learnSession: 0,
desireSession: 0,
yieldSession: 0,
fallTraits: [],
abnormalMastDone: false,
abnormalEnemaState: 0,
abnormalOutdoorDone: false,
expansionVDone: false,
expansionADone: false,
abnormalPierceDone: false,
filmedSession: false,
allowance: trainer?.funds?? 0,
inventory: {},
trainerSkill: trainer?.skill?? 0,
fallenCount: trainer?.fallen?? 0,
trainerId: trainer?.id?? "default",
trainerName: trainer?.name?? "あなた",
trainerSex: trainer?.sex?? "female",
trainerTraits: [...(trainer?.traits?? [])],
trainerEjacMax: typeof trainer?.ejacMax === "number" && trainer.ejacMax > 0? trainer.ejacMax: RESOURCE_MAX.ejac,
trainerLinked: true,
toolInsertedV: false,
aphroResidue: 0,
aphroAddict: false,
aphroDosed: false,
seiinCount: 0,
seiinExp: 0,
seiinClimax: 0,
seiinTaste: false,
look: def.look?? null,
usedCommands: [],
prevCommandId: null,
exp: {},
dailyExp: {},
prev: null,
fired: {},
srcGain: Object.fromEntries(SOURCE_IDS.map((id) => [id, 0])),
goal: {...DEFAULT_GOAL},
finished: false,
ending: null,
rngSeed: Math.floor(Math.random() * 2147483647),
rngRolls: 0,
funds: 0,
traitSrcMult,
traitConvMult,
traitIds: def.traits.map((t) => t.id),
log: [],
nextEntryId: 1,
createdAt: Date.now(),
};

pushLog(s, "system", `${name}／調教／現代`);
if (note) pushLog(s, "system", note);
const goalText = Object.entries(s.goal)
.map(([id, t]) => `${paramDef(id)?.label?? id} ${t}`)
.join("・");
pushLog(s, "system", `期間は ${s.daysLimit} 日、1日2回（午前・午後）。調教は終了するまで続く。目標: ${goalText}`);
pushLog(s, "status", "", { snapshot: snapshotOf(s)});
pushLog(s, "day", `―― 第1日（午前） ――`, { mark: 3});
return s;
}

// ---------------------------------------------------------------- command execution

export interface ExecuteResult {
ok: boolean;
reason?: string;
}

/** 辞書キー: コマンドID | 帯域 | 反復区分 */
export function narrationKey(commandId: string, band: string, repetition: string): string {
return `${commandId}|${band}|${repetition}`;
}

/**
* コマンド実行。narration は辞書（キー→地の文）の Map。
* 反復区分は first / repeat で、根拠は永続フラグ usedCommands
* （原作のコマンド別・永続初回フラグと同型。その日の初回でも、
* 過去に実行済みなら repeat 側）。
* 失敗時は fail_first / fail_repeat を先に引き、無ければ通常キーに落ちる。
*/
export function executeCommand(
s: GameState,
cmdId: string,
narration: ReadonlyMap<string, string>,
kojo?: ReadonlyMap<string, string[]>,
): ExecuteResult {
normalizeState(s);
if (s.finished) return { ok: false, reason: "期間は終了している"};
if (s.phase === "menu") {
return { ok: false, reason: "調教は終了している。次へ進むまでコマンドは実行できない"};
}
const list = visibleCommands(s);
const idx = list.findIndex((c) => c.id === cmdId);
const cmd = list[idx];
if (!cmd) return { ok: false, reason: "そのコマンドはこのセッションにない"};

const echoEntry = pushLog(s, "echo", `> [${idx}] ${cmd.label}`);

if (!isUnlocked(s, cmd)) {
pushLog(s, "system", "（まだ実行できない）");
return { ok: false, reason: "条件を満たしていない"};
}
if ((s.params["fatigue"]?? 0) >= 100) {
pushLog(s, "text", "彼女は限界だ。これ以上は崩れてしまう。調教を切り上げるべきだ。", { mark: 1});
return { ok: false, reason: "疲労が限界に達している"};
}

// 実行判定（eraMaou @COM_ORDER 方式）: ORDER_JUDGES にあるコマンドは
// 実行値 A < 閾値 V なら実行自体が成立しない（原作の RETURN 0。
// コスト・ソース・経験・初回消費は一切発生しない）。unlock（選択可否）
// とは別の、状態で決まる決定論ゲートで、確率判定ではない。
{
const judge = ORDER_JUDGES[cmdId];
if (judge) {
const r = orderScore(s, judge);
if (!r.auto && r.score < judge.v) {
pushLog(s, "system", `（実行値が足りない: 実行値${r.score} < ${judge.v}）`);
return { ok: false, reason: "実行値が足りない"};
}
}
}

// 新しい手が生成される段で、前の手のセリフは一度消える。
// この手のセリフ既定値は、手の確定後に口上辞書から選んで設定する
// （口上選択の段を参照。該当セルが無ければ空文字のまま）。
s.dialogue = "";

const ns = namespaceOf(s);

// 実行判定（unlock とは分離。success 式が無いコマンドは常時成功）
let failed = false;
if (cmd.success) {
const prob = Math.max(0, Math.min(1, evalExpr(cmd.success, ns)));
failed = roll(s) >= prob;
}

// ソース発生（素質のソース倍率を掛ける）
const src: Record<string, number> = Object.fromEntries(SOURCE_IDS.map((id) => [id, 0]));
for (const [sid, expr] of Object.entries(cmd.sources)) {
src[sid] = evalExpr(expr, ns) * (s.traitSrcMult[sid]?? 1);
}
if (failed) {
const decay = cmd.fail_source_mult?? 0.3;
for (const sid of SOURCE_IDS) src[sid] = (src[sid]?? 0) * decay;
}

// 調教者技巧のソース梯子（eraMaou COMF の ABL:PLAYER:12 参照分）:
// キス（COMF6）と座位系（COMF22/23/28/29）の情愛は技巧Lvで育つ
// （共通梯子。試作では基礎値への増分としてパック尺度で加える。
// 液体追加分は潤滑発生の段で、A 値は部位駆動の段で合算する）。
// 【実測の切り分け】@COM_ORDER に主人側能力の項は存在しないため、
// 実行値・成否には技巧は乗らない（原作どおり）。全体倍率
// （@PLAYER_SKILL_CHECK）は部位駆動の段で掛ける。
if (TECH_AFFECTION_COMMANDS.has(cmdId) && !failed) {
const tlv = Math.min(5, Math.max(0, s.trainerSkill?? 0));
src["affection"] = (src["affection"]?? 0) + (TECH_AFFECTION_ADD[tlv]?? 0);
}

// 気力0のソース半減（eraMaou @SOURCE_CHECK の「気力０による上下の
// 処理」の写像）: 手開始時点で気力が 0 以下なら、原作で半減対象の
// PALAM（恭順・欲情・苦痛）に対応するソースを半分にする。対応は
// affection（恭順）/ pleasure（欲情）/ pain（苦痛）。恥情・恐怖・
// 屈従に対応する shame / fear は原作でも半減対象外。絶頂に絡む
// 部位蓄積（CUP）には既存の cupChain 側の半減が別にある。
// 【写像の範囲】原作の半減は変換後の PALAM 増加分への適用だが、試作
// ではコマンドのソース値（変換前）に適用する近似として置く。潤滑の
// 苦痛加算・中毒充足の固定加算・絶頂波及は、この後段で加わる分として
// 対象に含めない。
if ((s.resources?.energy ?? RESOURCE_MAX.energy) <= 0) {
for (const sid of ["affection", "pleasure", "pain"]) {
src[sid] = (src[sid] ?? 0) / 2;
}
}

// 反発刻印の効果（eraMaou @UP_TALENT_CHECK）: 恭順（UP:4）の増加が
// 刻印Lvで ×0.70 / ×0.40 / ×0.10 に落ちる。試作では恭順PALAM の
// 蓄積に対応する情愛ソースへ適用する（変換・精算の両方へ効く）。
{
const rejLv = Math.min(3, Math.max(0, s.marksReal?.rejection?? 0));
if (rejLv > 0) {
src["affection"] = (src["affection"]?? 0) * [1, 0.7, 0.4, 0.1][rejLv]!;
}
}

// 潤滑の参照: 帯判定は手開始時点の確定値（原版 COMF は手開始時の
// PALAM:3 を読むため、この手の発生分は含まない）。
const lubAtStart = s.lub?? 0;
const lubBand = lubBandOf(lubAtStart);
const lubRule = LUB_RULES[cmdId];
// ソース側の潤滑参照（原版 COMF の潤滑ブロックの置き場 = ソース確定時）。
// 苦痛は「既存の苦痛基礎値に加算してから倍率」の順。
if (lubRule) {
if (lubRule.srcMult) {
for (const [sid, table] of Object.entries(lubRule.srcMult)) {
src[sid] = (src[sid]?? 0) * (table[lubBand]?? 1);
}
}
if (lubRule.srcAdd) {
for (const [sid, table] of Object.entries(lubRule.srcAdd)) {
src[sid] = (src[sid]?? 0) + (table[lubBand]?? 0);
}
}
if (lubRule.painAdd || lubRule.painMult) {
let pain = src["pain"]?? 0;
if (lubRule.painAdd) pain += lubRule.painAdd[lubBand]?? 0;
if (lubRule.painMult) pain *= lubRule.painMult[lubBand]?? 1;
src["pain"] = pain;
}
// 苦痛倍率より後のソース加算（原版ブロック内で倍率の後に加わる分）。
if (lubRule.srcAddPost) {
for (const [sid, table] of Object.entries(lubRule.srcAddPost)) {
src[sid] = (src[sid]?? 0) + (table[lubBand]?? 0);
}
}
}

// 中毒充足（addict ソース）のコマンド固有の発生分（eraMaou COMF 実測）。
// いずれも commands の sources 式には現れない固定分で、変換の前に src へ
// 加える。失敗減衰の対象にはしない（該当コマンドに成功判定は無い）。
// - com3 自慰: 自慰中毒Lv別の充足を毎回（絶頂非依存）加える。Lv0 は 0。
// - com22 対面座位 / com28 対面座位アナル: 中毒Lv非依存の固定ベース +100
//   （COMF22/28 の SOURCE:7=100。現行では落ちていた分）。
const addictLvOf = (abilityId: string) =>
Math.min(5, Math.max(0, s.abilities?.[abilityId]?? 0));
if (cmdId === "com3") {
src["addict"] = (src["addict"]?? 0) + (MAST_ADDICT_SOURCE[addictLvOf("add_mast")]?? 0);
}
if (cmdId === "com22" || cmdId === "com28") {
src["addict"] = (src["addict"]?? 0) + 100;
}
// 媚薬（COMF51）: 媚薬中毒（TALENT:46 写像）の状態では 中毒充足
// SOURCE:7 = 500 が付き、欲情追加（SOURCE:11）が倍（10000 vs 5000）
// になる。差分をパック尺度で src へ加える。
if (cmdId === "com51" && s.aphroAddict) {
src["addict"] = (src["addict"]?? 0) + 500;
src["pleasure"] = (src["pleasure"]?? 0) + 500;
}
// 自慰中毒: com3 の快ソースへの倍率（Lv0 = 1.00 で完全素通し）。
// 部位駆動分（partBases / partStages の drive）にのみ掛ける。
const mastMult = cmdId === "com3"
? (MAST_PLEASURE_MULT[addictLvOf("add_mast")]?? 1)
: 1;

// 手の開始時点の判定材料（変換でパラメータが変わる前に固定する）。
const desireAtStart = s.params["desire"]?? 0;
const obedienceAtStart = s.params["obedience"]?? 0;
const submissionAtStart = s.params["submission"]?? 0;
const skillAtStart = s.params["skill"]?? 0;
const stressAtStart = s.params["stress"]?? 0;
const energyAtStart = s.resources?.energy?? RESOURCE_MAX.energy;

// 調教者技巧の A 値（座位系 COMF22/23/28/29）: 原作では COMF 内で
// SOURCE:0／主部位へ加算され、その合計へ @PLAYER_SKILL_CHECK の
// 全体倍率が掛かる。試作では駆動値への加算として両ループへ畳み、
// 駆動を持たない部位（com22 / com28 の快C）は後段で単独に起こす。
const techLvNow = Math.min(5, Math.max(0, s.trainerSkill?? 0));
const techDriveAdd: Record<string, number> = {};
for (const partId of TECH_A_PARTS[cmdId]?? []) {
techDriveAdd[partId] = TECH_A_ADD[techLvNow]?? 0;
}

// CUP（部位蓄積への加算分）: 駆動値はコマンド×部位ごとの基礎定数
// （gamedata の partBases、原作 COMF の SOURCE:TARGET 実測値）に
// 素質倍率（pleasure チャンネル）・失敗倍率を掛けたもの。部位ごとに
// 補正チェーンを掛ける（caress のように複数部位を同時に駆動する
// コマンドもある）。主パラメータ変換に使う pleasure ソース量
// （sources.pleasure の式）は従来どおりで、ここでは一切触れない。
const cups: Record<string, number> = {};
if (cmd.partBases) {
for (const [partId, base] of Object.entries(cmd.partBases)) {
let drive = (base + (techDriveAdd[partId]?? 0)) * (s.traitSrcMult["pleasure"]?? 1);
// 潤滑の快倍率: 基礎値に対して（欲情帯などの後段倍率より前）
const lubPM = lubRule?.partMult?.[partId]?.[lubBand];
if (lubPM !== undefined) drive *= lubPM;
drive *= mastMult;
// 調教者技巧の全体倍率（@PLAYER_SKILL_CHECK。快F は対象外）
drive *= techMultOf(partId, s.trainerSkill?? 0);
if (failed) drive *= cmd.fail_source_mult?? 0.3;
const senseId = PART_SENSE_ABILITY[partId];
const senseMult = senseId? (SENSE_MULT[s.abilities?.[senseId]?? 0]?? 1): 1;
cups[partId] = cupChain(drive, {
desireAtStart,
consecutive: s.prevCommandId === cmdId,
energyAtStart,
senseMult,
partId,
});
}
}
// 感覚段階表（partStages、eraMaou COMF 移植）: 駆動値は対応する感覚
// 能力Lvで段階表を引いた値。チェーンは ベース（段階表）→ 欲情帯倍率 →
// 同一コマンド連続の半減 の順で、感覚倍率テーブルは掛けない
// （段階表自体が感覚Lv別の実測値のため二重がけ防止）。
if (cmd.partStages) {
for (const [partId, stageDef] of Object.entries(cmd.partStages)) {
const abilityId = stageDef.ability?? PART_SENSE_ABILITY[partId];
const lv = abilityId? (s.abilities?.[abilityId]?? 0): 0;
const base = stageDef.table[Math.min(lv, stageDef.table.length - 1)]?? 0;
let drive = (base + (techDriveAdd[partId]?? 0)) * (s.traitSrcMult["pleasure"]?? 1);
// 潤滑の快倍率: 感覚段階表で決まった基礎値に対して（欲情帯などの
// 後段倍率より前。原版 COMF の潤滑ブロックの適用位置）
const lubPM = lubRule?.partMult?.[partId]?.[lubBand];
if (lubPM !== undefined) drive *= lubPM;
drive *= mastMult;
// 調教者技巧の全体倍率（@PLAYER_SKILL_CHECK。快F は対象外）
drive *= techMultOf(partId, s.trainerSkill?? 0);
if (failed) drive *= cmd.fail_source_mult?? 0.3;
cups[partId] = cupChain(drive, {
desireAtStart,
consecutive: s.prevCommandId === cmdId,
energyAtStart,
senseMult: 1,
partId,
});
}
}
// 調教者技巧の A 値のみで駆動される部位（com22 / com28 の快C は
// 段階表・基礎値を持たないが、原作では SOURCE:0 = A が立つ）。
// チェーンは partBases と同型（感覚倍率を掛ける）。
for (const [partId, add] of Object.entries(techDriveAdd)) {
if (add <= 0 || cups[partId] !== undefined) continue;
let drive = add * (s.traitSrcMult["pleasure"]?? 1);
const lubPM = lubRule?.partMult?.[partId]?.[lubBand];
if (lubPM !== undefined) drive *= lubPM;
drive *= mastMult;
drive *= techMultOf(partId, s.trainerSkill?? 0);
if (failed) drive *= cmd.fail_source_mult?? 0.3;
const senseId = PART_SENSE_ABILITY[partId];
const senseMult = senseId? (SENSE_MULT[s.abilities?.[senseId]?? 0]?? 1): 1;
cups[partId] = cupChain(drive, {
desireAtStart,
consecutive: s.prevCommandId === cmdId,
energyAtStart,
senseMult,
partId,
});
}
// 射精ゲージ加算分（原作 B テーブル方式）: その手のソース処理の一部
// として、快ソースと同じタイミング・同じ成否の扱い（失敗時は同じ
// 減衰倍率）で計算する。B が無いコマンドは +0（対象の快とは別系統）。
// 倍率は手の開始時点のパラメータをレベル換算して原作表を引く。
// 奉仕精神は奉仕系コマンドにのみ、abl_service の Lv をそのまま使う。
let ejacGain = 0;
if (cmd.ejacB) {
let drive = cmd.ejacB;
if (failed) drive *= cmd.fail_source_mult?? 0.3;
// 精液中毒: フェラ系（fellatio / com80）の B には精液中毒Lv倍率を掛ける
// （Lv0 = 1.00 で素通し）。com32/com35 は倍率表が Lv0=0.80 始まりで
// Maou 自身の B 基礎値と一体のため適用しない（欠け）。
if (cmdId === "fellatio" || cmdId === "com80") {
drive *= SEMEN_EJAC_GAUGE_MULT[addictLvOf("add_semen")]?? 1;
}
ejacGain = ejacChain(drive, {
skillLv: paramLevel(skillAtStart),
obedienceLv: paramLevel(obedienceAtStart),
desireLv: paramLevel(desireAtStart),
serviceLv: (cmd.category === "奉仕" || cmd.category === "奉仕系")? (s.abilities?.["abl_service"]?? 0): undefined,
// 潤滑倍率（手開始時点の潤滑帯で引く。膣系とアナル系は別表）
lubMult: EJAC_LUB_V_COMMANDS.has(cmdId)? (EJAC_LUBRICATION_MULT[lubBand]?? 1)
: EJAC_LUB_A_COMMANDS.has(cmdId)? (EJAC_ANAL_LUBRICATION_MULT[lubBand]?? 1)
: undefined,
});
}

// 精液中毒: 射精時の波及（中毒充足）。発火段位は ejacGain と手開始時点の
// ゲージから変換より前に確定できる（ゲージはこの後、確定段で同じ値で
// 発火する）。射精が発生する手では、実行コマンドの Maou 表で充足を
// src へ加える（全表 Lv0 = 0）。大量相当（段位 tier≥2）では ×2.00、
// 素股（com33）のみ ×1.50。
// 同じ射精ブロックにある 達成（SOURCE:5）・屈従（SOURCE:13）の Lv 別倍率と
// 性行動（SOURCE:4）×3.00 は、試作のエンジンが換算前の達成/屈従/性行動
// チャンネルを保持していないため未接続（無理に作らない）。
{
const semenTable = SEMEN_ADDICT_EJAC[cmdId];
if (semenTable) {
const tierPre = ejacShoot((s.resources?.ejac?? 0) + ejacGain, s.trainerEjacMax?? RESOURCE_MAX.ejac).tier;
if (tierPre > 0) {
let add = semenTable[addictLvOf("add_semen")]?? 0;
if (tierPre >= 2) add = Math.round(add * (cmdId === "com33"? 1.5: 2.0));
src["addict"] = (src["addict"]?? 0) + add;
}
}
}

// 絶頂判定（C/V/A/B/F の5部位、Maou 形）: 部位ごとに 合計 = 現在の
// 蓄積 + CUP で EX を判定し、消費と確定後の残量まで先に決める
// （蓄積への適用は変換の後段で PALAM += CUP − 消費 として行う）。
// 処理順は Maou の TRAIN フロー（SOURCE 一括換算 → 絶頂判定 →
// PALAM 確定 → 口上 → 終了処理）に合わせたもの。
const intensities = emptyExMap();
const remainders: Partial<Record<ClimaxPartId, number>> = {};
let anyClimax = false;
for (const p of CLIMAX_PART_IDS) {
const step = climaxStep(s.params[p]?? 0, cups[p]?? 0);
intensities[p] = step.intensity;
remainders[p] = step.remainder;
if (step.intensity > 0) anyClimax = true;
}
const simultaneous = CLIMAX_PART_IDS.filter((p) => (intensities[p]?? 0) > 0).length;

// 絶頂の波及: ソース追加は「その手のソース合計に加えてから主パラメータ
// 変換に掛ける」ため、変換の前に src へ加算する。体力・気力分は
// リソースへの追加消費として後段で適用する（0クランプ・可否に影響なし）。
let waveVital = 0;
let waveEnergy = 0;
/** 波及で src["pain"] へ入った苦痛分（試作スケール）。原作の
 * @EX_CHECK_UP は絶頂時に苦痛（SOURCE:6）を一切加えず、反感の追加も
 * 無いため、波及の pain 分は刻印判定（UP:9 / UP:11）と苦痛の珠の
 * 入力から除く必要がある。パラメータ変換（苦痛パラメータへの写像）
 * には従来どおり含める（第10弾で受入済みの写像）。 */
let wavePainSrc = 0;
if (anyClimax) {
for (const p of CLIMAX_PART_IDS) {
const k = intensities[p]?? 0;
if (k <= 0) continue;
const wave = CLIMAX_WAVE[p];
for (const [sid, per] of Object.entries(wave.src)) {
src[sid] = (src[sid]?? 0) + per * k;
if (sid === "pain") wavePainSrc += per * k;
}
waveVital += wave.vital * k;
waveEnergy += wave.energy * k;
}
}

// 精飲絶頂（eraMaou SEIIN.ERB の移植）: 口内射精が成立した手で、
// 精愛味覚があれば @SEIIN_ORGASM（精飲絶頂そのもの）、無ければ
// その手で絶頂したときに @SEIIN_CHECK → 強制精飲絶頂として
// パブロフカウンター（CFLAG:600 写像）が進む。規定回数 P に達すると
// 精愛味覚を獲得し、精液中毒が Lv3 未満なら Lv3 になる。
// ソースは変換前に src へ加える（屈従 SOURCE:13 → fear チャンネル、
// 欲情追加 SOURCE:11 → pleasure、パック尺度 1/10）。液体追加
// （SOURCE:10）は潤滑の段で合算する。
// 【欠け】FLAG:72（システム有効フラグ）は試作に設定系が無いため
// 常時有効として扱う。P の素質増減は [淫乱] の −20 のみ写像。
let seiinLiquid = 0;
{
const tierHere = ejacShoot((s.resources?.ejac?? 0) + ejacGain, s.trainerEjacMax?? RESOURCE_MAX.ejac).tier;
if (!failed && tierHere > 0 && ORAL_EJAC_COMMANDS.has(cmdId)) {
if (s.seiinTaste) {
s.seiinExp = (s.seiinExp?? 0) + 1;
s.expReal["seiin"] = s.seiinExp;
s.seiinClimax = (s.seiinClimax?? 0) + 1;
const slv = addictLvOf("add_semen");
let fearAdd = 1000;
let pleasAdd = 500;
seiinLiquid = 2000;
if (s.seiinExp === 1) fearAdd *= 3;
else if (slv === 3) fearAdd *= 2;
else if (slv === 4) { fearAdd *= 1.5; pleasAdd *= 1.5; seiinLiquid *= 1.5; }
else if (slv === 5) { pleasAdd *= 2; seiinLiquid *= 2; }
src["fear"] = (src["fear"]?? 0) + fearAdd;
src["pleasure"] = (src["pleasure"]?? 0) + pleasAdd;
pushLog(s, "event", `${s.characterName}は精飲絶頂に達した`, { mark: 1 });
} else if (anyClimax) {
s.seiinCount = (s.seiinCount?? 0) + 1;
let fearAdd = 100;
if (s.seiinCount === 1) {
fearAdd = 150;
s.expReal["abnormal"] = (s.expReal["abnormal"]?? 0) + 1;
}
src["fear"] = (src["fear"]?? 0) + fearAdd;
const pMax = SEIIN_BASE_COUNT + ((s.fallTraits?? []).includes("inran")? SEIIN_INRAN_DELTA: 0);
if (s.seiinCount >= pMax) {
s.seiinTaste = true;
if ((s.abilities?.["add_semen"]?? 0) < 3) s.abilities["add_semen"] = 3;
pushLog(s, "event", `${s.characterName}は精液の味を覚えこんでしまった【精愛味覚】`, { mark: 1 });
} else {
pushLog(s, "event", `${s.characterName}は飲み下しながら強制的に絶頂させられた`, { mark: 1 });
}
}
}
}

// 変換（開始時点のパラメータで全式を評価し、素質の変換倍率を掛ける）
const saved = {...s.params};
for (const [pid, expr] of Object.entries(CONVERSION)) {
if (expr === "0") continue;
const convNs = {...saved,...src};
const delta = godotRound(evalExpr(expr, convNs) * (s.traitConvMult[pid]?? 1));
const def = paramDef(pid);
if (!def) continue;
s.params[pid] = Math.max(0, Math.min(def.max, (s.params[pid]?? 0) + delta));
}
// 中毒充足の換算（eraMaou @SOURCE_CHECK_UP_POISON の形）:
// 従順 += 充足 × m0、欲望 += 充足 × m1。倍率は能力 abl_desire の Lv
// （0〜7、8以上は末尾の値）で決まる。写像の判断: Maou では PALAM への
// 直接加算だが、試作では主変換と同じく「パラメータへの増分」として、
// 変換層の流儀に合わせ増分ごとに godotRound で整数化して加える
// （素質の変換倍率は掛けない）。
{
const addictAmt = src["addict"]?? 0;
if (addictAmt !== 0) {
const dlv = Math.min(8, Math.max(0, s.abilities?.["abl_desire"]?? 0));
const addTo = (pid: string, amt: number) => {
const def = paramDef(pid);
if (!def) return;
s.params[pid] = Math.max(0, Math.min(def.max, (s.params[pid]?? 0) + amt));
};
addTo("obedience", godotRound(addictAmt * (ADDICT_CONV_M0[dlv]?? 0)));
addTo("desire", godotRound(addictAmt * (ADDICT_CONV_M1[dlv]?? 0)));
}
}
// 自己効果
const applyEffects = (effects: Record<string, string>) => {
for (const [pid, expr] of Object.entries(effects)) {
const def = paramDef(pid);
if (!def) continue;
const delta = godotRound(evalExpr(expr, namespaceOf(s)));
s.params[pid] = Math.max(0, Math.min(def.max, (s.params[pid]?? 0) + delta));
}
};
applyEffects(cmd.self_effects);
if (failed && cmd.fail_effects) applyEffects(cmd.fail_effects);

// 部位蓄積の確定: PALAM += CUP − 消費 の形で適用する。全5部位とも
// 判定時に決めた残量（消費・9999ピン留め込み）で確定する。
// 蓄積は上限なし（旧・上限1000のクランプは廃止）。
let kaiGains: { id: string; delta: number }[] = [];
// 残量の確定はコマンドが部位を駆動するか否かに依らない: Maou の
// @EX_CHECK_UP は PALAM 全体に対して消費まで含めて適用されるため、
// 蓄積だけで発火した絶頂（部位駆動のないコマンドの手）でも消費を
// 確定させる。絶頂なし・CUP なしの部位では残量 = 現在値で無変化。
for (const p of CLIMAX_PART_IDS) {
s.params[p] = Math.max(0, remainders[p]?? (s.params[p]?? 0));
}
if (cmd.partBases || cmd.partStages) {
kaiGains = KAI_PARAM_IDS
.filter((id) => (cups[id]?? 0) > 0)
.map((id) => ({ id, delta: cups[id]?? 0 }));
}

updatePeaks(s);

// 絶頂の記録: EX:部位絶頂へ EX 値をそのまま（同時絶頂の乗算はしない
// Maou 形）、絶頂経験へ EX 合計を加算する。部位別の初回は永続フラグ
// climaxFirst で判定し、立てた部位からイベントを出す。快楽刻印は
// 旧・強度 R 式（C + 2V + 2A + B）を廃し、後段の @MARK_GOT_CHECK
// 移植（手ごとの快UP階段）で進行する。
const climaxEvents: HandEvent[] = [];
if (anyClimax) {
s.climaxCount = (s.climaxCount?? 0) + 1;
let rawTotal = 0;
for (const p of CLIMAX_PART_IDS) {
const k = intensities[p]?? 0;
if (k <= 0) continue;
rawTotal += k;
s.exClimax[p] = (s.exClimax[p]?? 0) + k;
s.exSession[p] = (s.exSession[p]?? 0) + k;
const first = !(s.climaxFirst[p]?? false);
s.climaxFirst[p] = true;
climaxEvents.push({ type: "climax", part: p, intensity: k, first, simultaneous });
}
s.climaxExp = (s.climaxExp?? 0) + rawTotal;
echoEntry.events = climaxEvents;
}

// リソース消費（体力/気力）: 判定の成功・失敗を問わず、この手で必ず適用する。
// 絶頂波及の体力・気力分も追加消費としてここで適用する。
// 【原作形への置換】従来の「0でクランプし、尽きても可否に影響しない」
// から、eraMaou @SOURCE_CHECK の形へ移した:
// - 手開始時点で気力が 0 以下なら、体力消費は ×2 + 80 になる
//   （原作: LOSEBASE:0 *= 2、LOSEBASE:0 += 80。気力消費は倍化しない）。
//   試作の調教慣れ軽減（costFactor）はコマンド固有コストへの軽減と
//   読み、倍化と +80 は軽減後の値に対して原作の並びで適用する。
// - 体力・気力ともクランプしない（マイナスになりうる）。体力が
//   0 以下になったら、この手の解決後に倒れてセッションが強制終了
//   する（後段の判定を参照）。
const costs = costsOf(cmd);
// 調教慣れ軽減: 手開始時点の （従順+欲望+屈服） から fam を決め、
// コマンドの costs にだけ factor = 1.00 − 0.50 × fam を掛ける。
// 絶頂波及分（waveVital / waveEnergy）や他の数値計算には掛けない。
const fam = Math.min(1, (obedienceAtStart + desireAtStart + submissionAtStart) / 1600);
const costFactor = 1 - 0.5 * fam;
let appliedVitalCost = Math.max(0, Math.floor(costs.vital * costFactor));
const appliedEnergyCost = Math.max(0, Math.floor(costs.energy * costFactor));
if (energyAtStart <= 0) appliedVitalCost = appliedVitalCost * 2 + 80;
s.resources.vital = s.resources.vital - appliedVitalCost - waveVital;
s.resources.energy = s.resources.energy - appliedEnergyCost - waveEnergy;
// 射精ゲージ: B 加算は上限でクランプしない（超過分を段位判定が読む）。
// その手の確定時に ejac > 10000 なら射精発火: 段位分の回数カウンタを
// 増やし、ゲージ減算（段位2のみ二重減算＋9999クランプ）を行う。
// 対象への波及: 精液中毒の中毒充足は変換の前に src へ加算済み
// （射精ゲージ加算の段を参照）。同じ射精ブロックの 達成/屈従の Lv 別
// 倍率・性行動 ×3.00 と精液経験は、換算前チャンネル／経験の受け口が
// 試作に無いため未接続。
let ejacTier = 0;
if (ejacGain > 0) s.resources.ejac += ejacGain;
{
const shoot = ejacShoot(s.resources.ejac, s.trainerEjacMax?? RESOURCE_MAX.ejac);
if (shoot.tier > 0) {
ejacTier = shoot.tier;
s.resources.ejac = shoot.after;
s.ejacCount = (s.ejacCount?? 0) + shoot.tier;
echoEntry.events = [...(echoEntry.events?? []), {
type: "ejac", part: null, intensity: 0, first: false, simultaneous: 0, tier: shoot.tier,
}];
}
}

// ----------------------------------------------------------------
// 原作準拠レイヤー（手の後処理）: 経験カウンタ・否定チャンネル・
// 習得の蓄積と刻印判定。入力はこの手で確定した値から取る:
// - upPleasure（快UP）= 部位CUPの合計（C+V+A+B。快Fは含まない:
//   原作 @MARK_GOT_CHECK / @EXP_GOT_CHECK とも UP:0+1+2+14 で、
//   UP:15（F）は快楽刻印にも奉仕快楽経験にも入らない）
// - upPain（苦痛UP）= 苦痛ソース ×10（試作ソースは原作 SOURCE の
//   約 1/10 スケールのため PALAM スケールへ戻す。第9弾の写像規約）。
//   ただし絶頂波及の pain 分は除く: 原作 @EX_CHECK_UP は絶頂時に
//   苦痛・反感を加えないため、波及分が刻印判定へ流れると「絶頂した
//   手で苦痛刻印+反発刻印が同時発生する」理不尽が起きる
// - 反感（UP:11）← 苦痛（波及分を除く） ×10 × 従順倍率
//   （@SOURCE_CHECK_UP_PAIN）
// - 欲情（UP:5）→ desireSession、屈服（UP:6）→ yieldSession へ蓄積
//   （精算で @JUEL_CHECK_MAIN 形に階段換算する）
// - 抑鬱（UP:13）← 恐怖（試作の屈従写像チャンネル）×10 × 従順倍率
//   （@SOURCE_CHECK_UP_SUBMIT）
// - 不快（UP:12）← 不潔ソース（DIRTY_SOURCES、Y=0 評価）× 従順倍率
//   （@SOURCE_CHECK_UP_DIRTY。下のブロックで接続済み）
// - 習得（UP:7）← LEARN_STAGES（SOURCE:4 実測表）
// - 不快（UP:12）← 不潔ソース（DIRTY_SOURCES、Y=0 評価）を
//   @SOURCE_CHECK_UP_DIRTY の従順倍率で変換。反感（UP:11）にも
//   同じ不潔から倍率違いで入る。Y>0 の汚れ連動分は STAIN が無い
//   ため欠けのまま（DIRTY_SOURCES の注記参照）。
{
const upPleasure = (cups["kai_c"]?? 0) + (cups["kai_v"]?? 0)
+ (cups["kai_a"]?? 0) + (cups["kai_b"]?? 0);
const painSrcNet = Math.max(0, (src["pain"]?? 0) - wavePainSrc);
const upPain = painSrcNet * 10;
const obedLvNow = s.abilities?.["abl_obedience"]?? 0;
const upHate = painSrcNet * 10 * (PAIN_HATE_OBED[obedLvNow]?? 0);
const upGloom = (src["fear"]?? 0) * 10 * (SUBMIT_GLOOM_OBED[obedLvNow]?? 0);
s.denialSession.hate += upHate;
s.denialSession.gloom += upGloom;
let upDiscomfort = 0;
let upDirtyHate = 0;
{
const dirtyDef = DIRTY_SOURCES[cmdId];
if (dirtyDef) {
const svcLv = Math.min(5, Math.max(0, s.abilities?.["abl_service"]?? 0));
let dirty = dirtyDef.mode === "stage"
? (dirtyDef.table?.[svcLv]?? 0)
: dirtyDef.mode === "ladder"
? dirtyDef.base * (DIRTY_SERVICE_MULT[svcLv]?? 1)
: dirtyDef.base;
if (failed) dirty *= cmd.fail_source_mult?? 0.3;
const obedIdx = Math.min(5, Math.max(0, obedLvNow));
upDiscomfort = dirty * (DIRTY_DISCOMFORT_OBED[obedIdx]?? 0);
upDirtyHate = dirty * (DIRTY_HATE_OBED[obedIdx]?? 0);
s.denialSession.discomfort += upDiscomfort;
s.denialSession.hate += upDirtyHate;
}
}
const learnDef = LEARN_STAGES[cmdId];
const upLearn = learnDef
? (learnDef.table[Math.min(s.abilities?.[learnDef.ability]?? 0, learnDef.table.length - 1)]?? 0)
: 0;
s.learnSession += upLearn;
// 欲情（UP:5）の蓄積（eraMaou @SOURCE_CHECK の欲情分の合成）:
// - 部位快UP × 欲望倍率（C/V/B は DESIRE_PART_MULT_CVB、A のみ別表）
// - 欲情ソース（SOURCE:11。試作 pleasure は 1/10 スケールのため ×10。
//   絶頂波及の欲情分・精飲絶頂分もここに含まれる——原作でも波及の
//   SOURCE:11 は UP:5 へ素通しで入る）
// - 情愛ソース ×10 × 欲望倍率（@SOURCE_CHECK_UP_LOVE の欲情分）
// - 中毒充足 × 欲望倍率（@SOURCE_CHECK_UP_POISON。addict は原作
//   スケール——COMF 実測値と一致するため ×1）
// 【欠け】痛み由来のマゾ分（LOCAL:3）は試作にマゾっ気能力が無い
// ため 0。露出由来分は露出癖能力が無いため 0（倍率 Lv0 = 0.00）。
{
const desireLvNow = s.abilities?.["abl_desire"]?? 0;
const di = Math.min(6, Math.max(0, desireLvNow));
const upDesire =
(cups["kai_c"]?? 0) * (DESIRE_PART_MULT_CVB[di]?? 0)
+ (cups["kai_v"]?? 0) * (DESIRE_PART_MULT_CVB[di]?? 0)
+ (cups["kai_a"]?? 0) * (DESIRE_PART_MULT_A[di]?? 0)
+ (cups["kai_b"]?? 0) * (DESIRE_PART_MULT_CVB[di]?? 0)
+ (src["pleasure"]?? 0) * 10
+ (src["affection"]?? 0) * 10 * (LOVE_DESIRE_MULT[di]?? 0)
+ (src["addict"]?? 0) * (ADDICT_CONV_M1[Math.min(8, Math.max(0, desireLvNow))]?? 0);
s.desireSession = (s.desireSession?? 0) + upDesire;
}
// 屈服（UP:6）の蓄積（@SOURCE_CHECK_UP_SUBMIT の LOCAL:1）:
// 屈従ソース（試作 fear チャンネル、1/10 スケールのため ×10）×
// 従順倍率。絶頂波及の屈従分・精飲分も fear に含まれ、原作でも
// 波及の SOURCE:13 は UP:6 へ入るため、そのまま含めるのが原作形。
{
const oi = Math.min(7, Math.max(0, obedLvNow));
s.yieldSession = (s.yieldSession?? 0)
+ (src["fear"]?? 0) * 10 * (SUBMIT_YIELD_OBED[oi]?? 0);
}
// 経験カウンタ（コマンド表分）
for (const [k, n] of Object.entries(EXP_GAINS[cmdId]?? {})) {
if (typeof n === "number") s.expReal[k] = (s.expReal[k]?? 0) + n;
}
// 奉仕快楽経験（@EXP_GOT_CHECK）: 奉仕フラグのある手だけ。
// LOCAL = 快UP × 習得UP倍率（<100 で 0 = 経験なし）、梯子で加算。
if (SERVICE_FLAG_COMMANDS[cmdId]) {
const mult = upLearn < 100? 0: upLearn < 300? 1: upLearn < 700? 2: upLearn < 1500? 3: 4;
const gain = expGotLadder(upPleasure * mult);
if (gain > 0) s.expReal["service"] = (s.expReal["service"]?? 0) + gain;
}
// A快楽経験（EXP:32）: LOCAL = 快A UP × 快A倍率、同じ梯子。
{
const upA = cups["kai_a"]?? 0;
const multA = upA < 300? 0: upA < 1000? 1: upA < 5000? 2: upA < 10000? 3: 4;
const gain = expGotLadder(upA * multA);
if (gain > 0) s.expReal["aPleasure"] = (s.expReal["aPleasure"]?? 0) + gain;
}
// 被虐快楽経験（EXP:30）: 快UPと苦痛UPの同時条件表。
{
const pairs: [number, number, number][] = [
[3000, 2000, 16], [2500, 1500, 12], [1500, 1000, 8],
[1000, 500, 4], [600, 300, 2], [300, 100, 1],
];
for (const [needP, needPain, gain] of pairs) {
if (upPleasure >= needP && upPain >= needPain) {
s.expReal["masoPleasure"] = (s.expReal["masoPleasure"]?? 0) + gain;
break;
}
}
}
// 絶頂経験（EXP:2 写像）= その手で絶頂した部位数。精液経験
// （EXP:20 写像）= 射精段位 × 3（COMF31 の +9/+3 の形の近似）。
if (anyClimax) s.expReal["climax"] = (s.expReal["climax"]?? 0) + simultaneous;
if (ejacTier > 0) s.expReal["semen"] = (s.expReal["semen"]?? 0) + ejacTier * 3;
// 調教経験（CFLAG:2 写像、@MASTER_FLAG_CHECK）: R = 従順ABL
// （素質補正は該当素質が無いため欠け）+ 絶頂分。最低 1。
{
let trainInc = Math.max(1, obedLvNow) + simultaneous;
if (ejacTier > 0 && (s.expReal["semen"]?? 0) >= 20) trainInc += 1;
s.expReal["train"] = (s.expReal["train"]?? 0) + trainInc;
}
// 撮影フラグ（com53 = ビデオカメラ使用。そのセッション内有効）
if (cmdId === "com53") s.filmedSession = true;
// 消耗品の消費（実行が成立した手で1つ使う。所持は unlock ゲートで保証）
{
const useItem = CONSUMABLE_USE[cmdId];
if (useItem!== undefined && !failed && s.inventory) {
const key = String(useItem);
if ((s.inventory[key]?? 0) > 0) s.inventory[key] = (s.inventory[key]?? 0) - 1;
}
}
// TEQUIP:11 のトグル（COMF11 バイブ: TEQUIP:11 = 1 - TEQUIP:11）
if (cmdId === "com11" && !failed) s.toolInsertedV = !s.toolInsertedV;
// 媚薬（COMF51）の残留度と薬物経験: 使用のたび 残留度 +1（CFLAG:31）、
// 薬物経験 +1（EXP:57 写像）。残留度が閾値に達したら媚薬中毒を
// 取得し、残留度は 15 以上に引き上げられる（EVENT_ADDICT の形）。
// 媚薬中毒の状態での使用は禁断症状の回避フラグ（CFLAG:32）を立てる。
if (cmdId === "com51" && !failed) {
s.aphroResidue = (s.aphroResidue?? 0) + 1;
s.expReal["drug"] = (s.expReal["drug"]?? 0) + 1;
if (s.aphroAddict) s.aphroDosed = true;
if (!s.aphroAddict && s.aphroResidue >= APHRO_ADDICT_THRESHOLD) {
s.aphroAddict = true;
if (s.aphroResidue < 15) s.aphroResidue = 15;
pushLog(s, "event", `${s.characterName}は媚薬の過剰摂取によって【媚薬中毒】になってしまった`, { mark: 1 });
}
}
// 刻印判定（@MARK_GOT_CHECK）
const markLines = applyMarkCheck(s, {
upPleasure,
upPain,
upHate12: upHate + upDirtyHate + upDiscomfort,
yieldMark: YIELD_MARKS[cmdId]?? 0,
filmedMast: (cmdId === "com3" || cmdId === "com7") && s.filmedSession,
});
for (const line of markLines) pushLog(s, "summary", line, { mark: 3 });
// 異常経験（EXP:50）のコマンド側発生分の接続（eraMaou COMF 実測。
// 撮影中の自慰分は applyMarkCheck 側で処理済み——COMF3 と COMF7 は
// 原作で CFLAG:3 を共有するため filmedMast に com7 も含めた）。
// いずれも実行が成立した手でのみ発生する。
if (!failed) {
const grantAbnormal = (n: number) => {
s.expReal["abnormal"] = (s.expReal["abnormal"]?? 0) + n;
pushLog(s, "summary", n > 1? `異常経験＋${n}`: "異常経験＋１", { mark: 3 });
};
// COMF46 浣腸器＋プラグ（CFLAG:4 状態機械）: 初回排泄で +1
// （撮影中なら +2 となり状態は 2 へ）。状態 1 のまま初めて撮影中に
// 実施すると +1（状態は 2 へ）。状態 2 以降は増えない。
if (cmdId === "com46") {
const st = s.abnormalEnemaState?? 0;
if (s.filmedSession) {
if (st === 0) { grantAbnormal(2); s.abnormalEnemaState = 2; }
else if (st === 1) { grantAbnormal(1); s.abnormalEnemaState = 2; }
} else if (st === 0) {
grantAbnormal(1); s.abnormalEnemaState = 1;
}
}
// COMF54 野外プレイ（CFLAG:5）: 初回のみ +1。
if (cmdId === "com54" && !s.abnormalOutdoorDone) {
grantAbnormal(1); s.abnormalOutdoorDone = true;
}
// COMF81/82/83 フィスト系: V拡張経験（EXP:52）/ A拡張経験
// （EXP:53）が 0 の間の初回で各 +1。試作に拡張経験の独立カウンタは
// 無いため初回フラグで判定する（com83 は両方を同時に判定）。
if (cmdId === "com81" || cmdId === "com83") {
if (!s.expansionVDone) { grantAbnormal(1); s.expansionVDone = true; }
}
if (cmdId === "com82" || cmdId === "com83") {
if (!s.expansionADone) { grantAbnormal(1); s.expansionADone = true; }
}
// COMF87 ピアシング（CFLAG:7）: 原作はへそ以外への初回装着で +1。
// 試作に部位選択が無いため初回実行で一度だけの近似。
if (cmdId === "com87" && !s.abnormalPierceDone) {
grantAbnormal(1); s.abnormalPierceDone = true;
}
}
}

// 潤滑の発生（原版 @LOVE_MOIST_CHECK_UP + @SOURCE_CHECK_UP_MOIST）:
// その手で実際に加算された快C・快V・快A・快B の上昇量（倍率適用後・
// 絶頂判定前の CUP）の合計 S が 100 超のとき G = floor(S / 5)。
// 素質（パック特性カタログのフラグ型）濡れやすい（原版 TALENT:42）は
// G ×3.00、濡れにくい（TALENT:43）は G ×0.40 を、原版の処理順で掛ける。
// 直接の液体追加（原版 SOURCE:10）も同じ増加に合算する:
// com50 ローションは +10000（原版 COMF50 は SOURCE:10 = 10000）。
// com58 お風呂場プレイの段階表（0/50/80/100/200/300）は原版 ABL:17
// （露出癖）の段階で引くが、試作の能力カタログに露出癖は無く、試作の
// com58 のソース計算にも段階変数・段階分け自体が存在しない（ソースは
// 定数のみ）ため、対応づける段階判定が無く未接続（欠け）。実行ごとの
// 既定段も勝手に作らない。
// コスト適用後に気力が 0 になっている手では G を半分にする
// （原版: 気力≤0 で UP:3 /= 2）。上限なし。
// com18 シャワーは実行時に現在値を半分にする（原版 COMF18 の
// PALAM:3 /= 2。その手の発生分は半減の対象に含めない）。
{
let lubGain = 0;
const moistS = (cups["kai_c"]?? 0) + (cups["kai_v"]?? 0)
+ (cups["kai_a"]?? 0) + (cups["kai_b"]?? 0);
if (moistS > 100) lubGain = Math.floor(moistS / 5);
const traitIds = s.traitIds?? [];
if (traitIds.includes(LUB_TRAIT_WET)) lubGain = Math.floor(lubGain * 3.0);
if (traitIds.includes(LUB_TRAIT_DRY)) lubGain = Math.floor(lubGain * 0.4);
if (cmdId === "com50") lubGain += 10000;
// 調教者技巧の液体追加（SOURCE:10 の梯子。COMF6 キス /
// COMF22・23・28・29 座位系で梯子が異なる。TECH_LIQUID 参照）
{
const techLiquid = TECH_LIQUID[cmdId];
if (techLiquid) {
const tlv = Math.min(5, Math.max(0, s.trainerSkill?? 0));
lubGain += techLiquid[tlv]?? 0;
}
}
// 精飲絶頂の液体追加（SEIIN_ORGASM の SOURCE:10）
lubGain += Math.floor(seiinLiquid);
if (s.resources.energy <= 0) lubGain = Math.floor(lubGain / 2);
const lubBase = cmdId === "com18"? Math.floor(lubAtStart / 2): lubAtStart;
s.lub = lubBase + lubGain;
}

for (const sid of SOURCE_IDS) {
// 苦痛の珠の入力（srcGain.pain）からも絶頂波及の pain 分を除く
// （原作 PALAM:9 に波及入力は無い。パラメータ側の写像は変換段で
// 済んでおり、ここは精算入力だけの話）。
const add = (src[sid]?? 0) - (sid === "pain"? wavePainSrc: 0);
s.srcGain[sid] = (s.srcGain[sid]?? 0) + add;
}
if (cmd.funds) {
s.funds += godotRound(evalExpr(cmd.funds, namespaceOf(s)));
}

const band = bandOf(s, cmdId);
// 初回/反復は永続フラグ usedCommands が根拠（原作のコマンド別・永続
// 初回フラグと同型）。成否を問わず、この手で初めて実行するなら first。
const rep = s.usedCommands.includes(cmdId)? "repeat": "first";
let text: string | undefined;
if (failed) {
text = narration.get(narrationKey(cmdId, band, `fail_${rep}`));
}
// 地の文辞書にエントリが無いコマンド（Maou 移植コマンド等）は空行で
// 処理する（捏造で埋めない）。数値結果行は通常どおり出る。
text = text?? narration.get(narrationKey(cmdId, band, rep))?? "";

s.exp[cmdId] = (s.exp[cmdId]?? 0) + 1;
s.dailyExp[cmdId] = (s.dailyExp[cmdId]?? 0) + 1;
if (!s.usedCommands.includes(cmdId)) s.usedCommands.push(cmdId);
s.prev = cmdId;
s.prevCommandId = cmdId;

// 閾値イベント
const eventTexts: string[] = [];
for (const e of EVENTS) {
if (e.once && s.fired[e.id]) continue;
if (evalExpr(e.when, namespaceOf(s))!== 0) {
s.fired[e.id] = true;
eventTexts.push(e.text);
}
}

// 反発のセッション内正増分: この手で stress が増えた分だけを累積する
// （減少は差し引かない）。否定の珠の換算入力で、調教終了時の精算が読む。
{
const dStress = (s.params["stress"]?? 0) - stressAtStart;
if (dStress > 0) s.stressPosSession = (s.stressPosSession?? 0) + dStress;
}

// 口上の既定値選択（数値計算には一切触れない、セリフ欄への代入のみ）。
// 優先順位: 絶頂 > 射精 > 通常コマンド口上。日送り挨拶（day2plus）は
// 手の選択ではなく、日が替わる遷移（proceedToNextSession）側で設定する。
{
const personality = normalizePersonality(s.personality);
// まず優先順位で「この手のセル」を1つに決め、そのセルだけを引く。
// 決まったセルが辞書に無ければ空文字（次候補へは落ちない）。
let parts: KojoKeyParts | null = null;
if (climaxEvents.length > 0) {
// 同時絶頂: intensity 最大、同強度なら c,v,a,b,f の順で先のもの。
const partOrder: Record<string, number> = { kai_c: 0, kai_v: 1, kai_a: 2, kai_b: 3, kai_f: 4 };
const partLetter: Record<string, string> = { kai_c: "c", kai_v: "v", kai_a: "a", kai_b: "b", kai_f: "f" };
const best = [...climaxEvents].sort((a, b) =>
(b.intensity - a.intensity)
|| ((partOrder[a.part?? ""]?? 9) - (partOrder[b.part?? ""]?? 9)))[0];
if (best && best.part && partLetter[best.part]) {
parts = {
personality, kind: "climax",
part: partLetter[best.part],
repetition: best.first? "first": "repeat",
};
}
}
if (parts === null && ejacTier > 0) {
parts = {
personality, kind: "ejac",
tierGroup: ejacTier >= 2? "large": "normal",
};
}
if (parts === null) {
// 通常時: 地の文と同じ band × repetition（fail_ 付きは first/repeat へ寄せる）
parts = {
personality, kind: "command",
commandId: cmdId, band, repetition: rep,
};
}
s.dialogue = pickKojo(s, kojo, parts)?? "";
}

// 1手の出力: 地の文（,1）→ 数値サマリー（,3）→ イベント文（,1）
updatePeaks(s);
pushLog(s, "text", text, { mark: 1});
pushLog(s, "summary", summaryLine(s, kaiGains), { mark: 3});
for (const ev of climaxEvents) {
const word = CLIMAX_WORDS[ev.intensity]?? "絶頂";
const partLabel = ev.part? paramDef(ev.part)?.label?? ev.part: "";
pushLog(s, "summary",
`${word}（${partLabel}）${ev.first? "・初回": ""}`,
{ mark: 3});
}
if (ejacTier > 0) {
pushLog(s, "summary", `射精（${EJAC_TIER_WORDS[ejacTier]?? "通常"}）`, { mark: 3});
}
for (const t of eventTexts) pushLog(s, "event", t, { mark: 1});

// 倒れる判定（eraMaou @EVENTCOMEND → @EVENTEND の形）: この手の解決後に
// 体力が 0 以下なら、彼女は倒れてセッションが強制終了する。原作では
// キャラが削除され珠も入らないが、eraMuse ではキャラは残し、
// 「精算なしでメニューへ移る」形にした（精算入力は破棄される:
// 快部位の残量とセッションEXは次のセッション開始時に捨て、
// ウォーターマークは開始時点で置き直す）。
if (s.resources.vital <= 0) {
s.collapsed = true;
// 強制終了でも回復は終了時点で適用する（通常の終了と同じ形。
// 体力は 1 へ引き上げてから通常率が当たる）。精算だけが無い。
applySessionEndRecovery(s);
s.phase = "menu";
pushLog(s, "text", "彼女はぴくりとも動かなくなった。", { mark: 1 });
pushLog(s, "day", `―― 第${s.day}日（${slotLabelOf(s.slot)}）調教中断 ――`, { mark: 3 });
pushLog(s, "notice", "彼女は倒れた。このセッションの精算は行われない。次へ進むと次の時間帯へ移る。", { mark: 3 });
}
pushLog(s, "status", "", { snapshot: snapshotOf(s)});
return { ok: true};
}

// ---------------------------------------------------------------- ending

/**
 * 期間終了後に「続ける」を選んだときの期間延長。終了分岐（手放す /
 * 手元に残す）を選ぶ前に限り有効で、daysLimit を days 日だけ延ばし、
 * finished を解除して延長期間の初日（午前）のセッションを開始する
 * （遷移は beginNextSession の形。回復は最終セッションの終了時点で
 * 適用済みのため、ここでは行わない）。延長は繰り返し可能（再び
 * 期日が来ればまた「続ける」か終了分岐かを選べる）。パラメータ・珠・
 * 能力・記録は引き継ぐ（日数制限と日付の進行だけが変わる）。
 */
export function extendPeriod(
s: GameState,
days: number,
): { ok: boolean; reason?: string } {
normalizeState(s);
if (!s.finished) return { ok: false, reason: "まだ期間が終わっていない"};
if (s.ending) return { ok: false, reason: "終了分岐は選択済み"};
if (!Number.isInteger(days) || days < 1) return { ok: false, reason: "延長日数が不正"};
s.daysLimit += days;
s.finished = false;
pushLog(s, "echo", `> extend:${days}`);
pushLog(s, "notice",
`期間を ${days} 日延長した（${s.daysLimit} 日まで）。調教を続ける。`,
{ mark: 3});
beginNextSession(s);
return { ok: true };
}

export function resolveEnding(
s: GameState,
choice: "release" | "keep",
kojo?: ReadonlyMap<string, string[]>,
): { ok: boolean; reason?: string} {
if (!s.finished) return { ok: false, reason: "まだ期間が終わっていない"};
if (s.ending) return { ok: false, reason: "終了分岐は選択済み"};

let met: boolean | null = null;
let rank = "-";
let key = "free";
const goalEntries = Object.entries(s.goal);
if (goalEntries.length > 0) {
met = goalEntries.every(([k, v]) => (s.params[k]?? 0) >= v);
const ratio = goalEntries.reduce(
(acc, [k, v]) => acc + Math.min((s.params[k]?? 0) / v, 1.2), 0) / goalEntries.length;
if (met && ratio >= 1.1) rank = "S";
else if (met) rank = "A";
else if (ratio >= 0.8) rank = "B";
else rank = "C";
key = `${met? "met": "unmet"}_${choice}`;
}
const text = ENDING_TEXTS[key]?? "";
s.ending = { choice, rank, met, text};
// 終了口上（原作 EVENTEND の受け皿）: 口上辞書に ending/<branch> が
// あれば dialogue へ設定する。無ければ dialogue は従来どおり変更しない。
{
const picked = pickKojo(s, kojo, {
personality: normalizePersonality(s.personality),
kind: "ending", branch: choice,
});
if (picked !== null) s.dialogue = picked;
}
pushLog(s, "echo", `> ending:${choice}`);
pushLog(s, "notice",
`ランク ${rank}` +
(met === null? "": `（目標達成: ${met? "達成": "未達"}）`),
{ mark: 3});
if (text) pushLog(s, "text", text, { mark: 1});
pushLog(s, "status", "", { snapshot: snapshotOf(s)});
return { ok: true};
}
