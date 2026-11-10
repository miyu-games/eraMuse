// eraMuse リプレイヤーのテスト（bun test）。
// 単体: ログ→リクエスト再構成、正規化・差分。
// 統合: 本番 CLI で実セッションを1本通し（開始前購入・派生・購入・
// setdialogue・期間終了・延長・ending まで）、生成された実ログを
// リプレイヤーで再生して最終状態の一致を assert する。
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  reconstructMessage, canonicalize, canonicalHash, diffPaths,
  replayLog, EngineProcess,
} from "./replay.ts";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_HOME = dirname(SRC_DIR);

describe("reconstructMessage", () => {
  const ctx = { characterId: "base", replaySaveExists: false, fallbackSeed: 4242 };

  test("start（新規）は rngSeed と調教主を拾う", () => {
    const w: string[] = [];
    const msg = reconstructMessage(
      { op: "start", ok: true, characterId: "base", trainerId: "myu", rngSeed: 777 }, ctx, w);
    expect(msg).toEqual({ op: "start", characterId: "base", fresh: true, trainerId: "myu", seed: 777 });
    expect(w).toEqual([]);
  });

  test("start（旧形式・シード無し）は元セーブの控えに落ちる", () => {
    const w: string[] = [];
    const msg = reconstructMessage({ op: "start", ok: true, trainerId: "default" }, ctx, w);
    expect(msg.seed).toBe(4242);
    expect(msg.fresh).toBe(true);
  });

  test("start（再開）は fresh を付けない", () => {
    const w: string[] = [];
    const msg = reconstructMessage(
      { op: "start", ok: true, characterId: "base", fresh: false },
      { ...ctx, replaySaveExists: true }, w);
    expect(msg.fresh).toBeUndefined();
    expect(msg.seed).toBeUndefined();
  });

  test("execute / buy / extend / setdialogue の再構成", () => {
    const w: string[] = [];
    expect(reconstructMessage({ op: "execute", commandId: "sex_v" }, ctx, w))
      .toEqual({ op: "execute", command: "sex_v" });
    expect(reconstructMessage({ op: "buy", abilityId: "sense_c", juelChoice: "lust" }, ctx, w))
      .toEqual({ op: "buy", abilityId: "sense_c", juelChoice: "lust" });
    expect(reconstructMessage({ op: "extend", days: 7 }, ctx, w))
      .toEqual({ op: "extend", days: 7 });
    expect(reconstructMessage({ op: "setdialogue", text: "あ" }, ctx, w))
      .toEqual({ op: "setdialogue", text: "あ" });
  });

  test("charcopy は解決済み id（copiedId）を明示 id として再構成する", () => {
    const w: string[] = [];
    expect(reconstructMessage(
      { op: "charcopy", characterId: "base", copiedId: "base_2", newName: "素体タイプ（2）" }, ctx, w))
      .toEqual({ op: "charcopy", characterId: "base", newId: "base_2", newName: "素体タイプ（2）" });
    expect(w).toEqual([]);
    // copiedId が無い旧形式は要求時の newId に落ちる
    expect(reconstructMessage({ op: "charcopy", characterId: "base", newId: "base_x" }, ctx, w))
      .toEqual({ op: "charcopy", characterId: "base", newId: "base_x" });
  });

  test("setdialogue の本文が無い旧形式は警告して空で再生する", () => {
    const w: string[] = [];
    const msg = reconstructMessage({ op: "setdialogue" }, ctx, w);
    expect(msg.text).toBe("");
    expect(w.length).toBe(1);
  });

  test("commandId の無い execute は再生不能として null", () => {
    const w: string[] = [];
    expect(reconstructMessage({ op: "execute" }, ctx, w)).toBeNull();
    expect(w.length).toBe(1);
  });
});

describe("canonicalize / diffPaths", () => {
  test("キー順を吸収し、時刻フィールドを潰す", () => {
    const a = { b: 1, a: { createdAt: 111, x: [{ at: 5, t: "s" }] } };
    const b = { a: { x: [{ t: "s", at: 999 }], createdAt: 222 }, b: 1 };
    expect(canonicalHash(a)).toBe(canonicalHash(b));
  });

  test("値の違いはハッシュが変わり、差分パスに出る", () => {
    const a = { params: { trust: 10 } };
    const b = { params: { trust: 11 } };
    expect(canonicalHash(a)).not.toBe(canonicalHash(b));
    const d = diffPaths(canonicalize(a), canonicalize(b));
    expect(d.length).toBe(1);
    expect(d[0]).toContain("params.trust");
  });
});

describe("統合: 実セッションの再生", () => {
  test("開始前購入→派生→購入→延長→ending のログが完全再生できる", async () => {
    const root = mkdtempSync(join(tmpdir(), "eramuse-replay-"));
    const srcHome = join(root, "src_home");
    const workHome = join(root, "replay_home");
    mkdirSync(join(srcHome, "data"), { recursive: true });
    mkdirSync(join(srcHome, "characters"), { recursive: true });
    mkdirSync(join(srcHome, "logs"), { recursive: true });
    for (const f of readdirSync(join(ENGINE_HOME, "data"))) {
      copyFileSync(join(ENGINE_HOME, "data", f), join(srcHome, "data", f));
    }

    const eng = new EngineProcess(join(SRC_DIR, "cli.ts"), srcHome);
    try {
      for (let i = 0; i < 3; i++) {
        const r = await eng.send({ op: "buytrainerskill", trainerId: "default" });
        expect(r.ok).toBe(true);
      }
      let r = await eng.send({ op: "start", characterId: "base", trainerId: "default", fresh: true });
      expect(r.ok).toBe(true);
      expect(r.snapshot.trainerSkill).toBe(3);

      for (const c of ["talk", "caress", "breast_caress", "cunni", "com40"]) {
        await eng.send({ op: "execute", command: c });
      }
      await eng.send({ op: "setdialogue", text: "「……っ、もう、やめ……」" });
      r = await eng.send({ op: "end" });
      expect(r.ok).toBe(true);
      // ペニスバンド（派生の装備前提）と安い器具を買う
      await eng.send({ op: "buyitem", itemId: 4 });
      await eng.send({ op: "buyitem", itemId: 0 });
      await eng.send({ op: "buy", abilityId: "abl_desire" });
      r = await eng.send({ op: "next" });
      expect(r.ok).toBe(true);

      // 挿入系の連続で派生（com120）を踏む
      let derived = 0;
      for (const c of ["sex_v", "sex_v", "sex_v", "com21", "com21"]) {
        const rr = await eng.send({ op: "execute", command: c });
        if (rr.derivedFrom) derived++;
      }
      expect(derived).toBeGreaterThan(0);

      r = await eng.send({ op: "end" });
      r = await eng.send({ op: "next" });
      let guard = 0;
      while (!r.finished && guard++ < 60) {
        r = await eng.send(r.phase === "play" ? { op: "end" } : { op: "next" });
      }
      expect(r.finished).toBe(true);
      r = await eng.send({ op: "extend", days: 3 });
      expect(r.ok).toBe(true);
      await eng.send({ op: "execute", command: "talk" });
      guard = 0;
      while (!r.finished && guard++ < 20) {
        r = await eng.send(r.phase === "play" ? { op: "end" } : { op: "next" });
      }
      expect(r.finished).toBe(true);
      r = await eng.send({ op: "ending", choice: "keep" });
      expect(r.ok).toBe(true);
    } finally {
      eng.close();
    }

    const logPath = join(srcHome, "logs", "base.jsonl");
    expect(existsSync(logPath)).toBe(true);
    const recordCount = readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim()).length;
    expect(recordCount).toBeGreaterThan(50);

    const verdict = await replayLog({ sourceHome: srcHome, logPath, workHome });
    expect(verdict.mismatches).toEqual([]);
    expect(verdict.final.snapshotEqual).toBe(true);
    expect(verdict.final.stateEqual).toBe(true);
    expect(verdict.final.trainerRecordEqual).toBe(true);
    expect(verdict.final.rngRollsSource).toBe(verdict.final.rngRollsReplay);
    expect(verdict.ok).toBe(true);
  }, 120_000);
});

describe("統合: 名前を付けて新規（charcopy）", () => {
  test("コピー作成→新規開始→数手実行→リプレイ一致", async () => {
    const root = mkdtempSync(join(tmpdir(), "eramuse-charcopy-"));
    const srcHome = join(root, "src_home");
    const workHome = join(root, "replay_home");
    mkdirSync(join(srcHome, "data"), { recursive: true });
    mkdirSync(join(srcHome, "characters"), { recursive: true });
    mkdirSync(join(srcHome, "logs"), { recursive: true });
    for (const f of readdirSync(join(ENGINE_HOME, "data"))) {
      copyFileSync(join(ENGINE_HOME, "data", f), join(srcHome, "data", f));
    }

    const eng = new EngineProcess(join(SRC_DIR, "cli.ts"), srcHome);
    try {
      // 自動付番: base → base_2 → base_3（名前は元の名前＋（n））
      let r = await eng.send({ op: "charcopy", characterId: "base" });
      expect(r.ok).toBe(true);
      expect(r.characterId).toBe("base_2");
      expect(r.name).toBe("素体タイプ（2）");
      r = await eng.send({ op: "charcopy", characterId: "base" });
      expect(r.ok).toBe(true);
      expect(r.characterId).toBe("base_3");

      // 明示 id＋名前の微調整。定義（素質・見た目）が引き継がれる側。
      r = await eng.send({ op: "charcopy", characterId: "shiori", newId: "shiori_b", newName: "栞・別ラン" });
      expect(r.ok).toBe(true);
      expect(r.name).toBe("栞・別ラン");
      // 冪等: 同じコピーの作り直しは成功扱い（alreadyExisted）
      r = await eng.send({ op: "charcopy", characterId: "shiori", newId: "shiori_b", newName: "栞・別ラン" });
      expect(r.ok).toBe(true);
      expect(r.alreadyExisted).toBe(true);
      // 衝突: 中身の違う既存 id・未知の元は失敗
      r = await eng.send({ op: "charcopy", characterId: "base", newId: "shiori" });
      expect(r.ok).toBe(false);
      r = await eng.send({ op: "charcopy", characterId: "nope" });
      expect(r.ok).toBe(false);

      // コピー先を開始すると定義が効いている（名前・素質）
      r = await eng.send({ op: "start", characterId: "shiori_b", fresh: true, trainerId: "default" });
      expect(r.ok).toBe(true);
      expect(r.resumed).toBe(false);
      const shioriSave = JSON.parse(readFileSync(join(srcHome, "characters", "shiori_b.json"), "utf8"));
      expect(shioriSave.characterName).toBe("栞・別ラン");
      expect(shioriSave.traitIds).toContain("kaifuku_hayai");
      // 元キャラのセーブは作られていない（コピーは定義だけ）
      expect(existsSync(join(srcHome, "characters", "shiori.json"))).toBe(false);

      // 本命フロー: base_2 を新規開始して数手＋セッション中の charcopy
      // （base_2 の op ログに charcopy が記録され、再生対象になる）
      r = await eng.send({ op: "start", characterId: "base_2", fresh: true, trainerId: "default", seed: 12345 });
      expect(r.ok).toBe(true);
      expect(r.resumed).toBe(false);
      for (const c of ["talk", "caress"]) {
        const rr = await eng.send({ op: "execute", command: c });
        expect(rr.ok).toBe(true);
      }
      r = await eng.send({ op: "charcopy", characterId: "base_2" });
      expect(r.ok).toBe(true);
      expect(r.characterId).toBe("base_2_2");
      await eng.send({ op: "setdialogue", text: "「……っ」" });
      r = await eng.send({ op: "end" });
      expect(r.ok).toBe(true);
    } finally {
      eng.close();
    }

    const logPath = join(srcHome, "logs", "base_2.jsonl");
    expect(existsSync(logPath)).toBe(true);
    const recs = readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const copyRec = recs.find((x: any) => x.op === "charcopy");
    expect(copyRec?.copiedId).toBe("base_2_2");

    const verdict = await replayLog({ sourceHome: srcHome, logPath, workHome });
    expect(verdict.mismatches).toEqual([]);
    expect(verdict.final.snapshotEqual).toBe(true);
    expect(verdict.final.stateEqual).toBe(true);
    expect(verdict.ok).toBe(true);
  }, 120_000);
});
