// eraMuse 汎用リプレイヤー（セーブ＝初期シード＋opログ列 の再生側）。
//
// 使い方:
//   bun src/replay.ts --home <元のホーム> --log <logs/xxx.jsonl> --work <再生ホーム>
//   --home  ログが生成されたホーム（data/ をコピーし、最終セーブと
//           旧形式ログ用のシード控えを読む）
//   --log   再生するオペレーションログ（logs/<characterId>.jsonl）
//   --work  再生先ホーム（新規作成。中身がある場合はエラー）
//
// 形: ログの start レコードに残された rngSeed（無ければ元セーブの
// rngSeed）で新規 state を作り、記録された op 列を本番 CLI
// （src/cli.ts）へ順に流し込む。各 op の応答（ok / 実行コマンド＝
// 派生結果 / 位置フィールド）を記録と照合し、最後に元セーブと
// 再生セーブの正規化ハッシュ・スナップショットを比較する。
// 判定 JSON を stdout に出す（exit 0 = 一致、1 = 不一致・失敗）。
//
// RNG の置き場（設計判断）: rngSeed / rngRolls はセッション（セーブ）
// 側の値であり、キャラ定義（data/characters.json）には置かない。
// 同一キャラの複数セーブ・分岐がそれぞれ独立に (seed, rolls) を
// 持てるため競合せず、再生検証は start レコードの seed と最終
// rolls＋ハッシュ照合で閉じる。詳細は README「セーブ方式」参照。
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { normalizeState, snapshotOf } from "./engine.ts";

// ---------------------------------------------------------------- 型

export interface ReplayMismatch {
  index: number;
  op: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface ReplayVerdict {
  ok: boolean;
  logFile: string;
  characterId: string;
  records: number;
  fedOps: number;
  mismatches: ReplayMismatch[];
  warnings: string[];
  final: {
    snapshotEqual: boolean;
    stateEqual: boolean;
    trainerRecordEqual: boolean;
    sourceHash: string;
    replayHash: string;
    rngSeed: number | null;
    rngRollsSource: number | null;
    rngRollsReplay: number | null;
    diffPaths: string[];
  };
}

// ---------------------------------------------------------------- ログ→リクエスト再構成

/** 1レコードから、元の op リクエスト（JSON メッセージ）を再構成する。
 * 記録されていないフィールドは「送らない」が原則（ハンドラの既定が
 * 原セッションと同じに効く）。欠落が再生を壊し得る場合は warnings に
 * 積む（呼び出し側で record 単位の文脈を付ける）。 */
export function reconstructMessage(
  rec: any,
  ctx: { characterId: string; replaySaveExists: boolean; fallbackSeed: number | null },
  warnings: string[],
): any | null {
  switch (rec.op) {
    case "start": {
      const msg: any = { op: "start", characterId: rec.characterId ?? ctx.characterId };
      const isFresh = rec.fresh === true || (rec.fresh === undefined && !ctx.replaySaveExists);
      if (isFresh) {
        msg.fresh = true;
        if (rec.requestTrainerId !== undefined) msg.trainerId = rec.requestTrainerId;
        else if (rec.trainerId !== undefined) msg.trainerId = rec.trainerId;
        const seed = typeof rec.rngSeed === "number" ? rec.rngSeed
          : typeof rec.requestSeed === "number" ? rec.requestSeed
          : ctx.fallbackSeed;
        if (typeof seed === "number") msg.seed = seed;
        else warnings.push("start: rngSeed がログにも元セーブにも無く、起点を再現できない");
      } else if (rec.requestTrainerId !== undefined) {
        msg.trainerId = rec.requestTrainerId;
      }
      return msg;
    }
    case "execute":
      if (typeof rec.commandId !== "string") {
        warnings.push("execute: commandId が記録されておらず再生できない");
        return null;
      }
      return { op: "execute", command: rec.commandId };
    case "end": return { op: "end" };
    case "buy": {
      const msg: any = { op: "buy", abilityId: rec.abilityId };
      if (rec.juelChoice !== undefined) msg.juelChoice = rec.juelChoice;
      return msg;
    }
    case "buyitem": return { op: "buyitem", itemId: rec.itemId };
    case "next": return { op: "next" };
    case "nextday": return { op: "nextday" };
    case "extend": {
      const msg: any = { op: "extend" };
      if (typeof rec.days === "number") msg.days = rec.days;
      return msg;
    }
    case "ending": return { op: "ending", choice: rec.choice };
    case "setdialogue": {
      if (rec.text === undefined) {
        warnings.push("setdialogue: text が記録されていない旧形式ログ（dialogue は空で再生する）");
      }
      return { op: "setdialogue", text: rec.text ?? "" };
    }
    case "buytrainerskill":
      return { op: "buytrainerskill", trainerId: rec.requestTrainerId ?? rec.trainerId ?? "default" };
    case "poolgen": {
      const msg: any = { op: "poolgen" };
      const seeds: number[] = Array.isArray(rec.generatedSeeds) ? rec.generatedSeeds : [];
      if (typeof rec.requestSeed === "number") msg.seed = rec.requestSeed;
      else if (seeds.length > 0) msg.seed = seeds[0];
      else warnings.push("poolgen: シードが記録されておらず、候補の再現は保証されない");
      if (typeof rec.count === "number") msg.count = rec.count;
      else if (seeds.length > 0) msg.count = seeds.length;
      return msg;
    }
    case "poolregister":
    case "pooldelete":
    case "poolshow": {
      if (rec.candidateId === undefined) {
        warnings.push(`${rec.op}: candidateId が記録されていない旧形式ログ`);
        return null;
      }
      return { op: rec.op, candidateId: rec.candidateId };
    }
    case "settraitflag": {
      if (rec.traitId === undefined) {
        warnings.push("settraitflag: traitId が記録されていない旧形式ログ");
        return null;
      }
      return { op: "settraitflag", traitId: rec.traitId, random: rec.random ? 1 : 0 };
    }
    case "trainers": return { op: "trainers" };
    case "getstate": return { op: "getstate" };
    case "pool": return { op: "pool" };
    case "traitflags": return { op: "traitflags" };
    default:
      warnings.push(`未知の op: ${rec.op}（読み飛ばす）`);
      return null;
  }
}

// ---------------------------------------------------------------- 正規化・ハッシュ

/** セーブ JSON の正規化: 時刻だけを潰し（createdAt とログエントリの
 * at は生成時刻で、状態の正味ではない）、キーを再帰的にソートして
 * 安定文字列化する。これ同士の一致が「状態の正味の一致」。 */
export function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value).sort()) {
      if (k === "createdAt" || k === "at") { out[k] = 0; continue; }
      out[k] = canonicalize(value[k]);
    }
    return out;
  }
  return value;
}

export function canonicalHash(save: any): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(save))).digest("hex");
}

/** 正規化済み同士の深い差分（葉パスの列挙、上限あり）。 */
export function diffPaths(a: any, b: any, path = "", acc: string[] = [], limit = 30): string[] {
  if (acc.length >= limit) return acc;
  if (JSON.stringify(a) === JSON.stringify(b)) return acc;
  const aObj = a && typeof a === "object";
  const bObj = b && typeof b === "object";
  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
    acc.push(`${path || "(root)"}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return acc;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (acc.length >= limit) break;
    diffPaths(a[k], b[k], path ? `${path}.${k}` : k, acc, limit);
  }
  return acc;
}

// ---------------------------------------------------------------- CLI ドライバ

export class EngineProcess {
  private proc: ChildProcessWithoutNullStreams;
  private lines: string[] = [];
  private waiters: ((line: string) => void)[] = [];

  constructor(cliPath: string, homeDir: string) {
    this.proc = spawn("bun", [cliPath, "--home", homeDir], { stdio: ["pipe", "pipe", "pipe"] });
    const rl = createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      const w = this.waiters.shift();
      if (w) w(line);
      else this.lines.push(line);
    });
    this.proc.stderr.on("data", (d) => process.stderr.write(`[engine] ${d}`));
  }

  send(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const take = (line: string) => {
        try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
      };
      const queued = this.lines.shift();
      if (queued !== undefined) { take(queued); return; }
      this.waiters.push(take);
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  close() {
    try { this.proc.stdin.end(); } catch { /* already closed */ }
    try { this.proc.kill(); } catch { /* already dead */ }
  }
}

// ---------------------------------------------------------------- 再生本体

export interface ReplayOptions {
  sourceHome: string;
  logPath: string;
  workHome: string;
  cliPath?: string;
}

export async function replayLog(opts: ReplayOptions): Promise<ReplayVerdict> {
  const { sourceHome, logPath, workHome } = opts;
  const cliPath = opts.cliPath ?? join(dirname(fileURLToPath(import.meta.url)), "cli.ts");
  const warnings: string[] = [];
  const mismatches: ReplayMismatch[] = [];

  const records: any[] = readFileSync(logPath, "utf8")
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const characterId = records.find((r) => r.characterId)?.characterId
    ?? basename(logPath).replace(/\.jsonl$/, "");

  // 元セーブ（最終状態の正）と、旧形式ログ用のシード控え。
  const sourceSavePath = join(sourceHome, "characters", `${characterId}.json`);
  const sourceSave = existsSync(sourceSavePath)
    ? JSON.parse(readFileSync(sourceSavePath, "utf8")) : null;
  if (!sourceSave) warnings.push("元セーブが無く、最終比較はスナップショットのみになる");
  const fallbackSeed = typeof sourceSave?.rngSeed === "number" ? sourceSave.rngSeed : null;

  // 再生ホームの準備: 辞書は元ホームからコピー、セーブとログは空。
  // トレーナーストアは start レコードの trainerStart で種付けする
  // （開始前購入などログ外のストア変更を起点に集約するため）。
  if (existsSync(workHome) && readdirSync(workHome).length > 0) {
    throw new Error(`再生ホームが空ではない: ${workHome}`);
  }
  mkdirSync(join(workHome, "data"), { recursive: true });
  mkdirSync(join(workHome, "characters"), { recursive: true });
  mkdirSync(join(workHome, "logs"), { recursive: true });
  for (const f of readdirSync(join(sourceHome, "data"))) {
    copyFileSync(join(sourceHome, "data", f), join(workHome, "data", f));
  }
  const firstStart = records.find((r) => r.op === "start" && r.ok);
  if (firstStart?.trainerStart && firstStart.trainerId) {
    const ts = {
      trainers: {
        [firstStart.trainerId]: {
          trainerSkill: firstStart.trainerStart.trainerSkill ?? 0,
          fallenCount: firstStart.trainerStart.fallenCount ?? 0,
          funds: firstStart.trainerStart.funds ?? 0,
        },
      },
    };
    writeFileSync(join(workHome, "trainers_state.json"), JSON.stringify(ts, null, 2));
  }

  const engine = new EngineProcess(cliPath, workHome);
  let fedOps = 0;
  try {
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const replaySaveExists = existsSync(join(workHome, "characters", `${characterId}.json`));
      const msg = reconstructMessage(rec, { characterId, replaySaveExists, fallbackSeed }, warnings);
      if (!msg) continue;
      const resp = await engine.send(msg);
      fedOps++;
      // --- 軌跡照合 ---
      if ((resp?.ok ?? false) !== (rec.ok ?? false)) {
        mismatches.push({ index: i, op: rec.op, field: "ok", expected: rec.ok, actual: resp?.ok });
      }
      if (rec.op === "execute" && rec.ok) {
        if (rec.executedCommandId !== undefined && resp?.commandId !== rec.executedCommandId) {
          mismatches.push({
            index: i, op: rec.op, field: "executedCommandId",
            expected: rec.executedCommandId, actual: resp?.commandId ?? null,
          });
        }
        const derivedExpected = rec.derivedFrom ?? null;
        const derivedActual = resp?.derivedFrom ?? null;
        if (derivedExpected !== derivedActual) {
          mismatches.push({
            index: i, op: rec.op, field: "derivedFrom",
            expected: derivedExpected, actual: derivedActual,
          });
        }
      }
      // 位置フィールド（view を返す op のみ応答に含まれる）
      for (const f of ["day", "phase", "slot", "sessionSeq", "finished"] as const) {
        if (resp && f in resp && rec[f] !== undefined && resp[f] !== rec[f]) {
          mismatches.push({ index: i, op: rec.op, field: f, expected: rec[f], actual: resp[f] });
        }
      }
    }

    // --- 最終比較 ---
    const finalResp = await engine.send({ op: "getstate" });
    const replaySavePath = join(workHome, "characters", `${characterId}.json`);
    const replaySave = existsSync(replaySavePath)
      ? JSON.parse(readFileSync(replaySavePath, "utf8")) : null;

    let snapshotEqual = false;
    if (sourceSave && finalResp?.snapshot) {
      const sourceSnapshot = snapshotOf(normalizeState(JSON.parse(JSON.stringify(sourceSave))));
      snapshotEqual = JSON.stringify(canonicalize(sourceSnapshot))
        === JSON.stringify(canonicalize(finalResp.snapshot));
    }
    const sourceHash = sourceSave ? canonicalHash(sourceSave) : "";
    const replayHash = replaySave ? canonicalHash(replaySave) : "";
    const stateEqual = !!sourceSave && !!replaySave && sourceHash === replayHash;
    const diffs = stateEqual || !sourceSave || !replaySave ? []
      : diffPaths(canonicalize(sourceSave), canonicalize(replaySave));

    // 調教主レコード（このセッションの調教主分のみ）の一致
    let trainerRecordEqual = false;
    const tid = firstStart?.trainerId ?? sourceSave?.trainerId ?? "default";
    try {
      const srcStore = JSON.parse(readFileSync(join(sourceHome, "trainers_state.json"), "utf8"));
      const repStore = JSON.parse(readFileSync(join(workHome, "trainers_state.json"), "utf8"));
      trainerRecordEqual = JSON.stringify(canonicalize(srcStore.trainers?.[tid] ?? null))
        === JSON.stringify(canonicalize(repStore.trainers?.[tid] ?? null));
    } catch { /* ストアが無いホームでは比較対象なし */ }

    return {
      ok: mismatches.length === 0 && snapshotEqual && stateEqual,
      logFile: logPath,
      characterId,
      records: records.length,
      fedOps,
      mismatches,
      warnings,
      final: {
        snapshotEqual, stateEqual, trainerRecordEqual,
        sourceHash, replayHash,
        rngSeed: typeof sourceSave?.rngSeed === "number" ? sourceSave.rngSeed : null,
        rngRollsSource: typeof sourceSave?.rngRolls === "number" ? sourceSave.rngRolls : null,
        rngRollsReplay: typeof replaySave?.rngRolls === "number" ? replaySave.rngRolls : null,
        diffPaths: diffs,
      },
    };
  } finally {
    engine.close();
  }
}

// ---------------------------------------------------------------- CLI 入口

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceHome = arg("--home");
  const logPath = arg("--log");
  const workHome = arg("--work");
  if (!sourceHome || !logPath || !workHome) {
    process.stderr.write("usage: bun src/replay.ts --home <sourceHome> --log <logPath> --work <replayHome>\n");
    process.exit(2);
  }
  const verdict = await replayLog({ sourceHome, logPath, workHome });
  process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
  process.exit(verdict.ok ? 0 : 1);
}

if (import.meta.main) {
  main().catch((e) => {
    process.stderr.write(`replay failed: ${e?.stack ?? e}\n`);
    process.exit(1);
  });
}
