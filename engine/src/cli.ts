// eraMuse engine adapter for the dedicated shell (方式A wiring).
// stdin/stdout JSON-lines driver: one JSON object per line in, one per line out.
// Ops: start / execute / end / buy / buyitem / next (alias: nextday) / ending / extend / getstate / setdialogue
//      charcopy (duplicate a registered character's DEFINITION under a new
//      id — 「名前を付けて新規」; state/saves are never copied)
//      poolgen / pool / poolshow / pooldelete / poolregister (candidate pool,
//      records carry registered: 0 until promoted; runtime-born records are
//      persisted to data/characters_added.json, never into characters.json)
//      traitflags / settraitflag (trait master: per-trait random appearance)
//      trainers (trainer profiles + their persistent progress)
//      buytrainerskill (pre-start purchase of ITEM:52【技巧Lv】from the
//      trainer's own balance — no session needed)
//
// Home layout (single shared set for online and offline; the only difference
// between the two is whether the chat layer is alive — see ../layout.json):
//   <home>/data/        dictionaries (narration.json / kojo.json / characters.json
//                        / trainers.json — trainer profiles)
//                        characters.json is the SHIPPED dictionary and is
//                        never rewritten by the engine; definitions born at
//                        runtime (charcopy copies, poolgen candidates,
//                        poolregister promotions of shipped records) live in
//                        data/characters_added.json instead, so a shell
//                        transfer that refreshes the shipped dictionary can
//                        no longer delete a created character (measured
//                        2026-11-11: base_2 lost its definition that way and
//                        became unstartable while its save remained).
//   <home>/characters/  per-character save files: <characterId>.json (portable)
//   <home>/logs/        per-character op logs:    <characterId>.jsonl
//   <home>/trainers_state.json
//                       trainer-side persistent progress (trainerSkill /
//                       fallenCount / funds per trainer id). The trainer
//                       (chara 0 in the original) outlives individual
//                       targets, so these values are NOT owned by a
//                       target's save; a session state carries a working
//                       copy (trainerSkill / fallenCount / allowance) that
//                       start hydrates from this store and every persist
//                       writes back to it. funds is the trainer's money
//                       balance (the お小遣い wallet): seeded once from
//                       the profile's fundsStart, topped up by the
//                       per-session grant, and spent by every money
//                       purchase (menu items and pre-start ITEM:52).
// Home resolution: --home <dir> argv  >  $ERA_ENGINE_HOME  >
//   exe directory (compiled)  >  ../  relative to this file (source run).
// Log records and save files use unambiguous keys; the primary reader is an
// AI (Muse), so machine-readability wins over human presentation.
import {
  newGameState, executeCommand, snapshotOf, purchaseInMenu, purchaseItem, endSession, proceedToNextSession,
  resolveEnding, extendPeriod, visibleCommands, isUnlocked, normalizeState, trainerSkillShopInfo,
} from "./engine.ts";
import { generateCandidate, type TraitMaster } from "./charroll.ts";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function resolveHome(): string {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--home");
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  if (process.env.ERA_ENGINE_HOME) return process.env.ERA_ENGINE_HOME;
  // Source run: this file is <home>/src/cli.ts, so home is one level up —
  // but only when the dictionaries are actually there.
  try {
    const up = fileURLToPath(new URL("../", import.meta.url));
    if (existsSync(join(up, "data", "narration.json"))) return up;
  } catch { /* compiled binary: import.meta.url is virtual */ }
  return dirname(process.execPath);
}

const home = resolveHome();
const dataDir = join(home, "data");
const charDir = join(home, "characters");
const logDir = join(home, "logs");
mkdirSync(charDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

function loadDict() {
  const narrData = JSON.parse(readFileSync(join(dataDir, "narration.json"), "utf8"));
  const kojoData = JSON.parse(readFileSync(join(dataDir, "kojo.json"), "utf8"));
  const narration = new Map<string, string>();
  for (const e of narrData.entries) narration.set(`${e.commandId}|${e.band}|${e.repetition}`, e.text);
  const kojo = new Map<string, string[]>();
  for (const e of kojoData.entries) {
    const key = [e.personality, e.kind, e.commandId ?? "", e.band ?? "", e.repetition ?? "", e.part ?? "", e.tierGroup ?? "", e.timing ?? "", e.branch ?? "", e.markId ?? ""].join("|");
    kojo.set(key, e.texts);
  }
  const chars = JSON.parse(readFileSync(join(dataDir, "characters.json"), "utf8"));
  // 配布辞書の素の状態（実行時差分を characters_added.json へ書き分ける
  // ための基準）。id 集合と、各 id の shipped な registered 値を持つ。
  const shippedIds = new Set<string>(chars.characters.map((c: any) => c.id));
  const shippedRegistered = new Map<string, number>(
    chars.characters.map((c: any) => [c.id, c.registered === 0 ? 0 : 1]),
  );
  // 実行時定義のマージ: tombstone（deleted）を落とし、added のレコードで
  // 同 id を置換／末尾に追加する。ファイルが無い・壊れている場合は配布
  // 辞書だけで起動する（実行時エントリが無いだけ）。
  try {
    const addedPath = join(dataDir, "characters_added.json");
    if (existsSync(addedPath)) {
      const added = JSON.parse(readFileSync(addedPath, "utf8"));
      const deleted = new Set<string>(Array.isArray(added?.deleted) ? added.deleted : []);
      if (deleted.size) {
        chars.characters = chars.characters.filter((c: any) => !deleted.has(c.id));
      }
      for (const rec of added?.characters ?? []) {
        if (!rec || typeof rec.id !== "string" || deleted.has(rec.id)) continue;
        const i = chars.characters.findIndex((c: any) => c.id === rec.id);
        if (i >= 0) chars.characters[i] = rec;
        else chars.characters.push(rec);
      }
    }
  } catch { /* added file is optional runtime data; never sink the dictionary */ }
  const charDefs = new Map<string, any>();
  const poolDefs = new Map<string, any>();
  for (const c of chars.characters) {
    // registered が 0 のレコードは候補プール内（開始不可）。欠落は 1 扱い（従来互換）
    if (c.registered === 0) poolDefs.set(c.id, c);
    else charDefs.set(c.id, c);
  }
  return { narration, kojo, charDefs, poolDefs, charsDoc: chars, shippedIds, shippedRegistered };
}

const { narration, kojo, charDefs, poolDefs, charsDoc, shippedIds, shippedRegistered } = loadDict();

// ---------------------------------------------------------------- trainers
// Trainer profiles (data/trainers.json): the trainer is also a character,
// chosen at session start (the original's @FIRST_SETTING form). Each
// profile carries a character sheet (sheet: sex / skill / ejacMax /
// traits) next to id / name / note / fundsStart; progress (trainerSkill
// / fallenCount / funds) lives in the persistent store below, keyed by
// trainer id. The sheet's skill is only the seed — the live value is
// the store's trainerSkill. The sheet's traits are receptacle only
// (ids validated against data/trainer_traits.json); their effects are
// not wired yet. Legacy profiles with flat sex / skillStart fields are
// folded into the sheet at load time.

/** 調教主の初期資金の既定（プロフィールの fundsStart が無い場合）。
 * 「多め」の水準: ITEM:52【技巧Lv】(50) を数個と、高額器具
 * （アナル電極 500）まで開始前に買える額。 */
export const TRAINER_FUNDS_SEED = 1000;

/** 射精ゲージ上限の既定（シートの ejacMax が無い場合。原作の上限）。 */
export const TRAINER_EJAC_MAX_SEED = 10000;

/** 調教師シート（trainers.json の sheet）。キャラデータとしての
 * 調教主の静的定義で、セッション開始時に作業コピーとして状態へ写る。 */
interface TrainerSheetData { sex: string; skill: number; ejacMax: number; traits: string[] }

interface TrainerProfile { id: string; name: string; note?: string; fundsStart?: number; sheet: TrainerSheetData }

const DEFAULT_TRAINER: TrainerProfile = {
  id: "default", name: "あなた", fundsStart: TRAINER_FUNDS_SEED,
  sheet: { sex: "female", skill: 0, ejacMax: TRAINER_EJAC_MAX_SEED, traits: [] },
};

/** 調教師素質マスター（data/trainer_traits.json）の id 集合。
 * ファイルが読めない場合は null（検証せず素通し）で、読めた場合だけ
 * プロフィールの traits を正本にある id に限る。 */
function loadTrainerTraitIds(): Set<string> | null {
  try {
    const doc = JSON.parse(readFileSync(join(dataDir, "trainer_traits.json"), "utf8"));
    const ids = new Set<string>();
    for (const t of doc.traits ?? []) if (t && typeof t.id === "string" && t.id) ids.add(t.id);
    return ids;
  } catch {
    return null;
  }
}

const trainerTraitIds = loadTrainerTraitIds();

function parseTrainerSheet(t: any): TrainerSheetData {
  const sh = (t && typeof t.sheet === "object" && t.sheet) ? t.sheet : {};
  // 旧形式（sex / skillStart の直置き）もシートへ寄せて読む。
  const sexRaw = typeof sh.sex === "string" && sh.sex ? sh.sex
    : (typeof t?.sex === "string" && t.sex ? t.sex : "female");
  const skillRaw = typeof sh.skill === "number" ? sh.skill
    : (typeof t?.skillStart === "number" ? t.skillStart : 0);
  const ejacMax = typeof sh.ejacMax === "number" && sh.ejacMax > 0 ? sh.ejacMax : TRAINER_EJAC_MAX_SEED;
  let traits: string[] = Array.isArray(sh.traits)
    ? sh.traits.filter((x: any) => typeof x === "string" && x)
    : [];
  if (trainerTraitIds) traits = traits.filter((id) => trainerTraitIds.has(id));
  return { sex: sexRaw, skill: skillRaw, ejacMax, traits: [...new Set(traits)] };
}

function loadTrainerProfiles(): Map<string, TrainerProfile> {
  const m = new Map<string, TrainerProfile>();
  try {
    const doc = JSON.parse(readFileSync(join(dataDir, "trainers.json"), "utf8"));
    for (const t of doc.trainers ?? []) {
      if (t && typeof t.id === "string" && t.id) {
        m.set(t.id, {
          id: t.id,
          name: typeof t.name === "string" && t.name ? t.name : t.id,
          note: typeof t.note === "string" ? t.note : "",
          fundsStart: typeof t.fundsStart === "number" ? t.fundsStart : TRAINER_FUNDS_SEED,
          sheet: parseTrainerSheet(t),
        });
      }
    }
  } catch { /* profiles file is optional; the built-in default remains */ }
  if (!m.has("default")) m.set("default", DEFAULT_TRAINER);
  return m;
}

const trainerProfiles = loadTrainerProfiles();

/** funds は任意: funds 導入前のストアファイルには存在せず、その場合は
 * 未種付けとして扱い、trainerRecordOf が初回にプロフィールの
 * fundsStart（既定 TRAINER_FUNDS_SEED）で種付けする。 */
interface TrainerRecord { trainerSkill: number; fallenCount: number; funds?: number }

const trainerStorePath = join(home, "trainers_state.json");

function loadTrainerStore(): { trainers: Record<string, TrainerRecord> } {
  try {
    const doc = JSON.parse(readFileSync(trainerStorePath, "utf8"));
    const trainers: Record<string, TrainerRecord> = {};
    for (const [id, r] of Object.entries<any>(doc.trainers ?? {})) {
      trainers[id] = {
        trainerSkill: typeof r?.trainerSkill === "number" ? r.trainerSkill : 0,
        fallenCount: typeof r?.fallenCount === "number" ? r.fallenCount : 0,
        funds: typeof r?.funds === "number" ? r.funds : undefined,
      };
    }
    return { trainers };
  } catch {
    return { trainers: {} };
  }
}

const trainerStore = loadTrainerStore();

function flushTrainerStore() {
  writeFileSync(trainerStorePath, JSON.stringify(trainerStore, null, 2));
}

/** The trainer's record with funds seeded. Seeding happens exactly once:
 * the first time a record without funds is materialised (a fresh store,
 * or a store file written before funds existed), the balance starts at
 * the profile's fundsStart. After that the stored value is the truth. */
function trainerRecordOf(tid: string): TrainerRecord {
  const prof = trainerProfiles.get(tid);
  let rec = trainerStore.trainers[tid];
  if (!rec) {
    rec = {
      trainerSkill: prof?.sheet.skill ?? 0,
      fallenCount: 0,
      funds: prof?.fundsStart ?? TRAINER_FUNDS_SEED,
    };
    trainerStore.trainers[tid] = rec;
    flushTrainerStore();
    return rec;
  }
  if (typeof rec.funds !== "number") {
    rec.funds = prof?.fundsStart ?? TRAINER_FUNDS_SEED;
    flushTrainerStore();
  }
  return rec;
}

/** Write the session's working copy back into the trainer's record.
 * Called from persist(): during play every mutation (ITEM:52 purchase,
 * fall-trait acquisition, item purchase, session-end grant) lands on
 * the state first, so the store simply mirrors it. funds mirrors the
 * state's allowance (the session-side working copy of the balance). */
function syncTrainerToStore() {
  if (!state || typeof state.trainerId !== "string" || !state.trainerId) return;
  const rec: TrainerRecord = {
    trainerSkill: state.trainerSkill ?? 0,
    fallenCount: state.fallenCount ?? 0,
    funds: state.allowance ?? 0,
  };
  const cur = trainerStore.trainers[state.trainerId];
  if (cur && cur.trainerSkill === rec.trainerSkill && cur.fallenCount === rec.fallenCount && cur.funds === rec.funds) return;
  trainerStore.trainers[state.trainerId] = rec;
  flushTrainerStore();
}

/** Attach the loaded session state to its trainer's persistent record.
 * - The trainer is the one recorded in the save (state.trainerId);
 *   fallbackTrainerId (the start request's, else "default") is used only
 *   for legacy saves that predate trainer profiles.
 * - Legacy migration: a save that is not linked yet (trainerLinked !==
 *   true), or whose trainer has no store record, merges its working copy
 *   into the store by taking the max of both sides — never a sum, so the
 *   same progress can never be counted twice. Whichever side progressed
 *   further wins; afterwards the store is authoritative and the state's
 *   working copy is overwritten from it. funds follows the same rule:
 *   the store side is seeded first (profile fundsStart) and then maxed
 *   with the legacy save's session-owned allowance, so a pre-funds
 *   save's accumulated balance is never lost nor doubled. */
function linkTrainerToStore(fallbackTrainerId: string) {
  if (!state) return;
  if (typeof state.trainerId !== "string" || !state.trainerId) {
    state.trainerId = fallbackTrainerId;
  }
  const prof = trainerProfiles.get(state.trainerId);
  if (prof && state.trainerLinked !== true) {
    // Legacy save (or first attach): the profile is the source of the
    // trainer's name / sex and of the sheet values that predated the
    // save (ejacMax / traits). Linked saves keep what they recorded.
    state.trainerName = prof.name;
    state.trainerSex = prof.sheet.sex;
    state.trainerEjacMax = prof.sheet.ejacMax;
    state.trainerTraits = [...prof.sheet.traits];
  }
  const tid = state.trainerId;
  const existed = trainerStore.trainers[tid];
  const rec = trainerRecordOf(tid); // materialises + seeds funds if needed
  if (state.trainerLinked !== true || !existed) {
    rec.trainerSkill = Math.max(rec.trainerSkill ?? 0, state.trainerSkill ?? 0);
    rec.fallenCount = Math.max(rec.fallenCount ?? 0, state.fallenCount ?? 0);
    rec.funds = Math.max(rec.funds ?? 0, state.allowance ?? 0);
    flushTrainerStore();
  }
  state.trainerSkill = rec.trainerSkill;
  state.fallenCount = rec.fallenCount;
  state.allowance = rec.funds ?? 0;
  state.trainerLinked = true;
}

/** 実行時差分だけを data/characters_added.json へ書く。配布辞書
 * characters.json 自体は決して書き換えない——殻の転送で辞書が差し
 * 替わっても、実行時に作ったエントリ（charcopy／poolgen／昇格した
 * 候補）は added 側に残り続ける。差分の定義:
 *  - 配布に無い id のレコードは丸ごと実行時所有。
 *  - 配布にある id は、registered が shipped 値から変わった時だけ
 *    上書きレコードとして持つ（poolregister の昇格）。
 *  - 配布にあって現在 Doc に無い id は tombstone（pooldelete）。 */
function persistChars() {
  const runtime: any[] = [];
  const present = new Set<string>();
  for (const c of charsDoc.characters) {
    present.add(c.id);
    if (!shippedIds.has(c.id)) { runtime.push(c); continue; }
    if ((c.registered === 0 ? 0 : 1) !== shippedRegistered.get(c.id)) runtime.push(c);
  }
  const deleted = [...shippedIds].filter((id) => !present.has(id));
  writeFileSync(
    join(dataDir, "characters_added.json"),
    JSON.stringify({ characters: runtime, deleted }, null, 2),
  );
}

/** キー順を吸収した正規化文字列（深い等値判定用）。charcopy の冪等判定
 * （リプレイで同じコピーを二度作らない）で使う。 */
function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** キャラ定義のうち「定義」に属する部分だけを深いコピーで取り出す
 * （状態・セーブ・候補プールの簿記は含めない）。charcopy の複製形。 */
function definitionCopyOf(src: any, id: string, name: string): any {
  const rec: any = {
    id,
    name,
    note: src.note ?? "",
    personality: src.personality ?? "sunao",
    traits: JSON.parse(JSON.stringify(src.traits ?? [])),
    initOverrides: JSON.parse(JSON.stringify(src.initOverrides ?? {})),
  };
  if (src.look) rec.look = JSON.parse(JSON.stringify(src.look));
  return rec;
}

function loadTraitMaster(): TraitMaster {
  try {
    return JSON.parse(readFileSync(join(dataDir, "trait_master.json"), "utf8"));
  } catch {
    return { traits: [] };
  }
}

function candidateSheet(rec: any) {
  const def = {
    init_overrides: rec.initOverrides ?? {},
    traits: (rec.traits ?? []).map((t: any) => ({ id: t.id, src_mult: t.src_mult, conv_mult: t.conv_mult })),
    personality: rec.personality ?? "sunao",
    look: rec.look ?? null,
  };
  const tmp = newGameState(rec.id, rec.name, rec.note ?? "", def);
  return {
    candidateId: rec.id,
    registered: rec.registered === 0 ? 0 : 1,
    seed: rec.candidate?.seed ?? null,
    name: rec.name,
    personality: rec.personality ?? "sunao",
    traitIds: (rec.traits ?? []).map((t: any) => t.id),
    excludedByFlag: rec.candidate?.excludedByFlag ?? [],
    look: rec.look ?? null,
    snapshot: snapshotOf(tmp),
  };
}
let state: any = null;

function statePath(id: string) {
  return join(charDir, `${id}.json`);
}
function persist() {
  if (!state) return;
  writeFileSync(statePath(state.characterId), JSON.stringify(state));
  syncTrainerToStore();
}

// Assemble the two narration bundles from a log slice. Engine log texts carry
// a trailing mark: ",1" = 地の文系 (kind text/event), ",3" = 後文系
// (kind summary/notice/day). The mark is stripped here.
function assemble(logSlice: any[]) {
  const one: string[] = [];
  const three: string[] = [];
  for (const e of logSlice) {
    if (typeof e?.text !== "string") continue;
    if (e.kind === "text" || e.kind === "event") one.push(e.text.replace(/,1$/, ""));
    else if (e.kind === "summary" || e.kind === "notice" || e.kind === "day") three.push(e.text.replace(/,3$/, ""));
  }
  return { narration1: one.join("\n"), narration3: three.join("\n") };
}

function commandList() {
  if (!state) return [];
  return visibleCommands(state).map((c: any) => ({
    id: c.id, label: c.label, category: c.category, unlocked: isUnlocked(state, c),
  }));
}

function view(logFrom: number) {
  const slice = state.log.slice(logFrom);
  const { narration1, narration3 } = assemble(slice);
  return {
    snapshot: snapshotOf(state),
    dialogue: state.dialogue,
    newLog: slice,
    narration1, narration3,
    commands: commandList(),
    day: state.day, phase: state.phase,
    slot: state.slot ?? 0, sessionSeq: state.sessionSeq ?? 1, collapsed: state.collapsed ?? false,
    finished: state.finished, ending: state.ending,
  };
}

// One JSONL record per op: {at, op, request fields, ok, reason?, position
// fields, newLog}. Keys are explicit so the play history (including the
// executed-command history) can be re-read mechanically later.
function appendOpLog(msg: any, out: any, logFrom: number) {
  if (!state) return;
  const rec: any = {
    at: new Date().toISOString(),
    op: msg.op,
    ok: out?.ok ?? false,
    trainerId: state.trainerId ?? "default",
    day: state.day, phase: state.phase,
    slot: state.slot ?? 0, sessionSeq: state.sessionSeq ?? 1,
    finished: state.finished,
    newLog: (state.log.slice(logFrom) as any[]).map((e) => ({
      id: e.id, at: e.at, kind: e.kind, text: e.text,
    })),
  };
  if (msg.trainerId !== undefined) rec.requestTrainerId = msg.trainerId;
  if (msg.command !== undefined) rec.commandId = msg.command;
  if (out?.commandId !== undefined) rec.executedCommandId = out.commandId;
  if (out?.derivedFrom) rec.derivedFrom = out.derivedFrom;
  if (msg.itemId !== undefined) rec.itemId = msg.itemId;
  if (msg.abilityId !== undefined) rec.abilityId = msg.abilityId;
  if (msg.juelChoice !== undefined) rec.juelChoice = msg.juelChoice;
  if (msg.choice !== undefined) rec.choice = msg.choice;
  if (out?.reason !== undefined) rec.reason = out.reason;
  // --- リプレイ用の記録拡張（セーブ＝初期シード＋opログ列 の確定に伴う） ---
  // 再生は「保存された rngSeed で新規 state を作り、op 列を順に流す」形。
  // そのために必要なリクエスト側の入力は、応答に現れない物も含めて
  // ここで落とさず残す（旧形式ログには無いので、再生側は欠落を前提に
  // フォールバックする）。
  if (msg.characterId !== undefined) rec.characterId = msg.characterId;
  if (msg.fresh !== undefined) rec.fresh = !!msg.fresh;
  if (msg.text !== undefined) rec.text = msg.text;
  if (msg.days !== undefined) rec.days = msg.days;
  if (msg.candidateId !== undefined) rec.candidateId = msg.candidateId;
  if (msg.newId !== undefined) rec.newId = msg.newId;
  if (msg.newName !== undefined) rec.newName = msg.newName;
  if (msg.op === "charcopy" && out?.ok) {
    // 解決済みの新しい id。再生側はこれを明示 id として作り直す（自動
    // 付番の結果が再生環境の辞書状態に左右されないようにするため）。
    rec.copiedId = out.characterId;
  }
  if (msg.traitId !== undefined) rec.traitId = msg.traitId;
  if (msg.random !== undefined) rec.random = msg.random ? 1 : 0;
  if (msg.seed !== undefined) rec.requestSeed = msg.seed;
  if (msg.count !== undefined) rec.count = msg.count;
  if (msg.op === "start" && out?.ok) {
    // 起点の再構成情報: 再生側はこの rngSeed で新規 state を作る。
    // rngSeed はセッション（セーブ）側の値で、キャラ定義には置かない。
    rec.rngSeed = state.rngSeed;
    if (!out.resumed) {
      // 新規開始時の調教主ハイドレーション結果。再生側はトレーナー
      // ストアをこの値で種付けしてから開始を再現する（開始前購入など
      // ログ外で起きたストア変更も、この一点に集約される）。
      rec.trainerStart = {
        trainerSkill: state.trainerSkill ?? 0,
        fallenCount: state.fallenCount ?? 0,
        funds: state.allowance ?? 0,
      };
    }
  }
  if (msg.op === "poolgen" && out?.ok) {
    rec.generatedSeeds = (out.candidates ?? []).map((c: any) => c.seed);
  }
  try {
    appendFileSync(join(logDir, `${state.characterId}.jsonl`), JSON.stringify(rec) + "\n");
  } catch { /* logging must never break a hand */ }
}

function handle(msg: any): any {
  const logFrom = state ? state.log.length : 0;
  let out: any;
  switch (msg.op) {
    case "trainers": {
      out = {
        ok: true,
        trainers: [...trainerProfiles.values()].map((prof) => {
          const rec = trainerRecordOf(prof.id);
          return {
            id: prof.id, name: prof.name, sex: prof.sheet.sex, note: prof.note ?? "",
            skillStart: prof.sheet.skill,
            fundsStart: prof.fundsStart ?? TRAINER_FUNDS_SEED,
            traits: [...prof.sheet.traits],
            sheet: {
              sex: prof.sheet.sex, skill: prof.sheet.skill,
              ejacMax: prof.sheet.ejacMax, traits: [...prof.sheet.traits],
            },
            trainerSkill: rec.trainerSkill,
            fallenCount: rec.fallenCount,
            funds: rec.funds ?? 0,
            // 開始前購入（ITEM:52）の可否。殻の開始エリアが使う。
            skillShop: trainerSkillShopInfo(rec.trainerSkill, rec.fallenCount, rec.funds ?? 0),
          };
        }),
      };
      break;
    }
    case "buytrainerskill": {
      // 開始前購入: セッション無しで ITEM:52【技巧Lv】を調教主残高から
      // 買う。可否規則はメニュー購入と共通（trainerSkillShopInfo）。
      // 購入はストアへ直接効き、進行中セッションが同じ調教主なら
      // 作業コピー（trainerSkill / allowance）も合わせて保存する。
      const tid = typeof msg.trainerId === "string" && msg.trainerId ? msg.trainerId : "default";
      const prof = trainerProfiles.get(tid);
      if (!prof) { out = { ok: false, reason: `unknown trainer: ${tid}` }; break; }
      const rec = trainerRecordOf(tid);
      const info = trainerSkillShopInfo(rec.trainerSkill, rec.fallenCount, rec.funds ?? 0);
      if (!info.canBuy) {
        out = {
          ok: false, reason: info.reason, trainerId: tid,
          trainerSkill: rec.trainerSkill, fallenCount: rec.fallenCount,
          funds: rec.funds ?? 0, price: info.price,
        };
        break;
      }
      rec.funds = (rec.funds ?? 0) - info.price;
      rec.trainerSkill += 1;
      flushTrainerStore();
      if (state && state.trainerId === tid) {
        state.trainerSkill = rec.trainerSkill;
        state.allowance = rec.funds;
        persist();
      }
      out = {
        ok: true, trainerId: tid, trainerName: prof.name,
        trainerSkill: rec.trainerSkill, fallenCount: rec.fallenCount,
        funds: rec.funds, price: info.price,
        message: `【購入】技巧Lv → 調教者の技巧Lv ${rec.trainerSkill}（お小遣い残高 ${rec.funds}）`,
      };
      break;
    }
    case "start": {
      const c = charDefs.get(msg.characterId);
      if (!c) {
        // セーブだけ残って定義が無い状態は「知らないキャラ」と区別する
        // （辞書側の欠落で開始できないケースの切り分け用）。
        const orphanSave = typeof msg.characterId === "string"
          && existsSync(statePath(msg.characterId));
        out = poolDefs.has(msg.characterId)
          ? { ok: false, reason: `candidate not registered: ${msg.characterId} (poolregister が必要)` }
          : {
              ok: false,
              reason: orphanSave
                ? `unknown character: ${msg.characterId}（セーブは存在しますが定義がありません）`
                : `unknown character: ${msg.characterId}`,
            };
        break;
      }
      // 調教主の指定（任意）。未知の id は明示エラーにする。未指定は default。
      const wantTrainer = typeof msg.trainerId === "string" && msg.trainerId ? msg.trainerId : null;
      if (wantTrainer && !trainerProfiles.has(wantTrainer)) {
        out = { ok: false, reason: `unknown trainer: ${wantTrainer}` };
        break;
      }
      const p = statePath(c.id);
      if (!msg.fresh && existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        // 再開時はセーブに記録された調教主が正（開始リクエストの指定では
        // 差し替わらない）。旧形式セーブには trainerId 自体が無い
        // （normalizeState が "default" で補完してしまうため、生データで
        // 判定する）ので、その場合だけリクエスト側（無ければ default）
        // の調教主へ移行する。
        const hadTrainer = typeof raw?.trainerId === "string" && !!raw.trainerId;
        state = normalizeState(raw);
        if (!hadTrainer) state.trainerId = wantTrainer ?? "default";
        linkTrainerToStore(state.trainerId);
        persist();
        out = { ok: true, resumed: true, ...view(0) };
        break;
      }
      const tid = wantTrainer ?? "default";
      const prof = trainerProfiles.get(tid) ?? DEFAULT_TRAINER;
      const trec = trainerRecordOf(tid);
      const def = {
        init_overrides: c.initOverrides ?? {},
        traits: (c.traits ?? []).map((t: any) => ({ id: t.id, src_mult: t.src_mult, conv_mult: t.conv_mult })),
        personality: c.personality ?? "sunao",
        look: c.look ?? null,
      };
      state = newGameState(c.id, c.name, c.note ?? "", def, {
        id: tid, name: prof.name, sex: prof.sheet.sex,
        skill: trec.trainerSkill,
        fallen: trec.fallenCount,
        funds: trec.funds ?? 0,
        ejacMax: prof.sheet.ejacMax,
        traits: prof.sheet.traits,
      });
      if (Number.isInteger(msg.seed)) { state.rngSeed = msg.seed; state.rngRolls = 0; }
      persist();
      out = { ok: true, resumed: false, ...view(0) };
      break;
    }
    case "execute": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = executeCommand(state, msg.command, narration, kojo);
      persist();
      out = { ...r, ...view(logFrom) };
      break;
    }
    case "end": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = endSession(state);
      persist();
      out = { ...r, ...view(logFrom) };
      break;
    }
    case "buy": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = purchaseInMenu(state, msg.abilityId, msg.juelChoice);
      persist();
      out = { ...r, ...view(logFrom) };
      break;
    }
    case "buyitem": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = purchaseItem(state, Number(msg.itemId));
      persist();
      out = { ok: r.ok, reason: r.ok ? undefined : r.message, message: r.message, ...view(logFrom) };
      break;
    }
    case "poolgen": {
      const count = Math.max(1, Math.min(20, Number(msg.count ?? 3)));
      const baseSeed = Number.isInteger(msg.seed) ? msg.seed : Math.floor(Math.random() * 1_000_000_000);
      const grammar = JSON.parse(readFileSync(join(dataDir, "charroll.json"), "utf8"));
      const traitsDoc = JSON.parse(readFileSync(join(dataDir, "traits.json"), "utf8"));
      const master = loadTraitMaster();
      const sheets: any[] = [];
      for (let i = 0; i < count; i++) {
        const seed = baseSeed + i;
        const rolled = generateCandidate(seed, grammar, traitsDoc, master);
        let cid = `cand_${seed}`;
        let n = 2;
        while (charDefs.has(cid) || poolDefs.has(cid)) cid = `cand_${seed}_${n++}`;
        const rec: any = {
          id: cid, registered: 0,
          name: rolled.name,
          note: "ランダム候補（プール）",
          personality: rolled.personality,
          traits: rolled.traits,
          initOverrides: rolled.initOverrides,
          look: rolled.look,
          candidate: { seed, excludedByFlag: rolled.excludedByFlag },
        };
        charsDoc.characters.push(rec);
        poolDefs.set(cid, rec);
        sheets.push(candidateSheet(rec));
      }
      persistChars();
      out = { ok: true, generated: sheets.length, candidates: sheets };
      break;
    }
    case "pool": {
      out = { ok: true, candidates: [...poolDefs.values()].map((r: any) => candidateSheet(r)) };
      break;
    }
    case "poolshow": {
      const rec = poolDefs.get(msg.candidateId) ?? charDefs.get(msg.candidateId);
      if (!rec) { out = { ok: false, reason: `unknown candidate: ${msg.candidateId}` }; break; }
      out = { ok: true, candidate: candidateSheet(rec) };
      break;
    }
    case "pooldelete": {
      const rec = poolDefs.get(msg.candidateId);
      if (!rec) { out = { ok: false, reason: `not an unregistered candidate: ${msg.candidateId}` }; break; }
      charsDoc.characters = charsDoc.characters.filter((c: any) => c.id !== msg.candidateId);
      poolDefs.delete(msg.candidateId);
      persistChars();
      out = { ok: true, deleted: msg.candidateId };
      break;
    }
    case "poolregister": {
      const rec = poolDefs.get(msg.candidateId);
      if (!rec) { out = { ok: false, reason: `not an unregistered candidate: ${msg.candidateId}` }; break; }
      rec.registered = 1; // データはそのまま、フラグだけ反転して正式登録
      poolDefs.delete(msg.candidateId);
      charDefs.set(msg.candidateId, rec);
      persistChars();
      out = { ok: true, registered: msg.candidateId, candidate: candidateSheet(rec) };
      break;
    }
    case "charcopy": {
      // 名前を付けて新規: 既存キャラの「定義」だけを複製して新しい
      // エントリを立てる。状態（セーブ）は複製しない——新しいエントリ
      // にはセーブが無く、そのまま新規開始できる。元キャラのセーブは
      // 一切触らない（従来の新規＝破棄とは別の導線）。
      const src = charDefs.get(msg.characterId);
      if (!src) {
        out = poolDefs.has(msg.characterId)
          ? { ok: false, reason: `candidate not registered: ${msg.characterId}（候補は先に poolregister してください）` }
          : { ok: false, reason: `unknown character: ${msg.characterId}` };
        break;
      }
      const wantName = typeof msg.newName === "string" && msg.newName.trim() ? msg.newName : null;
      let newId: string | null = null;
      let autoN: number | null = null;
      if (typeof msg.newId === "string" && msg.newId) {
        // 明示 id: セーブファイル名になるため安全な文字だけを許す。
        if (!/^[A-Za-z0-9_-]+$/.test(msg.newId)) {
          out = { ok: false, reason: `invalid id: ${msg.newId}` };
          break;
        }
        newId = msg.newId;
      } else {
        // 自動付番: <元id>_<n>（n は 2 から）。定義・候補・既存セーブの
        // どれとも重ならない最初の番号を使う。
        let n = 2;
        while (charDefs.has(`${src.id}_${n}`) || poolDefs.has(`${src.id}_${n}`)
          || existsSync(statePath(`${src.id}_${n}`))) n++;
        autoN = n;
        newId = `${src.id}_${n}`;
      }
      const name = wantName ?? (() => {
        if (autoN !== null) return `${src.name}（${autoN}）`;
        const m = /_(\d+)$/.exec(newId!);
        return m ? `${src.name}（${m[1]}）` : `${src.name}（コピー）`;
      })();
      const rec = definitionCopyOf(src, newId, name);
      if (poolDefs.has(newId)) {
        out = { ok: false, reason: `id already in use: ${newId}` };
        break;
      }
      const existing = charDefs.get(newId);
      if (existing) {
        // 冪等判定: 同じ定義のコピーが既にあるなら成功扱いにする
        // （リプレイでは起点データにコピーが含まれているため、二度目
        // の作成が軌跡の不一致にならないように）。中身の違う同名 id は
        // 本物の衝突として失敗させる。
        const existingProj = definitionCopyOf(existing, newId, existing.name);
        if (canonicalJson(existingProj) === canonicalJson(rec)) {
          out = { ok: true, characterId: newId, sourceId: src.id, name: existing.name, alreadyExisted: true };
        } else {
          out = { ok: false, reason: `id already in use: ${newId}` };
        }
        break;
      }
      if (existsSync(statePath(newId))) {
        out = { ok: false, reason: `id already in use (orphan save exists): ${newId}` };
        break;
      }
      charsDoc.characters.push(rec);
      charDefs.set(newId, rec);
      persistChars();
      out = { ok: true, characterId: newId, sourceId: src.id, name };
      break;
    }
    case "traitflags": {
      out = { ok: true, master: loadTraitMaster() };
      break;
    }
    case "settraitflag": {
      const master = loadTraitMaster();
      const entry = (master.traits ?? []).find((t: any) => t.id === msg.traitId);
      if (!entry) { out = { ok: false, reason: `unknown trait: ${msg.traitId}` }; break; }
      entry.random = msg.random ? 1 : 0;
      writeFileSync(join(dataDir, "trait_master.json"), JSON.stringify(master, null, 2));
      out = { ok: true, traitId: entry.id, random: entry.random };
      break;
    }
    case "next":
    case "nextday": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = proceedToNextSession(state, kojo);
      persist();
      out = { ...r, ...view(logFrom) };
      break;
    }
    case "ending": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = resolveEnding(state, msg.choice, kojo);
      persist();
      out = { ...r, ...view(logFrom) };
      break;
    }
    case "extend": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      const r = extendPeriod(state, msg.days ?? 14);
      persist();
      out = { ...r, ...view(logFrom) };
      break;
    }
    case "setdialogue": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      state.dialogue = String(msg.text ?? "");
      persist();
      out = { ok: true, ...view(logFrom) };
      break;
    }
    case "getstate": {
      if (!state) { out = { ok: false, reason: "no session" }; break; }
      out = { ok: true, ...view(0) };
      break;
    }
    default:
      out = { ok: false, reason: `unknown op: ${msg.op}` };
  }
  appendOpLog(msg, out, state ? logFrom : 0);
  return out;
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t) return;
  let out: any;
  try { out = handle(JSON.parse(t)); } catch (e: any) { out = { ok: false, reason: String(e?.message ?? e) }; }
  process.stdout.write(JSON.stringify(out) + "\n");
});
