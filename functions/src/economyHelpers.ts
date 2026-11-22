/**
 * Pure helpers for FitRPG economy / battle settlement (unit-testable).
 */

export const PVP_REWARDS = {
  win: { xp: 250, gold: 60, trophies: 50 },
  loss: { xp: 50, gold: 15, trophies: -50 },
  draw: { xp: 100, gold: 30, trophies: 0 },
} as const;

export const WORLD_BOSS_ATTACK_ENERGY = 15;
export const WORLD_BOSS_MAX_DAMAGE_PER_CALL = 50000;
export const WORLD_BOSS_ATTACKS_PER_HOUR = 20;

export const PVE_XP_CAP = 500;
export const PVE_GOLD_CAP = 250;
/** Tighter caps to limit App-Check farm (was 400/200 × 120/h). */
export const ACTIVITY_XP_CAP = 200;
export const ACTIVITY_GOLD_CAP = 80;
export const ACTIVITY_REWARDS_PER_HOUR = 40;

/** Free-train / camera session → energy (CF adjustEnergy op "train" only). */
export const TRAIN_ENERGY_PER_SESSION = 5;
export const TRAIN_ENERGY_DAILY_CAP = 40;

/** UTC calendar day key YYYY-MM-DD for train-energy daily cap. */
export function utcDayKey(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Cap train-energy grant by daily budget. Does not apply maxEnergy clamp —
 * caller applies Math.min(maxEnergy, energy + awarded).
 */
export function computeTrainEnergyGrant(opts: {
  requested?: unknown;
  awardedToday: unknown;
  dayKey: unknown;
  todayKey: string;
  perSession?: number;
  dailyCap?: number;
}): { awarded: number; nextAwardedToday: number; dayRollover: boolean } {
  const perSession = opts.perSession ?? TRAIN_ENERGY_PER_SESSION;
  const dailyCap = opts.dailyCap ?? TRAIN_ENERGY_DAILY_CAP;
  const requested = clampInt(opts.requested, 0, perSession, perSession);
  const sameDay = String(opts.dayKey || "") === opts.todayKey;
  const used = sameDay ? clampInt(opts.awardedToday, 0, dailyCap, 0) : 0;
  const remaining = Math.max(0, dailyCap - used);
  const awarded = Math.min(requested, remaining, perSession);
  return {
    awarded,
    nextAwardedToday: used + awarded,
    dayRollover: !sameDay,
  };
}

/** Passive regen: +1 energy per `intervalMs` (default 5 min). Preserves remainder. */
export const ENERGY_REGEN_INTERVAL_MS = 5 * 60 * 1000;

export function computePassiveRegen(opts: {
  energy: number;
  maxEnergy: number;
  lastRegenAtMs: number;
  nowMs: number;
  intervalMs?: number;
}): { energy: number; points: number; nextRegenAtMs: number } {
  const intervalMs = opts.intervalMs ?? ENERGY_REGEN_INTERVAL_MS;
  const maxEnergy = Math.max(0, Math.floor(opts.maxEnergy));
  let energy = Math.floor(opts.energy);
  if (!Number.isFinite(energy)) energy = maxEnergy;
  const lastMs = Number(opts.lastRegenAtMs) || 0;
  const nowMs = Number(opts.nowMs) || Date.now();
  if (!(energy < maxEnergy) || !(lastMs > 0) || !(intervalMs > 0)) {
    return { energy, points: 0, nextRegenAtMs: lastMs > 0 ? lastMs : nowMs };
  }
  const points = Math.floor((nowMs - lastMs) / intervalMs);
  if (points <= 0) {
    return { energy, points: 0, nextRegenAtMs: lastMs };
  }
  const nextEnergy = Math.min(maxEnergy, energy + points);
  return {
    energy: nextEnergy,
    points,
    nextRegenAtMs: lastMs + points * intervalMs,
  };
}

export type PvpOutcome = "win" | "loss" | "draw";

/**
 * Map a derived winnerId to this player's outcome.
 * Optional team id lists make 3v3 teammates share the win (winnerId is team captain / first id).
 */
export function pvpOutcomeForPlayer(
  winnerId: string | null | undefined,
  playerUid: string,
  localTeamIds?: string[],
  opponentTeamIds?: string[]
): PvpOutcome {
  if (!winnerId || winnerId === "draw") return "draw";
  if (winnerId === playerUid) return "win";
  if (localTeamIds?.length || opponentTeamIds?.length) {
    const local = localTeamIds || [];
    const opp = opponentTeamIds || [];
    const playerOnLocal = local.includes(playerUid);
    const playerOnOpp = opp.includes(playerUid);
    const winOnLocal = local.includes(winnerId);
    const winOnOpp = opp.includes(winnerId);
    if (playerOnLocal && winOnLocal) return "win";
    if (playerOnOpp && winOnOpp) return "win";
  }
  return "loss";
}

export function rewardsForPvpOutcome(outcome: PvpOutcome) {
  return PVP_REWARDS[outcome];
}

export function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function clampPvERewards(xp: unknown, gold: unknown): { xp: number; gold: number } {
  return {
    xp: clampInt(xp, 0, PVE_XP_CAP),
    gold: clampInt(gold, 0, PVE_GOLD_CAP),
  };
}

export function clampActivityRewards(xp: unknown, gold: unknown): { xp: number; gold: number } {
  return {
    xp: clampInt(xp, 0, ACTIVITY_XP_CAP),
    gold: clampInt(gold, 0, ACTIVITY_GOLD_CAP),
  };
}

/** Clan war: server rolls outcome from power; client `won` is ignored. */
export function rollClanWarWin(basePower: number, rng: () => number = Math.random): boolean {
  const power = Math.max(50, Number(basePower) || 100);
  const winChance = Math.min(0.72, 0.38 + power / 1200);
  return rng() < winChance;
}

export function applyXpToProgression(
  progressions: Record<string, any>,
  selectedClass: string,
  xpGain: number,
  userData: { statPoints?: number; maxEnergy?: number; energy?: number; basePower?: number }
): { progressions: Record<string, any>; updates: Record<string, any> } {
  const updates: Record<string, any> = {};
  const next = { ...(progressions || {}) };
  let classProg = { ...(next[selectedClass] || { level: 1, xp: 0, totalReps: 0, storyStage: 1 }) };
  classProg.xp = (classProg.xp || 0) + xpGain;

  let earnedStatPoints = 0;
  let levelsGained = 0;
  while (classProg.xp >= classProg.level * 150) {
    classProg.xp -= classProg.level * 150;
    classProg.level += 1;
    earnedStatPoints += 3;
    levelsGained += 1;
  }

  next[selectedClass] = classProg;
  updates.progressions = next;

  if (levelsGained > 0) {
    updates.currentLevel = classProg.level;
    updates.statPoints = (userData.statPoints || 0) + earnedStatPoints;
    const newMax = (userData.maxEnergy || 100) + levelsGained * 5;
    updates.maxEnergy = newMax;
    updates.energy = newMax;
    updates.basePower = (userData.basePower || 100) + levelsGained * 15;
  }

  return { progressions: next, updates };
}

/** Pending energy spend charges — refund only against unused charge within TTL. */
export const ENERGY_REFUND_TTL_MS = 15 * 60 * 1000;

export type EnergyCharge = { amount: number; at: number };

export function pruneEnergyCharges(
  charges: Record<string, EnergyCharge> | undefined | null,
  nowMs: number,
  ttlMs: number = ENERGY_REFUND_TTL_MS
): Record<string, EnergyCharge> {
  const next: Record<string, EnergyCharge> = {};
  for (const [id, c] of Object.entries(charges || {})) {
    if (!c || typeof c.amount !== "number" || typeof c.at !== "number") continue;
    if (nowMs - c.at <= ttlMs && c.amount > 0) next[id] = c;
  }
  return next;
}

export function registerEnergySpend(
  charges: Record<string, EnergyCharge> | undefined | null,
  chargeId: string,
  amount: number,
  nowMs: number
): Record<string, EnergyCharge> {
  const next = pruneEnergyCharges(charges, nowMs);
  next[chargeId] = { amount, at: nowMs };
  return next;
}

export function consumeEnergyChargeForRefund(
  charges: Record<string, EnergyCharge> | undefined | null,
  chargeId: string,
  requestedAmount: number,
  nowMs: number,
  ttlMs: number = ENERGY_REFUND_TTL_MS
): { ok: true; refundAmount: number; remaining: Record<string, EnergyCharge> } | { ok: false; reason: string } {
  const next = pruneEnergyCharges(charges, nowMs, ttlMs);
  const charge = next[chargeId];
  if (!charge) return { ok: false, reason: "no_charge" };
  if (nowMs - charge.at > ttlMs) {
    delete next[chargeId];
    return { ok: false, reason: "expired" };
  }
  const refundAmount = Math.min(Math.max(0, Math.floor(requestedAmount)), charge.amount);
  if (refundAmount <= 0) return { ok: false, reason: "bad_amount" };
  delete next[chargeId];
  return { ok: true, refundAmount, remaining: next };
}

export const FITRPG_USER_FIELD_KEYS = [
  "username",
  "usernameLower",
  "selectedClass",
  "energy",
  "maxEnergy",
  "basePower",
  "gold",
  "avatarName",
  "statPoints",
  "baseStrength",
  "baseDexterity",
  "baseIntelligence",
  "baseVitality",
  "stats",
  "equippedWeaponId",
  "equippedArmorId",
  "equippedRingId",
  "equippedAmuletId",
  "ownedEquipmentIds",
  "clanId",
  "pvpWins",
  "pvpTrophies",
  "friends",
  "friendRequests",
  "currentLevel",
  "classTrophies",
  "lastActive",
  "lastHealthSyncDate",
  "lastTrainEnergyDay",
  "trainEnergyAwardedToday",
  "claimedDailyQuests",
  "progressions",
  "fcmToken",
] as const;

const STAT_FIELD_BY_CODE: Record<string, "baseStrength" | "baseDexterity" | "baseIntelligence" | "baseVitality"> = {
  STR: "baseStrength",
  DEX: "baseDexterity",
  INT: "baseIntelligence",
  VIT: "baseVitality",
};

export function allocateStatPointUpdate(
  stat: unknown,
  userData: {
    statPoints?: unknown;
    baseStrength?: unknown;
    baseDexterity?: unknown;
    baseIntelligence?: unknown;
    baseVitality?: unknown;
  }
):
  | { ok: true; stat: string; field: string; newValue: number; updates: Record<string, number> }
  | { ok: false; reason: "invalid_stat" | "no_points" } {
  const code = String(stat || "").trim().toUpperCase();
  const field = STAT_FIELD_BY_CODE[code];
  if (!field) {
    return { ok: false, reason: "invalid_stat" };
  }
  const currentPoints = Math.max(0, Math.floor(Number(userData.statPoints) || 0));
  if (currentPoints <= 0) {
    return { ok: false, reason: "no_points" };
  }
  const currentStat = Math.max(10, Math.floor(Number((userData as any)[field]) || 10));
  const newValue = currentStat + 1;
  return {
    ok: true,
    stat: code,
    field,
    newValue,
    updates: {
      statPoints: currentPoints - 1,
      [field]: newValue,
    },
  };
}

export function computeDailyQuestClaim(opts: {
  claimedDailyQuests: Record<string, unknown> | undefined | null;
  dayKey: string;
  questId: unknown;
}):
  | { ok: true; nextClaimed: Record<string, string[]> }
  | { ok: false; reason: "invalid_quest" | "already_claimed" } {
  const questId = String(opts.questId || "").trim().slice(0, 64);
  if (!questId) {
    return { ok: false, reason: "invalid_quest" };
  }
  const rawList = opts.claimedDailyQuests?.[opts.dayKey];
  const existing = Array.isArray(rawList)
    ? rawList.map((id) => String(id)).filter(Boolean)
    : [];
  if (existing.includes(questId)) {
    return { ok: false, reason: "already_claimed" };
  }
  return {
    ok: true,
    nextClaimed: {
      [opts.dayKey]: [...existing, questId],
    },
  };
}

export function computeClanTreasuryDeposit(opts: {
  userGold: unknown;
  treasuryGold: unknown;
  amount: unknown;
}):
  | { ok: true; amount: number; nextUserGold: number; nextTreasuryGold: number }
  | { ok: false; reason: "invalid_amount" | "insufficient_gold" } {
  const amount = Math.floor(Number(opts.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50000) {
    return { ok: false, reason: "invalid_amount" };
  }
  const userGold = Math.max(0, Math.floor(Number(opts.userGold) || 0));
  if (userGold < amount) {
    return { ok: false, reason: "insufficient_gold" };
  }
  const treasuryGold = Math.max(0, Math.floor(Number(opts.treasuryGold) || 0));
  return {
    ok: true,
    amount,
    nextUserGold: userGold - amount,
    nextTreasuryGold: treasuryGold + amount,
  };
}

export const CLAN_BUFF_DURATION_MS = 24 * 60 * 60 * 1000;

export const CLAN_BUFF_CATALOG = {
  xp_surge: { cost: 500, durationMs: CLAN_BUFF_DURATION_MS },
  gold_rush: { cost: 500, durationMs: CLAN_BUFF_DURATION_MS },
  war_valor: { cost: 800, durationMs: CLAN_BUFF_DURATION_MS },
} as const;

export type ClanBuffId = keyof typeof CLAN_BUFF_CATALOG;

export function computeClanBuffActivation(opts: {
  buffId: unknown;
  role: unknown;
  treasuryGold: unknown;
  activeBuffs: Record<string, unknown> | undefined | null;
  nowMs: number;
}):
  | { ok: true; buffId: ClanBuffId; cost: number; expiresAt: number; nextTreasuryGold: number; nextActiveBuffs: Record<string, number> }
  | { ok: false; reason: "invalid_buff" | "forbidden" | "insufficient_treasury" | "already_active" } {
  const role = String(opts.role || "");
  if (role !== "Leader" && role !== "Officer") {
    return { ok: false, reason: "forbidden" };
  }
  const buffId = String(opts.buffId || "") as ClanBuffId;
  const spec = CLAN_BUFF_CATALOG[buffId];
  if (!spec) {
    return { ok: false, reason: "invalid_buff" };
  }
  const treasury = Math.max(0, Math.floor(Number(opts.treasuryGold) || 0));
  if (treasury < spec.cost) {
    return { ok: false, reason: "insufficient_treasury" };
  }
  const nextActiveBuffs: Record<string, number> = {};
  for (const [k, v] of Object.entries(opts.activeBuffs || {})) {
    const exp = Number(v);
    if (Number.isFinite(exp) && exp > opts.nowMs && k in CLAN_BUFF_CATALOG) {
      nextActiveBuffs[k] = exp;
    }
  }
  if ((nextActiveBuffs[buffId] || 0) > opts.nowMs) {
    return { ok: false, reason: "already_active" };
  }
  const expiresAt = opts.nowMs + spec.durationMs;
  nextActiveBuffs[buffId] = expiresAt;
  return {
    ok: true,
    buffId,
    cost: spec.cost,
    expiresAt,
    nextTreasuryGold: treasury - spec.cost,
    nextActiveBuffs,
  };
}

export function computeClanBuffMultipliers(
  activeBuffs: Record<string, unknown> | undefined | null,
  nowMs: number
): { xpMultiplier: number; goldMultiplier: number; warPowerBonus: number } {
  const isActive = (key: ClanBuffId): boolean => {
    const exp = Number(activeBuffs?.[key]);
    return Number.isFinite(exp) && exp > nowMs;
  };
  return {
    xpMultiplier: isActive("xp_surge") ? 1.2 : 1.0,
    goldMultiplier: isActive("gold_rush") ? 1.2 : 1.0,
    warPowerBonus: isActive("war_valor") ? 0.15 : 0.0,
  };
}
