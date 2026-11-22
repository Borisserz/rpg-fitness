#!/bin/bash
# Safe FitRPG deploy: never wipe Food/Workout orphan functions (tryonWorker, tagGarment).
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-serzhanovich-ecosystem-ce700}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building functions..." >&2
npm --prefix functions run build

ONLY=$(python3 - <<'PY'
# FitRPG never calls deleteAccount (recursive wipe) and never overwrites Workout/Food shared AI functions.
# Keep shared function names in functions/src/index.ts only as deletion guards, do NOT deploy them from here.
exports = [
"matchmakeClanWar","cancelClanWarSearch","processClanWarPhases","recordClanWarAttack",
"attackWorldBoss","processWorldBossCycle",
"sendFriendRequest","searchPlayers","inviteToTeam3v3",
"acceptFriendRequest","declineFriendRequest","acceptFriendDuel","declineFriendDuel",
"joinTeam","matchWithOpponent",
"equipItem","purchaseItem","resolvePvEBattle","resolvePvPBattle","awardActivityRewards","adjustEnergy","fillScreenshotWallet",
"allocateStatPoint","removeFriend","depositClanGold","activateClanBuff",
"cleanupFitRPGAccount","onMatchmakingTicketCreated",
"fillTeammatesWithBots","triggerOpponentBotFallback","getLeaderboards"
]
print(",".join(f"functions:{n}" for n in exports))
PY
)

echo "Deploying rules + indexes + targeted functions to $PROJECT..." >&2
firebase deploy --project "$PROJECT" --only "firestore:rules,firestore:indexes,$ONLY"
echo "Done." >&2
