// charroll.ts — ランダムキャラ生成（候補プール用）
// 生成文法は pack の charroll.json（原作 CHAR_MAKE の生成文法のデータ化）を
// そのまま移植したもの。テンプレート層は eraMuse では空の素体 1 種のみ。
// 素質の出現可否は trait_master.json（素質ごとの random フラグ）で制御する:
// フラグが 0 の素質は抽選結果から落とす（抽選自体は常に行うので、
// フラグを切り替えても他の結果は動かない）。
// 見た目（look）は原作 LOOK.ERB @LOOK_SET の分布を移植。種族・年齢・身長は
// 原作に抽選表が無いため eraMuse 側の重み（下部に明記）。

import type { LookData } from "./engine.ts";

export type Rng = () => number;

// pack の random.Random 相当の決定的乱数（mulberry32）
export function rngFromSeed(seed: number): { next: Rng; randrange: (n: number) => number; randint: (a: number, b: number) => number } {
  let a = (seed >>> 0) || 1;
  const next: Rng = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    randrange: (n: number) => Math.floor(next() * n),
    randint: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
  };
}

export interface TraitMasterEntry { id: string; label?: string; random: number; note?: string }
export interface TraitMaster { traits: TraitMasterEntry[] }

export interface RolledCandidate {
  name: string;
  personality: string;
  traits: { id: string; src_mult?: Record<string, number>; conv_mult?: Record<string, number> }[];
  traitIds: string[];
  initOverrides: Record<string, number>;
  look: LookData;
  excludedByFlag: string[]; // フラグで落とされた素質（提示用）
}

interface AxisSpec { id: string; minus: string; plus: string; sides: number; minusFaces: number[]; plusFaces: number[] }

const PERSONALITIES = ["sunao", "tsuyoki", "yowaki", "majime"];

// ---- 見た目（@LOOK_SET 移植） ----
const HAIR_COLORS: [number, string][] = [ // RAND:100 累積上限
  [20, "金髪"], [30, "青髪"], [40, "緑髪"], [60, "栗毛"], [80, "黒髪"], [98, "赤毛"], [99, "銀髪"],
];
const HAIR_STATES = ["直毛", "直毛", "直毛", "直毛", "直毛", "直毛", "直毛", "カール", "内カール", "外カール", "くせっ毛", "ウェーブ"]; // RAND:12
const HAIR_SETS = ["", "ナチュラル", "横分け", "アンバランス", "一本縛り", "ポニーテール", "サイドポニー", "おさげ", "ツインテール", "アップ", "サイドアップ", "フィッシュボーン", "ロール"]; // 1 始まり
const EYES: [number, string][] = [ // RAND:100
  [10, "切れ長"], [20, "大きい"], [25, "神秘的"], [35, "つり目"], [40, "潤み目"], [45, "たれ目"], [48, "三白眼"],
];
const PUPILS: [number, string][] = [
  [40, "碧"], [60, "ブラウン"], [80, "黒"], [97, "グレー"], [98, "ゴールド"],
];
const LIPS = ["肉感的", "薄い", "瑞々しい", "標準", "標準", "標準"]; // RAND:6（Q>=3 は標準）
const BUILDS = ["グラマー", "スレンダー", "標準"]; // RAND:3（308: 300/1/150）

// 種族・年齢は原作に抽選表が無い（CHAR_MAKE はテンプレート依存）ため eraMuse 側の重み
const RACES: [number, string][] = [ // 累積（合計100）
  [60, "人間"], [64, "エルフ"], [68, "人狼"], [72, "吸血鬼"], [76, "デュラハン"], [80, "ドラゴン"],
  [84, "天使"], [88, "ダークエルフ"], [92, "堕天使"], [96, "魔族"], [98, "レプラコーン"], [100, "ドワーフ"],
];

function pickBand(r: number, bands: [number, string][], fallback: string): string {
  for (const [cap, label] of bands) if (r <= cap) return label;
  return fallback;
}

export function rollLook(rng: ReturnType<typeof rngFromSeed>, stature: string): LookData {
  const hairColor = pickBand(rng.randrange(100), HAIR_COLORS, "銀髪");
  const hairState = HAIR_STATES[rng.randrange(12)];
  const lenRoll = rng.randrange(6);
  const hairLength = lenRoll <= 1 ? "ショート" : lenRoll === 4 ? "セミロング" : "ロング";
  // 303 カット: 原作は IF Q >= 2 → ベーシック が先に効き、切り揃え/レイヤーは到達不能（実測どおり移植）
  const hairCut = rng.randrange(6) >= 2 ? "ベーシック" : "シャギー";
  const setMax = hairLength === "ショート" ? 3 : hairLength === "セミロング" ? 10 : 12;
  const hairSet = HAIR_SETS[rng.randrange(setMax) + 1];
  const eyes = pickBand(rng.randrange(100), EYES, "標準");
  const pupilColor = pickBand(rng.randrange(100), PUPILS, "クリムゾン");
  const lips = LIPS[rng.randrange(6)];
  const build = BUILDS[rng.randrange(3)];
  const race = pickBand(rng.randrange(100) + 1, RACES, "人間");
  const age = rng.randint(18, 35);
  const heightCm = stature === "長身" ? rng.randint(166, 176) : stature === "小柄" ? rng.randint(140, 149) : rng.randint(150, 165);
  return {
    age, pronoun: "わたし", heightCm, build, race,
    hairColor, hairLength, hairCut, hairSet, hairState, eyes, pupilColor, lips,
  };
}

// ---- 生成文法（pack generate_character の移植、テンプレート層なし） ----
export function generateCandidate(
  seed: number,
  grammar: any,
  traitsDoc: any,
  master: TraitMaster,
): RolledCandidate {
  const rng = rngFromSeed(seed);
  const flagOf = new Map<string, number>();
  for (const t of master.traits ?? []) flagOf.set(t.id, t.random ? 1 : 0);
  const allowed = (id: string) => (flagOf.get(id) ?? 1) === 1;
  const excluded: string[] = [];
  const found = new Set<string>();
  const take = (id: string | null) => {
    if (!id) return;
    if (!allowed(id)) { excluded.push(id); return; }
    found.add(id);
  };

  // 型A: 軸サイコロ（traits.json の軸 + charroll の polarity / 生成専用軸）
  const dice = grammar.axis_dice ?? {};
  const defSides = dice.default?.sides ?? 12;
  const defMinus: number[] = dice.default?.minus_faces ?? [0];
  const defPlus: number[] = dice.default?.plus_faces ?? [1];
  const polarity: Record<string, [string, string]> = dice.polarity ?? {};
  const overrides: Record<string, any> = dice.overrides ?? {};
  const axes: AxisSpec[] = [];
  for (const ax of traitsDoc.axes ?? []) {
    const pol = polarity[ax.id];
    if (!pol) continue; // 極性未宣言の軸は生成対象にしない（pack と同じ）
    const ov = overrides[ax.id] ?? {};
    axes.push({ id: ax.id, minus: pol[0], plus: pol[1], sides: ov.sides ?? defSides, minusFaces: ov.minus_faces ?? defMinus, plusFaces: ov.plus_faces ?? defPlus });
  }
  for (const ax of dice.extra_axes ?? []) {
    axes.push({ id: ax.id, minus: ax.minus, plus: ax.plus, sides: defSides, minusFaces: defMinus, plusFaces: defPlus });
  }
  const axisResult = new Map<string, string | null>();
  for (const ax of axes) {
    const face = rng.randrange(ax.sides);
    const form = ax.minusFaces.includes(face) ? ax.minus : ax.plusFaces.includes(face) ? ax.plus : null;
    axisResult.set(ax.id, form);
    take(form);
  }

  // 型C: グループ cascade（forms を順に RAND:分母、全滅でなし）
  const groupRolls: Record<string, any> = grammar.group_rolls ?? {};
  for (const gr of traitsDoc.groups ?? []) {
    const denom = groupRolls[gr.id]?.denominator ?? 40;
    let hit: string | null = null;
    for (const form of gr.forms ?? []) {
      if (rng.randrange(denom) === 0) { hit = form; break; }
    }
    take(hit);
  }

  // 型B: 単発素質
  for (const sg of grammar.singles?.entries ?? []) {
    if (rng.randrange(Math.max(1, sg.denominator ?? 1)) === 0) take(sg.id);
  }

  // 型C: 段階ラダー（steps は希少度順カスケード、値は step の id、表示は label）
  const ladderOut: Record<string, string> = {};
  const ladderLabel: Record<string, string> = {};
  for (const lad of grammar.ladders ?? []) {
    let value: string = lad.default?.id ?? "normal";
    let label: string = lad.default?.label ?? "並";
    for (const step of lad.steps ?? []) {
      if (rng.randrange(Math.max(1, step.denominator ?? 1)) === 0) { value = step.id; label = step.label ?? step.id; break; }
    }
    // 連携軸のシフト（胸 ← B感度軸。plus/minus 形は polarity から引く）
    const link = lad.link;
    if (link && lad.size_order) {
      const form = axisResult.get(link.axis);
      const pol = polarity[link.axis];
      const order: string[] = lad.size_order;
      let idx = order.indexOf(value);
      if (idx >= 0 && pol) {
        if (form === pol[1]) idx = Math.min(order.length - 1, idx + (link.plus_shift ?? 0));
        if (form === pol[0]) idx = Math.max(0, idx + (link.minus_shift ?? 0));
        value = order[idx];
        const stepHit = (lad.steps ?? []).find((s: any) => s.id === value);
        label = value === lad.default?.id ? (lad.default?.label ?? label) : (stepHit?.label ?? value);
      }
    }
    ladderOut[lad.id] = value;
    ladderLabel[lad.id] = label;
  }

  // 名前（スタイル重み付き → 一様）
  const styles = grammar.names?.styles ?? [];
  let totalW = 0;
  for (const st of styles) totalW += st.weight ?? 1;
  let name = "名無し";
  if (styles.length > 0) {
    let w = rng.randrange(Math.max(1, totalW));
    let chosen = styles[0];
    for (const st of styles) { w -= st.weight ?? 1; if (w < 0) { chosen = st; break; } }
    const pool: string[] = chosen.names ?? [];
    if (pool.length > 0) name = pool[rng.randrange(pool.length)];
  }

  // 初期パラメータの揺らぎ（stress のみ、pack の init_roll: 基礎値 ± spread）
  const initOverrides: Record<string, number> = {};
  for (const pr of grammar.init_roll?.params ?? []) {
    const base = pr.id === "stress" ? 100 : 0;
    const spread = pr.spread ?? 0;
    const jitter = rng.randint(-spread, spread);
    initOverrides[pr.id] = Math.max(0, base + jitter);
  }

  // 性格は charroll に無い（テンプレート側の領分）ため eraMuse 側で一様抽選
  const personality = PERSONALITIES[rng.randrange(PERSONALITIES.length)];

  const stature = ladderLabel["stature"] ?? "並";
  const look = rollLook(rng, stature);
  const bodyDetails: string[] = [];
  if (stature !== "並") bodyDetails.push(`体格：${stature}`);
  const chest = ladderLabel["chest"];
  if (chest) bodyDetails.push(`胸：${chest}`);
  if (bodyDetails.length > 0) look.bodyDetails = bodyDetails;

  const effects: Record<string, any> = grammar.effects ?? {};
  const traits = [...found].map((id) => {
    const fx = effects[id];
    const t: { id: string; src_mult?: Record<string, number>; conv_mult?: Record<string, number> } = { id };
    if (fx && typeof fx === "object") {
      if (fx.src_mult && typeof fx.src_mult === "object") t.src_mult = fx.src_mult;
      if (fx.conv_mult && typeof fx.conv_mult === "object") t.conv_mult = fx.conv_mult;
    }
    return t;
  });

  return { name, personality, traits, traitIds: [...found], initOverrides, look, excludedByFlag: excluded };
}
