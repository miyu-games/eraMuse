// Game data (numeric canon) copied verbatim from ~/workspace/era_proto/pack/data (era式パック).
// Command narration texts are NOT here: they live in the shell dictionary
// (narration_entries table, seeded from narration-seed.json). Formulas and
// goal values below are the authoritative side — do not hand-edit.
//
// 【セッション骨格改修での乖離 (2026-11-09)】COMMANDS の unlock 欄だけは
// パック正本から意図的に外した: パック側の数値ゲート（信頼/欲望等の閾値）は
// 原作に無い作りだったため、eraMaou JP の COMABLE.ERB の状況条件へ置換した
// （表現できる能力・潤滑ゲート9件のみを残し、他は "true"。詳細は
// ~/workspace/era_proto/research/session_restructure_measurement.md）。
// 数値表（sources / partStages / costs 等）はパック正本のまま。
//
// 【原作準拠改良での乖離 (2026-11-09)】ABILITIES の価格・ゲートは
// eraMaou ABLUP 実測へ置換した（パック近似値から原作表へ）。あわせて
// 道具系コマンドの表示名を一般名へ差し替え、talk のカテゴリを
// 「コミュニケーション」へ移した。COMMANDS の数値表（sources /
// partStages / costs）は従来どおりパック正本のまま。詳細は
// ~/workspace/era_proto/research/engine_fidelity_report.md。

export interface ParamDef { id: string; label: string; init: number; max: number }
export interface CommandDef {
  id: string; label: string; category: string; unlock: string; world?: string;
  sources: Record<string, string>; self_effects: Record<string, string>;
  success?: string; fail_source_mult?: number;
  fail_effects?: Record<string, string>; funds?: string; dependence?: number;
  /** 部位別快ソース基礎値（部位パラメータID → 定数）。原作（era天）COMF
   * ファイルの SOURCE:TARGET 実測値（第6弾で置き換え）。部位蓄積はこの
   * 定数を起点に補正チェーンを掛けて駆動する。主パラメータ変換へ流れる
   * pleasure ソース式（sources.pleasure）とは独立で、そちらは従来どおり。
   * caress のように複数部位を同時に駆動するコマンドもある。 */
  partBases?: Record<string, number>;
  /** 部位別快ソースの感覚段階表（eraMaou JP原版 COMF の ABL感覚別 SOURCE
   * 割当をそのまま移植したもの）。キーは部位パラメータID、table は
   * 対応する感覚能力Lv（0〜5+、上限は末尾の値）で引く値の列。
   * ability を省略すると部位対応の感覚能力（PART_SENSE_ABILITY）で引き、
   * 指定するとその能力Lvで引く（例: 逆レイプ系は奉仕精神で引く COMF24/25）。
   * 段階表で駆動する部位には CUP チェーンの感覚倍率テーブル
   * （SENSE_MULT）を掛けない（二重がけ防止。Maou 形への組み替えで導入）。 */
  partStages?: Record<string, { ability?: string; table: number[] }>;
  /** 射精ゲージ基礎値 B（原作 COMF 内処理の実測値、第7弾）。対象の快とは
   * 完全な別系統で、この値に倍率チェーンを掛けたものが調教者の射精
   * ゲージへ直接加算される。B が無いコマンドはゲージが増えない（+0）。 */
  ejacB?: number;
  /** リソース消費（体力/気力）。未指定のコマンドは CATEGORY_COSTS で補完する */
  costs?: { vital: number; energy: number };
}

/** コマンドのカテゴリ既定リソース消費（体力/気力）。
 *  体力・気力はパック正本に定義が無いため、殻側の最小限の新規定義として
 *  ここ（データ側）に置く。コマンド個別の costs があればそちらが優先。 */
export const CATEGORY_COSTS: Record<string, { vital: number; energy: number }> = {
  "愛撫系": { vital: 5, energy: 50 },
  "道具使用": { vital: 10, energy: 80 },
  "セックス系": { vital: 15, energy: 80 },
  "奉仕系": { vital: 6, energy: 50 },
  "SM系": { vital: 5, energy: 60 },
  "特殊": { vital: 2, energy: 20 },
  "ハード": { vital: 20, energy: 100 },
  "着衣・脱衣": { vital: 1, energy: 20 },
  "コミュニケーション": { vital: 2, energy: 15 },
  "奉仕": { vital: 6, energy: 50 },
  "性交": { vital: 15, energy: 80 },
};
export interface EventDef { id: string; when: string; once: boolean; text: string }
export interface MarkDef { id: string; label: string; param: string; thresholds: number[] }

export const PARAM_DEFS = [{"id": "trust", "label": "信頼", "init": 0, "max": 1000}, {"id": "obedience", "label": "従順", "init": 0, "max": 1000}, {"id": "desire", "label": "欲望", "init": 0, "max": 1000}, {"id": "submission", "label": "屈服", "init": 0, "max": 1000}, {"id": "skill", "label": "技巧", "init": 0, "max": 1000}, {"id": "fatigue", "label": "疲労", "init": 0, "max": 100}, {"id": "stress", "label": "反発", "init": 100, "max": 1000}, {"id": "relief", "label": "安心", "init": 0, "max": 1000}, {"id": "satisfaction", "label": "満足", "init": 0, "max": 1000}, {"id": "kai_c", "label": "快C", "init": 0, "max": 1000}, {"id": "kai_v", "label": "快V", "init": 0, "max": 1000}, {"id": "kai_a", "label": "快A", "init": 0, "max": 1000}, {"id": "kai_b", "label": "快B", "init": 0, "max": 1000}, {"id": "kai_f", "label": "快F", "init": 0, "max": 1000}] as unknown as ParamDef[];
export const DEFAULT_DAYS_LIMIT = 14 as unknown as number;
export const ACTIONS_PER_DAY = 3 as unknown as number;
export const DEFAULT_GOAL = {"obedience": 600, "desire": 600, "submission": 400} as unknown as Record<string, number>;
export const ENDING_TEXTS = {"met_release": "目標は達成された。期日が来て、彼女は完成した状態で手放された。育てた側の実利と、彼女の到達が一致した終わり方。", "unmet_release": "期日が来たが、目標には届かないまま手放された。未完成の引き渡し。次があるなら、育て方の順序が課題になる。", "met_keep": "目標は達成されたが、手放さなかった。ノルマより関係が勝った。期日の外側で、続きが始まる。", "unmet_keep": "目標には届かなかったが、手放さなかった。未完成のまま、こちらの側に残ることになった。", "free": "ノルマのないモードのため、判定なしで区切りを迎えた。"} as unknown as Record<string, string>;
export const SOURCE_IDS = ["pleasure", "pain", "fear", "shame", "affection", "fatigue_src", "addict"] as unknown as string[];
export const SOURCE_LABELS = {"pleasure": "快楽", "pain": "苦痛", "fear": "恐怖", "shame": "恥情", "affection": "情愛", "fatigue_src": "疲労", "addict": "中毒充足"} as unknown as Record<string, string>;
export const CONVERSION = {"trust": "affection * 0.30", "obedience": "fear * 0.24 + shame * 0.20 + pleasure * 0.12 + pain * 0.08", "desire": "pleasure * (0.16 + obedience * 0.0003) + shame * 0.06", "submission": "fear * 0.30 + pain * 0.24 + shame * 0.22", "skill": "0", "fatigue": "fatigue_src * 0.1", "stress": "pain * 0.06 + fear * 0.06 - affection * 0.10 - pleasure * 0.02", "relief": "affection * 0.15 - fear * 0.05", "satisfaction": "pleasure * 0.08 + affection * 0.05"} as unknown as Record<string, string>;
export const COMMANDS = [{"id": "kiss", "ejacB": 300, "costs": {"vital": 5, "energy": 50}, "label": "キスする", "category": "愛撫系", "unlock": "tequip_45 == 0", "sources": {"affection": "100", "pleasure": "110", "shame": "80", "fatigue_src": "30"}, "self_effects": {}}, {"id": "talk", "costs": {"vital": 1, "energy": 15}, "label": "会話する", "category": "コミュニケーション", "unlock": "tequip_45 == 0", "sources": {"affection": "60 + trust * 0.05", "fatigue_src": "20"}, "self_effects": {}}, {"id": "caress", "costs": {"vital": 5, "energy": 50}, "label": "愛撫", "category": "愛撫系", "unlock": "true", "sources": {"pleasure": "70 + skill * 0.15", "shame": "35", "fatigue_src": "40"}, "self_effects": {}, "partStages": {"kai_c": {"table": [20, 100, 500, 1200, 2000, 2800]}, "kai_b": {"table": [15, 50, 300, 700, 1100, 1600]}}}, {"id": "breast_caress", "costs": {"vital": 5, "energy": 50}, "label": "胸愛撫", "category": "愛撫系", "unlock": "target_male == 0", "sources": {"pleasure": "90 + skill * 0.15", "shame": "40", "fatigue_src": "45"}, "self_effects": {}, "partStages": {"kai_b": {"table": [20, 100, 500, 1200, 2000, 2800]}}}, {"id": "cunni", "costs": {"vital": 5, "energy": 50}, "label": "クンニ", "category": "愛撫系", "unlock": "target_male == 0", "sources": {"pleasure": "120 + skill * 0.2", "shame": "70", "fatigue_src": "50"}, "self_effects": {}, "partStages": {"kai_c": {"table": [40, 160, 700, 1500, 2400, 3300]}}}, {"id": "fellatio", "ejacB": 1500, "costs": {"vital": 10, "energy": 90}, "label": "フェラチオ", "category": "奉仕系", "unlock": "tequip_44 == 0 && tequip_45 == 0", "sources": {"pleasure": "110 + skill * 0.1", "shame": "75", "fatigue_src": "50"}, "self_effects": {}, "partBases": {"kai_f": 126}}, {"id": "sex_v", "ejacB": 1500, "costs": {"vital": 50, "energy": 100}, "label": "正常位", "category": "セックス系", "unlock": "tool_v == 0 && target_male == 0 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && (scene_bath == 0 || item_13 >= 1)", "sources": {"pleasure": "180 + skill * 0.2", "shame": "60", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}}}, {"id": "sex_a", "ejacB": 1500, "costs": {"vital": 80, "energy": 120}, "label": "正常位アナル", "category": "セックス系", "unlock": "exp_a >= 10 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"pleasure": "150 + skill * 0.15", "shame": "90", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_a": {"table": [10, 30, 400, 900, 1600, 2100]}}}, {"id": "com2", "costs": {"vital": 20, "energy": 100}, "label": "アナル愛撫", "category": "愛撫系", "unlock": "true", "sources": {"shame": "85", "pain": "40", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_a": {"table": [20, 75, 300, 700, 1100, 1500]}}}, {"id": "com3", "costs": {"vital": 5, "energy": 50}, "label": "自慰", "category": "愛撫系", "unlock": "tequip_44 == 0", "sources": {"shame": "200", "fear": "50", "pain": "40", "fatigue_src": "50"}, "self_effects": {}, "partStages": {"kai_c": {"table": [15, 50, 300, 700, 1100, 1600]}, "kai_b": {"table": [15, 50, 300, 700, 1100, 1600]}}}, {"id": "com4", "costs": {"vital": 5, "energy": 50}, "label": "フェラする", "category": "愛撫系", "unlock": "(target_futanari >= 1 || target_male >= 1)", "sources": {"shame": "22", "pain": "5", "fatigue_src": "50"}, "self_effects": {}, "partStages": {"kai_c": {"table": [50, 200, 800, 1600, 2400, 3200]}}}, {"id": "com7", "costs": {"vital": 10, "energy": 50}, "label": "広げて見せる", "category": "愛撫系", "unlock": "abl_obedience >= 2 && tool_v == 0 && tequip_44 == 0 && target_male == 0", "sources": {"shame": "150", "fear": "30", "pain": "40", "pleasure": "10", "affection": "5", "fatigue_src": "50"}, "self_effects": {}}, {"id": "com8", "costs": {"vital": 30, "energy": 80}, "label": "指挿入れ", "category": "愛撫系", "unlock": "target_male == 0", "sources": {"shame": "30", "fear": "15", "pain": "28", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_v": {"table": [10, 50, 250, 600, 1200, 1800]}}}, {"id": "com9", "costs": {"vital": 5, "energy": 50}, "label": "アナル舐め", "category": "愛撫系", "unlock": "tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0", "sources": {"shame": "30", "pain": "50", "fatigue_src": "50"}, "self_effects": {}, "partStages": {"kai_a": {"table": [5, 50, 200, 500, 1000, 1800]}}}, {"id": "com10", "costs": {"vital": 10, "energy": 80}, "label": "ローター（C）", "category": "道具使用", "unlock": "item_0 >= 1", "sources": {"shame": "12", "pain": "7", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_c": {"table": [200, 400, 900, 1600, 2400, 3000]}}}, {"id": "rotor_b", "costs": {"vital": 20, "energy": 70}, "label": "ローター（B）", "category": "道具使用", "unlock": "item_0 >= 1", "sources": {"shame": "12", "pain": "7", "fatigue_src": "70"}, "self_effects": {}, "partStages": {"kai_b": {"table": [100, 300, 800, 1500, 2300, 2900]}}}, {"id": "com11", "costs": {"vital": 30, "energy": 100}, "label": "ディルド", "category": "道具使用", "unlock": "item_1 >= 1 && target_male == 0", "sources": {"pain": "5", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_v": {"table": [80, 250, 600, 1000, 1300, 1700]}}}, {"id": "com12", "costs": {"vital": 30, "energy": 150}, "label": "E・マッサージャー", "category": "道具使用", "unlock": "item_2 >= 1", "sources": {"shame": "12", "pain": "40", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_c": {"table": [2000, 2500, 3000, 3300, 3600, 3800]}}}, {"id": "com13", "costs": {"vital": 60, "energy": 150}, "label": "アナルバイブ", "category": "道具使用", "unlock": "item_3 >= 1 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0", "sources": {"fear": "30", "pain": "30", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_a": {"table": [80, 250, 600, 1000, 1300, 1700]}}}, {"id": "com16", "costs": {"vital": 50, "energy": 100}, "label": "搾乳機", "category": "道具使用", "unlock": "item_17 >= 1 && sense_b >= 3 && scene_wife == 0", "sources": {"pleasure": "20", "pain": "10", "shame": "10", "fear": "20", "affection": "10", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_b": {"table": [200, 400, 900, 1600, 2400, 3000]}}}, {"id": "com17", "costs": {"vital": 10, "energy": 80}, "label": "オナホール", "category": "道具使用", "unlock": "item_12 >= 1 && (target_futanari >= 1 || target_male >= 1) && scene_wife == 0", "sources": {"shame": "12", "pain": "7", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_c": {"table": [200, 400, 900, 1600, 2400, 3000]}}}, {"id": "com18", "costs": {"vital": 0, "energy": 10}, "label": "シャワー", "category": "道具使用", "unlock": "scene_bath >= 1 && tequip_16 == 0", "sources": {"affection": "40", "fear": "20", "shame": "10", "pain": "20", "fatigue_src": "10"}, "self_effects": {}}, {"id": "com19", "costs": {"vital": 60, "energy": 150}, "label": "アナルビーズ", "category": "道具使用", "unlock": "item_20 >= 1 && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0 && scene_wife == 0", "sources": {"fear": "30", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_a": {"table": [80, 250, 600, 1000, 1300, 1700]}}}, {"id": "com21", "ejacB": 1800, "costs": {"vital": 50, "energy": 100}, "label": "後背位", "category": "セックス系", "unlock": "tool_v == 0 && target_male == 0 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "80", "affection": "5", "pain": "3", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}}}, {"id": "com22", "ejacB": 1500, "costs": {"vital": 10, "energy": 80}, "label": "対面座位", "category": "セックス系", "unlock": "exp_v >= 1 && tool_v == 0 && target_male == 0 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "10", "affection": "15", "pleasure": "15", "fear": "10", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 300, 700, 1100, 1500]}}}, {"id": "com23", "ejacB": 1500, "costs": {"vital": 20, "energy": 150}, "label": "背面座位", "category": "セックス系", "unlock": "exp_v >= 1 && tool_v == 0 && target_male == 0 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "20", "affection": "5", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_v": {"table": [50, 150, 300, 600, 1000, 1500]}, "kai_b": {"table": [50, 200, 500, 800, 1300, 1800]}, "kai_c": {"table": [40, 160, 500, 900, 1400, 2100]}}}, {"id": "com24", "ejacB": 1500, "costs": {"vital": 50, "energy": 200}, "label": "逆レイプ", "category": "セックス系", "unlock": "(target_futanari >= 1 || target_male >= 1 || item_4 >= 1) && trainer_male == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "22", "pain": "5", "pleasure": "160", "affection": "20", "fatigue_src": "200"}, "self_effects": {}, "partStages": {"kai_c": {"ability": "abl_service", "table": [800, 1400, 2000, 2500, 2900, 3200]}}}, {"id": "com25", "ejacB": 1500, "costs": {"vital": 50, "energy": 200}, "label": "逆アナルレイプ", "category": "セックス系", "unlock": "(target_futanari >= 1 || target_male >= 1 || item_4 >= 1) && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "22", "pain": "5", "pleasure": "160", "affection": "20", "fatigue_src": "200"}, "self_effects": {}, "partStages": {"kai_c": {"ability": "abl_service", "table": [800, 1400, 2000, 2500, 2900, 3200]}}}, {"id": "com27", "ejacB": 1800, "costs": {"vital": 120, "energy": 200}, "label": "後背位アナル", "category": "セックス系", "unlock": "exp_a >= 10 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "120", "pain": "120", "fear": "10", "fatigue_src": "200"}, "self_effects": {}, "partStages": {"kai_a": {"table": [10, 30, 500, 1000, 1700, 2200]}}}, {"id": "com28", "ejacB": 1500, "costs": {"vital": 60, "energy": 80}, "label": "対面座位アナル", "category": "セックス系", "unlock": "exp_a >= 10 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "10", "pleasure": "10", "affection": "10", "fear": "8", "fatigue_src": "80"}, "self_effects": {}, "partStages": {"kai_a": {"table": [100, 300, 700, 1200, 1800, 2500]}}}, {"id": "com29", "ejacB": 1500, "costs": {"vital": 70, "energy": 90}, "label": "背面座位アナル", "category": "セックス系", "unlock": "exp_a >= 10 && (trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"shame": "20", "fear": "8", "fatigue_src": "90"}, "self_effects": {}, "partStages": {"kai_a": {"table": [100, 300, 700, 1200, 1800, 2500]}, "kai_b": {"table": [50, 200, 500, 800, 1300, 1800]}, "kai_c": {"table": [40, 160, 500, 900, 1400, 2100]}}}, {"id": "com30", "ejacB": 500, "costs": {"vital": 10, "energy": 100}, "label": "手淫", "category": "奉仕系", "unlock": "tequip_44 == 0", "sources": {"pleasure": "25", "affection": "5", "fear": "50", "pain": "10", "fatigue_src": "100"}, "self_effects": {}}, {"id": "com32", "ejacB": 2000, "costs": {"vital": 10, "energy": 70}, "label": "パイズリ", "category": "奉仕系", "unlock": "tequip_44 == 0 && tequip_45 == 0", "partStages": {"kai_b": {"table": [100, 200, 400, 800, 1200, 1500]}}, "sources": {"pleasure": "50", "affection": "30", "fear": "180", "pain": "120", "fatigue_src": "70"}, "self_effects": {}}, {"id": "com33", "costs": {"vital": 40, "energy": 130}, "label": "素股", "category": "奉仕系", "unlock": "lub >= 2000 && tool_v == 0 && tequip_44 == 0", "partStages": {"kai_c": {"table": [0, 10, 50, 200, 600, 2000]}}, "sources": {"pleasure": "20", "affection": "10", "fear": "120", "pain": "40", "fatigue_src": "130"}, "self_effects": {}}, {"id": "com34", "ejacB": 2000, "costs": {"vital": 60, "energy": 150}, "label": "騎乗位", "category": "奉仕系", "unlock": "tool_v == 0 && tequip_44 == 0 && target_male == 0", "sources": {"shame": "90", "affection": "3", "pleasure": "20", "pain": "30", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_v": {"table": [20, 75, 200, 500, 850, 1100]}}}, {"id": "com35", "costs": {"vital": 50, "energy": 180}, "label": "泡踊り", "category": "奉仕系", "unlock": "scene_bath >= 1 && item_13 >= 1 && tool_v == 0 && tequip_13 == 0 && tequip_19 == 0 && tequip_43 == 0 && tequip_44 == 0 && tequip_45 == 0 && tequip_46 == 0 && tequip_49 == 0", "sources": {"pleasure": "90", "affection": "80", "pain": "160", "fear": "200", "fatigue_src": "180"}, "self_effects": {}, "partStages": {"kai_c": {"table": [0, 50, 200, 400, 1000, 2000]}, "kai_b": {"table": [200, 300, 500, 1000, 1500, 1800]}}}, {"id": "com36", "ejacB": 2000, "costs": {"vital": 90, "energy": 110}, "label": "騎乗位アナル", "category": "奉仕系", "unlock": "exp_a >= 10 && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0 && tequip_44 == 0", "sources": {"shame": "90", "pleasure": "20", "affection": "5", "fear": "8", "fatigue_src": "110"}, "self_effects": {}, "partStages": {"kai_a": {"table": [10, 20, 200, 450, 850, 1300]}}}, {"id": "com37", "costs": {"vital": 0, "energy": 100}, "label": "アナル奉仕", "category": "奉仕系", "unlock": "tequip_44 == 0 && tequip_45 == 0", "sources": {"fear": "300", "pain": "500", "pleasure": "42", "affection": "15", "fatigue_src": "100"}, "self_effects": {}}, {"id": "com38", "costs": {"vital": 10, "energy": 150}, "label": "足コキ", "category": "奉仕系", "unlock": "tequip_44 == 0", "sources": {"fear": "55", "pain": "40", "pleasure": "30", "affection": "5", "fatigue_src": "150"}, "self_effects": {}}, {"id": "com40", "costs": {"vital": 80, "energy": 40}, "label": "スパンキング", "category": "SM系", "unlock": "true", "sources": {"pain": "100", "shame": "20", "fatigue_src": "40"}, "self_effects": {}}, {"id": "com41", "costs": {"vital": 100, "energy": 80}, "label": "鞭", "category": "SM系", "unlock": "item_10 >= 1 && scene_bath == 0 && scene_wife == 0", "sources": {"pain": "250", "fatigue_src": "80"}, "self_effects": {}}, {"id": "com42", "costs": {"vital": 0, "energy": 20}, "label": "針", "category": "SM系", "unlock": "item_11 >= 1 && scene_bath == 0 && scene_wife == 0", "sources": {"pain": "460", "fatigue_src": "20"}, "self_effects": {}}, {"id": "com43", "costs": {"vital": 0, "energy": 150}, "label": "アイマスク", "category": "SM系", "unlock": "item_5 >= 1", "sources": {"shame": "100", "pain": "50", "fatigue_src": "150"}, "self_effects": {}}, {"id": "com44", "costs": {"vital": 100, "energy": 150}, "label": "縄", "category": "SM系", "unlock": "item_14 >= 1 && trainer_skill >= 3", "sources": {"pain": "130", "fear": "50", "fatigue_src": "150"}, "self_effects": {}}, {"id": "com45", "costs": {"vital": 80, "energy": 100}, "label": "ボールギャグ", "category": "SM系", "unlock": "item_9 >= 1 && scene_wife == 0", "sources": {"pain": "15", "fear": "25", "shame": "10", "pleasure": "5", "fatigue_src": "100"}, "self_effects": {}}, {"id": "com46", "costs": {"vital": 60, "energy": 150}, "label": "浣腸器＋プラグ", "category": "SM系", "unlock": "abl_obedience + abl_desire >= 10 && exp_a >= 26 && item_15 >= 1 && tequip_13 == 0 && tequip_19 == 0 && tequip_49 == 0", "sources": {"pain": "370", "fear": "80", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_a": {"table": [80, 250, 600, 1000, 1300, 1700]}}}, {"id": "com47", "costs": {"vital": 0, "energy": 60}, "label": "ボンデージ装着", "category": "SM系", "unlock": "item_23 >= 1", "sources": {"pleasure": "10", "pain": "10", "fatigue_src": "60"}, "self_effects": {}}, {"id": "com48", "costs": {"vital": 10, "energy": 60}, "label": "足コキする", "category": "SM系", "unlock": "(target_futanari >= 1 || target_male >= 1)", "sources": {"shame": "15", "pain": "40", "fatigue_src": "60"}, "self_effects": {}, "partStages": {"kai_c": {"table": [30, 100, 200, 500, 1000, 1500]}}}, {"id": "com49", "costs": {"vital": 100, "energy": 150}, "label": "アナル電極", "category": "SM系", "unlock": "item_21 >= 1 && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && scene_bath == 0", "sources": {"fear": "100", "pain": "5", "fatigue_src": "150"}, "self_effects": {}, "partStages": {"kai_a": {"table": [200, 500, 900, 1800, 2400, 3800]}}}, {"id": "com50", "costs": {"vital": 0, "energy": 0}, "label": "ローション", "category": "特殊", "unlock": "item_25 >= 1", "sources": {"shame": "30", "fatigue_src": "0"}, "self_effects": {}}, {"id": "com51", "costs": {"vital": 0, "energy": 50}, "label": "媚薬", "category": "特殊", "unlock": "item_26 >= 1", "sources": {"pleasure": "100", "pain": "50", "fatigue_src": "50"}, "self_effects": {}}, {"id": "com52", "costs": {"vital": 0, "energy": 50}, "label": "利尿剤", "category": "特殊", "unlock": "item_27 >= 1 && tequip_22 == 0 && scene_wife == 0", "sources": {"pain": "115", "fatigue_src": "50"}, "self_effects": {}}, {"id": "com53", "costs": {"vital": 0, "energy": 50}, "label": "ビデオカメラ", "category": "特殊", "unlock": "item_6 >= 1 && item_28 >= 1", "sources": {"fatigue_src": "10"}, "self_effects": {}}, {"id": "com54", "costs": {"vital": 0, "energy": 150}, "label": "野外プレイ", "category": "特殊", "unlock": "item_18 >= 1 && abl_obedience >= 3 && (scene_mode == 0 || scene_mode == 54)", "sources": {"pleasure": "15", "fatigue_src": "150"}, "self_effects": {}}, {"id": "com55", "costs": {"vital": 0, "energy": 10}, "label": "何もしない", "category": "特殊", "unlock": "true", "sources": {"affection": "10", "shame": "5", "pleasure": "5", "fatigue_src": "10"}, "self_effects": {}}, {"id": "com57", "costs": {"vital": 0, "energy": 200}, "label": "羞恥プレイ", "category": "特殊", "unlock": "abl_obedience >= 2 && item_16 >= 1 && (scene_mode == 0 || scene_mode == 57)", "sources": {"fear": "110", "pain": "200", "pleasure": "30", "affection": "50", "fatigue_src": "200"}, "self_effects": {}}, {"id": "com58", "costs": {"vital": 20, "energy": 50}, "label": "お風呂場プレイ", "category": "特殊", "unlock": "abl_obedience >= 2 && (scene_mode == 0 || scene_mode == 58)", "sources": {"pleasure": "10", "fatigue_src": "50"}, "self_effects": {}}, {"id": "com59", "costs": {"vital": 0, "energy": 30}, "label": "新妻プレイ", "category": "特殊", "unlock": "sense_c >= 3 && item_19 >= 1 && (scene_mode == 0 || scene_mode == 59)", "sources": {"pleasure": "10", "shame": "10", "pain": "20", "fatigue_src": "30"}, "self_effects": {}}, {"id": "com80", "costs": {"vital": 200, "energy": 150}, "label": "イラマチオ", "category": "ハード", "unlock": "abl_obedience + abl_desire >= 6 && tequip_45 == 0 && scene_wife == 0", "sources": {"pain": "70", "fear": "200", "pleasure": "42", "affection": "15", "fatigue_src": "150"}, "self_effects": {}}, {"id": "com81", "costs": {"vital": 600, "energy": 300}, "label": "フィストファック", "category": "ハード", "unlock": "exp_v >= 75 && tool_v == 0 && scene_wife == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"pain": "240", "shame": "120", "fear": "240", "fatigue_src": "300"}, "self_effects": {}, "partStages": {"kai_v": {"table": [2000, 2500, 3000, 3300, 3600, 3800]}}}, {"id": "com82", "costs": {"vital": 600, "energy": 300}, "label": "アナルフィスト", "category": "ハード", "unlock": "exp_a >= 75 && tequip_13 == 0 && tequip_19 == 0 && tequip_46 == 0 && tequip_49 == 0 && scene_wife == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"pain": "240", "shame": "120", "fear": "130", "fatigue_src": "300"}, "self_effects": {}, "partStages": {"kai_a": {"table": [10, 30, 500, 1000, 1700, 2200]}}}, {"id": "com83", "costs": {"vital": 800, "energy": 500}, "label": "両穴フィスト", "category": "ハード", "unlock": "exp_v >= 150 && exp_a >= 150 && tool_v == 0 && tequip_13 == 0 && tequip_46 == 0 && scene_wife == 0 && (scene_bath == 0 || item_13 >= 1)", "sources": {"pain": "430", "shame": "250", "fear": "500", "pleasure": "150", "fatigue_src": "500"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}, "kai_a": {"table": [10, 30, 500, 1000, 1700, 2200]}}}, {"id": "com85", "costs": {"vital": 10, "energy": 200}, "label": "放尿", "category": "ハード", "unlock": "tequip_22 >= 1 && (scene_bath >= 1 || abl_obedience >= 3)", "sources": {"shame": "200", "fear": "300", "pleasure": "30", "pain": "100", "fatigue_src": "200"}, "self_effects": {}}, {"id": "com87", "costs": {"vital": 50, "energy": 100}, "label": "ピアシング", "category": "ハード", "unlock": "abl_obedience >= 3 && (item_34 >= 1 || pierce_done >= 1) && tool_v == 0 && tequip_16 == 0", "sources": {"pain": "600", "fear": "100", "fatigue_src": "100"}, "self_effects": {}}, {"id": "com90", "costs": {"vital": 50, "energy": 100}, "label": "ニプルファック", "category": "ハード", "unlock": "(trainer_male >= 1 || trainer_futanari >= 1 || item_4 >= 1) && talent_chounyu >= 1", "sources": {"shame": "40", "affection": "15", "pain": "5", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_b": {"table": [40, 150, 400, 1000, 1700, 2200]}}}, {"id": "com110", "costs": {"vital": 0, "energy": 20}, "label": "服の着脱", "category": "着衣・脱衣", "unlock": "true", "sources": {"shame": "30", "fatigue_src": "10"}, "self_effects": {}}, {"id": "com120", "ejacB": 1500, "costs": {"vital": 50, "energy": 100}, "label": "挿入Gスポ責め", "category": "セックス系", "unlock": "(prev_sex_v >= 1 || prev_com21 >= 1 || prev_com22 >= 1 || prev_com23 >= 1 || prev_com34 >= 1) && tool_v == 0 && trainer_skill >= 3", "sources": {"pleasure": "15", "affection": "10", "shame": "90", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_v": {"table": [150, 200, 600, 2000, 2600, 3400]}}}, {"id": "com121", "ejacB": 1500, "costs": {"vital": 50, "energy": 100}, "label": "挿入子宮口責め", "category": "セックス系", "unlock": "(prev_sex_v >= 1 || prev_com21 >= 1 || prev_com22 >= 1 || prev_com23 >= 1 || prev_com34 >= 1) && tool_v == 0 && trainer_skill >= 3", "sources": {"pleasure": "15", "affection": "10", "shame": "40", "fatigue_src": "100"}, "self_effects": {}, "partStages": {"kai_v": {"table": [10, 30, 400, 800, 2700, 3800]}, "kai_c": {"table": [0, 20, 100, 400, 900, 1400]}}}, {"id": "com123", "ejacB": 2000, "costs": {"vital": 20, "energy": 80}, "label": "パイズリフェラ", "category": "奉仕系", "unlock": "abl_obedience >= 3 || abl_skill >= 3 || abl_service >= 3", "sources": {"pleasure": "60", "affection": "30", "fear": "220", "shame": "90", "fatigue_src": "80"}, "self_effects": {}, "partBases": {"kai_f": 150}, "partStages": {"kai_b": {"table": [20, 100, 500, 1200, 2000, 2800]}}}, {"id": "com124", "ejacB": 1500, "costs": {"vital": 20, "energy": 90}, "label": "ディープスロート", "category": "奉仕系", "unlock": "abl_obedience >= 3 || abl_skill >= 3 || abl_service >= 3", "sources": {"pain": "20", "fear": "180", "shame": "60", "fatigue_src": "90"}, "self_effects": {}, "partBases": {"kai_f": 160}}, {"id": "com125", "ejacB": 1500, "costs": {"vital": 20, "energy": 70}, "label": "フェラ自慰", "category": "奉仕系", "unlock": "abl_obedience >= 3 || abl_skill >= 3 || abl_service >= 3", "sources": {"pleasure": "20", "fear": "150", "shame": "200", "fatigue_src": "70"}, "self_effects": {}, "partBases": {"kai_f": 126}, "partStages": {"kai_c": {"table": [15, 50, 300, 700, 1100, 1600]}}}, {"id": "com126", "ejacB": 1500, "costs": {"vital": 10, "energy": 90}, "label": "手コキフェラ", "category": "奉仕系", "unlock": "abl_obedience >= 3 || abl_skill >= 3 || abl_service >= 3", "sources": {"pleasure": "30", "fear": "150", "shame": "50", "fatigue_src": "90"}, "self_effects": {}, "partBases": {"kai_f": 140}}, {"id": "com127", "ejacB": 1500, "costs": {"vital": 20, "energy": 90}, "label": "バキュームフェラ", "category": "奉仕系", "unlock": "abl_obedience >= 3 || abl_skill >= 3 || abl_service >= 3", "sources": {"pain": "20", "fear": "180", "shame": "60", "fatigue_src": "90"}, "self_effects": {}, "partBases": {"kai_f": 170}}, {"id": "com128", "ejacB": 1500, "costs": {"vital": 60, "energy": 120}, "label": "正常位・キス", "category": "セックス系", "unlock": "trainer_skill >= 3 && tool_v == 0", "sources": {"pleasure": "20", "affection": "25", "shame": "40", "fatigue_src": "120"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}}}, {"id": "com129", "ejacB": 1500, "costs": {"vital": 60, "energy": 120}, "label": "正常位・胸愛撫", "category": "セックス系", "unlock": "trainer_skill >= 3 && tool_v == 0", "sources": {"pleasure": "20", "affection": "20", "shame": "40", "fatigue_src": "120"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}, "kai_b": {"table": [50, 200, 500, 800, 1300, 1800]}}}, {"id": "com130", "ejacB": 1500, "costs": {"vital": 70, "energy": 130}, "label": "正常位SP", "category": "セックス系", "unlock": "trainer_skill >= 5 && tool_v == 0", "sources": {"pleasure": "25", "affection": "25", "shame": "40", "fatigue_src": "130"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}, "kai_c": {"table": [20, 100, 500, 1200, 2000, 2800]}}}, {"id": "com131", "ejacB": 1800, "costs": {"vital": 60, "energy": 120}, "label": "後背位・胸愛撫", "category": "セックス系", "unlock": "trainer_skill >= 3 && tool_v == 0", "sources": {"pleasure": "20", "affection": "15", "shame": "80", "fatigue_src": "120"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}, "kai_b": {"table": [50, 200, 500, 800, 1300, 1800]}}}, {"id": "com132", "ejacB": 1800, "costs": {"vital": 100, "energy": 120}, "label": "後背位・スパンキング", "category": "セックス系", "unlock": "trainer_skill >= 3 && tool_v == 0", "sources": {"pleasure": "15", "pain": "60", "fear": "80", "shame": "80", "fatigue_src": "120"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}}}, {"id": "com133", "ejacB": 1800, "costs": {"vital": 60, "energy": 120}, "label": "立ちバック", "category": "セックス系", "unlock": "trainer_skill >= 4 && tool_v == 0", "sources": {"pleasure": "20", "affection": "15", "shame": "80", "fatigue_src": "120"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}}}, {"id": "com134", "ejacB": 1800, "costs": {"vital": 60, "energy": 120}, "label": "後背位SP", "category": "セックス系", "unlock": "trainer_skill >= 5 && tool_v == 0", "sources": {"pleasure": "25", "affection": "30", "shame": "80", "fatigue_src": "120"}, "self_effects": {}, "partStages": {"kai_v": {"table": [40, 150, 400, 1000, 1700, 2200]}, "kai_c": {"table": [20, 100, 500, 1200, 2000, 2800]}}}, {"id": "com135", "costs": {"vital": 5, "energy": 50}, "label": "セルフクンニ", "category": "愛撫系", "unlock": "race_dullahan >= 1", "sources": {"pleasure": "20", "shame": "260", "fear": "80", "fatigue_src": "50"}, "self_effects": {}, "partStages": {"kai_c": {"table": [15, 50, 300, 700, 1100, 1600]}}}] as unknown as CommandDef[];
// ---------------------------------------------------------------- 数値表（eraMaou JP原版 0.930 で照合済みの確定値）
// PALAMLV（LV0-13）: eraMaou JP版 CSV/_replace.csv の初期値と一致確認済み。
// EXPLV（LV0-10）: 同上。
export const PALAMLV = [0, 100, 500, 3000, 10000, 30000, 60000, 100000, 150000, 250000, 500000, 1000000, 5000000, 10000000] as unknown as number[];
export const EXPLV = [0, 1, 4, 20, 50, 200, 400, 700, 1000, 1500, 2000] as unknown as number[];
// ---------------------------------------------------------------- 珠（JUEL）
// 通貨定義はパック data/juels.json の8種＋苦痛の珠（pain）。苦痛の珠は
// eraMaou @JUEL_CHECK_MAIN の苦痛PALAM換算チャンネルに対応する通貨で、
// 全体換算の移植時に追加した（既存8種の順序・価格参照は変えない）。
// 階段は eraMaou JP原版
// TRAIN_MAIN.ERB @JUEL_CHECK_MAIN の字面どおり（Maou 形への組み替えで
// 従来の天形＝最大1000000・入力×100スケーリングから置換。天井は 12000）。
// 階段: 入力（日次の残量、そのままの生値）が THRESHOLDS[i] 未満の間は
// VALUES[i]、全境界以上で末尾の 12000。
export const JUEL_CURRENCIES = [{"id": "devotion", "label": "恭順の珠"}, {"id": "lust", "label": "欲情の珠"}, {"id": "yield", "label": "屈服の珠"}, {"id": "terror", "label": "恐怖の珠"}, {"id": "shame", "label": "恥情の珠"}, {"id": "pleasure", "label": "快楽の珠"}, {"id": "learning", "label": "習得の珠"}, {"id": "denial", "label": "否定の珠"}, {"id": "pain", "label": "苦痛の珠"}] as unknown as { id: string; label: string }[];
export const JUEL_STAIR_THRESHOLDS = [100, 300, 500, 1500, 3000, 6000, 10000, 30000, 60000, 100000, 150000, 250000] as unknown as number[];
export const JUEL_STAIR_VALUES = [0, 1, 2, 10, 20, 100, 200, 1000, 2000, 3000, 5000, 8000, 12000] as unknown as number[];
/** 絶頂相当の到達として数える pleasure ソースの閾値（パック juels.json の count_threshold） */
export const JUEL_COUNT_THRESHOLD = 100 as unknown as number;
// ---------------------------------------------------------------- 能力（ABL）
// パック data/abilities.json の6件をそのまま移植し、感覚系4件を
// 追補5／ABLUP 実物（eraten_structure.md 追補5、ABLUP3〜6）から追加した。
// 中毒系7種は eraMaou JP原版の ABLUP 実測（addiction_transplant.md §1）。
// abl_addiction（快楽中毒）は Maou に存在しないパック独自の複合代表で、
// 価格3列だけを ABLUP31（自慰中毒）の実測列へ差し替えた（id・ラベル・
// param・exp_req・requires は従来のまま）。
// 試作に部位別の珠が無く快楽の珠へ一本化されているため、感覚系の支払い通貨は
// パックの中毒表の読み替えに倣い pleasure とする。
// exp_req / requires / discounts / expDiscount / desireChannelMult は
// 定義データとして保持するが、今ラウンドでは購入ゲートに接続しない
// （購入可否は Lv・価格・残高の3点のみ。エンジン側 buyAbility の注記参照）。
export interface AbilityDef {
  id: string;
  label: string;
  maxLv: number;
  /** 対応パラメータ（パック定義の参考情報） */
  param?: string;
  price:
    | { type: "single"; juel: string; table: (number | null)[] }
    | { type: "or"; options: { juel: string; table: (number | null)[]; gateExp?: { exp: string; orExp?: string; table: number[] } }[] }
    | { type: "and"; entries: { juel: string; table: (number | null)[] }[] };
  /** 陥落履歴連動の割引定義（パック abilities.json のまま保持） */
  discounts?: { juel: string; mult: number; when: string }[];
  /** 経験要件（cmd = コマンド実行回数、exp = 経験名。パック読み替え表のまま保持） */
  expReq?: { cmd?: string; exp?: string; table?: number[] };
  /** 追加の経験要件（自慰中毒の調教自慰経験など。データ保持のみ） */
  expReqs?: { cmd?: string; exp?: string; table?: number[] }[];
  /** 前提能力（パック定義のまま保持） */
  requires?: { ability: string; minLv: number };
  /** 前提能力（複数形。原作 ABLUP の「対象能力 ≥ 次Lv」条件。ability が
   * 無い項目は試作の能力カタログに存在しない能力。データ保持のみ） */
  requiresList?: { ability?: string; label: string; note?: string }[];
  /** 中毒の合算上限グループ（原作: 同グループの合計 Lv ≤ 10。データ保持のみ） */
  sumGroup?: string;
  /** Lv5 以降の解放条件（原作: 特定素質所持時のみ解放。データ保持のみ） */
  lv5Gate?: string;
  /** 特殊処理の種別（abl_buyoff の mark 連動処理） */
  special?: string;
  mark?: string;
  requiresMarks?: Record<string, string>;
  requiresAbilityMark?: Record<string, string>;
  /** abl_desire の欲望倍率チャンネル（原作: 生SOURCE→CUP:欲情への倍率、Lv0..10）。
   * 試作に欲情の蓄積チャンネルが無いためデータのみ保持し、効果は接続しない。 */
  desireChannelMult?: number[];
  /** 経験ゲート（eraMaou ABLUP の経験要件を機能化したもの。exp は
   * エンジンの経験カウンタID、table は現在Lv → 必要経験量） */
  expGate?: { exp: string; table: number[] };
  /** 能力ゲート（eraMaou ABLUP の「対象能力 ≥ 現在Lv + plus」条件） */
  abilityGates?: { ability: string; plus: number }[];
  /** 異常経験ゲート（現在Lv → 必要な異常経験。null は要件なし）。
   * eraMaou ABLUP10/11/16/30/31/32 の「LVn から m に上げるときは
   * 異常経験が k 以上必要」の形。 */
  abnormalTable?: (number | null)[];
  /** 異常経験ゲートを免除する陥落素質ID（原作の免除素質の写像） */
  abnormalExemptTraits?: string[];
  /** 解放上限: この Lv までは通常購入でき、それ以上は traits の
   * いずれか（陥落素質）を持っている場合のみ買える（eraMaou ABLUP の
   * 「Lv5 が上限、[愛] 等があれば Lv10 まで解放」の形）。 */
  capGate?: { max: number; traits: string[] };
  /** 購入対象外の理由（定義自体は旧セーブ互換のため残す） */
  blocked?: string;
  /** sense_a の経験帯による価格割引（ABLUP5 実測）: その Lv でアナル経験が
   * EXPLV 帯 expLv 以上なら単価が price になる。データのみ保持。 */
  expDiscount?: { lv: number; expLv: number; price: number }[];
}
export const ABILITIES = [
  {
    "id": "abl_obedience", "label": "従順", "maxLv": 10, "param": "obedience",
    // eraMaou ABLUP10 @DECIDE_ABLUP10 の4ルート実測値（A=恐怖/B=恭順/C=欲情/D=屈服。
    // 0 の段はそのルートが存在しないため null）。素質別価格倍率（臆病・反抗的・
    // 気丈・素直 等）は eraMuse に Maou TALENT が無いため未接続（欠け）。
    "price": { "type": "or", "options": [
      { "juel": "terror", "table": [10, 150, 1000, 3000, 8000, 12000, 25000, null, null, null] },
      { "juel": "devotion", "table": [10, 100, 800, 3000, 5000, 10000, 20000, 40000, 80000, 150000] },
      { "juel": "lust", "table": [300, 1000, 2000, null, null, null, null, null, null, null] },
      { "juel": "yield", "table": [200, 1200, 3000, 12000, null, null, null, null, null, null] },
    ] },
    // ABLUP10: Lv4→5 は異常経験1、Lv7→8 は異常経験2 が必要（免除素質は
    // 臆病/素直/即落ち/淫乱/愛/妄信。写像できるのは淫乱・愛のみ）。
    "abnormalTable": [null, null, null, null, 1, null, null, 2, null, null],
    "abnormalExemptTraits": ["inran", "ai"],
    // ABLUP10: Lv5 が上限、[愛][妄信] があれば Lv10 まで解放（妄信は欠け）。
    "capGate": { "max": 5, "traits": ["ai"] },
  },
  {
    "id": "abl_desire", "label": "欲望", "maxLv": 10, "param": "desire",
    // eraMaou ABLUP11 実測値（欲情の珠 単一ルート）。
    "price": { "type": "single", "juel": "lust", "table": [5, 50, 1000, 5000, 12000, 20000, 30000, 50000, 80000, 150000] },
    // ABLUP11: Lv4→5 は異常経験1、Lv7→8 は異常経験3（免除は解放/快感に
    // 素直/即落ち/淫乱。写像できるのは淫乱のみ）。
    "abnormalTable": [null, null, null, null, 1, null, null, 3, null, null],
    "abnormalExemptTraits": ["inran"],
    "desireChannelMult": [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.05, 1.1, 1.15, 1.2, 1.4],
  },
  {
    "id": "abl_skill", "label": "技巧", "maxLv": 10, "param": "skill",
    // eraMaou ABLUP12 実測値（習得の珠 単一ルート、経験ゲートなし）。
    "price": { "type": "single", "juel": "learning", "table": [1, 25, 200, 3000, 8000, 12000, 16000, 22000, 28000, 35000] },
  },
  {
    "id": "abl_service", "label": "奉仕精神", "maxLv": 10, "param": "trust",
    // eraMaou ABLUP16 実測の3ルート:
    // [0] 屈服の珠 A + ゲート（絶頂経験 ≥ E または 精液経験 ≥ E）
    // [1] 恭順の珠 B + ゲート（奉仕快楽経験 ≥ D）
    // [2] 習得の珠 C + ゲート（絶頂経験 ≥ 1）。C は Lv3 以降ルートなし。
    "price": { "type": "or", "options": [
      { "juel": "yield", "table": [100, 1200, 5000, 10000, 30000, 50000, 70000, 100000, 150000, 200000],
        "gateExp": { "exp": "climax", "orExp": "semen", "table": [1, 3, 6, 10, 20, 80, 150, 200, 400, 800] } },
      { "juel": "devotion", "table": [20, 400, 2000, 3000, 10000, 20000, 30000, 50000, 80000, 150000],
        "gateExp": { "exp": "service", "table": [1, 1, 20, 20, 100, 200, 350, 500, 700, 1000] } },
      { "juel": "learning", "table": [100, 2000, 10000, null, null, null, null, null, null, null],
        "gateExp": { "exp": "climax", "table": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } },
    ] },
    // ABLUP16: Lv3 以上へ上げる時は異常経験 F = 現在Lv − 2 が必要
    // （免除は献身的/愛/妄信。写像できるのは愛のみ）。全ルート共通。
    "abnormalTable": [null, null, null, 1, 2, 3, 4, 5, 6, 7],
    "abnormalExemptTraits": ["ai"],
  },
  {
    "id": "abl_addiction", "label": "快楽中毒", "maxLv": 10, "param": "desire",
    "price": { "type": "and", "entries": [
      { "juel": "lust", "table": [3000, 6000, 12000, 20000, 32000, 50000, 70000, 100000, 150000, 200000] },
      { "juel": "pleasure", "table": [10000, 25000, 50000, 100000, 200000, 250000, 320000, 500000, 800000, 1000000] },
      { "juel": "shame", "table": [1000, 3000, 6000, 15000, 30000, 40000, 50000, 70000, 100000, 150000] },
    ] },
    "requires": { "ability": "abl_desire", "minLv": 3 },
    // 快楽中毒は eraMaou の能力カタログ（Abl.csv / ABLUP 群）に存在しない
    // パック独自能力 = 「余計」。価格列は ABLUP31（自慰中毒）の実測列の
    // 流用だった。原作形の購入体系と矛盾しないよう購入対象外にし、
    // 定義自体は旧セーブの Lv 保持のため残す（削除は本人の最終確認待ち）。
    "blocked": "原作（eraMaou）に存在しない能力のため購入対象外（扱いは判断待ち）",
  },
  {
    "id": "abl_buyoff", "label": "反発の払拭", "maxLv": 3, "mark": "peak_stress",
    "price": { "type": "single", "juel": "yield", "table": [1000, 3000, 5000] },
    "special": "buy_off_stress",
    "requiresMarks": { "peak_submission": "peak_stress" },
    "requiresAbilityMark": { "abl_obedience": "peak_stress" },
  },
  {
    "id": "sense_c", "label": "C感覚", "maxLv": 10,
    // eraMaou ABLUP0 実測値（原作の支払いは快Cの珠。試作は部位別珠が
    // 無く快楽の珠へ一本化する写像のまま、価格数値だけ原作表に一致）。
    // 上限は通常 Lv5（Lv6 以降は解放素質が必要。試作に無いため hardCap）。
    "price": { "type": "single", "juel": "pleasure", "table": [1, 20, 400, 8000, 20000, 40000, 60000, 90000, 120000, 180000] },
    "capGate": { "max": 5, "traits": [] },
  },
  {
    "id": "sense_v", "label": "V感覚", "maxLv": 10,
    // eraMaou ABLUP2 実測値（快Vの珠 → 快楽の珠へ写像）。V経験ゲート付き。
    "price": { "type": "single", "juel": "pleasure", "table": [1, 20, 400, 8000, 20000, 40000, 60000, 90000, 120000, 180000] },
    "expGate": { "exp": "v", "table": [2, 10, 30, 75, 150, 180, 250, 350, 500, 600] },
    "capGate": { "max": 5, "traits": [] },
  },
  {
    "id": "sense_b", "label": "B感覚", "maxLv": 10,
    // eraMaou ABLUP1 実測値（快Bの珠 → 快楽の珠へ写像）。
    "price": { "type": "single", "juel": "pleasure", "table": [1, 20, 400, 8000, 20000, 40000, 60000, 90000, 120000, 180000] },
    "capGate": { "max": 5, "traits": [] },
  },
  {
    "id": "sense_a", "label": "A感覚", "maxLv": 10,
    // eraMaou ABLUP3 実測値（快Aの珠 → 快楽の珠へ写像）。A経験ゲート付き。
    // 旧 expReq / expDiscount は era天 ABLUP 由来のため Maou 形へ置換した
    // （Maou の A経験要件は ABLUP2 の V経験表と同数列）。
    "price": { "type": "single", "juel": "pleasure", "table": [1, 20, 400, 8000, 20000, 40000, 60000, 90000, 120000, 180000] },
    "expGate": { "exp": "a", "table": [2, 10, 30, 75, 150, 180, 250, 350, 500, 600] },
    "capGate": { "max": 5, "traits": [] },
  },
  // ---------------------------------------------------------------- 中毒系7種
  // eraMaou JP原版 Abl.csv の有効な中毒能力（ABL 30〜40 のうち 30/31/32/33/37/39/40）。
  // 価格は各 ABLUP の [0] 案（珠の AND 複合＋経験要件）。通貨写像は原作 PALAM →
  // 試作の珠: 欲情→lust、屈服→yield、恭順→devotion、恥情→shame、快C・快F→pleasure。
  // 購入ゲートは現行どおり（Lv＜上限・価格存在・珠残高のみ）で、expReq /
  // requiresList / sumGroup / lv5Gate は定義データとして保持するに留める。
  {
    "id": "add_sex", "label": "性交中毒", "maxLv": 10,
    "price": { "type": "and", "entries": [
      { "juel": "lust", "table": [3000, 8000, 15000, 30000, 55000, 70000, 90000, 120000, 150000, 200000] },
      { "juel": "yield", "table": [10000, 25000, 50000, 100000, 200000, 300000, 400000, 550000, 700000, 900000] },
    ] },
    "expReq": { "exp": "性交経験", "table": [10, 25, 40, 80, 200, 400, 800, 1200, 1500, 2000] },
    "requiresList": [{ "ability": "abl_service", "label": "奉仕精神", "note": "≥ 次Lv" }],
    // ABLUP30 の機能ゲート: 性交経験 C 表・奉仕精神 ≥ 現在Lv+1・
    // 異常経験 F = 現在Lv − 1（Lv2 から）。
    "expGate": { "exp": "sex", "table": [10, 25, 40, 80, 200, 400, 800, 1200, 1500, 2000] },
    "abilityGates": [{ "ability": "abl_service", "plus": 1 }],
    "abnormalTable": [null, null, 1, 2, 3, 4, 5, 6, 7, 8],
    "sumGroup": "sex_mast",
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
  {
    "id": "add_mast", "label": "自慰中毒", "maxLv": 10,
    "price": { "type": "and", "entries": [
      { "juel": "lust", "table": [3000, 6000, 12000, 20000, 32000, 50000, 70000, 100000, 150000, 200000] },
      { "juel": "pleasure", "table": [10000, 25000, 50000, 100000, 200000, 250000, 320000, 500000, 800000, 1000000] },
      { "juel": "shame", "table": [1000, 3000, 6000, 15000, 30000, 40000, 50000, 70000, 100000, 150000] },
    ] },
    "expReq": { "exp": "自慰経験", "table": [100, 250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000] },
    "expReqs": [{ "exp": "調教自慰経験", "table": [20, 40, 60, 100, 150, 200, 320, 500, 800, 1000] }],
    "requiresList": [
      { "label": "露出癖", "note": "≥ 次Lv。試作の能力カタログに無い能力" },
      { "ability": "sense_c", "label": "C感覚", "note": "≥ 次Lv" },
    ],
    // ABLUP31 の機能ゲート: 自慰経験 D 表・異常経験 F = 現在Lv − 1。
    // 能力ゲートは原作では露出癖（試作に無い＝欠け）と C感覚の両方で、
    // 機能化できる C感覚分のみ接続する。
    "expGate": { "exp": "mast", "table": [100, 250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000] },
    "abilityGates": [{ "ability": "sense_c", "plus": 1 }],
    "abnormalTable": [null, null, 1, 2, 3, 4, 5, 6, 7, 8],
    "sumGroup": "sex_mast",
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
  {
    "id": "add_semen", "label": "精液中毒", "maxLv": 10,
    "price": { "type": "and", "entries": [
      { "juel": "lust", "table": [3000, 8000, 15000, 30000, 50000, 65000, 90000, 120000, 200000, 500000] },
      { "juel": "yield", "table": [10000, 20000, 35000, 60000, 130000, 190000, 300000, 500000, 800000, 1500000] },
    ] },
    "expReq": { "exp": "精液経験", "table": [10, 25, 40, 80, 200, 500, 800, 1200, 1500, 2000] },
    "requiresList": [
      { "ability": "abl_service", "label": "奉仕精神", "note": "≥ 次Lv" },
      { "ability": "abl_desire", "label": "欲望", "note": "≥ 次Lv" },
    ],
    // ABLUP32 の機能ゲート: 精液経験 C 表・奉仕精神と欲望が共に
    // ≥ 現在Lv+1・異常経験 D = 現在Lv − 1（Lv2 から）。
    "expGate": { "exp": "semen", "table": [10, 25, 40, 80, 200, 500, 800, 1200, 1500, 2000] },
    "abilityGates": [{ "ability": "abl_service", "plus": 1 }, { "ability": "abl_desire", "plus": 1 }],
    "abnormalTable": [null, null, 1, 2, 3, 4, 5, 6, 7, 8],
    "sumGroup": "semen_les_beast",
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
  {
    "id": "add_les", "label": "レズ中毒", "maxLv": 10,
    "price": { "type": "and", "entries": [
      { "juel": "pleasure", "table": [5000, 15000, 23000, 50000, 70000, 120000, 200000, 350000, 500000, 800000] },
      { "juel": "lust", "table": [1200, 3900, 6000, 18000, 30000, 55000, 70000, 100000, 150000, 300000] },
      { "juel": "yield", "table": [1200, 3900, 6000, 18000, 30000, 55000, 70000, 100000, 150000, 300000] },
    ] },
    "expReq": { "exp": "レズ経験", "table": [300, 600, 1000, 1400, 2100, 3000, 4000, 5200, 6500, 8000] },
    "requiresList": [{ "label": "レズっ気", "note": "≥ 次Lv。試作の能力カタログに無い能力" }],
    "sumGroup": "semen_les_beast",
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
  {
    "id": "add_prost", "label": "売春中毒", "maxLv": 10,
    "price": { "type": "and", "entries": [
      { "juel": "devotion", "table": [2000, 5000, 8000, 14000, 22000, 34000, 55000, 80000, 150000, 300000] },
      { "juel": "lust", "table": [3000, 8000, 15000, 30000, 50000, 80000, 120000, 180000, 300000, 600000] },
      { "juel": "yield", "table": [1000, 2500, 5500, 10000, 20000, 30000, 50000, 60000, 90000, 150000] },
    ] },
    "expReq": { "exp": "売春経験", "table": [50, 100, 150, 250, 400, 500, 800, 1200, 2000, 3000] },
    "requiresList": [{ "ability": "abl_desire", "label": "欲望", "note": "≥ 次Lv" }],
    // ABLUP37: Lv5 以降は [淫乱] 等の解放素質が必要（写像できるのは
    // 淫乱のみ）。売春経験の獲得経路自体が試作に無いため expGate は
    // 接続しない（欠け）。
    "capGate": { "max": 5, "traits": ["inran"] },
    "sumGroup": "prost_tentacle",
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
  {
    "id": "add_beast", "label": "獣姦中毒", "maxLv": 10,
    "price": { "type": "and", "entries": [
      { "juel": "lust", "table": [2000, 5000, 10000, 20000, 30000, 45000, 75000, 100000, 200000, 300000] },
      { "juel": "yield", "table": [2000, 5000, 10000, 20000, 30000, 45000, 75000, 100000, 200000, 300000] },
    ] },
    "expReq": { "exp": "獣姦経験", "table": [30, 100, 220, 400, 800, 1600, 2000, 2800, 4000, 6000] },
    "requiresList": [{ "ability": "abl_desire", "label": "欲望", "note": "≥ 次Lv" }],
    // ABLUP39: Lv5 以降は [淫乱] 等の解放素質が必要（写像できるのは
    // 淫乱のみ）。獣姦経験の獲得経路自体が試作に無いため expGate は
    // 接続しない（欠け）。
    "capGate": { "max": 5, "traits": ["inran"] },
    "sumGroup": "semen_les_beast",
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
  {
    "id": "add_f", "label": "F中毒", "maxLv": 10,
    "price": { "type": "single", "juel": "pleasure", "table": [2000, 5000, 10000, 20000, 30000, 45000, 75000, 100000, 200000, 300000] },
    "expReq": { "exp": "異常経験" },
    "requiresList": [{ "ability": "abl_desire", "label": "欲望", "note": "≥ 次Lv" }],
    // ABLUP40 の機能ゲート: 欲望 ≥ 現在Lv+1（異常経験 F の数値は
    // 未実測のため付けない）。
    "abilityGates": [{ "ability": "abl_desire", "plus": 1 }],
    "lv5Gate": "特定素質所持時のみ解放（原作）",
  },
] as unknown as AbilityDef[];
/** 部位感覚の倍率テーブル（原作 SOURCE_CHECK 実測、Lv0..10）。
 * CUP チェーンの部位別快CUPに掛ける。Lv0 の ×0.50 も原作どおり適用する。 */
export const SENSE_MULT = [0.5, 1.8, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0, 15.0, 17.0, 20.0] as unknown as number[];
/** 快パラメータ → 対応する感覚能力。快F に対応する感覚は原作に無い（倍率 ×1）。 */
export const PART_SENSE_ABILITY = { "kai_c": "sense_c", "kai_v": "sense_v", "kai_a": "sense_a", "kai_b": "sense_b" } as unknown as Record<string, string>;
// ---------------------------------------------------------------- 射精ゲージ（Bテーブル方式、第7弾）
// 原作 ejac_chain.md §3 の実測倍率表。倍率の値そのものは全て原作実測値。
// 試作側の対応づけは「パラメータ（0〜1000）→ レベル」の換算規則
// （レベル = min(5, floor(値/200))）だけで、これは試作側の対応づけであり
// 原作の数値ではない。奉仕精神だけは能力 abl_service の Lv をそのまま使う。
/** 調教者技巧（試作 skill パラメータをレベル換算）: Lv0..5+ */
export const EJAC_SKILL_MULT = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0] as unknown as number[];
/** 対象の従順（obedience をレベル換算）: Lv0..5+ */
export const EJAC_OBEDIENCE_MULT = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3] as unknown as number[];
/** 対象の欲望（desire をレベル換算）: Lv0..5+ */
export const EJAC_DESIRE_MULT = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5] as unknown as number[];
/** 対象の奉仕精神（abl_service の Lv をそのまま）: Lv0..5+。奉仕系コマンドにのみ掛ける */
export const EJAC_SERVICE_MULT = [0.5, 0.8, 1.2, 1.5, 1.8, 2.4] as unknown as number[];
/** 対象 PALAM:潤滑の射精ゲージ倍率表（帯0..4 = LV1未満..LV4以上）。
 * eraMaou JP原版 COMF_VAGINASEX の B 倍率そのまま。膣性交系コマンドの
 * 射精チェーンに接続済み（engine の ejacChain の lubMult）。 */
export const EJAC_LUBRICATION_MULT = [0.6, 0.8, 1.0, 1.2, 1.4] as unknown as number[];
/** アナル性交系の潤滑倍率表（帯0..4）。eraMaou JP原版 COMF_ANALSEX の
 * B 倍率そのまま（膣系とは別表）。アナル性交系コマンドの射精チェーンに
 * 接続済み。 */
export const EJAC_ANAL_LUBRICATION_MULT = [0.4, 0.7, 1.0, 1.3, 1.6] as unknown as number[];
/** 【未接続・データ保持のみ】調教者 C感覚の倍率表（Lv0..5+）。
 * 試作に調教者側の感覚能力が無いため、計算には使わない。 */
export const EJAC_C_SENSE_MULT = [1.0, 1.5, 2.0, 2.5, 3.5, 5.0] as unknown as number[];
// ---------------------------------------------------------------- 中毒系（eraMaou JP原版 移植）
// 中毒充足ソース（SOURCE:7）の換算 @SOURCE_CHECK_UP_POISON
// （SYSTEM_SOURCE.ERB:1288）: 恭順PALAM += 充足 × m0、欲情PALAM += 充足 × m1。
// 倍率は能力 abl_desire（原作 ABL:11 欲望）の Lv で決まる（Lv0..7、8以上は末尾）。
// 試作写像: 恭順PALAM → パラメータ従順、欲情PALAM → パラメータ欲望。
export const ADDICT_CONV_M0 = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5] as unknown as number[];
export const ADDICT_CONV_M1 = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as unknown as number[];
/** 精液中毒: 射精発生時に加える中毒充足（コマンド別、精液中毒Lv 0..5+。
 * 全表 Lv0 = 0。出典は各 COMF の射精チェック節。大量相当（段位 tier≥2）では
 * ×2.00、素股（com33）のみ ×1.50。射精ゲージ B を持たないコマンドの表は
 * 当面休眠（ゲージ側は変更しない）。 */
export const SEMEN_ADDICT_EJAC = {
  "fellatio": [0, 500, 1200, 3000, 6000, 12000],
  "com30": [0, 200, 600, 1500, 3000, 6000],
  "com32": [0, 500, 1200, 3000, 6000, 12000],
  "com33": [0, 200, 400, 700, 1000, 1500],
  "com34": [0, 300, 1000, 1500, 2200, 3000],
  "com35": [0, 200, 600, 1500, 3000, 6000],
  "com36": [0, 300, 1000, 1500, 2200, 3000],
  "com37": [0, 200, 500, 1200, 2500, 5000],
  "com38": [0, 200, 600, 1500, 3000, 6000],
  "com80": [0, 500, 1200, 3000, 6000, 12000],
} as unknown as Record<string, number[]>;
/** 精液中毒: フェラ系（fellatio / com80）の射精ゲージ加算 B への倍率
 * （精液中毒Lv 0..5+。Lv0 = 1.00 で素通し）。com32/com35 の倍率表は
 * Lv0=0.80 始まりで Maou 自身の B 基礎値と一体のため適用しない（欠け）。 */
export const SEMEN_EJAC_GAUGE_MULT = [1.0, 1.2, 1.3, 1.5, 1.7, 2.0] as unknown as number[];
/** 自慰中毒: com3 自慰で毎回（絶頂非依存）加える中毒充足（自慰中毒Lv 0..5+） */
export const MAST_ADDICT_SOURCE = [0, 100, 300, 800, 1500, 2500] as unknown as number[];
/** 自慰中毒: com3 の快ソース（部位駆動分）への倍率（自慰中毒Lv 0..5+。Lv0 = 1.00 で素通し） */
export const MAST_PLEASURE_MULT = [1.0, 1.1, 1.2, 1.3, 1.5, 1.7] as unknown as number[];
export const EVENTS = [{"id": "ev_desire_1", "when": "desire >= 200", "once": true, "text": "【変化】彼女の視線が、こちらの手元に留まるようになった。本人は気づいていない。"}, {"id": "ev_obed_1", "when": "obedience >= 300", "once": true, "text": "【変化】命令への反応が速くなった。考える前に、身体が動いている。"}, {"id": "ev_sub_1", "when": "submission >= 250", "once": true, "text": "【変化】彼女は抵抗の言葉を飲み込むようになった。代わりに、許可を求める目をする。"}, {"id": "ev_stress", "when": "stress >= 500", "once": false, "text": "【警告】反発が高まっている。このままでは崩れる。調教を切り上げるか、信頼を回復すべきだ。"}, {"id": "ev_mark_trust", "when": "mark_peak_trust >= 1", "once": true, "text": "【到達記録】信頼が最初の節目に届いたことが、記録として残った。"}, {"id": "ev_debt_call", "when": "circ_debtor == 1 && trust >= 60", "once": true, "text": "【債務】返済の催促が届いた。彼女の前でその話はされなかったが、空気は少しだけ重くなった。"}] as unknown as EventDef[];
export const MARKS = [{"id": "peak_trust", "label": "信頼到達", "param": "trust", "thresholds": [250, 500, 800]}, {"id": "peak_obedience", "label": "従順到達", "param": "obedience", "thresholds": [250, 500, 800]}, {"id": "peak_desire", "label": "欲望到達", "param": "desire", "thresholds": [250, 500, 800]}, {"id": "peak_submission", "label": "屈服到達", "param": "submission", "thresholds": [200, 450, 700]}, {"id": "peak_relief", "label": "安心到達", "param": "relief", "thresholds": [250, 500, 800]}, {"id": "peak_stress", "label": "反発到達", "param": "stress", "thresholds": [300, 550, 800]}] as unknown as MarkDef[];
// ---------------------------------------------------------------- 原作準拠レイヤー（2026-11-09 原作準拠改良）
// eraMaou JP 0.930 実測の追加表。出典は各表の注記と
// ~/workspace/era_proto/research/engine_fidelity_report.md を参照。

/** コマンド実行判定（eraMaou @COM_ORDER + 各 COMF の判定節）。
 * 原作の判定は確率ではなく「実行値 A ≥ 閾値 V」の決定論ゲートで、
 * A < V のコマンドは実行自体が成立しない（コスト・ソース・経験は
 * 一切発生しない）。ここにはコマンド固有の追加項だけを置き、共通項
 * （@COM_ORDER）はエンジン側で計算する。
 * terms の key: 能力ID / "mark_pleasure"（快楽刻印）/ "mark_submission"
 * （屈服刻印、COMF37 の追加項）/ "palam_lust"（欲情PALAM の帯 0〜5）。
 * auto は自動成功条件（式。名前空間は namespaceOf + fall_ai/fall_inran）。
 * 【欠け】素質項（恥じらい・献身的 等の TALENT 項）・汚れ項・露出癖 /
 * サドっ気 / マゾっ気 項は、試作に対応する素質・能力が無いため落とした。 */
export interface OrderJudgeDef {
  v: number;
  terms: { key: string; mult: number }[];
  auto?: string;
}
export const ORDER_JUDGES: Record<string, OrderJudgeDef> = {
  // COMF6 キスする: V=15、自動成功 = 従順≥2 or 奉仕精神≥3 or [愛]
  "kiss": { v: 15, auto: "abl_obedience >= 2 || abl_service >= 3 || fall_ai >= 1",
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "mark_pleasure", mult: 2 }, { key: "palam_lust", mult: 1 }] },
  // COMF3 自慰: V=33（露出癖×4 は欠け）
  "com3": { v: 33,
    terms: [{ key: "abl_desire", mult: 3 }, { key: "add_mast", mult: 3 }, { key: "mark_pleasure", mult: 3 }, { key: "palam_lust", mult: 3 }] },
  // COMF7 秘貝開帳（表示名: 広げて見せる）: V=22（露出癖×3 は欠け）
  "com7": { v: 22,
    terms: [{ key: "abl_desire", mult: 3 }, { key: "sense_v", mult: 2 }, { key: "abl_service", mult: 4 }, { key: "add_mast", mult: 3 }, { key: "palam_lust", mult: 3 }] },
  // COMF24 逆レイプ: V=40（サドっ気×2 は欠け）
  "com24": { v: 40,
    terms: [{ key: "abl_desire", mult: 2 }, { key: "abl_service", mult: 4 }, { key: "mark_pleasure", mult: 2 }, { key: "palam_lust", mult: 2 }] },
  // COMF25 逆アナルレイプ: V=40（同上）
  "com25": { v: 40,
    terms: [{ key: "abl_desire", mult: 2 }, { key: "abl_service", mult: 4 }, { key: "mark_pleasure", mult: 2 }, { key: "palam_lust", mult: 2 }] },
  // COMF30 手淫: V=14
  "com30": { v: 14,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 1 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF31 フェラチオ: V=24（汚れ項は欠け）
  "fellatio": { v: 24,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF32 パイズリ: V=30
  "com32": { v: 30,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF33 素股: V=20
  "com33": { v: 20,
    terms: [{ key: "abl_desire", mult: 2 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 1 }, { key: "mark_pleasure", mult: 2 }, { key: "palam_lust", mult: 3 }] },
  // COMF34 騎乗位: V=24（判定節の潤滑不足 -5 は閾値未実測のため欠け）
  "com34": { v: 24,
    terms: [{ key: "abl_desire", mult: 3 }, { key: "sense_v", mult: 2 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 1 }, { key: "mark_pleasure", mult: 3 }, { key: "palam_lust", mult: 3 }] },
  // COMF35 泡踊り: V=30
  "com35": { v: 30,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF36 騎乗位アナル: V=24
  "com36": { v: 24,
    terms: [{ key: "abl_desire", mult: 3 }, { key: "sense_a", mult: 2 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 1 }, { key: "mark_pleasure", mult: 3 }, { key: "palam_lust", mult: 3 }] },
  // COMF37 アナル奉仕: V=23（屈服刻印の追加項は COM_ORDER 共通項とは別枠）
  "com37": { v: 23,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 3 }, { key: "mark_pleasure", mult: 2 }, { key: "mark_submission", mult: 3 }] },
  // COMF38 足コキ: V=22（サドっ気×5 は欠け）
  "com38": { v: 22,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 1 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF80 イラマチオ: V=36
  "com80": { v: 36,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF87 ピアシング: V は部位別 30〜44（部位選択が試作に無いため
  // 先頭部位ニプルの 36 で代表させる。マゾっ気×4 は欠け）
  "com87": { v: 36,
    terms: [{ key: "abl_desire", mult: 3 }, { key: "mark_pleasure", mult: 3 }, { key: "palam_lust", mult: 3 }] },
  // 複合コマンド（COMF123〜127 フェラ系ファミリー）: 固有項は
  // 欲望×1 / 奉仕精神×4 / 精液中毒×3 / 快楽刻印×1（COMF123/124 実測。
  // 125〜127 は同ファミリーの雛形として同形。欲情帯×1 は COMF31 の形）
  "com123": { v: 36,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  "com124": { v: 40,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF125 フェラ自慰: 本体 V=50（自慰側の副判定 V=40 は分割しない＝欠け）
  "com125": { v: 50,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  "com126": { v: 40,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  "com127": { v: 40,
    terms: [{ key: "abl_desire", mult: 1 }, { key: "abl_service", mult: 4 }, { key: "add_semen", mult: 3 }, { key: "mark_pleasure", mult: 1 }, { key: "palam_lust", mult: 1 }] },
  // COMF135 セルフクンニ: V=33（露出癖×4 は能力が無いため欠け）
  "com135": { v: 33,
    terms: [{ key: "abl_desire", mult: 3 }, { key: "add_mast", mult: 3 }, { key: "mark_pleasure", mult: 3 }, { key: "palam_lust", mult: 3 }] },
};

/** 屈服刻印の固定対応（eraMaou 各 COMF の TFLAG:200 実測）。
 * その手に設定される値（1/2/3）が現行の屈服刻印Lvより大きければ
 * 刻印がそのLvまで上がる。分岐で値が変わるコマンドは基本値を置き、
 * 分岐側は注記に留める（com31 は分岐で 3、com34/36 は分岐で 3、
 * com6 は分岐で 2 になる箇所がある）。挿入系性交（COMF20 等）は
 * TFLAG:200 を設定しない（実測で無し）。 */
export const YIELD_MARKS: Record<string, number> = {
  "com3": 2, "kiss": 1, "com24": 2, "com25": 2, "com30": 1,
  "fellatio": 2, "com32": 2, "com33": 1, "com34": 2, "com35": 3,
  "com36": 2, "com37": 3, "com38": 1, "com55": 1, "com80": 2,
  // 複合（COMF 実測の TFLAG:200）: 123=3 / 124=2 / 125=3 / 126=2 /
  // 127=2 / 135=2。挿入系複合（120/121/128〜134）は設定なし（実測どおり）
  "com123": 3, "com124": 2, "com125": 3, "com126": 2, "com127": 2,
  "com135": 2,
};

/** 奉仕フラグ（eraMaou 各 COMF の TFLAG:100 = 1 実測）。
 * 奉仕快楽経験（EXP:21）の発生条件。 */
export const SERVICE_FLAG_COMMANDS: Record<string, true> = {
  "com30": true, "fellatio": true, "com32": true, "com33": true,
  "com34": true, "com37": true, "com38": true,
  // 複合の奉仕系（123〜127）: COMF の TFLAG:100 は未確認のため、
  // フェラ系ファミリーからの写像として立てる（要再実測）
  "com123": true, "com124": true, "com125": true, "com126": true,
  "com127": true,
};

/** 習得の発生表（eraMaou 各 COMF の SOURCE:4 性行動 実測の段階表）。
 * UP:7 習得 = この値（@SOURCE_CHECK_UP_IMPULSIVE の二段倍率
 * （奉仕精神 × 奉仕技術）は、試作に奉仕技術が無いため接続しない＝欠け）。
 * ability は段階を引く能力: 原作の索引が ABL:16 の kiss は abl_service、
 * ABL:12 の com3 は abl_skill、その他は原作 ABL:13 奉仕技術索引を
 * abl_service へ写像した。索引未確認の com7 は含めない。 */
export const LEARN_STAGES: Record<string, { ability: string; table: number[] }> = {
  "kiss": { ability: "abl_service", table: [50, 150, 200, 250, 300, 350] },
  "caress": { ability: "abl_service", table: [60] },
  "breast_caress": { ability: "abl_service", table: [60] },
  "com3": { ability: "abl_skill", table: [100, 160, 220, 280, 340] },
  "com30": { ability: "abl_service", table: [250, 300, 350, 400, 450, 500] },
  "fellatio": { ability: "abl_service", table: [420, 500, 580, 660, 740, 820] },
  "com32": { ability: "abl_service", table: [420, 500, 580, 660, 740, 820] },
  "com33": { ability: "abl_service", table: [200, 250, 300, 350, 400, 450] },
  "com34": { ability: "abl_service", table: [200, 250, 350, 450, 600, 750] },
  "com35": { ability: "abl_service", table: [500, 700, 900, 1100, 1300, 1500] },
  "com36": { ability: "abl_service", table: [200, 250, 350, 450, 600, 750] },
  "com37": { ability: "abl_service", table: [420, 500, 580, 660, 740, 820] },
  "com38": { ability: "abl_service", table: [300, 350, 400, 450, 500, 580] },
  "com80": { ability: "abl_service", table: [420, 500, 580, 660, 740, 820] },
  // 複合の SOURCE:4 実測表（索引は原作 ABL:13 奉仕技術 → abl_service 写像。
  // 既存表と同じ規約）。com125 は SOURCE:4 の段階表が無いため含めない
  "com123": { ability: "abl_service", table: [620, 700, 820, 940, 1100, 1260] },
  "com124": { ability: "abl_service", table: [620, 700, 820, 940, 1100, 1260] },
  "com126": { ability: "abl_service", table: [500, 600, 700, 800, 900, 1000] },
  "com127": { ability: "abl_service", table: [620, 700, 820, 940, 1100, 1260] },
};

/** 経験カウンタの手ごとの増加（eraMaou COMF / COMF_VAGINASEX /
 * COMF_ANALSEX 実測の基本値）。キーはエンジンの経験カウンタID:
 * v = V経験（EXP:0）、a = A経験（EXP:1）、sex = 性交経験（EXP:5）、
 * mast = 自慰経験（EXP:10）。条件分岐で増える分は含めない。 */
export const EXP_GAINS: Record<string, Partial<Record<string, number>>> = {
  "sex_v": { v: 1, sex: 1 }, "com21": { v: 1, sex: 1 }, "com22": { v: 1, sex: 1 },
  "com23": { v: 1, sex: 1 }, "com34": { v: 1, sex: 1 },
  "com81": { v: 1, sex: 1 }, "com83": { v: 1, sex: 1 },
  "com8": { v: 1 }, "com11": { v: 1 },
  "sex_a": { a: 1, sex: 1 }, "com27": { a: 1, sex: 1 }, "com28": { a: 1, sex: 1 },
  "com29": { a: 1, sex: 1 }, "com36": { a: 1, sex: 1 },
  "com82": { a: 1, sex: 1 },
  "com3": { mast: 1 },
  // 複合の挿入系（COMF120/121/128〜134）: V経験+1・性交経験+1
  // （挿入系 COMF の基本形）。フェラ系複合の EXP:22（口淫経験）は
  // 試作にカウンタが無いため未接続（欠け）
  "com120": { v: 1, sex: 1 }, "com121": { v: 1, sex: 1 },
  "com128": { v: 1, sex: 1 }, "com129": { v: 1, sex: 1 },
  "com130": { v: 1, sex: 1 }, "com131": { v: 1, sex: 1 },
  "com132": { v: 1, sex: 1 }, "com133": { v: 1, sex: 1 },
  "com134": { v: 1, sex: 1 },
};

/** アイテム定義（eraMaou Item.csv 実測の原作価格 + eraMuse の購入価格）。
 * 購入価格は §9.1 のお小遣い式（セッション終了ごとに 100 付与）との
 * 整合のため原作価格の 1/100（切り上げ相当・最小1）に置いた写像
 * （原作価格そのものではない = 報告済みの設計差分）。
 * label は改名済みコマンド名に合わせた表示名（原作名は出さない方針と
 * 同じ）。special: "trainer_skill" は ITEM:52【技巧Lv】で、在庫では
 * なく調教者の技巧Lvそのものを上げる（原作 @TECHNIQUE_OF_MASTER_UP）。
 * ここに無いアイテム（コンドーム・罠系・知識系など）は、対応する
 * システムが試作に無いため未収録（欠け）。 */
export interface ItemDef {
  label: string;
  priceOrig: number;
  price: number;
  consumable?: boolean;
  special?: "trainer_skill";
}
export const ITEM_DEFS: Record<number, ItemDef> = {
  0: { label: "ローター", priceOrig: 200, price: 2 },
  1: { label: "ディルド", priceOrig: 500, price: 5 },
  2: { label: "E・マッサージャー", priceOrig: 2000, price: 20 },
  3: { label: "アナルバイブ", priceOrig: 5000, price: 50 },
  4: { label: "ペニスバンド", priceOrig: 2000, price: 20 },
  5: { label: "アイマスク", priceOrig: 4000, price: 40 },
  6: { label: "ビデオカメラ", priceOrig: 7000, price: 70 },
  9: { label: "ボールギャグ", priceOrig: 1000, price: 10 },
  10: { label: "鞭", priceOrig: 200, price: 2 },
  11: { label: "針", priceOrig: 2000, price: 20 },
  12: { label: "オナホール", priceOrig: 4000, price: 40 },
  13: { label: "プレイマット", priceOrig: 5000, price: 50 },
  14: { label: "縄", priceOrig: 3000, price: 30 },
  15: { label: "浣腸器＋プラグ", priceOrig: 8000, price: 80 },
  16: { label: "大鏡", priceOrig: 30000, price: 300 },
  17: { label: "搾乳機", priceOrig: 1500, price: 15 },
  18: { label: "首輪", priceOrig: 5000, price: 50 },
  19: { label: "エプロン", priceOrig: 10000, price: 100 },
  20: { label: "アナルビーズ", priceOrig: 7000, price: 70 },
  21: { label: "アナル電極", priceOrig: 50000, price: 500 },
  23: { label: "ボンデージ", priceOrig: 10000, price: 100 },
  25: { label: "ローション", priceOrig: 200, price: 2, consumable: true },
  26: { label: "媚薬", priceOrig: 2000, price: 20, consumable: true },
  27: { label: "利尿剤", priceOrig: 1000, price: 10, consumable: true },
  28: { label: "記録メディア", priceOrig: 500, price: 5, consumable: true },
  34: { label: "ピアスリング", priceOrig: 5000, price: 50 },
  52: { label: "技巧Lv", priceOrig: 5000, price: 50, special: "trainer_skill" },
};

/** コマンド使用時に消費するアイテム（eraMaou COMABLE の所持ゲートと
 * 消耗品フラグの写像）: コマンドID → アイテムID。実行が成立した手で
 * 1つ消費する。com53 は ITEM:6 所持に加えて ITEM:28 を消費する。 */
export const CONSUMABLE_USE: Record<string, number> = {
  "com50": 25, "com51": 26, "com52": 27, "com53": 28,
};

/** 不潔ソース（eraMaou COMF の SOURCE:8 実測、Y=0 = 清潔な身体の値）。
 * 試作に STAIN（汚れ蓄積）が無いため、Y は常に 0 として評価する
 * （Y>0 の汚れ連動分は欠け）。mode:
 * - "flat": base をそのまま使う
 * - "ladder": base × 奉仕精神倍率（DIRTY_SERVICE_MULT、奉仕精神Lv索引）
 * - "stage": table[奉仕精神Lv] をそのまま使う
 * ここに無いコマンドは原作でも SOURCE:8 を持たない（性交位系・自慰・
 * アナル舐め・アナル愛撫など。不快は汚れ連動でしか入らない）。 */
export interface DirtyDef { base: number; mode: "flat" | "ladder" | "stage"; table?: number[] }
export const DIRTY_SOURCES: Record<string, DirtyDef> = {
  "caress": { base: 30, mode: "flat" },
  "breast_caress": { base: 20, mode: "flat" },
  "kiss": { base: 10, mode: "flat" },
  "com30": { base: 60, mode: "ladder" },
  "fellatio": { base: 100, mode: "ladder" },
  "com32": { base: 0, mode: "stage", table: [400, 300, 150, 50, 20, 0] },
  "com33": { base: 60, mode: "ladder" },
  "com34": { base: 60, mode: "ladder" },
  "com35": { base: 0, mode: "stage", table: [200, 150, 100, 50, 20, 0] },
  "com36": { base: 60, mode: "ladder" },
  "com37": { base: 50, mode: "ladder" },
  "com38": { base: 50, mode: "ladder" },
  "com46": { base: 1000, mode: "flat" },
  "com80": { base: 100, mode: "ladder" },
  "com123": { base: 100, mode: "ladder" },
  "com124": { base: 100, mode: "ladder" },
  "com125": { base: 100, mode: "ladder" },
  "com126": { base: 100, mode: "ladder" },
  "com127": { base: 100, mode: "ladder" },
};
/** 不潔ソースの奉仕精神倍率（eraMaou COMF の奉仕系共通梯子） */
export const DIRTY_SERVICE_MULT = [4.0, 2.5, 1.5, 1.0, 0.5, 0.1];
/** 不潔 → 不快（UP:12）の従順倍率（@SOURCE_CHECK_UP_DIRTY、ABL:10 索引） */
export const DIRTY_DISCOMFORT_OBED = [1.0, 0.8, 0.6, 0.3, 0.1, 0.0];
/** 不潔 → 反感（UP:11）の従順倍率（@SOURCE_CHECK_UP_DIRTY、ABL:10 索引） */
export const DIRTY_HATE_OBED = [0.6, 0.4, 0.25, 0.1, 0.0, 0.0];
