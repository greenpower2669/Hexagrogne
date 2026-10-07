import type { PlayerRole } from "./game-engine";
import {
  ROYAL_COCOON_DURATION_MS,
  ROYAL_FIREWORKS_DURATION_MS,
} from "./game-effects";

// A royal finale is the longest legitimate input lock. A timestamp further in
// the future is corrupt/stale and must never force the player to restart.
export const MAX_VALID_ROYAL_INPUT_LOCK_MS =
  Math.max(ROYAL_FIREWORKS_DURATION_MS, ROYAL_COCOON_DURATION_MS) + 1_000;

export function isRoyalInputLocked(
  lockedUntil: number,
  now: number,
): boolean {
  if (!Number.isFinite(lockedUntil) || !Number.isFinite(now)) return false;
  const remaining = lockedUntil - now;
  return remaining > 0 && remaining <= MAX_VALID_ROYAL_INPUT_LOCK_MS;
}

export function canHumanUseBoard({
  playerRole,
  gameFinished,
  royalLockUntil,
  now,
}: {
  playerRole: PlayerRole;
  gameFinished: boolean;
  royalLockUntil: number;
  now: number;
}): boolean {
  return (
    playerRole === "human" &&
    !gameFinished &&
    !isRoyalInputLocked(royalLockUntil, now)
  );
}
