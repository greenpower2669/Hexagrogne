export type FxKind =
  | "audio-on"
  | "move"
  | "capture"
  | "check"
  | "promotion"
  | "acid-duel"
  | "hatch"
  | "egg-crush"
  | "reproduction-success"
  | "reproduction-fail"
  | "royal-sacrifice"
  | "royal-cocoon"
  | "royal-escape"
  | "royal-fireworks"
  | "zombie-spawn"
  | "zombie-step"
  | "zombie-bite"
  | "zombie-expire"
  | "victory";

// These durations are shared by the renderer, input lock and AI delay. Keeping
// one source of truth prevents the next turn from erasing a royal finale.
export const ROYAL_SACRIFICE_DURATION_MS = 3_200;
export const ROYAL_COCOON_DURATION_MS = 10_000;
export const ROYAL_ESCAPE_DURATION_MS = 6_200;
export const ROYAL_FIREWORKS_DURATION_MS = 7_600;
export const ZOMBIE_EFFECT_DURATION_MS = 2_100;
