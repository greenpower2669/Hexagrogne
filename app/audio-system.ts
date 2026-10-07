import type { PlayerId } from "./game-engine";

export const AUDIO_MODE_ORDER = ["fx", "silent", "music", "both"] as const;

export const DEFAULT_MUSIC_VOLUME = 0.8;
export const DEFAULT_FX_VOLUME = 0.8;

export type AudioMode = (typeof AUDIO_MODE_ORDER)[number];

export const GAME_SOUNDTRACK = {
  title: "Le Petit Robot Qui Dormait",
  durationSeconds: 330.048,
  src: "/audio/le-petit-robot-qui-dormait.mp3",
} as const;

export const AUDIO_MODE_META: Record<
  AudioMode,
  { label: string; shortLabel: string; symbol: string; description: string }
> = {
  fx: {
    label: "Sons seuls",
    shortLabel: "Sons",
    symbol: "FX",
    description: "Effets des troupes et signaux des colonies, sans musique",
  },
  silent: {
    label: "Silence",
    shortLabel: "Silence",
    symbol: "×",
    description: "Musique et effets coupés",
  },
  music: {
    label: "Musique seule",
    shortLabel: "Musique",
    symbol: "♪",
    description: `« ${GAME_SOUNDTRACK.title} », sans effets de jeu`,
  },
  both: {
    label: "Musique + sons",
    shortLabel: "Musique + FX",
    symbol: "♫",
    description: `« ${GAME_SOUNDTRACK.title} » et tous les effets des troupes`,
  },
};

export interface ColonyAudioSignature {
  baseFrequency: number;
  responseRatio: number;
  echoSpacing: number;
  pulseCount: number;
}

export const COLONY_AUDIO_SIGNATURES: Record<
  PlayerId,
  ColonyAudioSignature
> = {
  0: {
    baseFrequency: 174.61,
    responseRatio: 1.5,
    echoSpacing: 0.115,
    pulseCount: 4,
  },
  1: {
    baseFrequency: 207.65,
    responseRatio: 4 / 3,
    echoSpacing: 0.14,
    pulseCount: 3,
  },
  2: {
    baseFrequency: 246.94,
    responseRatio: 5 / 4,
    echoSpacing: 0.095,
    pulseCount: 5,
  },
  3: {
    baseFrequency: 293.66,
    responseRatio: 1.618,
    echoSpacing: 0.125,
    pulseCount: 4,
  },
  4: {
    baseFrequency: 220,
    responseRatio: 1.25,
    echoSpacing: 0.105,
    pulseCount: 6,
  },
  5: {
    baseFrequency: 277.18,
    responseRatio: 1.414,
    echoSpacing: 0.155,
    pulseCount: 3,
  },
};

export interface ColonySignal {
  id: number;
  playerId: PlayerId;
  sourcePieceId: string;
  kind: "soldier" | "egg";
  relayPieceIds?: string[];
  startedAt: number;
}

export function validateAudioMode(value: unknown): AudioMode {
  return AUDIO_MODE_ORDER.includes(value as AudioMode)
    ? (value as AudioMode)
    : "fx";
}

export function validateAudioVolume(
  value: unknown,
  fallback = DEFAULT_MUSIC_VOLUME,
): number {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(1, numeric))
    : fallback;
}

export function audioModeHasFx(mode: AudioMode): boolean {
  return mode === "fx" || mode === "both";
}

export function audioModeHasMusic(mode: AudioMode): boolean {
  return mode === "music" || mode === "both";
}

export function nextAudioMode(mode: AudioMode): AudioMode {
  const index = AUDIO_MODE_ORDER.indexOf(mode);
  return AUDIO_MODE_ORDER[(index + 1) % AUDIO_MODE_ORDER.length];
}
