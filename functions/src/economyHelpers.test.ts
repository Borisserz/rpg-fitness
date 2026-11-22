import {
  allocateStatPointUpdate,
  applyXpToProgression,
  clampPvERewards,
  computeClanBuffActivation,
  computeClanBuffMultipliers,
  computeClanTreasuryDeposit,
  computeDailyQuestClaim,
  computePassiveRegen,
  computeTrainEnergyGrant,
  consumeEnergyChargeForRefund,
  pvpOutcomeForPlayer,
  registerEnergySpend,
  rewardsForPvpOutcome,
  rollClanWarWin,
  TRAIN_ENERGY_DAILY_CAP,
  TRAIN_ENERGY_PER_SESSION,
  utcDayKey,
} from "./economyHelpers";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(pvpOutcomeForPlayer("u1", "u1") === "win", "win");
assert(pvpOutcomeForPlayer("u2", "u1") === "loss", "loss");
assert(pvpOutcomeForPlayer("draw", "u1") === "draw", "draw");
assert(
  pvpOutcomeForPlayer("u1", "u1b", ["u1", "u1b"], ["u2", "u2b"]) === "win",
  "3v3 teammate win"
);
assert(
  pvpOutcomeForPlayer("u1", "u2b", ["u1", "u1b"], ["u2", "u2b"]) === "loss",
  "3v3 opposing team loss"
);
assert(rewardsForPvpOutcome("win").gold === 60, "win gold");

const capped = clampPvERewards(9999, -5);
assert(capped.xp === 500 && capped.gold === 0, "pve clamp");

assert(rollClanWarWin(100, () => 0) === true, "rng 0 wins");
assert(rollClanWarWin(100, () => 0.99) === false, "rng high loses");

const { updates } = applyXpToProgression(
  { Archer: { level: 1, xp: 140, totalReps: 0, storyStage: 1 } },
  "Archer",
  20,
  { statPoints: 0, maxEnergy: 100, basePower: 100 }
);
assert(updates.progressions.Archer.level === 2, "level up");
assert(updates.statPoints === 3, "stat points");
assert(updates.maxEnergy === 105 && updates.energy === 105, "level-up refills energy to new max");

const t0 = 1_000_000;
let charges = registerEnergySpend({}, "c1", 10, t0);
assert(charges.c1.amount === 10, "spend registered");
const refundOk = consumeEnergyChargeForRefund(charges, "c1", 10, t0 + 1000);
assert(refundOk.ok === true && refundOk.ok && refundOk.refundAmount === 10, "refund ok");
assert(!refundOk.ok || Object.keys(refundOk.remaining).length === 0, "charge cleared");
const refundDup = consumeEnergyChargeForRefund({}, "c1", 10, t0 + 1000);
assert(refundDup.ok === false, "no double refund");
charges = registerEnergySpend({}, "c2", 10, t0);
const expired = consumeEnergyChargeForRefund(charges, "c2", 10, t0 + 16 * 60 * 1000);
assert(expired.ok === false, "expired charge");

assert(TRAIN_ENERGY_PER_SESSION === 5, "train session grant");
assert(TRAIN_ENERGY_DAILY_CAP === 40, "train daily cap");
assert(utcDayKey(Date.UTC(2026, 6, 29)).startsWith("2026-07-29"), "utc day key");

const trainFresh = computeTrainEnergyGrant({
  awardedToday: 0,
  dayKey: "",
  todayKey: "2026-07-29",
});
assert(trainFresh.awarded === 5 && trainFresh.nextAwardedToday === 5, "train fresh +5");

const trainNearCap = computeTrainEnergyGrant({
  awardedToday: 38,
  dayKey: "2026-07-29",
  todayKey: "2026-07-29",
});
assert(trainNearCap.awarded === 2 && trainNearCap.nextAwardedToday === 40, "train near daily cap");

const trainCapped = computeTrainEnergyGrant({
  awardedToday: 40,
  dayKey: "2026-07-29",
  todayKey: "2026-07-29",
});
assert(trainCapped.awarded === 0, "train daily exhausted");

const trainRollover = computeTrainEnergyGrant({
  awardedToday: 40,
  dayKey: "2026-07-28",
  todayKey: "2026-07-29",
});
assert(trainRollover.awarded === 5 && trainRollover.dayRollover === true, "train day rollover");

const trainOverRequest = computeTrainEnergyGrant({
  requested: 99,
  awardedToday: 0,
  dayKey: "2026-07-29",
  todayKey: "2026-07-29",
});
assert(trainOverRequest.awarded === 5, "train clamps requested to per-session");

const regenT0 = 1_000_000;
const regenNone = computePassiveRegen({
  energy: 50,
  maxEnergy: 100,
  lastRegenAtMs: regenT0,
  nowMs: regenT0 + 4 * 60 * 1000,
});
assert(regenNone.points === 0 && regenNone.energy === 50, "regen <5min grants 0");

const regenOne = computePassiveRegen({
  energy: 50,
  maxEnergy: 100,
  lastRegenAtMs: regenT0,
  nowMs: regenT0 + 5 * 60 * 1000,
});
assert(regenOne.points === 1 && regenOne.energy === 51, "regen +1 / 5min");
assert(regenOne.nextRegenAtMs === regenT0 + 5 * 60 * 1000, "regen remainder anchor");

const regenCap = computePassiveRegen({
  energy: 98,
  maxEnergy: 100,
  lastRegenAtMs: regenT0,
  nowMs: regenT0 + 30 * 60 * 1000,
});
assert(regenCap.points === 6 && regenCap.energy === 100, "regen clamps to maxEnergy");

// Stat allocation (Constellation Skill Tree)
const statOk = allocateStatPointUpdate("STR", { statPoints: 3, baseStrength: 10 });
assert(statOk.ok && statOk.updates.statPoints === 2 && statOk.updates.baseStrength === 11, "allocate STR");
const statEmpty = allocateStatPointUpdate("DEX", { statPoints: 0, baseDexterity: 10 });
assert(!statEmpty.ok && statEmpty.reason === "no_points", "reject 0 SP");
const statBad = allocateStatPointUpdate("LUCK", { statPoints: 2 });
assert(!statBad.ok && statBad.reason === "invalid_stat", "reject unknown stat");

// Daily quest idempotent claims
const q1 = computeDailyQuestClaim({ claimedDailyQuests: {}, dayKey: "2026-11-22", questId: "q_squat_15" });
assert(q1.ok && q1.nextClaimed["2026-11-22"]?.includes("q_squat_15"), "claim fresh daily quest");
const qDup = computeDailyQuestClaim({ claimedDailyQuests: q1.ok ? q1.nextClaimed : {}, dayKey: "2026-11-22", questId: "q_squat_15" });
assert(!qDup.ok && qDup.reason === "already_claimed", "reject duplicate claim same day");
const qNextDay = computeDailyQuestClaim({ claimedDailyQuests: q1.ok ? q1.nextClaimed : {}, dayKey: "2026-11-23", questId: "q_squat_15" });
assert(qNextDay.ok && !qNextDay.nextClaimed["2026-11-22"], "prune old days and allow next day claim");

// Clan treasury deposit
const depOk = computeClanTreasuryDeposit({ userGold: 300, treasuryGold: 1000, amount: 100 });
assert(depOk.ok && depOk.nextUserGold === 200 && depOk.nextTreasuryGold === 1100, "treasury deposit");
const depLow = computeClanTreasuryDeposit({ userGold: 50, treasuryGold: 1000, amount: 100 });
assert(!depLow.ok && depLow.reason === "insufficient_gold", "reject deposit > gold");

// Clan buffs activation + multipliers
const nowMs = 1_700_000_000_000;
const buffDenied = computeClanBuffActivation({
  buffId: "xp_surge",
  role: "Member",
  treasuryGold: 2000,
  activeBuffs: {},
  nowMs,
});
assert(!buffDenied.ok && buffDenied.reason === "forbidden", "member cannot activate buff");
const buffOk = computeClanBuffActivation({
  buffId: "xp_surge",
  role: "Leader",
  treasuryGold: 2000,
  activeBuffs: {},
  nowMs,
});
assert(buffOk.ok && buffOk.nextTreasuryGold === 1500 && buffOk.nextActiveBuffs.xp_surge > nowMs, "leader activates xp_surge");
const multActive = computeClanBuffMultipliers(buffOk.ok ? buffOk.nextActiveBuffs : {}, nowMs + 1000);
assert(multActive.xpMultiplier === 1.2 && multActive.goldMultiplier === 1.0, "xp_surge active multiplier");
const multExpired = computeClanBuffMultipliers(buffOk.ok ? buffOk.nextActiveBuffs : {}, nowMs + 25 * 3600 * 1000);
assert(multExpired.xpMultiplier === 1.0, "expired buff returns 1.0");

console.log("economyHelpers.test.ts: OK");
