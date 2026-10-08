"use client";

import { isNative, downloadJson } from "../mobile/platform";
import { App } from "@capacitor/app";
import { loadBundledFabExport, FAB_EXPORT_FILES } from "./fab-exports";
import { ensureAiImportBackup } from "./ai-import-backup";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import GameIntro from "./game-intro";
import HexBoard from "./hex-board";
import {
  ADMIN_ANIMATIONS,
  ADMIN_UNLOCK_RADIUS_PX,
  ADMIN_UNLOCK_TAPS,
  ADMIN_UNLOCK_WINDOW_MS,
  GAME_EVOLUTIONS,
  type AdminAnimationKind,
  type AdminAnimationPreview,
  createAdminAnimationPreview,
} from "./admin-animation-lab";
import {
  type FxKind,
  ROYAL_COCOON_DURATION_MS,
  ROYAL_ESCAPE_DURATION_MS,
  ROYAL_FIREWORKS_DURATION_MS,
  ROYAL_SACRIFICE_DURATION_MS,
} from "./game-effects";
import {
  canHumanUseBoard,
  isRoyalInputLocked,
} from "./game-input-guard";
import {
  AUDIO_MODE_META,
  AUDIO_MODE_ORDER,
  COLONY_AUDIO_SIGNATURES,
  DEFAULT_FX_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  GAME_SOUNDTRACK,
  AudioMode,
  ColonySignal,
  audioModeHasFx,
  audioModeHasMusic,
  validateAudioMode,
  validateAudioVolume,
} from "./audio-system";
import {
  AIDifficulty,
  AIMemory,
  AI_CORE_FEATURE_ORDER,
  AI_STRATEGIC_PHASE_META,
  COLONY_NEST_RESOURCE_RESERVE,
  Coord,
  EGG_HATCH_TURNS,
  EGG_RESOURCE_COST,
  GameNotice,
  GameState,
  KING_SOLITUDE_ESCAPE_TURNS,
  LOOP_ESCAPE_REPETITION,
  LOOP_REPETITION_LIMIT,
  LOOP_WARNING_REPETITION,
  Move,
  PAWN_RESOURCE_COST,
  PIECE_LABEL,
  PLAYER_META,
  PlayerId,
  PlayerCount,
  ROYAL_COCOON_RADIUS,
  ROYAL_COCOON_TURNS,
  STRATEGIC_INTENT_LABEL,
  STRATEGIC_STAGNATION_TURNS,
  allLegalMoves,
  antiLoopLearningPenalty,
  applyMove,
  checkingPieces,
  chooseAiMove,
  conditionAiWeights,
  contextLearningAdjustment,
  createDefaultAIMemory,
  createNewGame,
  currentPlayerId,
  effectiveLoopRepetition,
  evolveAfterGame,
  hexDistance,
  immediateReward,
  isInCheck,
  isLoopActionSignature,
  isPieceFrozenByRoyalCocoon,
  isZombieTermite,
  isTurnBlockedByRoyalCocoon,
  legalMovesForPiece,
  passTurnBlockedByRoyalCocoon,
  pieceAt,
  playerIdsForCount,
  populationForPlayer,
  queenSpawnCells,
  queenPromotionCost,
  repeatedActionTail,
  reinforceAi,
  resourceStatusForPlayer,
  sameCoord,
  selectStrategicPhase,
  strategicProgressSnapshot,
  synchronizePlayerResources,
  territoryForPlayer,
  usedResources,
  validateImportedMemory,
} from "./game-engine";
import {
  HUMAN_TRAINING_STORAGE_KEY,
  HumanTrainingArchive,
  archiveHumanVictory,
  createEmptyHumanTrainingArchive,
  emergencyCompactHumanTrainingArchive,
  humanTrainingStats,
  validateHumanTrainingArchive,
} from "./human-training";
import {
  MATCH_HISTORY_STORAGE_KEY,
  MatchHistoryArchive,
  MatchHistoryEntry,
  appendMatchFrame,
  createEmptyMatchHistory,
  emergencyCompactMatchHistoryArchive,
  replayFrameToGameState,
  validateMatchHistory,
} from "./match-history";
import {
  FAB_HEXA_BRAIN_ARCHITECTURE,
  TRAINING_IMPORT_MAX_BYTES,
  type FabHexaBrainCorpus,
  clearTrainingCorpus,
  createEmptyTrainingCorpus,
  createTrainingExport,
  importTrainingPayload,
  loadTrainingCorpus,
  saveTrainingCorpus,
  trainingCorpusStats,
} from "./training-dataset";
import {
  HYBRID_HEX_BRAIN_ARCHITECTURE,
  HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
  HYBRID_HEX_FILTERS,
  HYBRID_HEX_PARAMETER_COUNT,
  createDefaultHybridHexBrain,
  createHybridMoveScoreAugmenter,
  loadHybridHexBrain,
  parseHybridHexBrain,
  saveHybridHexBrain,
  serializeHybridHexBrain,
  type HybridHexBrain,
} from "./hexconv-brain";
import {
  MODULAR_AI_PACK_VERSION,
  importNamedWeightModules,
  serializeNamedWeightModules,
} from "./ai-weight-modules";
import {
  T2_IMPORTED_LEAGUE_META,
  T2_IMPORTED_LEAGUE_STORAGE_KEY,
  createT2LeagueSeed,
  shouldAdoptT2LeagueSeed,
} from "./t2-league-seed";
import {
  AI_DIFFICULTY_META,
  AI_STRATEGY_IDS,
  AI_STRATEGY_META,
  SELF_PLAY_STORAGE_KEY,
  SelfPlayLeague,
  TRAINING_POWER_META,
  TrainingPower,
  bestStrategyAgainstHuman,
  blendedQueenEscapeContextWeights,
  blendedSuperModelWeights,
  buildSuperModelLayers,
  createDefaultSelfPlayLeague,
  strategicScoreAverages,
  strategyForAiPlayer,
  trainingDelayMs,
  validateTrainingPower,
  validateSelfPlayLeague,
} from "./self-play";

const GAME_STORAGE_KEY = "fabhexagrogne-v3-game-v1";
const AI_STORAGE_KEY = "fabhexagrogne-v3-ai-v1";
const AI_IMPORT_BACKUP_KEY = "fabhexagrogne-v3-ai-import-backup-v1";
const AUDIO_MODE_STORAGE_KEY = "fabhexagrogne-v3-audio-mode-v1";
const MUSIC_VOLUME_STORAGE_KEY = "fabhexagrogne-v3-music-volume-v1";
const FX_VOLUME_STORAGE_KEY = "fabhexagrogne-v3-fx-volume-v1";
const TRAINING_POWER_STORAGE_KEY = "fabhexagrogne-v3-training-power-v1";
const SOUNDTRACK_START_TIMEOUT_MS = 30_000;
const AUDIO_CONTEXT_START_TIMEOUT_MS = 1600;
const CAMP_NOTICE_DURATION_MS = 8800;
const TOAST_DURATION_MS = 5200;
const SELF_PLAY_WATCHDOG_INTERVAL_MS = 10_000;
const SELF_PLAY_STALE_AFTER_MS = 45_000;
const SELF_PLAY_RESTART_DELAY_MS = 900;
const REPLAY_SPEEDS = [1, 2, 4, 8] as const;
type WasmScore = (weights: number[], features: number[]) => number;

interface AiImportBackup {
  schema: "fabhexagrogne-ai-import-backup";
  version: 1 | 2;
  createdAt: string;
  memory: AIMemory;
  league: SelfPlayLeague;
  hybridBrain?: ReturnType<typeof serializeHybridHexBrain>;
}

interface NewGameConfig {
  playerCount: PlayerCount;
  humanCount: number;
  aiDifficulty: AIDifficulty;
  teamNames: Partial<Record<PlayerId, string>>;
  teamColors: Partial<Record<PlayerId, string>>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface AmbientRig {
  context: AudioContext;
  musicGain: GainNode;
  fxGain: GainNode;
  masterGain: GainNode;
  soundtrack: HTMLAudioElement;
  soundtrackFailed: boolean;
  soundtrackStartAccepted: boolean;
  mode: AudioMode;
  musicVolume: number;
  fxVolume: number;
}

type AudioStatus = "idle" | "starting" | "ready" | "partial" | "blocked";
type SelfPlayWorkerStatus =
  | "starting"
  | "running"
  | "recovering"
  | "paused"
  | "unsupported";

type SelfPlayWorkerEvent =
  | {
      type: "ready" | "progress";
      league: SelfPlayLeague;
      brain?: HybridHexBrain;
    }
  | { type: "brain-progress"; brain: HybridHexBrain; trained: number }
  | { type: "heartbeat"; duels: number; trainingEnabled: boolean }
  | { type: "recoverable-error"; message: string };
type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

function BrainWeightBars({
  weights,
  label,
}: {
  weights: number[];
  label: string;
}) {
  const description = AI_CORE_FEATURE_ORDER.map(
    (feature, index) => `${feature} ${Number(weights[index] ?? 0).toFixed(2)}`,
  ).join(", ");
  return (
    <div
      className="brain-weight-bars"
      role="img"
      aria-label={`${label} : ${description}`}
    >
      {AI_CORE_FEATURE_ORDER.map((feature, index) => {
        const weight = Number(weights[index] ?? 0);
        const height = Math.max(3, Math.min(48, Math.abs(weight) * 12));
        return (
          <i
            className={weight < 0 ? "negative" : "positive"}
            key={feature}
            title={`${feature} : ${weight.toFixed(2)}`}
            aria-hidden="true"
          >
            <span style={{ height: `${height}%` }} />
          </i>
        );
      })}
    </div>
  );
}

class LeaguePanelErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("League panel render error", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ai-details ai-error-fallback" role="alert">
          <strong>L’affichage de la Ligue a rencontré une erreur.</strong>
          <p>
            La partie, l’auto-entraînement et les sauvegardes restent actifs.
            Refermez ce panneau puis rechargez le jeu pour réessayer.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface TimedCampNotice extends GameNotice {
  shownAt: number;
}

function createCompatibleAudioContext(): AudioContext {
  const CompatibleAudioContext =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (
          window as unknown as {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
  if (!CompatibleAudioContext) {
    throw new Error("Web Audio indisponible");
  }
  return new CompatibleAudioContext({ latencyHint: "interactive" });
}

function primeAudioContext(context: AudioContext) {
  if (context.state === "closed") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start();
  oscillator.stop(context.currentTime + 0.025);
}

async function resumeAudioContext(context: AudioContext): Promise<boolean> {
  if (context.state === "closed") return false;
  if ((context.state as AudioContextState) === "running") return true;
  primeAudioContext(context);
  try {
    await Promise.race([
      context.resume(),
      new Promise<void>((_, reject) =>
        window.setTimeout(
          () => reject(new Error("Délai Web Audio dépassé")),
          AUDIO_CONTEXT_START_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch {
    return false;
  }
  if ((context.state as AudioContextState) === "running") return true;
  await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
  return (context.state as AudioContextState) === "running";
}

function playPluck(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  volume = 0.08,
  duration = 0.9,
  delay = 0,
) {
  const oscillator = context.createOscillator();
  const overtone = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const now = context.currentTime + delay;
  oscillator.type = "triangle";
  overtone.type = "sine";
  oscillator.frequency.value = frequency;
  overtone.frequency.value = frequency * 2;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.frequency.exponentialRampToValueAtTime(480, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(filter);
  overtone.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    overtone.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  oscillator.start(now);
  overtone.start(now);
  oscillator.stop(now + duration + 0.05);
  overtone.stop(now + duration + 0.05);
}

function soundtrackVolumeForMode(
  mode: AudioMode,
  musicVolume: number,
): number {
  return audioModeHasMusic(mode) ? musicVolume : 0;
}

function configureSoundtrackElement(soundtrack: HTMLAudioElement) {
  soundtrack.preload = "auto";
  soundtrack.loop = true;
  soundtrack.volume = 0;
  soundtrack.setAttribute("playsinline", "");
  const sourceUrl = new URL(GAME_SOUNDTRACK.src, window.location.href).href;
  if (soundtrack.src !== sourceUrl) {
    soundtrack.src = GAME_SOUNDTRACK.src;
  }
}

async function startAudioRig(
  mode: AudioMode,
  soundtrack: HTMLAudioElement,
  musicVolume: number,
  fxVolume: number,
): Promise<AmbientRig> {
  const context = createCompatibleAudioContext();
  const musicGain = context.createGain();
  const fxGain = context.createGain();
  const masterGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  configureSoundtrackElement(soundtrack);
  musicGain.gain.setValueAtTime(0.0001, context.currentTime);
  fxGain.gain.setValueAtTime(0.0001, context.currentTime);
  masterGain.gain.value = 1;
  compressor.threshold.value = -16;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.24;
  musicGain.connect(masterGain);
  fxGain.connect(masterGain);
  masterGain.connect(compressor);
  compressor.connect(context.destination);

  const rig: AmbientRig = {
    context,
    musicGain,
    fxGain,
    masterGain,
    soundtrack,
    soundtrackFailed: false,
    soundtrackStartAccepted: false,
    mode,
    musicVolume,
    fxVolume,
  };
  soundtrack.onplaying = () => {
    rig.soundtrackFailed = false;
    rig.soundtrackStartAccepted = true;
  };
  soundtrack.onerror = () => {
    rig.soundtrackFailed = true;
    rig.soundtrackStartAccepted = false;
  };
  await activateAudioRig(rig, mode, false);
  if (!audioRigHasOutput(rig, mode)) {
    discardAudioRig(rig);
    throw new Error("Le moteur audio reste suspendu");
  }
  return rig;
}

function setAudioMix(
  rig: AmbientRig,
  mode: AudioMode,
  smooth = true,
  musicVolume = rig.musicVolume,
  fxVolume = rig.fxVolume,
) {
  rig.mode = mode;
  rig.musicVolume = musicVolume;
  rig.fxVolume = fxVolume;
  const now = rig.context.currentTime;
  const duration = smooth ? 0.34 : 0.08;
  const soundtrackTarget = soundtrackVolumeForMode(mode, musicVolume);
  const musicTarget = audioModeHasMusic(mode)
    ? Math.max(0.0001, 0.3 * musicVolume)
    : 0.0001;
  const fxTarget = audioModeHasFx(mode)
    ? Math.max(0.0001, 0.85 * fxVolume)
    : 0.0001;
  rig.soundtrack.volume = soundtrackTarget;
  rig.musicGain.gain.cancelScheduledValues(now);
  rig.fxGain.gain.cancelScheduledValues(now);
  rig.musicGain.gain.setValueAtTime(
    Math.max(0.0001, rig.musicGain.gain.value),
    now,
  );
  rig.fxGain.gain.setValueAtTime(
    Math.max(0.0001, rig.fxGain.gain.value),
    now,
  );
  rig.musicGain.gain.exponentialRampToValueAtTime(
    musicTarget,
    now + duration,
  );
  rig.fxGain.gain.exponentialRampToValueAtTime(fxTarget, now + duration);
  if (!audioModeHasMusic(mode) && !rig.soundtrack.paused) {
    window.setTimeout(() => {
      if (!audioModeHasMusic(rig.mode)) {
        rig.soundtrack.pause();
      }
    }, duration * 1000 + 40);
  }
}

async function requestSoundtrackStart(rig: AmbientRig): Promise<boolean> {
  const soundtrack = rig.soundtrack;
  if (
    !soundtrack.paused &&
    soundtrack.readyState >= 2 &&
    !rig.soundtrackFailed
  ) {
    rig.soundtrackStartAccepted = true;
    return true;
  }
  rig.soundtrackFailed = false;
  if (soundtrack.error) soundtrack.load();
  let playRequest: Promise<void>;
  try {
    playRequest = soundtrack.play();
  } catch {
    rig.soundtrackStartAccepted = false;
    return false;
  }
  const accepted = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(
      () => finish(false),
      SOUNDTRACK_START_TIMEOUT_MS,
    );
    playRequest.then(
      () => finish(true),
      () => finish(false),
    );
  });
  rig.soundtrackStartAccepted = accepted;
  return accepted;
}

function audioRigIsReady(rig: AmbientRig, mode: AudioMode): boolean {
  if (mode === "music") return rig.soundtrackStartAccepted;
  if (mode === "both") {
    return rig.soundtrackStartAccepted && rig.context.state === "running";
  }
  if (mode === "fx") return rig.context.state === "running";
  return true;
}

function audioRigHasOutput(rig: AmbientRig, mode: AudioMode): boolean {
  if (mode === "both") {
    return rig.soundtrackStartAccepted || rig.context.state === "running";
  }
  return audioRigIsReady(rig, mode);
}

function audioStatusForRig(rig: AmbientRig, mode: AudioMode): AudioStatus {
  if (audioRigIsReady(rig, mode)) return "ready";
  return audioRigHasOutput(rig, mode) ? "partial" : "blocked";
}

function partialAudioMessage(rig: AmbientRig): string {
  if (rig.soundtrackStartAccepted) {
    return "Musique active · effets momentanément suspendus";
  }
  return "Effets actifs · musique encore indisponible";
}

async function activateAudioRig(
  rig: AmbientRig,
  mode: AudioMode,
  smooth = true,
): Promise<boolean> {
  setAudioMix(rig, mode, smooth);
  const soundtrackStarted = audioModeHasMusic(mode)
    ? requestSoundtrackStart(rig)
    : Promise.resolve(true);
  const effectsStarted = audioModeHasFx(mode)
    ? resumeAudioContext(rig.context)
    : Promise.resolve(true);
  await Promise.all([
    effectsStarted,
    soundtrackStarted,
  ]);
  return audioRigIsReady(rig, mode);
}

function releaseSoundtrack(rig: AmbientRig) {
  rig.soundtrackStartAccepted = false;
  rig.soundtrackFailed = false;
  rig.soundtrack.pause();
  rig.soundtrack.volume = 0;
  rig.soundtrack.onplaying = null;
  rig.soundtrack.onerror = null;
}

function stopAmbientMusic(rig: AmbientRig) {
  if (rig.context.state === "closed") {
    releaseSoundtrack(rig);
    return;
  }
  const now = rig.context.currentTime;
  rig.musicGain.gain.cancelScheduledValues(now);
  rig.musicGain.gain.setValueAtTime(
    Math.max(0.0001, rig.musicGain.gain.value),
    now,
  );
  rig.musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  window.setTimeout(() => {
    releaseSoundtrack(rig);
    if (rig.context.state !== "closed") void rig.context.close();
  }, 420);
}

function discardAudioRig(rig: AmbientRig) {
  releaseSoundtrack(rig);
  if (rig.context.state !== "closed") void rig.context.close();
}

function playFx(rig: AmbientRig, kind: FxKind) {
  if (!audioModeHasFx(rig.mode) || rig.context.state !== "running") return;
  const tone = (
    startFrequency: number,
    endFrequency: number,
    duration: number,
    delay = 0,
    type: OscillatorType = "sine",
    volume = 0.3,
  ) => {
    const oscillator = rig.context.createOscillator();
    const gain = rig.context.createGain();
    const start = rig.context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(rig.fxGain);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  };

  const noiseBurst = (
    duration: number,
    delay: number,
    volume: number,
    filterType: BiquadFilterType,
    startFrequency: number,
    endFrequency: number,
  ) => {
    const frameCount = Math.max(
      1,
      Math.floor(rig.context.sampleRate * duration),
    );
    const buffer = rig.context.createBuffer(
      1,
      frameCount,
      rig.context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const progress = index / frameCount;
      samples[index] =
        (Math.random() * 2 - 1) * Math.pow(1 - progress, 1.7);
    }
    const source = rig.context.createBufferSource();
    const filter = rig.context.createBiquadFilter();
    const gain = rig.context.createGain();
    const start = rig.context.currentTime + delay;
    source.buffer = buffer;
    filter.type = filterType;
    filter.Q.setValueAtTime(filterType === "lowpass" ? 4.8 : 1.7, start);
    filter.frequency.setValueAtTime(startFrequency, start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFrequency),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(rig.fxGain);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(start + duration + 0.025);
  };

  const crackShell = () => {
    noiseBurst(0.055, 0, 0.42, "highpass", 2_400, 1_050);
    noiseBurst(0.042, 0.068, 0.3, "highpass", 3_100, 1_380);
    noiseBurst(0.032, 0.125, 0.22, "highpass", 2_700, 1_600);
  };

  if (kind === "audio-on") {
    [523.25, 659.25, 783.99].forEach((frequency, index) =>
      tone(frequency, frequency * 1.01, 0.28, index * 0.09, "triangle", 0.34),
    );
  }
  if (kind === "move") tone(245, 205, 0.085, 0, "sine", 0.2);
  if (kind === "capture") tone(185, 72, 0.24, 0, "triangle", 0.5);
  if (kind === "check") {
    tone(330, 330, 0.14, 0, "square", 0.23);
    tone(440, 440, 0.18, 0.12, "square", 0.2);
  }
  if (kind === "promotion") {
    [392, 523.25, 659.25].forEach((frequency, index) =>
      tone(frequency, frequency * 1.01, 0.28, index * 0.1, "sine", 0.25),
    );
  }
  if (kind === "acid-duel") {
    tone(760, 96, 0.5, 0, "sawtooth", 0.38);
    tone(520, 72, 0.64, 0.055, "triangle", 0.3);
    tone(1320, 240, 0.34, 0.12, "square", 0.12);
  }
  if (kind === "hatch") {
    crackShell();
    tone(460, 690, 0.18, 0.12, "triangle", 0.18);
    tone(610, 820, 0.16, 0.19, "sine", 0.12);
  }
  if (kind === "egg-crush") {
    crackShell();
    noiseBurst(0.58, 0.045, 0.52, "lowpass", 780, 82);
    noiseBurst(0.24, 0.09, 0.26, "highpass", 3_600, 1_120);
    noiseBurst(0.72, 0.16, 0.42, "lowpass", 430, 48);
    tone(168, 38, 0.62, 0.065, "sawtooth", 0.3);
    tone(96, 28, 0.74, 0.17, "triangle", 0.27);
    tone(52, 31, 0.82, 0.34, "sine", 0.2);
  }
  if (kind === "reproduction-success") {
    [329.63, 440, 554.37].forEach((frequency, index) =>
      tone(frequency, frequency * 1.02, 0.34, index * 0.08, "triangle", 0.26),
    );
  }
  if (kind === "reproduction-fail") {
    tone(220, 174.61, 0.24, 0, "triangle", 0.28);
    tone(174.61, 130.81, 0.3, 0.18, "triangle", 0.24);
  }
  if (kind === "royal-sacrifice") {
    tone(420, 260, 0.72, 0, "triangle", 0.18);
    tone(330, 108, 0.86, 0.34, "sawtooth", 0.2);
    noiseBurst(0.68, 0.9, 0.56, "lowpass", 1_050, 72);
    tone(620, 92, 1.15, 0.93, "triangle", 0.3);
    noiseBurst(0.92, 1.42, 0.28, "highpass", 2_800, 220);
  }
  if (kind === "royal-cocoon") {
    tone(196, 204, 9.7, 0, "sine", 0.085);
    tone(293.66, 302, 9.5, 0.08, "triangle", 0.065);
    tone(440, 454, 9.25, 0.16, "sine", 0.045);
    noiseBurst(9.45, 0.05, 0.075, "lowpass", 1_400, 180);
    [0.2, 1.35, 2.55, 3.8, 5.05, 6.3, 7.55, 8.75].forEach(
      (delay, index) => {
        tone(
          660 + index * 37,
          880 + index * 42,
          0.72,
          delay,
          index % 2 === 0 ? "sine" : "triangle",
          0.075,
        );
      },
    );
  }
  if (kind === "royal-escape") {
    [523, 440, 392, 330, 262, 196, 147, 98].forEach((frequency, index) =>
      tone(
        frequency,
        Math.max(42, frequency * 0.42),
        0.72,
        index * 0.52,
        index % 2 === 0 ? "triangle" : "sine",
        0.19,
      ),
    );
    noiseBurst(4.7, 0.35, 0.2, "lowpass", 780, 42);
    tone(160, 36, 4.5, 0.45, "sine", 0.13);
  }
  if (kind === "royal-fireworks") {
    tone(220, 460, 1.05, 0, "sawtooth", 0.18);
    [1.05, 1.9, 2.75, 3.6, 4.45].forEach((delay, index) => {
      noiseBurst(0.74, delay, 0.56, "highpass", 3_200 + index * 360, 150);
      noiseBurst(0.94, delay + 0.04, 0.34, "lowpass", 820, 52);
      tone(440 + index * 95, 980 + index * 130, 0.82, delay, "triangle", 0.24);
    });
    [659, 784, 988].forEach((frequency, index) =>
      tone(frequency, frequency * 1.24, 1.1, 5.15 + index * 0.16, "sine", 0.18),
    );
  }
  if (kind === "zombie-spawn") {
    tone(94, 47, 0.82, 0, "sawtooth", 0.28);
    tone(141, 58, 0.68, 0.06, "triangle", 0.2);
    noiseBurst(0.62, 0.02, 0.34, "bandpass", 1_180, 170);
  }
  if (kind === "zombie-step") {
    tone(112, 78, 0.18, 0, "sawtooth", 0.13);
    noiseBurst(0.12, 0.02, 0.16, "bandpass", 860, 190);
  }
  if (kind === "zombie-bite") {
    noiseBurst(0.055, 0, 0.42, "highpass", 2_900, 950);
    noiseBurst(0.05, 0.075, 0.34, "highpass", 2_400, 720);
    tone(126, 52, 0.31, 0.035, "square", 0.22);
  }
  if (kind === "zombie-expire") {
    tone(76, 29, 0.72, 0, "sawtooth", 0.34);
    noiseBurst(0.46, 0.08, 0.56, "lowpass", 1_450, 58);
    noiseBurst(0.28, 0.12, 0.24, "highpass", 3_100, 480);
  }
  if (kind === "victory") {
    [392, 493.88, 587.33, 783.99].forEach((frequency, index) =>
      tone(frequency, frequency, 0.45, index * 0.13, "sine", 0.3),
    );
  }
}

function playAudioConfirmation(rig: AmbientRig, mode: AudioMode) {
  if (rig.context.state !== "running") return;
  if (audioModeHasMusic(mode)) {
    playPluck(rig.context, rig.musicGain, 392, 0.42, 0.65, 0);
    playPluck(rig.context, rig.musicGain, 523.25, 0.36, 0.72, 0.13);
  }
  if (audioModeHasFx(mode)) playFx(rig, "audio-on");
}

function playColonySignal(
  rig: AmbientRig,
  playerId: PlayerId,
  kind: ColonySignal["kind"] = "soldier",
  relayCount = 0,
) {
  if (!audioModeHasFx(rig.mode) || rig.context.state !== "running") return;
  const signature = COLONY_AUDIO_SIGNATURES[playerId];
  const now = rig.context.currentTime;
  const tone = (
    frequency: number,
    duration: number,
    delay: number,
    volume: number,
    type: OscillatorType,
    endRatio = 1,
  ) => {
    const oscillator = rig.context.createOscillator();
    const gain = rig.context.createGain();
    const filter = rig.context.createBiquadFilter();
    const start = now + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * endRatio,
      start + duration,
    );
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(2400, frequency * 7), start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(260, frequency * 1.8),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(rig.fxGain);
    oscillator.onended = () => {
      oscillator.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  };

  if (kind === "egg") {
    const crack = (delay: number, volume: number, pitch: number) => {
      const duration = 0.055;
      const frameCount = Math.max(
        1,
        Math.floor(rig.context.sampleRate * duration),
      );
      const buffer = rig.context.createBuffer(
        1,
        frameCount,
        rig.context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        const envelope = 1 - index / samples.length;
        samples[index] = (Math.random() * 2 - 1) * envelope * envelope;
      }
      const source = rig.context.createBufferSource();
      const filter = rig.context.createBiquadFilter();
      const gain = rig.context.createGain();
      const start = now + delay;
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(pitch, start);
      filter.Q.setValueAtTime(1.8, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(rig.fxGain);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      source.start(start);
      source.stop(start + duration + 0.02);
    };
    const pulses = Math.max(2, Math.min(8, relayCount + 1));
    for (let index = 0; index < pulses; index += 1) {
      const delay = index * 0.245;
      crack(delay, 0.12 * (1 - index / (pulses + 2)), 1250 + index * 115);
      tone(
        signature.baseFrequency * (1.7 + index * 0.025),
        0.15,
        delay + 0.025,
        0.055,
        "triangle",
        0.88,
      );
    }
    return;
  }

  for (let echo = 0; echo < signature.pulseCount; echo += 1) {
    const decay = 1 - echo / (signature.pulseCount + 1);
    tone(
      signature.baseFrequency * (1 + echo * 0.004),
      0.2 + echo * 0.045,
      echo * signature.echoSpacing,
      0.18 * decay,
      echo % 2 ? "triangle" : "sine",
      1.015,
    );
  }

  const responseStart =
    signature.echoSpacing * Math.max(2, signature.pulseCount - 1) + 0.24;
  // Le roi répond par une vibration grave, large et lente.
  tone(
    signature.baseFrequency / 2,
    0.62,
    responseStart,
    0.2,
    "sine",
    0.92,
  );
  tone(
    signature.baseFrequency,
    0.4,
    responseStart + 0.13,
    0.09,
    "triangle",
    0.98,
  );
  // La reine répond ensuite par deux ondulations plus fines et plus hautes.
  [0, 0.18].forEach((delay, index) =>
    tone(
      signature.baseFrequency * signature.responseRatio * (1 + index * 0.012),
      0.48,
      responseStart + 0.42 + delay,
      0.14 - index * 0.025,
      "triangle",
      1.04,
    ),
  );
}

function safeStoredGame(value: unknown): GameState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<GameState>;
  const rulesVersion = Number(candidate.rulesVersion);
  if (
    (rulesVersion !== 2 &&
      rulesVersion !== 3 &&
      rulesVersion !== 4 &&
      rulesVersion !== 5 &&
      rulesVersion !== 6 &&
      rulesVersion !== 7 &&
      rulesVersion !== 8 &&
      rulesVersion !== 9 &&
      rulesVersion !== 10 &&
      rulesVersion !== 11 &&
      rulesVersion !== 12 &&
      rulesVersion !== 13 &&
      rulesVersion !== 14 &&
      rulesVersion !== 15) ||
    !Array.isArray(candidate.pieces) ||
    !Array.isArray(candidate.players) ||
    !Array.isArray(candidate.turnOrder) ||
    typeof candidate.turnIndex !== "number" ||
    !candidate.config
  ) {
    return undefined;
  }
  const saved = candidate as GameState;
  const pieces = saved.pieces
    .filter((piece) => {
      const type = (piece as { type?: string }).type;
      return type === "king" || type === "queen" || type === "pawn" || type === "egg";
    })
    .map((piece) => ({
      ...piece,
      zombieActivationsRemaining:
        piece.type === "pawn" &&
        Number.isFinite(piece.zombieActivationsRemaining) &&
        (piece.zombieActivationsRemaining ?? 0) > 0
          ? Math.max(
              1,
              Math.min(10, Math.floor(piece.zombieActivationsRemaining ?? 10)),
            )
          : undefined,
      zombieBornMoveNumber:
        piece.type === "pawn" &&
        Number.isFinite(piece.zombieActivationsRemaining) &&
        (piece.zombieActivationsRemaining ?? 0) > 0
          ? Math.max(0, Math.floor(piece.zombieBornMoveNumber ?? 0))
          : undefined,
      breedingTurns:
        rulesVersion >= 14 &&
        (piece.type === "queen" || piece.type === "king")
          ? Math.max(
              0,
              Math.min(ROYAL_COCOON_TURNS, piece.breedingTurns ?? 0),
            )
          : 0,
      breedingPartnerId:
        rulesVersion >= 14 &&
        (piece.type === "queen" || piece.type === "king") &&
        typeof piece.breedingPartnerId === "string"
          ? piece.breedingPartnerId
          : undefined,
      hatchTurns:
        piece.type === "egg"
          ? Math.max(1, Math.min(EGG_HATCH_TURNS, piece.hatchTurns ?? EGG_HATCH_TURNS))
          : undefined,
      queenBonded:
        piece.type === "queen"
          ? typeof piece.queenBonded === "boolean"
            ? piece.queenBonded
            : !piece.promoted
          : false,
    }));
  const notices = rulesVersion >= 10 && Array.isArray(saved.notices)
    ? saved.notices.filter(
        (notice) => (notice as { pieceType?: string }).pieceType === "egg",
      )
    : [];
  const players = synchronizePlayerResources(
    saved.players.map((player) => ({
      ...player,
      solitaryKingTurns: Math.max(0, player.solitaryKingTurns ?? 0),
      exitReason:
        player.exitReason === "escaped" || player.exitReason === "checkmate"
          ? player.exitReason
          : undefined,
    })),
    pieces,
  );
  let teamLogs = saved.teamLogs;
  if (!teamLogs || typeof teamLogs !== "object") {
    teamLogs = {};
    saved.players.forEach((player) => {
      teamLogs[player.id] = [
        {
          id: `journal-migration-${player.id}-${saved.moveNumber ?? 0}`,
          turn: saved.moveNumber ?? 0,
          round: saved.round ?? 1,
          kind: "system",
          message:
            "Journal activé à partir de cette version ; les anciens messages n’étaient pas encore classés par royaume.",
        },
      ];
    });
  }
  const savedTraining = saved as GameState & {
    matchId?: unknown;
    humanMoveTrace?: unknown;
  };
  const matchId =
    typeof savedTraining.matchId === "string"
      ? savedTraining.matchId
      : `legacy-${saved.moveNumber ?? 0}-${saved.winnerId ?? "active"}-${saved.players.map((player) => player.personalTurns ?? 0).join("-")}`;
  const humanMoveTrace = Array.isArray(savedTraining.humanMoveTrace)
    ? (savedTraining.humanMoveTrace as GameState["humanMoveTrace"]).map(
        (frame) => ({
          ...frame,
          features: Array.isArray(frame.features) ? frame.features : [],
          position: {
            ...frame.position,
            pieces: Array.isArray(frame.position?.pieces)
              ? frame.position.pieces.map((piece) => ({
                  ...piece,
                  breedingPartnerId:
                    typeof piece.breedingPartnerId === "string"
                      ? piece.breedingPartnerId
                      : undefined,
                  hatchTurns: piece.type === "egg" ? piece.hatchTurns ?? EGG_HATCH_TURNS : 0,
                  queenBonded:
                    piece.type === "queen"
                      ? typeof piece.queenBonded === "boolean"
                        ? piece.queenBonded
                        : !piece.promoted
                      : false,
                }))
              : [],
            players: Array.isArray(frame.position?.players)
              ? frame.position.players.map((player) => ({
                  ...player,
                  resourcesEarned: player.resourcesEarned ?? player.resources,
                  solitaryKingTurns: player.solitaryKingTurns ?? 0,
                }))
              : [],
          },
        }),
      )
    : [];
  const storedDifficulty = Number(
    (saved.config as { aiDifficulty?: unknown }).aiDifficulty,
  );
  const aiDifficulty = ([1, 2, 3, 4] as number[]).includes(storedDifficulty)
    ? (storedDifficulty as AIDifficulty)
    : 3;
  const legacyPat =
    rulesVersion < 13 &&
    typeof saved.drawReason === "string" &&
    /pat|blocage général/i.test(saved.drawReason);
  const loopTrackers: GameState["loopTrackers"] = {};
  saved.turnOrder.forEach((playerId) => {
    const raw = saved.loopTrackers?.[playerId];
    const history = Array.isArray(raw?.history)
      ? raw.history
          .filter(
            (entry) =>
              entry &&
              typeof entry.signature === "string" &&
              entry.signature.length > 0 &&
              entry.signature.length <= 64,
          )
          .slice(-256)
          .map((entry) => ({
            signature: entry.signature,
            hadSafeAlternative: Boolean(entry.hadSafeAlternative),
          }))
      : [];
    const actionHistory = Array.isArray(raw?.actionHistory)
      ? raw.actionHistory.filter(isLoopActionSignature).slice(-40)
      : [];
    const repeatedActions = repeatedActionTail(actionHistory);
    loopTrackers[playerId] = {
      history,
      repeatCount: Math.max(
        0,
        Math.min(LOOP_REPETITION_LIMIT, Math.floor(raw?.repeatCount ?? 0)),
      ),
      cycleLength: Math.max(
        0,
        Math.min(24, Math.floor(raw?.cycleLength ?? 0)),
      ),
      cycleSignatures: Array.isArray(raw?.cycleSignatures)
        ? raw.cycleSignatures
            .filter(
              (signature): signature is string =>
                typeof signature === "string" &&
                signature.length > 0 &&
                signature.length <= 64,
            )
            .slice(-24)
        : [],
      actionHistory,
      actionRepeatCount: repeatedActions.repeatCount,
      actionPatternLength: repeatedActions.patternLength,
      actionPattern: repeatedActions.pattern,
      bestTerritoryPotential:
        typeof raw?.bestTerritoryPotential === "number" &&
        Number.isFinite(raw.bestTerritoryPotential)
          ? Math.max(0, Math.min(10_000, raw.bestTerritoryPotential))
          : territoryForPlayer(pieces, playerId).potential,
      escapeAttempted: Boolean(raw?.escapeAttempted),
    } as NonNullable<GameState["loopTrackers"]>[PlayerId];
  });
  const restoredForStrategy = {
    ...saved,
    pieces,
    players,
    notices,
    teamLogs,
    humanMoveTrace,
    loopTrackers,
  } as GameState;
  const strategicTrackers: GameState["strategicTrackers"] = {};
  const strategicIntents = new Set([
    "secure_royals",
    "open_nursery",
    "lay",
    "border_pressure",
    "breach",
    "promotion",
  ]);
  saved.turnOrder.forEach((playerId) => {
    const raw = saved.strategicTrackers?.[playerId];
    const baseline = strategicProgressSnapshot(restoredForStrategy, playerId);
    const intent =
      typeof raw?.intent === "string" && strategicIntents.has(raw.intent)
        ? raw.intent
        : undefined;
    const lastIntent =
      typeof raw?.lastIntent === "string" &&
      strategicIntents.has(raw.lastIntent)
        ? raw.lastIntent
        : undefined;
    const finiteInteger = (
      value: unknown,
      fallback: number,
      maximum: number,
    ) =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(maximum, Math.floor(value)))
        : fallback;
    strategicTrackers[playerId] = {
      stagnantTurns: finiteInteger(raw?.stagnantTurns, 0, 99),
      intent,
      intentTurnsRemaining: intent
        ? finiteInteger(raw?.intentTurnsRemaining, 0, 3)
        : 0,
      replanPending: Boolean(intent && raw?.replanPending),
      failedSacrifices: finiteInteger(raw?.failedSacrifices, 0, 2),
      reason:
        typeof raw?.reason === "string"
          ? raw.reason.trim().slice(0, 180)
          : undefined,
      lastIntent,
      best: {
        territoryPotential: finiteInteger(
          raw?.best?.territoryPotential,
          baseline.territoryPotential,
          10_000,
        ),
        nurseryCells: finiteInteger(
          raw?.best?.nurseryCells,
          baseline.nurseryCells,
          64,
        ),
        eggs: finiteInteger(raw?.best?.eggs, baseline.eggs, 512),
        enemyMobility: finiteInteger(
          raw?.best?.enemyMobility,
          baseline.enemyMobility,
          256,
        ),
        promotionDistance: finiteInteger(
          raw?.best?.promotionDistance,
          baseline.promotionDistance,
          10,
        ),
      },
    } as NonNullable<GameState["strategicTrackers"]>[PlayerId];
  });
  return {
    ...saved,
    rulesVersion: 15,
    matchId,
    pieces,
    players,
    notices,
    teamLogs,
    humanMoveTrace,
    loopTrackers,
    strategicTrackers,
    drawReason: legacyPat
      ? "Victoire reportée : l’ancien pat devient une évasion royale. La rivalité continuera dans une autre partie."
      : saved.drawReason,
    outcome:
      legacyPat || saved.outcome === "royal_escape"
        ? "royal_escape"
        : undefined,
    config: { ...saved.config, aiDifficulty },
  };
}


function roleLabel(role: "human" | "ai") {
  return role === "human" ? "Humain" : "IA évolutive";
}

function historyDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactGameForStorage(game: GameState): GameState {
  return {
    ...game,
    humanMoveTrace: (game.humanMoveTrace ?? []).slice(-48),
  };
}

function storeJsonSafely(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function ReplayBoard({ state }: { state: GameState }) {
  const replayTerritories: Partial<
    Record<PlayerId, ReturnType<typeof territoryForPlayer>>
  > = {};
  state.players.forEach((player) => {
    if (player.alive) {
      replayTerritories[player.id] = territoryForPlayer(
        state.pieces,
        player.id,
      );
    }
  });
  const replayPlayerId = currentPlayerId(state);
  return (
    <div className="replay-board-frame">
      <HexBoard
        state={state}
        legalTargets={[]}
        checkingPieceIds={checkingPieces(state.pieces, replayPlayerId).map(
          (piece) => piece.id,
        )}
        territories={replayTerritories}
        onCellClick={() => undefined}
      />
    </div>
  );
}

function AnimationLabBoard({ preview }: { preview: AdminAnimationPreview }) {
  const territories: Partial<
    Record<PlayerId, ReturnType<typeof territoryForPlayer>>
  > = {};
  preview.state.players.forEach((player) => {
    if (player.alive) {
      territories[player.id] = territoryForPlayer(preview.state.pieces, player.id);
    }
  });
  const activeId = currentPlayerId(preview.state);
  return (
    <div className="admin-animation-board">
      <HexBoard
        state={preview.state}
        legalTargets={[]}
        checkingPieceIds={checkingPieces(preview.state.pieces, activeId).map(
          (piece) => piece.id,
        )}
        territories={territories}
        colonySignal={preview.colonySignal}
        onCellClick={() => undefined}
      />
    </div>
  );
}

export default function FabHexaGame() {
  const [game, setGame] = useState<GameState>(() => createNewGame(2, 1));
  const [selectedPieceId, setSelectedPieceId] = useState<string>();
  const [memory, setMemory] = useState<AIMemory>(
    () => createT2LeagueSeed().memory,
  );
  const [humanArchive, setHumanArchive] = useState<HumanTrainingArchive>(() =>
    createEmptyHumanTrainingArchive(),
  );
  const [matchHistory, setMatchHistory] = useState<MatchHistoryArchive>(() =>
    createEmptyMatchHistory(),
  );
  const [selfPlayLeague, setSelfPlayLeague] = useState<SelfPlayLeague>(() =>
    createT2LeagueSeed().league,
  );
  const [trainingCorpus, setTrainingCorpus] = useState<FabHexaBrainCorpus>(() =>
    createEmptyTrainingCorpus(),
  );
  const [trainingCorpusReady, setTrainingCorpusReady] = useState(false);
  const [trainingCorpusStatus, setTrainingCorpusStatus] = useState(
    "Chargement du corpus local…",
  );
  const [hybridBrain, setHybridBrain] = useState<HybridHexBrain>(() =>
    createDefaultHybridHexBrain(),
  );
  const [hybridBrainReady, setHybridBrainReady] = useState(false);
  const [hybridBrainStatus, setHybridBrainStatus] = useState(
    "Chargement du cerveau HexConv local…",
  );
  const [showRules, setShowRules] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminAnimationKind, setAdminAnimationKind] =
    useState<AdminAnimationKind>("royal-fireworks");
  const [adminPreview, setAdminPreview] = useState<AdminAnimationPreview>(() =>
    createAdminAnimationPreview("royal-fireworks", 1, 0),
  );
  const [showIntro, setShowIntro] = useState(true);
  const [gameRevealed, setGameRevealed] = useState(false);
  const [replayMatchId, setReplayMatchId] = useState<string>();
  const [replayFrameIndex, setReplayFrameIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [journalPlayerId, setJournalPlayerId] = useState<PlayerId>();
  const [thinking, setThinking] = useState(false);
  const [rendererMode, setRendererMode] = useState<"WebGL 2" | "Canvas">("WebGL 2");
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [audioMode, setAudioMode] = useState<AudioMode>("fx");
  const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [fxVolume, setFxVolume] = useState(DEFAULT_FX_VOLUME);
  const [trainingPower, setTrainingPower] = useState<TrainingPower>(3);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [colonySignal, setColonySignal] = useState<ColonySignal>();
  const [campNotices, setCampNotices] = useState<TimedCampNotice[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();
  const [installed, setInstalled] = useState(false);
  const [hasAiImportBackup, setHasAiImportBackup] = useState(false);
  const [fabExportsBusy, setFabExportsBusy] = useState(false);
  const [selfPlayWorkerStatus, setSelfPlayWorkerStatus] =
    useState<SelfPlayWorkerStatus>("starting");
  const [newConfig, setNewConfig] = useState<NewGameConfig>({
    playerCount: 2,
    humanCount: 1,
    aiDifficulty: 3,
    teamNames: {},
    teamColors: {},
  });
  const hydrated = useRef(false);
  const importInput = useRef<HTMLInputElement>(null);
  const trainingImportInput = useRef<HTMLInputElement>(null);
  const wasmScore = useRef<WasmScore | undefined>(undefined);
  const evolvedWinnerMove = useRef<number | undefined>(undefined);
  const soundtrackElement = useRef<HTMLAudioElement>(null);
  const ambientRig = useRef<AmbientRig | undefined>(undefined);
  const audioRigStarting = useRef<Promise<AmbientRig> | undefined>(undefined);
  const audioModeRef = useRef<AudioMode>("fx");
  const musicVolumeRef = useRef(DEFAULT_MUSIC_VOLUME);
  const fxVolumeRef = useRef(DEFAULT_FX_VOLUME);
  const colonySignalId = useRef(0);
  const adminAnimationSequence = useRef(1);
  const adminTapProbe = useRef({ x: 0, y: 0, count: 0, firstAt: 0 });
  const gameRef = useRef(game);
  const noticeTimers = useRef<number[]>([]);
  const seenNoticeIds = useRef(new Set<string>());
  const noticeMatchId = useRef(game.matchId);
  const soundedMove = useRef(-1);
  const archivedHumanMatches = useRef(new Set<string>());
  const capturedHistoryFrame = useRef<string | undefined>(undefined);
  const historyPersistTimer = useRef<number | undefined>(undefined);
  const latestHistoryForPersistence = useRef(matchHistory);
  const selfPlayWorker = useRef<Worker | undefined>(undefined);
  const selfPlayLeagueRef = useRef<SelfPlayLeague>(selfPlayLeague);
  const hybridBrainRef = useRef<HybridHexBrain>(hybridBrain);
  const selfPlayLastSignalAt = useRef(0);
  const selfPlayPace = useRef(900);
  const trainingPowerRef = useRef<TrainingPower>(3);
  const royalAnimationUntil = useRef(0);
  const wakeSelfPlayWorker = useRef<(() => void) | undefined>(undefined);

  const activePlayerId = currentPlayerId(game);
  const activePlayer = game.players.find((player) => player.id === activePlayerId)!;
  const gameFinished = game.winnerId !== undefined || Boolean(game.drawReason);
  const humanMatchActive =
    !gameFinished &&
    game.players.some((player) => player.role === "human" && player.alive);
  const selectedPiece = game.pieces.find((piece) => piece.id === selectedPieceId);
  const selectedPieceFrozen = selectedPiece
    ? isPieceFrozenByRoyalCocoon(game.pieces, selectedPiece)
    : false;
  const legalMoves = useMemo(
    () => (selectedPieceId ? legalMovesForPiece(game, selectedPieceId) : []),
    [game, selectedPieceId],
  );
  const legalTargets = useMemo(() => legalMoves.map((move) => move.to), [legalMoves]);
  const territories = useMemo(() => {
    const result: Partial<
      Record<PlayerId, ReturnType<typeof territoryForPlayer>>
    > = {};
    game.players.forEach((player) => {
      if (player.alive) result[player.id] = territoryForPlayer(game.pieces, player.id);
    });
    return result;
  }, [game.pieces, game.players]);
  const activeTerritory = territories[activePlayerId];
  const activeInCheck =
    !gameFinished && isInCheck(game.pieces, activePlayerId);
  const checkingPieceIds = useMemo(
    () => checkingPieces(game.pieces, activePlayerId).map((piece) => piece.id),
    [activePlayerId, game.pieces],
  );
  const nextQueenPromotionCost = queenPromotionCost(
    game.pieces,
    activePlayerId,
  );
  const activeEggCount = game.pieces.filter(
    (piece) => piece.playerId === activePlayerId && piece.type === "egg",
  ).length;
  const activePopulation = populationForPlayer(game.pieces, activePlayerId);
  const activeResourceStatus = resourceStatusForPlayer(
    game.pieces,
    activePlayerId,
  );
  const activeUsedResources = usedResources(game.pieces, activePlayerId);
  const loopStatusMessages: Array<{
    key: string;
    label: string;
    severity: "strategy" | "warning" | "escape" | "zombie";
  }> = [];
  const escapedPlayerId = game.lastMove?.antiLoopEscape
    ? game.lastMove.playerId
    : undefined;
  if (escapedPlayerId !== undefined) {
    loopStatusMessages.push({
      key: `escape-${game.moveNumber}-${escapedPlayerId}`,
      label: `BOUCLE ${LOOP_ESCAPE_REPETITION}/${LOOP_REPETITION_LIMIT} — ÉVASION · ${game.players.find((player) => player.id === escapedPlayerId)?.name ?? PLAYER_META[escapedPlayerId].name}`,
      severity: "escape",
    });
  }
  game.players.forEach((player) => {
    const tracker = game.loopTrackers?.[player.id];
    const repetition = effectiveLoopRepetition(tracker);
    const repetitionLabel =
      (tracker?.actionRepeatCount ?? 0) >= (tracker?.repeatCount ?? 0) &&
      (tracker?.actionRepeatCount ?? 0) > 0
        ? "MOTIF"
        : "BOUCLE";
    const strategy = game.strategicTrackers?.[player.id];
    if (
      strategy?.intent &&
      strategy.intentTurnsRemaining > 0 &&
      player.alive
    ) {
      loopStatusMessages.push({
        key: `strategy-${player.id}-${strategy.intent}-${strategy.intentTurnsRemaining}`,
        label: `ANALYSE STRATÉGIQUE · ${STRATEGIC_INTENT_LABEL[strategy.intent]} · ${strategy.intentTurnsRemaining} TOUR${strategy.intentTurnsRemaining > 1 ? "S" : ""} · ${player.name}`,
        severity: "strategy",
      });
    } else if (
      (strategy?.stagnantTurns ?? 0) >= STRATEGIC_STAGNATION_TURNS - 1 &&
      player.role === "ai" &&
      player.alive
    ) {
      loopStatusMessages.push({
        key: `strategy-watch-${player.id}-${strategy?.stagnantTurns ?? 0}`,
        label: `STAGNATION ${strategy?.stagnantTurns ?? 0}/${STRATEGIC_STAGNATION_TURNS} · ${player.name}`,
        severity: "strategy",
      });
    }
    if (
      repetition >= LOOP_WARNING_REPETITION &&
      player.id !== escapedPlayerId
    ) {
      loopStatusMessages.push({
        key: `loop-${player.id}-${repetition}`,
        label:
          repetition >= LOOP_ESCAPE_REPETITION
            ? `${repetitionLabel} ${LOOP_ESCAPE_REPETITION}/${LOOP_REPETITION_LIMIT} — ÉVASION · ${player.name}`
            : `${repetitionLabel} ${LOOP_WARNING_REPETITION}/${LOOP_REPETITION_LIMIT} · ${player.name}`,
        severity:
          repetition >= LOOP_ESCAPE_REPETITION ? "escape" : "warning",
      });
    }
  });
  game.pieces.filter(isZombieTermite).forEach((zombie) => {
    const owner = game.players.find((player) => player.id === zombie.playerId);
    const remaining = Math.max(
      1,
      Math.min(10, zombie.zombieActivationsRemaining),
    );
    loopStatusMessages.push({
      key: `zombie-${zombie.id}`,
      label: `TERMITE ZOMBIE — ${remaining} TOUR${remaining > 1 ? "S" : ""} · ${owner?.name ?? PLAYER_META[zombie.playerId].name}`,
      severity: "zombie",
    });
  });
  const nextQueenAdditionalPotential = Math.max(
    0,
    nextQueenPromotionCost - PAWN_RESOURCE_COST,
  );
  const replayMatch = matchHistory.matches.find(
    (entry) => entry.id === replayMatchId,
  );
  const replayState = replayMatch
    ? replayFrameToGameState(replayMatch, replayFrameIndex)
    : undefined;
  const selfPlayWorkerLabel = !selfPlayLeague.trainingEnabled
    ? "Auto-jeu en pause"
    : selfPlayWorkerStatus === "running"
      ? "Auto-jeu actif"
      : selfPlayWorkerStatus === "recovering"
        ? "Auto-jeu en reprise"
        : selfPlayWorkerStatus === "unsupported"
          ? "Worker indisponible"
          : "Auto-jeu en démarrage";

  const adoptHybridBrain = useCallback(
    (value: unknown, force = false): HybridHexBrain | undefined => {
      const parsed = parseHybridHexBrain(value);
      if (!parsed) return undefined;
      if (
        !force &&
        parsed.trainedSamples < hybridBrainRef.current.trainedSamples
      ) {
        return hybridBrainRef.current;
      }
      hybridBrainRef.current = parsed;
      setHybridBrain(parsed);
      return parsed;
    },
    [],
  );

  const ensureAudioRig = useCallback(
    async (requestedMode = audioModeRef.current): Promise<AmbientRig | undefined> => {
      const existingRig = ambientRig.current;
      if (existingRig?.context.state === "closed") {
        discardAudioRig(existingRig);
        ambientRig.current = undefined;
      } else if (existingRig) {
        await activateAudioRig(existingRig, requestedMode);
        return audioRigHasOutput(existingRig, requestedMode)
          ? existingRig
          : undefined;
      }
      if (requestedMode === "silent") return undefined;
      const soundtrack = soundtrackElement.current;
      if (!soundtrack) return undefined;
      if (!audioRigStarting.current) {
        audioRigStarting.current = startAudioRig(
          requestedMode,
          soundtrack,
          musicVolumeRef.current,
          fxVolumeRef.current,
        );
      }
      try {
        const rig = await audioRigStarting.current;
        ambientRig.current = rig;
        if (rig.mode === requestedMode && audioRigHasOutput(rig, requestedMode)) {
          return rig;
        }
        await activateAudioRig(rig, requestedMode, false);
        return audioRigHasOutput(rig, requestedMode) ? rig : undefined;
      } catch {
        return undefined;
      } finally {
        audioRigStarting.current = undefined;
      }
    },
    [],
  );

  const emitFx = useCallback(
    (kind: FxKind) => {
      if (!audioModeHasFx(audioModeRef.current)) return;
      const rig = ambientRig.current;
      if (rig?.context.state === "running") {
        playFx(rig, kind);
        return;
      }
      void ensureAudioRig(audioModeRef.current).then((readyRig) => {
        if (readyRig) playFx(readyRig, kind);
      });
    },
    [ensureAudioRig],
  );

  const runAdminAnimation = useCallback(
    (kind: AdminAnimationKind) => {
      adminAnimationSequence.current += 1;
      const now = performance.now();
      const preview = createAdminAnimationPreview(
        kind,
        adminAnimationSequence.current,
        now,
      );
      setAdminAnimationKind(kind);
      setAdminPreview(preview);
      const spec = ADMIN_ANIMATIONS.find((candidate) => candidate.kind === kind);
      if (spec?.fx) {
        emitFx(spec.fx);
        if (!audioModeHasFx(audioModeRef.current)) {
          setToast("Animation visible · activez Sons ou Musique + sons pour entendre les FX");
        }
      }
    },
    [emitFx],
  );

  const detectAdminGesture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (adminUnlocked) return;
      const now = performance.now();
      const probe = adminTapProbe.current;
      const distance = Math.hypot(event.clientX - probe.x, event.clientY - probe.y);
      if (
        probe.count === 0 ||
        now - probe.firstAt > ADMIN_UNLOCK_WINDOW_MS ||
        distance > ADMIN_UNLOCK_RADIUS_PX
      ) {
        probe.x = event.clientX;
        probe.y = event.clientY;
        probe.count = 1;
        probe.firstAt = now;
      } else {
        probe.x = probe.x * 0.82 + event.clientX * 0.18;
        probe.y = probe.y * 0.82 + event.clientY * 0.18;
        probe.count += 1;
      }
      if (probe.count >= 40) {
        event.preventDefault();
        event.stopPropagation();
      }
      if ([40, 44, 46].includes(probe.count)) {
        setToast(`Accès administrateur · encore ${ADMIN_UNLOCK_TAPS - probe.count} pression${ADMIN_UNLOCK_TAPS - probe.count > 1 ? "s" : ""}`);
      }
      if (probe.count < ADMIN_UNLOCK_TAPS) return;
      probe.count = 0;
      setAdminUnlocked(true);
      setShowAdmin(true);
      runAdminAnimation("royal-fireworks");
      setToast("Laboratoire administrateur déverrouillé");
      navigator.vibrate?.([45, 35, 80]);
    },
    [adminUnlocked, runAdminAnimation],
  );

  useEffect(() => {
    if (!isNative) return;
    const listener = App.addListener('backButton', () => {
      if (showRules) setShowRules(false);
      else if (showAdmin) setShowAdmin(false);
      else if (showNewGame) setShowNewGame(false);
      else if (showAudioPanel) setShowAudioPanel(false);
      else if (showHistory) { setReplayPlaying(false); setShowHistory(false); }
      else if (journalPlayerId !== undefined) setJournalPlayerId(undefined);
      else if (window.confirm('Quitter Hexagrogne ? La sauvegarde locale sera conservée.')) void App.exitApp();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [showRules, showAdmin, showNewGame, showAudioPanel, showHistory, journalPlayerId]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    updateFullscreen();
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (noticeMatchId.current === game.matchId) return;
    noticeMatchId.current = game.matchId;
    seenNoticeIds.current.clear();
    noticeTimers.current.forEach((timer) => window.clearTimeout(timer));
    noticeTimers.current = [];
    setCampNotices([]);
    soundedMove.current = -1;
  }, [game.matchId]);

  useEffect(() => {
    if (!showHistory || !replayPlaying || !replayMatch) return;
    if (replayFrameIndex >= replayMatch.frames.length - 1) {
      setReplayPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () =>
        setReplayFrameIndex((current) =>
          Math.min(current + 1, replayMatch.frames.length - 1),
        ),
      Math.max(150, 1050 / replaySpeed),
    );
    return () => window.clearTimeout(timer);
  }, [
    replayFrameIndex,
    replayMatch,
    replayPlaying,
    replaySpeed,
    showHistory,
  ]);

  useEffect(() => {
    const t2LeagueSeed = createT2LeagueSeed();
    let initialLeague = t2LeagueSeed.league;
    try {
      const savedGame = safeStoredGame(
        JSON.parse(localStorage.getItem(GAME_STORAGE_KEY) ?? "null"),
      );
      const savedMemory = validateImportedMemory(
        JSON.parse(localStorage.getItem(AI_STORAGE_KEY) ?? "null"),
      );
      const savedHumanArchive = validateHumanTrainingArchive(
        JSON.parse(
          localStorage.getItem(HUMAN_TRAINING_STORAGE_KEY) ?? "null",
        ),
      );
      const savedMatchHistory = validateMatchHistory(
        JSON.parse(localStorage.getItem(MATCH_HISTORY_STORAGE_KEY) ?? "null"),
      );
      const rawSavedLeague = JSON.parse(
        localStorage.getItem(SELF_PLAY_STORAGE_KEY) ?? "null",
      );
      const savedLeague = rawSavedLeague
        ? validateSelfPlayLeague(rawSavedLeague, savedMemory)
        : undefined;
      const t2SeedAlreadyApplied =
        localStorage.getItem(T2_IMPORTED_LEAGUE_STORAGE_KEY) === "1";
      const adoptT2Seed =
        !t2SeedAlreadyApplied && shouldAdoptT2LeagueSeed(savedLeague);
      if (
        adoptT2Seed &&
        savedMemory &&
        savedLeague &&
        !localStorage.getItem(AI_IMPORT_BACKUP_KEY)
      ) {
        const backup: AiImportBackup = {
          schema: "fabhexagrogne-ai-import-backup",
          version: 1,
          createdAt: new Date().toISOString(),
          memory: savedMemory,
          league: savedLeague,
        };
        localStorage.setItem(AI_IMPORT_BACKUP_KEY, JSON.stringify(backup));
      }
      localStorage.setItem(T2_IMPORTED_LEAGUE_STORAGE_KEY, "1");
      const restoredMemory = adoptT2Seed
        ? t2LeagueSeed.memory
        : savedMemory ?? t2LeagueSeed.memory;
      initialLeague = adoptT2Seed
        ? t2LeagueSeed.league
        : savedLeague ?? t2LeagueSeed.league;
      const restoredGame = savedGame ?? gameRef.current;
      if (savedGame) setGame(savedGame);
      setMemory(restoredMemory);
      archivedHumanMatches.current = new Set(
        savedHumanArchive.games.map((record) => record.matchId),
      );
      setHumanArchive(savedHumanArchive);
      capturedHistoryFrame.current = `${restoredGame.matchId}:${restoredGame.moveNumber}:${restoredGame.winnerId ?? "-"}:${restoredGame.drawReason ?? "-"}`;
      setMatchHistory(appendMatchFrame(savedMatchHistory, restoredGame));
      setHasAiImportBackup(
        Boolean(localStorage.getItem(AI_IMPORT_BACKUP_KEY)),
      );
      const savedAudioMode = validateAudioMode(
        localStorage.getItem(AUDIO_MODE_STORAGE_KEY),
      );
      const savedMusicVolume = validateAudioVolume(
        localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY),
        DEFAULT_MUSIC_VOLUME,
      );
      const savedFxVolume = validateAudioVolume(
        localStorage.getItem(FX_VOLUME_STORAGE_KEY),
        DEFAULT_FX_VOLUME,
      );
      const savedTrainingPower = validateTrainingPower(
        localStorage.getItem(TRAINING_POWER_STORAGE_KEY),
      );
      audioModeRef.current = savedAudioMode;
      musicVolumeRef.current = savedMusicVolume;
      fxVolumeRef.current = savedFxVolume;
      setAudioMode(savedAudioMode);
      setMusicVolume(savedMusicVolume);
      setFxVolume(savedFxVolume);
      setTrainingPower(savedTrainingPower);
      trainingPowerRef.current = savedTrainingPower;
      selfPlayPace.current = trainingDelayMs(
        savedTrainingPower,
        restoredGame.winnerId === undefined &&
          !restoredGame.drawReason &&
          restoredGame.players.some(
            (player) => player.role === "human" && player.alive,
          ),
      );
      selfPlayLeagueRef.current = initialLeague;
      setSelfPlayLeague(initialLeague);
    } catch {
      // A corrupt local save must never prevent a new match.
    } finally {
      hydrated.current = true;
    }
    if (typeof Worker === "undefined") {
      setSelfPlayWorkerStatus("unsupported");
      return;
    }

    let disposed = false;
    let restartTimer: number | undefined;

    function scheduleRestart(
      failedWorker?: Worker,
      delay = SELF_PLAY_RESTART_DELAY_MS,
    ) {
      if (disposed) return;
      if (failedWorker && selfPlayWorker.current !== failedWorker) return;
      if (failedWorker) {
        failedWorker.terminate();
        selfPlayWorker.current = undefined;
      }
      if (restartTimer !== undefined) return;
      setSelfPlayWorkerStatus(
        selfPlayLeagueRef.current.trainingEnabled ? "recovering" : "paused",
      );
      restartTimer = window.setTimeout(() => {
        restartTimer = undefined;
        launchWorker(selfPlayLeagueRef.current);
      }, delay);
    }

    function launchWorker(snapshot: SelfPlayLeague) {
      if (disposed) return;
      const previousWorker = selfPlayWorker.current;
      if (previousWorker) previousWorker.terminate();

      let worker: Worker;
      try {
        worker = new Worker(
          new URL("./self-play-worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        selfPlayWorker.current = undefined;
        scheduleRestart(undefined, 2_500);
        return;
      }

      selfPlayWorker.current = worker;
      selfPlayLastSignalAt.current = Date.now();
      setSelfPlayWorkerStatus(
        selfPlayLeagueRef.current.trainingEnabled ? "starting" : "paused",
      );

      worker.onmessage = (event: MessageEvent<SelfPlayWorkerEvent>) => {
        if (disposed || selfPlayWorker.current !== worker) return;
        const message = event.data;
        if (!message || typeof message.type !== "string") return;
        selfPlayLastSignalAt.current = Date.now();

        if (message.type === "ready" || message.type === "progress") {
          const incoming = validateSelfPlayLeague(message.league);
          const controls = selfPlayLeagueRef.current;
          const merged = {
            ...incoming,
            trainingEnabled: controls.trainingEnabled,
            guardrailsEnabled: controls.guardrailsEnabled,
          };
          selfPlayLeagueRef.current = merged;
          setSelfPlayLeague(merged);
          if (message.brain) adoptHybridBrain(message.brain);
          setSelfPlayWorkerStatus(
            merged.trainingEnabled ? "running" : "paused",
          );
          return;
        }

        if (message.type === "brain-progress") {
          const adopted = adoptHybridBrain(message.brain);
          if (adopted) {
            setHybridBrainStatus(
              `${message.trained} décision${message.trained > 1 ? "s" : ""} du corpus apprise${message.trained > 1 ? "s" : ""} · ${adopted.trainedSamples} exemples T3 au total.`,
            );
          }
          return;
        }

        if (message.type === "recoverable-error") {
          setSelfPlayWorkerStatus(
            selfPlayLeagueRef.current.trainingEnabled
              ? "recovering"
              : "paused",
          );
          return;
        }

        setSelfPlayWorkerStatus(
          selfPlayLeagueRef.current.trainingEnabled ? "running" : "paused",
        );
      };
      worker.onerror = (event) => {
        event.preventDefault();
        scheduleRestart(worker);
      };
      worker.onmessageerror = () => scheduleRestart(worker);

      const controls = selfPlayLeagueRef.current;
      worker.postMessage({
        type: "start",
        league: {
          ...snapshot,
          trainingEnabled: controls.trainingEnabled,
          guardrailsEnabled: controls.guardrailsEnabled,
        },
        brain: hybridBrainRef.current,
      });
      worker.postMessage({ type: "set-pace", delayMs: selfPlayPace.current });
      worker.postMessage({
        type: "set-brain-budget",
        updates: Math.max(1, trainingPowerRef.current - 1),
      });
    }

    function wakeWorker() {
      if (disposed) return;
      if (document.visibilityState !== "visible") {
        if (isNative) selfPlayWorker.current?.postMessage({ type: "set-enabled", enabled: false });
        return;
      }
      const worker = selfPlayWorker.current;
      const enabled = selfPlayLeagueRef.current.trainingEnabled;
      if (!enabled) {
        setSelfPlayWorkerStatus("paused");
        return;
      }
      if (
        !worker ||
        Date.now() - selfPlayLastSignalAt.current > SELF_PLAY_STALE_AFTER_MS
      ) {
        scheduleRestart(worker, 120);
        return;
      }
      worker.postMessage({ type: "ping" });
      worker.postMessage({ type: "set-enabled", enabled: true });
      worker.postMessage({ type: "set-pace", delayMs: selfPlayPace.current });
    }

    wakeSelfPlayWorker.current = wakeWorker;
    launchWorker(initialLeague);
    const watchdogTimer = window.setInterval(
      wakeWorker,
      SELF_PLAY_WATCHDOG_INTERVAL_MS,
    );
    document.addEventListener("visibilitychange", wakeWorker);

    return () => {
      disposed = true;
      if (restartTimer !== undefined) window.clearTimeout(restartTimer);
      window.clearInterval(watchdogTimer);
      document.removeEventListener("visibilitychange", wakeWorker);
      wakeSelfPlayWorker.current = undefined;
      const worker = selfPlayWorker.current;
      if (worker) {
        worker.postMessage({ type: "stop" });
        worker.terminate();
        selfPlayWorker.current = undefined;
      }
    };
  }, [adoptHybridBrain]);

  useEffect(() => {
    let active = true;
    void loadHybridHexBrain()
      .then((storedBrain) => {
        if (!active) return;
        const selected =
          adoptHybridBrain(storedBrain) ?? hybridBrainRef.current;
        selfPlayWorker.current?.postMessage({
          type: "set-brain",
          brain: selected,
        });
        setHybridBrainReady(true);
        setHybridBrainStatus(
          selected.trainedSamples
            ? `${selected.trainedSamples} exemples T3 restaurés sur cet appareil.`
            : "Branche HexConv prête · sortie neutre jusqu’au premier apprentissage.",
        );
      })
      .catch(() => {
        if (!active) return;
        setHybridBrainReady(true);
        setHybridBrainStatus(
          "Stockage T3 indisponible · apprentissage conservé en mémoire pour cette session.",
        );
      });
    return () => {
      active = false;
    };
  }, [adoptHybridBrain]);

  useEffect(() => {
    if (!hybridBrainReady) return;
    const timer = window.setTimeout(() => {
      void saveHybridHexBrain(hybridBrain).catch(() => {
        setHybridBrainStatus(
          "Cerveau HexConv actif · sauvegarde locale momentanément indisponible.",
        );
      });
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [hybridBrain, hybridBrainReady]);

  useEffect(() => {
    let active = true;
    void loadTrainingCorpus()
      .then((corpus) => {
        if (!active) return;
        setTrainingCorpus(corpus);
        setTrainingCorpusReady(true);
        setTrainingCorpusStatus(
          corpus.samples.length
            ? String(corpus.samples.length) +
                " décision" +
                (corpus.samples.length > 1 ? "s" : "") +
                " restaurée" +
                (corpus.samples.length > 1 ? "s" : "") +
                " depuis cet appareil."
            : "Corpus T2 prêt à recevoir des entraînements.",
        );
      })
      .catch(() => {
        if (!active) return;
        setTrainingCorpusReady(true);
        setTrainingCorpusStatus(
          "IndexedDB indisponible · le corpus restera en mémoire pour cette session.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    trainingPowerRef.current = trainingPower;
    selfPlayPace.current = trainingDelayMs(trainingPower, humanMatchActive);
    selfPlayWorker.current?.postMessage({
      type: "set-pace",
      delayMs: selfPlayPace.current,
    });
    selfPlayWorker.current?.postMessage({
      type: "set-brain-budget",
      updates: Math.max(1, trainingPower - 1),
    });
    if (hydrated.current) {
      try {
        localStorage.setItem(
          TRAINING_POWER_STORAGE_KEY,
          String(trainingPower),
        );
      } catch {
        // L’entraînement continue même sans persistance locale.
      }
    }
  }, [humanMatchActive, trainingPower]);

  useEffect(() => {
    let audioPreparationTimer: number | undefined;
    let disposed = false;
    const prepareSoundtrack = () => {
      if (disposed) return;
      if (audioPreparationTimer !== undefined) {
        window.clearTimeout(audioPreparationTimer);
        audioPreparationTimer = undefined;
      }
      const soundtrack = soundtrackElement.current;
      if (!soundtrack) return;
      configureSoundtrackElement(soundtrack);
      soundtrack.load();
    };
    if (!isNative && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js?v=3-t351-league-fix").catch(() => undefined);
      void Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => {
          audioPreparationTimer = window.setTimeout(resolve, 2_500);
        }),
      ]).then(prepareSoundtrack);
    } else {
      prepareSoundtrack();
    }
    const standalone = window.matchMedia("(display-mode: standalone)");
    const fullscreenApp = window.matchMedia("(display-mode: fullscreen)");
    const iosStandalone = Boolean(
      (navigator as Navigator & { standalone?: boolean }).standalone,
    );
    setInstalled(isNative || standalone.matches || fullscreenApp.matches || iosStandalone);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
      setToast("FabHexaGrogne est installé");
    };
    const resumeActiveAudio = (event?: Event) => {
      if (document.visibilityState !== "visible") return;
      if (audioModeRef.current === "silent") return;
      if (
        event?.type === "pointerdown" &&
        event.target instanceof Element &&
        event.target.closest(".audio-modal, .game-intro, .game-soundtrack")
      ) {
        return;
      }
      void ensureAudioRig(audioModeRef.current).then((rig) => {
        setAudioStatus(
          rig ? audioStatusForRig(rig, audioModeRef.current) : "blocked",
        );
      });
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("pointerdown", resumeActiveAudio, true);
    document.addEventListener("visibilitychange", resumeActiveAudio);
    return () => {
      disposed = true;
      if (audioPreparationTimer !== undefined) {
        window.clearTimeout(audioPreparationTimer);
      }
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("pointerdown", resumeActiveAudio, true);
      document.removeEventListener("visibilitychange", resumeActiveAudio);
      const rig = ambientRig.current;
      ambientRig.current = undefined;
      if (rig) stopAmbientMusic(rig);
      noticeTimers.current.forEach((timer) => window.clearTimeout(timer));
      if (historyPersistTimer.current !== undefined) {
        window.clearTimeout(historyPersistTimer.current);
      }
    };
  }, [ensureAudioRig]);

  useEffect(() => {
    const freshNotices = (game.notices ?? []).filter(
      (notice) => !seenNoticeIds.current.has(notice.id),
    );
    if (!freshNotices.length) return;
    freshNotices.forEach((notice) => seenNoticeIds.current.add(notice.id));
    setCampNotices((current) => [
      ...current,
      ...freshNotices.map((notice) => ({ ...notice, shownAt: Date.now() })),
    ].slice(-10));
    freshNotices.forEach((notice) => {
      emitFx(
        notice.kind === "reproduction-success"
          ? "reproduction-success"
          : "reproduction-fail",
      );
      let timer = 0;
      timer = window.setTimeout(() => {
        setCampNotices((current) =>
          current.filter((candidate) => candidate.id !== notice.id),
        );
        noticeTimers.current = noticeTimers.current.filter(
          (candidate) => candidate !== timer,
        );
      }, CAMP_NOTICE_DURATION_MS);
      noticeTimers.current.push(timer);
    });
  }, [emitFx, game.notices]);

  useEffect(() => {
    if (game.moveNumber <= 0 || soundedMove.current === game.moveNumber) return;
    soundedMove.current = game.moveNumber;
    emitFx("move");
    if (game.lastMove?.capturedType === "egg") {
      emitFx("egg-crush");
      if (game.lastMove.eggBlast) navigator.vibrate?.([55, 28, 110]);
    }
    else if (game.lastMove?.capturedType) emitFx("capture");
    if (game.lastMove?.royalSacrifice) emitFx("royal-sacrifice");
    const cocoonStarted = game.lastMove?.royalCocoonEffects?.some(
      (effect) => effect.kind === "started",
    );
    if (cocoonStarted) {
      emitFx("royal-cocoon");
      royalAnimationUntil.current = Math.max(
        royalAnimationUntil.current,
        performance.now() + ROYAL_COCOON_DURATION_MS,
      );
    }
    if (game.lastMove?.acidVictimId) emitFx("acid-duel");
    if (game.lastMove?.promoted) emitFx("promotion");
    if ((game.lastMove?.hatchedCount ?? 0) > 0) emitFx("hatch");
    const zombieEffects = game.lastMove?.zombieEffects ?? [];
    if (zombieEffects.some((effect) => effect.kind === "spawn")) {
      emitFx("zombie-spawn");
      navigator.vibrate?.([90, 35, 90, 35, 180]);
    }
    if (zombieEffects.some((effect) => effect.kind === "move")) {
      emitFx("zombie-step");
      navigator.vibrate?.([22, 18, 22]);
    }
    if (zombieEffects.some((effect) => effect.kind === "bite")) {
      emitFx("zombie-bite");
      navigator.vibrate?.([35, 25, 70]);
    }
    if (zombieEffects.some((effect) => effect.kind === "expire")) {
      emitFx("zombie-expire");
      navigator.vibrate?.([120, 50, 200]);
    }
    const royalExits = game.lastMove?.royalExitEffects ?? [];
    if (royalExits.length) {
      const duration = Math.max(
        ...royalExits.map((effect) =>
          effect.kind === "escape"
            ? ROYAL_ESCAPE_DURATION_MS
            : ROYAL_FIREWORKS_DURATION_MS,
        ),
      );
      royalAnimationUntil.current = performance.now() + duration;
      if (royalExits.some((effect) => effect.kind === "escape")) {
        emitFx("royal-escape");
      }
      if (royalExits.some((effect) => effect.kind === "checkmate")) {
        emitFx("royal-fireworks");
      }
    } else if (game.lastMove?.royalSacrifice) {
      royalAnimationUntil.current =
        performance.now() + ROYAL_SACRIFICE_DURATION_MS;
    }
    if (game.winnerId !== undefined) {
      emitFx("victory");
      return;
    }
    if (game.drawReason) return;
    const nextPlayerId = currentPlayerId(game);
    if (isInCheck(game.pieces, nextPlayerId)) emitFx("check");
  }, [emitFx, game]);

  useEffect(() => {
    if (!hydrated.current) return;
    const stored = storeJsonSafely(
      GAME_STORAGE_KEY,
      compactGameForStorage(game),
    );
    if (!stored) {
      const emergencyHistory = emergencyCompactMatchHistoryArchive(
        latestHistoryForPersistence.current,
      );
      latestHistoryForPersistence.current = emergencyHistory;
      storeJsonSafely(MATCH_HISTORY_STORAGE_KEY, emergencyHistory);
      storeJsonSafely(GAME_STORAGE_KEY, {
        ...compactGameForStorage(game),
        humanMoveTrace: [],
      });
      setMatchHistory(emergencyHistory);
    }
  }, [game]);

  useEffect(() => {
    if (!hydrated.current) return;
    const frameKey = `${game.matchId}:${game.moveNumber}:${game.winnerId ?? "-"}:${game.drawReason ?? "-"}`;
    if (capturedHistoryFrame.current === frameKey) return;
    capturedHistoryFrame.current = frameKey;
    setMatchHistory((current) => appendMatchFrame(current, game));
  }, [game]);

  useEffect(() => {
    latestHistoryForPersistence.current = matchHistory;
    if (!hydrated.current) return;
    if (historyPersistTimer.current !== undefined) return;
    historyPersistTimer.current = window.setTimeout(() => {
      historyPersistTimer.current = undefined;
      const latest = latestHistoryForPersistence.current;
      if (storeJsonSafely(MATCH_HISTORY_STORAGE_KEY, latest)) return;
      const emergency = emergencyCompactMatchHistoryArchive(latest);
      latestHistoryForPersistence.current = emergency;
      storeJsonSafely(MATCH_HISTORY_STORAGE_KEY, emergency);
      setMatchHistory(emergency);
    }, 900);
  }, [matchHistory]);

  useEffect(() => {
    if (!hydrated.current) return;
    storeJsonSafely(AI_STORAGE_KEY, memory);
  }, [memory]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (storeJsonSafely(HUMAN_TRAINING_STORAGE_KEY, humanArchive)) return;

    const compactedArchive = emergencyCompactHumanTrainingArchive(humanArchive);
    const compactedHistory = emergencyCompactMatchHistoryArchive(
      latestHistoryForPersistence.current,
    );
    latestHistoryForPersistence.current = compactedHistory;
    storeJsonSafely(MATCH_HISTORY_STORAGE_KEY, compactedHistory);
    const recovered = storeJsonSafely(
      HUMAN_TRAINING_STORAGE_KEY,
      compactedArchive,
    );
    const timer = window.setTimeout(() => {
      setMatchHistory(compactedHistory);
      if (recovered) {
        setHumanArchive(compactedArchive);
        setToast(
          "Stockage local optimisé automatiquement : la victoire et son apprentissage sont conservés",
        );
      } else {
        setToast(
          "Stockage local indisponible : victoire conservée pour cette session, export conseillé",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [humanArchive]);

  useEffect(() => {
    if (!hydrated.current) return;
    storeJsonSafely(SELF_PLAY_STORAGE_KEY, selfPlayLeague);
  }, [selfPlayLeague]);

  useEffect(() => {
    audioModeRef.current = audioMode;
    musicVolumeRef.current = musicVolume;
    fxVolumeRef.current = fxVolume;
    if (hydrated.current) {
      try {
        localStorage.setItem(AUDIO_MODE_STORAGE_KEY, audioMode);
        localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(musicVolume));
        localStorage.setItem(FX_VOLUME_STORAGE_KEY, String(fxVolume));
      } catch {
        // Le son continue même si le stockage local est momentanément plein.
      }
    }
    if (ambientRig.current) {
      setAudioMix(
        ambientRig.current,
        audioMode,
        true,
        musicVolume,
        fxVolume,
      );
    } else if (soundtrackElement.current) {
      soundtrackElement.current.volume = soundtrackVolumeForMode(
        audioMode,
        musicVolume,
      );
    }
  }, [audioMode, fxVolume, musicVolume]);

  useEffect(() => {
    let nextSignalTimer = 0;
    let clearSignalTimer = 0;
    const scheduleSignal = (delay: number) => {
      nextSignalTimer = window.setTimeout(() => {
        const current = gameRef.current;
        const eligiblePlayers = current.players.filter((player) => {
          if (!player.alive) return false;
          const colonyPieces = current.pieces.filter(
            (piece) => piece.playerId === player.id,
          );
          const hasEggs =
            colonyPieces.some((piece) => piece.type === "egg");
          return (
            hasEggs ||
            (colonyPieces.some((piece) => piece.type === "pawn") &&
              colonyPieces.some(
                (piece) => piece.type === "king" || piece.type === "queen",
              ))
          );
        });
        if (document.visibilityState === "visible" && eligiblePlayers.length) {
          const player =
            eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
          const soldiers = current.pieces.filter(
            (piece) => piece.playerId === player.id && piece.type === "pawn",
          );
          const eggs = current.pieces.filter(
            (piece) => piece.playerId === player.id && piece.type === "egg",
          );
          const eggSignal =
            eggs.length >= 1 &&
            (!soldiers.length || Math.random() < 0.42);
          const sourcePiece = eggSignal
            ? eggs[Math.floor(Math.random() * eggs.length)]
            : soldiers[Math.floor(Math.random() * soldiers.length)];
          const relayPieceIds: string[] = [];
          if (eggSignal) {
            const remaining = eggs.filter((egg) => egg.id !== sourcePiece.id);
            let cursor = sourcePiece;
            while (remaining.length && relayPieceIds.length < 8) {
              remaining.sort(
                (a, b) => hexDistance(cursor, a) - hexDistance(cursor, b),
              );
              cursor = remaining.shift()!;
              relayPieceIds.push(cursor.id);
            }
          }
          const signal: ColonySignal = {
            id: colonySignalId.current + 1,
            playerId: player.id,
            sourcePieceId: sourcePiece.id,
            kind: eggSignal ? "egg" : "soldier",
            relayPieceIds: eggSignal ? relayPieceIds : undefined,
            startedAt: performance.now(),
          };
          colonySignalId.current = signal.id;
          setColonySignal(signal);
          clearSignalTimer = window.setTimeout(() => {
            setColonySignal((active) =>
              active?.id === signal.id ? undefined : active,
            );
          }, 2900);
          if (ambientRig.current) {
            playColonySignal(
              ambientRig.current,
              signal.playerId,
              signal.kind,
              signal.relayPieceIds?.length ?? 0,
            );
          }
        }
        scheduleSignal(4800 + Math.random() * 4300);
      }, delay);
    };
    scheduleSignal(2600 + Math.random() * 2200);
    return () => {
      window.clearTimeout(nextSignalTimer);
      window.clearTimeout(clearSignalTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWasm = async () => {
      try {
        const response = await fetch("/ai-score.wasm");
        if (!response.ok) return;
        let module: WebAssembly.WebAssemblyInstantiatedSource;
        try {
          module = await WebAssembly.instantiateStreaming(response.clone());
        } catch {
          module = await WebAssembly.instantiate(await response.arrayBuffer());
        }
        const score = module.instance.exports.score as (...values: number[]) => number;
        if (typeof score !== "function" || cancelled) return;
        wasmScore.current = (weights, features) => score(...weights, ...features);
        setMemory((current) => ({ ...current, wasmReady: true }));
      } catch {
        // The TypeScript evaluator remains an exact functional fallback.
      }
    };
    void loadWasm();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (game.winnerId === undefined || evolvedWinnerMove.current === game.moveNumber) return;
    evolvedWinnerMove.current = game.moveNumber;
    const winner = game.players.find((player) => player.id === game.winnerId);
    setMemory((current) => evolveAfterGame(current, winner?.role === "ai"));
  }, [game.moveNumber, game.players, game.winnerId]);

  useEffect(() => {
    if (
      !hydrated.current ||
      game.winnerId === undefined ||
      archivedHumanMatches.current.has(game.matchId)
    ) {
      return;
    }
    const winner = game.players.find((player) => player.id === game.winnerId);
    if (winner?.role !== "human") return;
    const result = archiveHumanVictory(humanArchive, game);
    if (!result.added) return;
    archivedHumanMatches.current.add(game.matchId);
    setHumanArchive(result.archive);
    setToast(
      `Victoire humaine mémorisée : ${result.frameCount} décision${result.frameCount !== 1 ? "s" : ""} pour l’IA future`,
    );
  }, [game, humanArchive]);

  useEffect(() => {
    if (
      showIntro ||
      showHistory ||
      gameFinished ||
      !isTurnBlockedByRoyalCocoon(game, activePlayerId)
    ) {
      return;
    }
    const startedNow = game.lastMove?.royalCocoonEffects?.some(
      (effect) => effect.kind === "started",
    );
    const moveSnapshot = game.moveNumber;
    const turnSnapshot = game.turnIndex;
    const timer = window.setTimeout(() => {
      setGame((current) =>
        current.moveNumber === moveSnapshot &&
        current.turnIndex === turnSnapshot &&
        isTurnBlockedByRoyalCocoon(current)
          ? passTurnBlockedByRoyalCocoon(current)
          : current,
      );
      setSelectedPieceId(undefined);
      setThinking(false);
    }, startedNow ? ROYAL_COCOON_DURATION_MS + 180 : 720);
    return () => window.clearTimeout(timer);
  }, [activePlayerId, game, gameFinished, showHistory, showIntro]);

  useEffect(() => {
    if (
      showIntro ||
      showHistory ||
      gameFinished ||
      activePlayer.role !== "ai" ||
      isTurnBlockedByRoyalCocoon(game, activePlayerId)
    ) {
      return;
    }
    setThinking(true);
    const moveSnapshot = game.moveNumber;
    const royalExitDuration = Math.max(
      0,
      ...(game.lastMove?.royalExitEffects ?? []).map((effect) =>
        effect.kind === "escape"
          ? ROYAL_ESCAPE_DURATION_MS
          : ROYAL_FIREWORKS_DURATION_MS,
      ),
    );
    const cocoonDuration = game.lastMove?.royalCocoonEffects?.some(
      (effect) => effect.kind === "started",
    )
      ? ROYAL_COCOON_DURATION_MS
      : 0;
    const royalDecisionDuration = Math.max(
      royalExitDuration,
      cocoonDuration,
    );
    const decisionDelay = royalDecisionDuration
      ? royalDecisionDuration + 180
      : game.lastMove?.royalSacrifice
        ? ROYAL_SACRIFICE_DURATION_MS + 180
        : 620;
    const timer = window.setTimeout(() => {
      try {
        const hasHumanOpponent = game.players.some(
          (player) => player.role === "human" && player.alive,
        );
        const strategyId = hasHumanOpponent
          ? bestStrategyAgainstHuman(selfPlayLeagueRef.current, game).strategy
          : strategyForAiPlayer(game, activePlayerId);
        const difficulty = game.config.aiDifficulty ?? 3;
        const difficultyMeta = AI_DIFFICULTY_META[difficulty];
        let choice: ReturnType<typeof chooseAiMove>;
        try {
          choice = chooseAiMove(
            game,
            activePlayerId,
            blendedSuperModelWeights(
              selfPlayLeagueRef.current,
              strategyId,
              memory,
              difficulty,
              selfPlayLeagueRef.current.guardrailsEnabled,
            ),
            wasmScore.current,
            difficultyMeta.explorationRate,
            difficultyMeta.explorationPool,
            selfPlayLeagueRef.current.guardrailsEnabled,
            strategyId,
            createHybridMoveScoreAugmenter(
              hybridBrainRef.current,
              0.52 + difficulty * 0.12,
            ),
            blendedQueenEscapeContextWeights(
              selfPlayLeagueRef.current,
              strategyId,
              memory,
              difficulty,
            ),
          );
        } catch {
          choice = undefined;
        }
        const fallbackMove = choice?.move ?? allLegalMoves(game, activePlayerId)[0];
        if (!fallbackMove) {
          setToast("L’IA a libéré son verrou ; ouvrez Nouvelle partie si ce royaume ne possède réellement aucun coup.");
          return;
        }
        const nextGame = applyMove(game, fallbackMove);
        setGame((current) =>
          current.moveNumber === moveSnapshot ? nextGame : current,
        );
        if (choice) {
          const reward = Math.max(
            -1,
            Math.min(
              1.5,
              immediateReward(game, choice.move, strategyId) +
                antiLoopLearningPenalty(nextGame) +
                contextLearningAdjustment(nextGame),
            ),
          );
          setMemory((current) =>
            reinforceAi(
              current,
              choice.features,
              reward,
              choice.queenEscapeFeatures,
            ),
          );
        } else {
          setToast("Décision IA récupérée automatiquement avec un coup légal de secours");
        }
        if (navigator.vibrate) navigator.vibrate(12);
      } catch {
        setToast("Décision IA interrompue puis déverrouillée automatiquement");
      } finally {
        setSelectedPieceId(undefined);
        setThinking(false);
      }
    }, decisionDelay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activePlayer.role,
    activePlayerId,
    game,
    gameFinished,
    memory,
    showHistory,
    showIntro,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const commitHumanMove = (move: Move) => {
    const now = performance.now();
    if (!canHumanUseBoard({
      playerRole: activePlayer.role,
      gameFinished,
      royalLockUntil: royalAnimationUntil.current,
      now,
    })) return;
    setGame((current) => applyMove(current, move));
    setSelectedPieceId(undefined);
    if (navigator.vibrate) navigator.vibrate(14);
  };

  const handleCellClick = (coord: Coord) => {
    const now = performance.now();
    const royalLockActive = isRoyalInputLocked(
      royalAnimationUntil.current,
      now,
    );
    if (!royalLockActive && royalAnimationUntil.current !== 0) {
      royalAnimationUntil.current = 0;
    }
    if (!canHumanUseBoard({
      playerRole: activePlayer.role,
      gameFinished,
      royalLockUntil: royalAnimationUntil.current,
      now,
    })) {
      if (!royalLockActive) return;
      setToast("Le destin royal est encore en train de se résoudre…");
      return;
    }
    const occupant = pieceAt(game.pieces, coord);
    if (
      occupant &&
      isZombieTermite(occupant) &&
      occupant.playerId === activePlayerId
    ) {
      setSelectedPieceId(undefined);
      setToast(
        `Termite zombie autonome — ${occupant.zombieActivationsRemaining} activation${occupant.zombieActivationsRemaining > 1 ? "s" : ""} restante${occupant.zombieActivationsRemaining > 1 ? "s" : ""}. Il n’accepte aucun ordre.`,
      );
      return;
    }
    if (selectedPieceId) {
      const legalMove = legalMoves.find((move) => sameCoord(move.to, coord));
      if (legalMove) {
        commitHumanMove(legalMove);
        return;
      }
      if (
        selectedPiece?.type === "pawn" &&
        sameCoord(coord, PLAYER_META[selectedPiece.playerId].opposite) &&
        hexDistance(selectedPiece, coord) === 1 &&
        occupant?.playerId !== activePlayerId &&
        activeResourceStatus.free < nextQueenAdditionalPotential
      ) {
        setToast(
          `Promotion bloquée : la reine suivante vaut ${nextQueenPromotionCost}, soit ${nextQueenAdditionalPotential} potentiels supplémentaires ; ${activeResourceStatus.free} libres.`,
        );
        return;
      }
      if (occupant?.playerId !== activePlayerId) {
        setToast(
          activeInCheck
            ? "Échec : ce coup ne protégerait pas le roi"
            : "Cette case n’est pas accessible à cette pièce",
        );
      }
    }
    if (
      activeInCheck &&
      occupant &&
      occupant.playerId !== activePlayerId &&
      checkingPieceIds.includes(occupant.id)
    ) {
      const savingCaptures = allLegalMoves(game, activePlayerId).filter(
        (move) => sameCoord(move.to, coord),
      );
      if (savingCaptures.length === 1) {
        commitHumanMove(savingCaptures[0]);
        setToast("La pièce qui donnait échec a été capturée");
        return;
      }
      if (savingCaptures.length > 1) {
        setToast(
          "Plusieurs défenseurs peuvent capturer l’attaquant : choisissez d’abord celui à déplacer",
        );
        return;
      }
      setToast(
        occupant.type === "king"
          ? "Le roi adverse ne se capture pas : déplacez ou protégez votre roi"
          : "Cette pièce donne échec, mais sa case reste défendue ou une autre menace subsiste",
      );
      return;
    }
    if (occupant?.playerId === activePlayerId) {
      const availableMoves = legalMovesForPiece(game, occupant.id);
      setSelectedPieceId(
        occupant.id === selectedPieceId ? undefined : occupant.id,
      );
      if (activeInCheck && availableMoves.length === 0) {
        setToast("Cette pièce ne peut pas sauver le roi de l’échec");
      }
    } else {
      setSelectedPieceId(undefined);
    }
  };

  const startNewGame = () => {
    const playerIds = playerIdsForCount(newConfig.playerCount);
    const next = createNewGame(
      newConfig.playerCount,
      newConfig.humanCount,
      newConfig.aiDifficulty,
      playerIds.map(
        (playerId) => newConfig.teamNames[playerId] ?? PLAYER_META[playerId].name,
      ),
      playerIds.map(
        (playerId) => newConfig.teamColors[playerId] ?? PLAYER_META[playerId].color,
      ),
    );
    setGame(next);
    setSelectedPieceId(undefined);
    setThinking(false);
    setShowNewGame(false);
    setCampNotices([]);
    royalAnimationUntil.current = 0;
    noticeTimers.current.forEach((timer) => window.clearTimeout(timer));
    noticeTimers.current = [];
    seenNoticeIds.current.clear();
    soundedMove.current = -1;
    evolvedWinnerMove.current = undefined;
    setToast("Nouvelle conquête lancée");
  };

  const selectHistoryMatch = (entry: MatchHistoryEntry) => {
    setReplayMatchId(entry.id);
    setReplayFrameIndex(0);
    setReplayPlaying(entry.frames.length > 1);
  };

  const openHistory = () => {
    const preferred =
      matchHistory.matches.find((entry) => entry.completedAt) ??
      matchHistory.matches[0];
    if (preferred) selectHistoryMatch(preferred);
    setThinking(false);
    setShowHistory(true);
  };

  const closeHistory = () => {
    setReplayPlaying(false);
    setShowHistory(false);
  };

  const replayPrevious = () => {
    setReplayPlaying(false);
    setReplayFrameIndex((current) => Math.max(0, current - 1));
  };

  const replayNext = () => {
    if (!replayMatch) return;
    setReplayPlaying(false);
    setReplayFrameIndex((current) =>
      Math.min(replayMatch.frames.length - 1, current + 1),
    );
  };

  const toggleReplay = () => {
    if (!replayMatch || replayMatch.frames.length < 2) return;
    if (
      !replayPlaying &&
      replayFrameIndex >= replayMatch.frames.length - 1
    ) {
      setReplayFrameIndex(0);
    }
    setReplayPlaying((playing) => !playing);
  };

  const cycleReplaySpeed = () => {
    setReplaySpeed((current) => {
      const index = REPLAY_SPEEDS.indexOf(current);
      return REPLAY_SPEEDS[(index + 1) % REPLAY_SPEEDS.length];
    });
  };

  const exportAi = () => {
    downloadJson(`FabHexaGrogne-IA-ligue-cycle-${selfPlayLeague.cycle}.json`, {
      schema: "fabhexagrogne-ai-pack",
      version: MODULAR_AI_PACK_VERSION,
      formatVersion: MODULAR_AI_PACK_VERSION,
      gameVersion: "3.1.1-t3",
      exportedAt: new Date().toISOString(),
      game: "FabHexaGrogne",
      legacyCompatibility: "named-modules-with-v1-memory-fallback",
      architectureId: HYBRID_HEX_BRAIN_ARCHITECTURE_ID,
      liveMemory: memory,
      selfPlayLeague,
      hybridBrain: serializeHybridHexBrain(hybridBrainRef.current),
      modules: serializeNamedWeightModules(
        memory,
        hybridBrainRef.current,
      ),
      featureOrder: AI_CORE_FEATURE_ORDER,
    });
    setToast("Cerveau T3 exporté · modules Core, Queen Escape et HexConv réunis");
  };

  const exportHumanTraining = () => {
    const stats = humanTrainingStats(humanArchive);
    if (!stats.games) {
      setToast("Aucune victoire humaine à exporter pour le moment");
      return;
    }
    downloadJson(
      `FabHexaGrogne-victoires-humaines-${new Date().toISOString().slice(0, 10)}.json`,
      {
        ...humanArchive,
        exportedAt: new Date().toISOString(),
        intendedUse:
          "Apprentissage supervisé d’une politique de jeu, avec conversion possible des coordonnées axiales en tenseur hexagonal 11 × 11 masqué.",
      },
    );
    setToast(
      `${stats.games} victoire${stats.games !== 1 ? "s" : ""} humaine${stats.games !== 1 ? "s" : ""} exportée${stats.games !== 1 ? "s" : ""}`,
    );
  };

  const applyImportedAi = (
    nextMemory: AIMemory,
    nextLeague: SelfPlayLeague,
    nextHybridBrain?: HybridHexBrain,
  ) => {
    setMemory(nextMemory);
    selfPlayLeagueRef.current = nextLeague;
    setSelfPlayLeague(nextLeague);
    selfPlayWorker.current?.postMessage({
      type: "sync",
      league: nextLeague,
    });
    if (nextHybridBrain) {
      const adopted = adoptHybridBrain(nextHybridBrain, true);
      if (adopted) {
        selfPlayWorker.current?.postMessage({
          type: "set-brain",
          brain: adopted,
        });
      }
    }
  };

  const saveAiImportBackup = () => {
    const backup: AiImportBackup = {
      schema: "fabhexagrogne-ai-import-backup",
      version: 2,
      createdAt: new Date().toISOString(),
      memory,
      league: selfPlayLeagueRef.current,
      hybridBrain: serializeHybridHexBrain(hybridBrainRef.current),
    };
    // Jamais d'import si la sauvegarde restaurable ne peut pas être écrite.
    // Ne pas écraser une sauvegarde déjà conservée avant un premier import.
    if (!ensureAiImportBackup(localStorage, AI_IMPORT_BACKUP_KEY, backup)) {
      throw new Error(
        "Import interrompu : sauvegarde IA impossible ou ancienne sauvegarde incomplète. Exportez ou restaurez d’abord le cerveau local.",
      );
    }
    setHasAiImportBackup(true);
  };

  const openAiImport = () => {
    importInput.current?.click();
  };

  const importAi = async (file?: File, embedded?: unknown) => {
    if (!file && embedded === undefined) return;
    try {
      const parsed = embedded === undefined ? JSON.parse(await file!.text()) : embedded;
      const isLeaguePack = parsed?.schema === "fabhexagrogne-ai-pack";
      const diagnostics: string[] = [];
      const hasNamedModules = Boolean(
        isLeaguePack &&
          parsed.modules &&
          typeof parsed.modules === "object" &&
          !Array.isArray(parsed.modules),
      );
      let imported = validateImportedMemory(
        isLeaguePack ? parsed.liveMemory : parsed,
        memory,
        diagnostics,
      );
      if (!imported && !hasNamedModules) throw new Error("Format invalide");
      imported ??= memory;
      let compatibleHybridBrain = hybridBrainRef.current;
      let hybridImported = false;
      if (isLeaguePack && parsed.hybridBrain) {
        const legacyHybridBrain = parseHybridHexBrain(parsed.hybridBrain);
        if (legacyHybridBrain) {
          compatibleHybridBrain = legacyHybridBrain;
          hybridImported = true;
        } else {
          diagnostics.push(
            "hexConv: ancien module incompatible, HexConv locale conservée.",
          );
        }
      }
      const modularImport = importNamedWeightModules(
        isLeaguePack ? parsed.modules : undefined,
        imported,
        compatibleHybridBrain,
      );
      imported = modularImport.memory;
      compatibleHybridBrain = modularImport.hybridBrain;
      hybridImported =
        hybridImported || modularImport.importedModules.includes("hexConv");
      diagnostics.push(...modularImport.diagnostics);
      diagnostics.forEach((message) => console.info(message));
      const currentLeague = selfPlayLeagueRef.current;
      const importedLeague =
        isLeaguePack && parsed.selfPlayLeague
          ? validateSelfPlayLeague(
              parsed.selfPlayLeague,
              imported,
              currentLeague,
            )
          : {
              ...currentLeague,
              profiles: {
                ...currentLeague.profiles,
                balanced: {
                  ...currentLeague.profiles.balanced,
                  memory: imported,
                },
              },
            };
      saveAiImportBackup();
      applyImportedAi(
        imported,
        importedLeague,
        hybridImported ? compatibleHybridBrain : undefined,
      );
      const compatibleCount = modularImport.importedModules.length;
      const ignoredCount = modularImport.ignoredModules.length;
      setToast(
        compatibleCount || ignoredCount
          ? `${compatibleCount} module${compatibleCount !== 1 ? "s" : ""} compatible${compatibleCount !== 1 ? "s" : ""} importé${compatibleCount !== 1 ? "s" : ""}${ignoredCount ? ` · ${ignoredCount} inconnu${ignoredCount !== 1 ? "s" : ""} ignoré${ignoredCount !== 1 ? "s" : ""}` : ""} · absents conservés`
          : isLeaguePack
            ? `Ligue IA cycle ${importedLeague.cycle} importée · modules absents conservés`
            : `Ancienne IA génération ${imported.generation} intégrée sans réinitialiser les autres modules`,
      );
    } catch (error) {
      setToast(
        error instanceof Error && error.message !== "Format invalide"
          ? error.message
          : "Ce fichier de poids n’est pas compatible",
      );
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const importBundledFabAi = async () => {
    if (fabExportsBusy) return;
    if (!window.confirm(
      "Charger le cerveau de Fab (ligue cycle 1341) ? Les poids actifs seront remplacés après sauvegarde, sans toucher aux parties. Exportez auparavant votre cerveau actuel. Continuer ?",
    )) return;
    setFabExportsBusy(true);
    try {
      const payload = await loadBundledFabExport("ai");
      await importAi(undefined, payload);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Export IA Fab indisponible");
    } finally {
      setFabExportsBusy(false);
    }
  };

  const persistTrainingCorpus = async (
    nextCorpus: FabHexaBrainCorpus,
    message: string,
  ) => {
    setTrainingCorpus(nextCorpus);
    try {
      await saveTrainingCorpus(nextCorpus);
      setTrainingCorpusStatus(message);
    } catch {
      setTrainingCorpusStatus(
        message + " · conservation en mémoire seulement pour cette session.",
      );
    }
  };

  const importTrainingFiles = async (fileList?: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setTrainingCorpusStatus("Analyse des fichiers d’entraînement…");
    let nextCorpus = trainingCorpus;
    let added = 0;
    let duplicates = 0;
    let rejected = 0;
    let lastRejection = "";
    try {
      for (const file of files) {
        if (file.size > TRAINING_IMPORT_MAX_BYTES) {
          rejected += 1;
          lastRejection = file.name + " dépasse la limite de 24 Mo.";
          continue;
        }
        try {
          const parsed = JSON.parse(await file.text());
          const result = importTrainingPayload(nextCorpus, parsed, file.name);
          nextCorpus = result.corpus;
          added += result.report.addedSamples;
          duplicates += result.report.duplicateSamples;
          if (result.report.status === "rejected") {
            rejected += 1;
            lastRejection = result.report.message;
          }
        } catch {
          rejected += 1;
          lastRejection = file.name + " n’est pas un JSON valide.";
        }
      }
      const summary =
        String(added) +
        " décision" +
        (added !== 1 ? "s" : "") +
        " ajoutée" +
        (added !== 1 ? "s" : "") +
        " · " +
        String(duplicates) +
        " doublon" +
        (duplicates !== 1 ? "s" : "") +
        (rejected
          ? " · " + String(rejected) + " fichier" + (rejected > 1 ? "s" : "") + " rejeté" + (rejected > 1 ? "s" : "")
          : "");
      await persistTrainingCorpus(
        nextCorpus,
        lastRejection && !added ? summary + " · " + lastRejection : summary,
      );
      setToast(added ? summary : lastRejection || summary);
    } finally {
      if (trainingImportInput.current) trainingImportInput.current.value = "";
    }
  };

  const importBundledFabTraining = async () => {
    if (fabExportsBusy || !trainingCorpusReady) return;
    setFabExportsBusy(true);
    setTrainingCorpusStatus("Lecture des deux archives Fab embarquées…");
    try {
      let nextCorpus = trainingCorpus;
      let added = 0;
      let duplicates = 0;
      for (const kind of ["corpus", "human"] as const) {
        const payload = await loadBundledFabExport(kind);
        const result = importTrainingPayload(
          nextCorpus,
          payload,
          FAB_EXPORT_FILES[kind],
        );
        if (result.report.status === "rejected") {
          throw new Error(result.report.message);
        }
        nextCorpus = result.corpus;
        added += result.report.addedSamples;
        duplicates += result.report.duplicateSamples;
      }
      // Atomicité fonctionnelle : n'activer le nouveau corpus qu'après
      // une persistance réussie. Aucune modification des poids IA.
      await saveTrainingCorpus(nextCorpus);
      setTrainingCorpus(nextCorpus);
      const message = `Exports Fab : ${added} décision(s) ajoutée(s), ${duplicates} doublon(s). Cerveau actif inchangé.`;
      setTrainingCorpusStatus(message);
      setToast(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import Fab impossible";
      setTrainingCorpusStatus("Import Fab interrompu : " + message);
      setToast("Import Fab interrompu : " + message);
    } finally {
      setFabExportsBusy(false);
    }
  };

  const addLocalTrainingData = async () => {
    let nextCorpus = trainingCorpus;
    const humanResult = importTrainingPayload(
      nextCorpus,
      humanArchive,
      "Mémoire humaine locale",
    );
    nextCorpus = humanResult.corpus;
    const historyResult = importTrainingPayload(
      nextCorpus,
      matchHistory,
      "Historique local des parties",
    );
    nextCorpus = historyResult.corpus;
    const added =
      humanResult.report.addedSamples + historyResult.report.addedSamples;
    const duplicates =
      humanResult.report.duplicateSamples +
      historyResult.report.duplicateSamples;
    const message =
      String(added) +
      " décision" +
      (added !== 1 ? "s" : "") +
      " locale" +
      (added !== 1 ? "s" : "") +
      " ajoutée" +
      (added !== 1 ? "s" : "") +
      " · " +
      String(duplicates) +
      " doublon" +
      (duplicates !== 1 ? "s" : "");
    await persistTrainingCorpus(nextCorpus, message);
    setToast(
      added
        ? message
        : "Aucune nouvelle décision locale compatible à ajouter",
    );
  };

  const exportTrainingCorpus = () => {
    if (!trainingCorpus.samples.length) {
      setToast("Le corpus T2 est encore vide");
      return;
    }
    downloadJson(
      "FabHexaBrain-V2-corpus-" +
        new Date().toISOString().slice(0, 10) +
        ".json",
      createTrainingExport(trainingCorpus),
    );
    setToast(
      String(trainingCorpus.samples.length) +
        " décisions FabHexaBrain V2 exportées",
    );
  };

  const trainHybridFromCorpus = () => {
    const worker = selfPlayWorker.current;
    if (!worker) {
      setToast("Le Worker T3 n’est pas disponible sur cet appareil");
      return;
    }
    if (!trainingCorpus.samples.length) {
      setToast("Ajoutez d’abord des décisions au corpus T2");
      return;
    }
    const requested = [0, 4, 8, 12, 16][trainingPower];
    const batchSize = Math.min(requested, trainingCorpus.samples.length);
    const start =
      hybridBrainRef.current.corpusSamples % trainingCorpus.samples.length;
    const samples = Array.from({ length: batchSize }, (_, offset) =>
      trainingCorpus.samples[(start + offset) % trainingCorpus.samples.length],
    );
    worker.postMessage({ type: "train-corpus", samples });
    setHybridBrainStatus(
      `Apprentissage de ${batchSize} décision${batchSize > 1 ? "s" : ""} dans le Worker…`,
    );
    setToast("Lot T3 confié au Worker HexConv");
  };

  const resetTrainingCorpus = async () => {
    if (
      !window.confirm(
        "Effacer le corpus T2 de cet appareil ? Les poids actifs et les sauvegardes de partie ne seront pas touchés.",
      )
    ) {
      return;
    }
    const emptyCorpus = createEmptyTrainingCorpus();
    setTrainingCorpus(emptyCorpus);
    try {
      await clearTrainingCorpus();
      setTrainingCorpusStatus("Corpus T2 effacé · prêt pour un nouvel import.");
      setToast("Corpus FabHexaBrain V2 effacé");
    } catch {
      setTrainingCorpusStatus(
        "Corpus effacé en mémoire · le stockage local n’a pas répondu.",
      );
      setToast("Corpus effacé pour cette session");
    }
  };

  const restoreAiBeforeImport = () => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(AI_IMPORT_BACKUP_KEY) ?? "null",
      ) as Partial<AiImportBackup> | null;
      if (
        parsed?.schema !== "fabhexagrogne-ai-import-backup" ||
        (parsed.version !== 1 && parsed.version !== 2)
      ) {
        throw new Error("Sauvegarde absente");
      }
      const restoredMemory = validateImportedMemory(parsed.memory);
      if (!restoredMemory) throw new Error("Sauvegarde invalide");
      const restoredLeague = validateSelfPlayLeague(
        parsed.league,
        restoredMemory,
      );
      const restoredHybrid = parsed.hybridBrain
        ? parseHybridHexBrain(parsed.hybridBrain)
        : undefined;
      applyImportedAi(restoredMemory, restoredLeague, restoredHybrid);
      localStorage.removeItem(AI_IMPORT_BACKUP_KEY);
      setHasAiImportBackup(false);
      setToast("IA locale restaurée avant le dernier import");
    } catch {
      localStorage.removeItem(AI_IMPORT_BACKUP_KEY);
      setHasAiImportBackup(false);
      setToast("Aucune sauvegarde d’import valide à restaurer");
    }
  };

  const resetAi = () => {
    const freshMemory = createDefaultAIMemory();
    const freshHybridBrain = createDefaultHybridHexBrain();
    const freshLeague = {
      ...createDefaultSelfPlayLeague(freshMemory),
      trainingEnabled: selfPlayLeagueRef.current.trainingEnabled,
      guardrailsEnabled: selfPlayLeagueRef.current.guardrailsEnabled,
    };
    setMemory(freshMemory);
    selfPlayLeagueRef.current = freshLeague;
    setSelfPlayLeague(freshLeague);
    selfPlayWorker.current?.postMessage({
      type: "sync",
      league: freshLeague,
    });
    adoptHybridBrain(freshHybridBrain, true);
    selfPlayWorker.current?.postMessage({
      type: "set-brain",
      brain: freshHybridBrain,
    });
    setToast("Poids Core, Queen Escape et HexConv remis à zéro · cycle 1");
  };

  const toggleSelfPlay = () => {
    const enabled = !selfPlayLeagueRef.current.trainingEnabled;
    const updated = {
      ...selfPlayLeagueRef.current,
      trainingEnabled: enabled,
    };
    selfPlayLeagueRef.current = updated;
    setSelfPlayLeague(updated);
    setSelfPlayWorkerStatus(enabled ? "starting" : "paused");
    selfPlayWorker.current?.postMessage({ type: "set-enabled", enabled });
    if (enabled) wakeSelfPlayWorker.current?.();
    setToast(
      enabled
        ? "Auto-entraînement relancé en arrière-plan"
        : "Auto-entraînement mis en pause",
    );
  };

  const toggleGuardrails = () => {
    const enabled = !selfPlayLeagueRef.current.guardrailsEnabled;
    const updated = {
      ...selfPlayLeagueRef.current,
      guardrailsEnabled: enabled,
    };
    selfPlayLeagueRef.current = updated;
    setSelfPlayLeague(updated);
    selfPlayWorker.current?.postMessage({ type: "sync", league: updated });
    setToast(
      enabled
        ? "Garde-fous IA activés : reine, cocon, couverture des pions et ponte protégés"
        : "Garde-fous IA coupés : stratégies suicides autorisées",
    );
  };

  const beginNativeMusicGesture = (mode: AudioMode) => {
    if (!audioModeHasMusic(mode)) return;
    const soundtrack = soundtrackElement.current;
    if (!soundtrack) return;
    configureSoundtrackElement(soundtrack);
    if (soundtrack.error) soundtrack.load();
    soundtrack.volume = soundtrackVolumeForMode(
      mode,
      musicVolumeRef.current,
    );
    void soundtrack.play().catch(() => undefined);
  };

  const changeAudioMode = async (nextMode: AudioMode) => {
    audioModeRef.current = nextMode;
    setAudioMode(nextMode);
    if (nextMode === "silent") {
      const rig = ambientRig.current;
      if (rig && rig.context.state !== "closed") {
        setAudioMix(rig, nextMode);
      }
      setAudioStatus("idle");
      setToast("Audio · Silence");
      return;
    }
    beginNativeMusicGesture(nextMode);
    setAudioStatus("starting");
    const rig = await ensureAudioRig(nextMode);
    if (
      !rig &&
      audioModeHasMusic(nextMode) &&
      soundtrackElement.current &&
      !soundtrackElement.current.paused
    ) {
      setAudioStatus("partial");
      setToast("Musique active · effets momentanément suspendus");
      return;
    }
    if (!rig || !audioRigHasOutput(rig, nextMode)) {
      setAudioStatus("blocked");
      setToast("Audio suspendu · retouchez Tester le son");
      return;
    }
    setAudioMix(rig, nextMode, false);
    const nextStatus = audioStatusForRig(rig, nextMode);
    setAudioStatus(nextStatus);
    playAudioConfirmation(rig, nextMode);
    setToast(
      nextStatus === "partial"
        ? partialAudioMessage(rig)
        : audioModeHasMusic(nextMode)
        ? `Musique lancée · ${GAME_SOUNDTRACK.title}`
        : `Audio actif · ${AUDIO_MODE_META[nextMode].label}`,
    );
  };

  const testAudio = async () => {
    const mode = audioModeRef.current;
    if (mode === "silent") {
      setToast("Choisissez d’abord Musique, Sons ou Musique + sons");
      return;
    }
    beginNativeMusicGesture(mode);
    const existingRig = ambientRig.current;
    if (existingRig?.context.state === "closed") {
      ambientRig.current = undefined;
      audioRigStarting.current = undefined;
      discardAudioRig(existingRig);
    }
    setAudioStatus("starting");
    const rig = await ensureAudioRig(mode);
    if (
      !rig &&
      audioModeHasMusic(mode) &&
      soundtrackElement.current &&
      !soundtrackElement.current.paused
    ) {
      setAudioStatus("partial");
      setToast("Musique active · effets momentanément suspendus");
      return;
    }
    if (!rig || !audioRigHasOutput(rig, mode)) {
      setAudioStatus("blocked");
      setToast("Lecture refusée · retouchez Tester pour autoriser l’audio");
      return;
    }
    setAudioMix(rig, mode, false);
    const nextStatus = audioStatusForRig(rig, mode);
    setAudioStatus(nextStatus);
    playAudioConfirmation(rig, mode);
    setToast(
      nextStatus === "partial"
        ? partialAudioMessage(rig)
        : audioModeHasMusic(mode)
        ? `Musique lancée · ${GAME_SOUNDTRACK.title}`
        : "Test des effets sonores envoyé",
    );
  };

  const installApp = async () => {
    if (installed) {
      setToast("FabHexaGrogne est déjà installé");
      return;
    }
    if (!installPrompt) {
      setToast("Menu du navigateur ⋮ → Installer l’application");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setToast("Installation lancée");
    setInstallPrompt(undefined);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setToast("Le navigateur refuse le plein écran · installez l’application");
    }
  };

  const currentLegalCount = allLegalMoves(game, activePlayerId).length;
  const humanStats = humanTrainingStats(humanArchive);
  const trainingStats = trainingCorpusStats(trainingCorpus);
  const humanCounterAnalysis = bestStrategyAgainstHuman(
    selfPlayLeague,
    game,
  );
  const hasHumanPlayers = game.players.some(
    (player) => player.role === "human",
  );
  const activeAiStrategy =
    activePlayer.role === "ai"
      ? hasHumanPlayers
        ? humanCounterAnalysis.strategy
        : strategyForAiPlayer(game, activePlayerId)
      : undefined;
  const activeAiPhase =
    activeAiStrategy && activePlayer.role === "ai"
      ? selectStrategicPhase(game, activePlayerId, activeAiStrategy)
      : undefined;
  const inspectedAiPlayerId =
    activePlayer.role === "ai"
      ? activePlayerId
      : game.players.find((player) => player.role === "ai" && player.alive)?.id ??
        activePlayerId;
  const inspectedAiStrategy =
    activeAiStrategy ??
    (hasHumanPlayers
      ? humanCounterAnalysis.strategy
      : strategyForAiPlayer(game, inspectedAiPlayerId));
  const inspectedAiPhase =
    activeAiPhase ??
    selectStrategicPhase(game, inspectedAiPlayerId, inspectedAiStrategy);
  const inspectedBrain = buildSuperModelLayers(
    selfPlayLeague,
    inspectedAiStrategy,
    memory,
    game.config.aiDifficulty ?? 3,
    selfPlayLeague.guardrailsEnabled,
  );
  const inspectedDecisionWeights = conditionAiWeights(
    inspectedBrain.blendedWeights,
    inspectedAiPhase,
    inspectedAiStrategy,
  );

  const primeGameAudioFromIntro = useCallback(() => {
    const mode = audioModeRef.current;
    if (mode === "silent") return;
    setAudioStatus("starting");

    // Start Web Audio before the media call so neither request loses the tap.
    if (audioModeHasFx(mode)) {
      void ensureAudioRig("fx").then((rig) => {
        if (!rig || audioModeRef.current !== mode) return;
        setAudioStatus(mode === "fx" ? "ready" : audioStatusForRig(rig, mode));
      });
    }

    if (!audioModeHasMusic(mode)) return;
    const soundtrack = soundtrackElement.current;
    if (!soundtrack) return;
    configureSoundtrackElement(soundtrack);
    if (soundtrack.error) soundtrack.load();
    soundtrack.volume = 0;
    try {
      void soundtrack.play().then(
        () => {
          soundtrack.volume = 0;
          const rig = ambientRig.current;
          if (rig) rig.soundtrackStartAccepted = true;
        },
        () => {
          if (mode === "music") setAudioStatus("blocked");
        },
      );
    } catch {
      if (mode === "music") setAudioStatus("blocked");
    }
  }, [ensureAudioRig]);

  const completeIntro = useCallback(() => {
    setGameRevealed(true);
    setShowIntro(false);
    const mode = audioModeRef.current;
    if (mode === "silent") {
      setAudioStatus("idle");
      return;
    }

    const soundtrack = soundtrackElement.current;
    if (audioModeHasMusic(mode) && soundtrack) {
      soundtrack.volume = soundtrackVolumeForMode(
        mode,
        musicVolumeRef.current,
      );
    }

    if (mode === "music") {
      setAudioStatus(
        soundtrack && !soundtrack.paused
          ? soundtrack.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            ? "ready"
            : "starting"
          : "blocked",
      );
      return;
    }

    const existingRig = ambientRig.current;
    if (existingRig && existingRig.context.state !== "closed") {
      setAudioMix(existingRig, mode, false);
      setAudioStatus(audioStatusForRig(existingRig, mode));
    }
    void ensureAudioRig(mode).then((rig) => {
      if (!rig) {
        setAudioStatus(
          audioModeHasMusic(mode) && soundtrack && !soundtrack.paused
            ? "partial"
            : "blocked",
        );
        return;
      }
      setAudioMix(rig, mode, false);
      setAudioStatus(audioStatusForRig(rig, mode));
    });
  }, [ensureAudioRig]);

  const revealGameFromIntro = useCallback(() => {
    setGameRevealed(true);
  }, []);

  const nativePlayerVisible =
    showAudioPanel && audioModeHasMusic(audioMode);

  return (
    <>
      <audio
        ref={soundtrackElement}
        className={`game-soundtrack ${nativePlayerVisible ? "native-visible" : ""}`}
        src={GAME_SOUNDTRACK.src}
        preload="auto"
        loop
        playsInline
        controls={nativePlayerVisible}
        controlsList="nodownload noplaybackrate"
        aria-label="Lecteur musical système"
        onPlaying={(event) => {
          const mode = audioModeRef.current;
          if (!audioModeHasMusic(mode)) return;
          const soundtrack = event.currentTarget;
          const rig = ambientRig.current;
          if (rig) rig.soundtrackStartAccepted = true;
          if (showIntro) {
            soundtrack.volume = 0;
            setAudioStatus("starting");
            return;
          }
          soundtrack.volume = soundtrackVolumeForMode(
            mode,
            musicVolumeRef.current,
          );
          setAudioStatus(
            mode === "music"
              ? "ready"
              : rig
                ? audioStatusForRig(rig, mode)
                : "partial",
          );
          setToast(`Musique lancée · ${GAME_SOUNDTRACK.title}`);
        }}
        onError={() => {
          if (audioModeHasMusic(audioModeRef.current)) setAudioStatus("blocked");
        }}
      />
      {showIntro && (
        <GameIntro
          onComplete={completeIntro}
          onRevealGame={revealGameFromIntro}
          onStartAudio={primeGameAudioFromIntro}
        />
      )}
      <div
        className="game-shell"
        hidden={!gameRevealed}
        aria-hidden={!gameRevealed || undefined}
        onPointerDownCapture={detectAdminGesture}
      >
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <p className="eyebrow">JEU DE STRATÉGIE HEXAGONAL</p>
            <h1>FabHexaGrogne</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className="engine-pill" title="Moteur graphique actif">
            <span className="status-light" /> {rendererMode}
          </span>
          <button
            className="icon-button fullscreen-button"
            type="button"
            onClick={() => void toggleFullscreen()}
            title={fullscreen ? "Quitter le plein écran" : "Passer en plein écran"}
            aria-pressed={fullscreen}
          >
            <span aria-hidden="true">{fullscreen ? "↙" : "⛶"}</span>
            <span className="desktop-label">{fullscreen ? "Réduire" : "Plein écran"}</span>
          </button>
          <button
            type="button"
            className={`audio-mode-control mode-${audioMode}`}
            title={AUDIO_MODE_META[audioMode].description}
            aria-haspopup="dialog"
            onClick={() => setShowAudioPanel(true)}
          >
            <span className="audio-mode-symbol" aria-hidden="true">
              {AUDIO_MODE_META[audioMode].symbol}
            </span>
            <span className="audio-mode-label">
              {AUDIO_MODE_META[audioMode].shortLabel}
            </span>
            <span
              className={`audio-status-light status-${audioStatus}`}
              aria-label={
                audioStatus === "ready"
                  ? "Moteur audio prêt"
                  : audioStatus === "partial"
                    ? "Musique ou effets actifs partiellement"
                  : audioStatus === "blocked"
                    ? "Moteur audio suspendu"
                    : "Moteur audio en attente"
              }
            />
          </button>
          <button className="icon-button rules-button" type="button" onClick={() => setShowRules(true)} title="Ouvrir le mode d’emploi">
            <span aria-hidden="true">?</span>
            <span className="desktop-label">Mode d’emploi</span>
          </button>
          {adminUnlocked && (
            <button
              className="icon-button admin-open-button"
              type="button"
              onClick={() => setShowAdmin(true)}
              title="Ouvrir le laboratoire administrateur"
            >
              <span aria-hidden="true">Σ</span>
              <span className="desktop-label">Admin</span>
            </button>
          )}
          <button className="primary-small" type="button" onClick={() => setShowNewGame(true)}>
            Nouvelle partie
          </button>
        </div>
      </header>

      {!installed && (
        <button
          className={`floating-install-button ${installPrompt ? "install-ready" : ""}`}
          type="button"
          onClick={() => void installApp()}
          title="Installer FabHexaGrogne en plein écran"
          aria-label="Installer FabHexaGrogne en plein écran"
        >
          <span className="floating-install-icon" aria-hidden="true">↓</span>
          <span>
            <strong>Installer le jeu</strong>
            <small>Plein écran · accès direct</small>
          </span>
        </button>
      )}

      <main className="game-layout">
        <section className="board-column" aria-label="Partie en cours">
          <div className={`turn-banner ${activeInCheck ? "in-check" : ""}`} style={{ "--player-color": activePlayer.color } as React.CSSProperties}>
            <div className="turn-identity">
              <span className="player-orb" />
              <div>
                <span className="turn-kicker">
                  {gameFinished
                    ? "PARTIE TERMINÉE"
                    : activePlayer.role === "ai"
                      ? thinking
                        ? `${activeAiPhase ? AI_STRATEGIC_PHASE_META[activeAiPhase].label : "L’IA"}…`
                        : `IA ${activeAiStrategy ? AI_STRATEGY_META[activeAiStrategy].shortLabel : "évolutive"} · ${activeAiPhase ? AI_STRATEGIC_PHASE_META[activeAiPhase].shortLabel : "adaptative"}`
                      : "À VOUS DE JOUER"}
                </span>
                <strong>{gameFinished ? game.event : activePlayer.name}</strong>
              </div>
            </div>
            <div className="event-stack">
              <p className="event-line" aria-live="polite">{game.event}</p>
              {loopStatusMessages.length > 0 && (
                <div className="loop-status-stack" aria-live="assertive">
                  {loopStatusMessages.map((status) => (
                    <span
                      className={`loop-status-chip ${status.severity}`}
                      key={status.key}
                    >
                      {status.label}
                    </span>
                  ))}
                </div>
              )}
              {activeInCheck && (
                <span className="check-rule">
                  ÉCHEC — déplacez le roi, bloquez ou capturez l’attaquant
                </span>
              )}
            </div>
          </div>

          <div className="board-frame">
            <div className="board-glow" />
            <HexBoard
              state={game}
              selectedPieceId={selectedPieceId}
              legalTargets={legalTargets}
              checkingPieceIds={checkingPieceIds}
              territories={territories}
              colonySignal={colonySignal}
              onCellClick={handleCellClick}
              onRendererMode={setRendererMode}
            />
            <div className="camp-notice-layer" aria-live="polite">
              {campNotices.map((notice) => {
                const noticePlayer = game.players.find(
                  (player) => player.id === notice.playerId,
                );
                const stackIndex = campNotices
                  .filter((candidate) => candidate.playerId === notice.playerId)
                  .findIndex((candidate) => candidate.id === notice.id);
                return (
                  <button
                    type="button"
                    className={`camp-notice camp-${notice.playerId} ${notice.kind === "reproduction-success" ? "success" : "failure"}`}
                    key={notice.id}
                    style={{
                      "--player-color": noticePlayer?.color ?? PLAYER_META[notice.playerId].color,
                      "--notice-offset": `${stackIndex * 54}px`,
                    } as React.CSSProperties}
                    onClick={() => setJournalPlayerId(notice.playerId)}
                    aria-label={`${notice.kind === "reproduction-success" ? "Message positif" : "Message négatif"} de ${noticePlayer?.name ?? PLAYER_META[notice.playerId].name} : ${notice.message}. Ouvrir le journal.`}
                    title={`${notice.message} — toucher pour ouvrir le journal`}
                  >
                    <span aria-hidden="true">
                      {notice.kind === "reproduction-success" ? "!" : "??"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="board-corner-label north">BORD • 1</div>
            <div className="board-corner-label center">CENTRE • 6</div>
          </div>

          <div className="match-strip">
            <div>
              <span>Manche</span>
              <strong>{game.round}</strong>
            </div>
            <div>
              <span>Cristaux</span>
              <strong className="resource-value">
                {activeUsedResources} / {activeResourceStatus.capacity} potentiels mobilisés
              </strong>
              <small>
                {activeResourceStatus.overload > 0
                  ? `surcharge ${activeResourceStatus.overload}`
                  : `${activeResourceStatus.free} libres`}
                {` · reine ${nextQueenPromotionCost} (+${nextQueenAdditionalPotential})`}
              </small>
            </div>
            <div>
              <span>Territoire</span>
              <strong>+{activeTerritory?.potential ?? 0} potentiels</strong>
              <small>nid {COLONY_NEST_RESOURCE_RESERVE} + richesse {activeTerritory?.richness ?? 0} ÷ 3 · aucun cumul</small>
            </div>
            <div>
              <span>Population</span>
              <strong>
                {activePopulation} termite{activePopulation > 1 ? "s" : ""} · {activeEggCount} œuf{activeEggCount > 1 ? "s" : ""}
              </strong>
              <small>Ponte chaque tour · éclosion {EGG_HATCH_TURNS} tours</small>
            </div>
            <button
              className="history-strip-button"
              type="button"
              onClick={openHistory}
              aria-label={`Ouvrir l’historique de ${matchHistory.matches.length} partie${matchHistory.matches.length !== 1 ? "s" : ""}`}
            >
              <span>Historique</span>
              <strong>↶ {matchHistory.matches.length}</strong>
            </button>
          </div>
        </section>

        <aside className="command-panel">
          <section className="panel-card players-card">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">ROYAUMES</span>
                <h2>{game.players.filter((player) => player.alive).length} encore en lice</h2>
              </div>
              <span className="round-chip">Tour {game.moveNumber + 1}</span>
            </div>
            <div className="player-list">
              {game.players.map((player) => {
                const territory = territories[player.id];
                const checked = player.alive && isInCheck(game.pieces, player.id);
                const resourceStatus = resourceStatusForPlayer(
                  game.pieces,
                  player.id,
                );
                const hasQueenOrPawn = game.pieces.some(
                  (piece) =>
                    piece.playerId === player.id &&
                    (piece.type === "queen" ||
                      (piece.type === "pawn" && !isZombieTermite(piece))),
                );
                const playerLoop = game.loopTrackers?.[player.id];
                const playerStrategy = game.strategicTrackers?.[player.id];
                const playerZombies = game.pieces.filter(
                  (piece) =>
                    piece.playerId === player.id && isZombieTermite(piece),
                );
                return (
                  <article
                    className={`player-row ${player.id === activePlayerId && !gameFinished ? "active" : ""} ${!player.alive ? "eliminated" : ""}`}
                    key={player.id}
                    style={{ "--player-color": player.color } as React.CSSProperties}
                  >
                    <span className="player-sigil">{player.id + 1}</span>
                    <div className="player-copy">
                      <strong>{player.name}</strong>
                      <span>{roleLabel(player.role)} · {territory?.shape ?? "Aucun"}</span>
                    </div>
                    <div className="player-stats">
                      {checked && <b className="check-label">ÉCHEC</b>}
                      {!player.alive && player.exitReason === "escaped" && (
                        <b className="escape-label">ÉCHAPPÉ</b>
                      )}
                      {!player.alive && player.exitReason === "checkmate" && (
                        <b className="mate-label">ÉCHEC ET MAT</b>
                      )}
                      <span>◆ {resourceStatus.used}/{resourceStatus.capacity}</span>
                      <span>{populationForPlayer(game.pieces, player.id)} termites</span>
                      {effectiveLoopRepetition(playerLoop) >=
                        LOOP_WARNING_REPETITION && (
                        <b className="player-loop-label">
                          {effectiveLoopRepetition(playerLoop) >=
                          LOOP_ESCAPE_REPETITION
                            ? `BOUCLE ${LOOP_ESCAPE_REPETITION}/${LOOP_REPETITION_LIMIT} — ÉVASION`
                            : `BOUCLE ${LOOP_WARNING_REPETITION}/${LOOP_REPETITION_LIMIT}`}
                        </b>
                      )}
                      {playerStrategy?.intent &&
                        playerStrategy.intentTurnsRemaining > 0 && (
                          <b className="player-strategy-label">
                            ANALYSE · {STRATEGIC_INTENT_LABEL[playerStrategy.intent]} · {playerStrategy.intentTurnsRemaining}
                          </b>
                        )}
                      {playerZombies.map((zombie) => (
                        <b className="player-zombie-label" key={zombie.id}>
                          ZOMBIE · {zombie.zombieActivationsRemaining}/10
                        </b>
                      ))}
                      {player.alive && !hasQueenOrPawn && (
                        <span className="solitude-counter">
                          Évasion {Math.min(KING_SOLITUDE_ESCAPE_TURNS, player.solitaryKingTurns ?? 0)}/{KING_SOLITUDE_ESCAPE_TURNS}
                        </span>
                      )}
                    </div>
                    <button
                      className="player-journal-button"
                      type="button"
                      onClick={() => setJournalPlayerId(player.id)}
                      aria-label={`Ouvrir le journal de ${player.name}`}
                    >
                      Journal
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel-card action-card">
            <div className="panel-heading compact">
              <div>
                <span className="section-kicker">COMMANDE</span>
                <h2>{selectedPiece ? PIECE_LABEL[selectedPiece.type] : activeInCheck ? "Sauvez le roi" : "Choisissez une pièce"}</h2>
              </div>
              {selectedPiece && <span className="level-chip">NIV. {selectedPiece.level}</span>}
            </div>
            {selectedPiece ? (
              <div className="selection-detail">
                <div className={`piece-medallion ${selectedPiece.type}`} style={{ "--player-color": game.players.find((player) => player.id === selectedPiece.playerId)?.color ?? PLAYER_META[selectedPiece.playerId].color } as React.CSSProperties}>
                  <span>{selectedPiece.type === "king" ? "R" : selectedPiece.type === "queen" ? "D" : selectedPiece.type === "egg" ? "O" : "P"}</span>
                </div>
                <div>
                  <p>
                    {selectedPiece.type === "egg"
                      ? "Œuf en incubation"
                      : `${legalMoves.length} déplacement${legalMoves.length !== 1 ? "s" : ""} possible${legalMoves.length !== 1 ? "s" : ""}`}
                  </p>
                  <span>
                    {selectedPiece.type === "egg"
                      ? "Inerte : il ne contrôle rien, mais toute termite peut l’écraser, même une alliée."
                      : selectedPieceFrozen
                      ? "Forteresse opaque : cette pièce est enfermée et ne peut ni se déplacer ni attaquer avant l’ouverture du cocon."
                      : "Touchez une case lumineuse pour confirmer."}
                  </span>
                  {selectedPiece.type === "queen" && (
                    <>
                      <span className="move-info">
                        Saut sur les 12 cases de la couronne à distance 2, par-dessus toute pièce.
                      </span>
                      <span className="breeding-info">
                        {(selectedPiece.breedingTurns ?? 0) > 0
                          ? `Forteresse opaque active · ${selectedPiece.breedingTurns} tour${(selectedPiece.breedingTurns ?? 0) > 1 ? "s" : ""} de rituel restant${(selectedPiece.breedingTurns ?? 0) > 1 ? "s" : ""} · toute la zone distance ${ROYAL_COCOON_RADIUS} est imprenable et immobilisée`
                          : selectedPiece.queenBonded
                          ? `Liée au roi · ${queenSpawnCells(game.pieces, selectedPiece).length} case${queenSpawnCells(game.pieces, selectedPiece).length !== 1 ? "s" : ""} libre${queenSpawnCells(game.pieces, selectedPiece).length !== 1 ? "s" : ""} autour d’elle`
                          : `Stérile pour l’instant : elle doit rejoindre le roi puis accomplir ${ROYAL_COCOON_TURNS} tours de cocon`}
                        {` · autant d’œufs que possible chaque tour · ${EGG_RESOURCE_COST} potentiel par œuf`}
                      </span>
                    </>
                  )}
                  {selectedPiece.type === "king" &&
                    (selectedPiece.breedingTurns ?? 0) > 0 && (
                      <span className="breeding-info">
                        Rituel royal en cours : {selectedPiece.breedingTurns} tour{(selectedPiece.breedingTurns ?? 0) > 1 ? "s" : ""} avant la fertilité de la nouvelle reine. La forteresse opaque immobilise toutes les pièces situées à distance {ROYAL_COCOON_RADIUS} ou moins.
                      </span>
                    )}
                  {selectedPiece.type === "pawn" && (
                    <span className="breeding-info">
                      Reine suivante : palier {nextQueenPromotionCost}, soit {nextQueenAdditionalPotential} potentiels supplémentaires après libération du pion. {activeResourceStatus.free} sont libres.
                    </span>
                  )}
                  {selectedPiece.type === "egg" && (
                    <span className="breeding-info">
                      Incubation : encore {selectedPiece.hatchTurns ?? EGG_HATCH_TURNS} tour{(selectedPiece.hatchTurns ?? EGG_HATCH_TURNS) > 1 ? "s" : ""} de sa colonie avant de devenir un pion. Il ne se déplace pas, n’attaque pas et ne compte pas dans la population active.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className={`instruction-copy ${activeInCheck ? "check-copy" : ""}`}>
                {activeInCheck
                  ? "Le territoire ne bloque rien. Choisissez une défense ou touchez directement la pièce entourée de rouge pour la capturer si elle peut l’être."
                  : "Touchez une de vos pièces. Ses déplacements sûrs apparaîtront sur le plateau."}
              </p>
            )}
            <div className="piece-legend" aria-label="Légende des pièces">
              <span><b>R</b> Roi</span>
              <span><b>D</b> Reine</span>
              <span><b>P</b> Pion</span>
              <span><b>O</b> Œuf</span>
            </div>
          </section>

          <section className={`panel-card ai-card ${showAi ? "expanded" : ""}`}>
            <button className="ai-summary" type="button" onClick={() => setShowAi((value) => !value)} aria-expanded={showAi}>
              <span className="ai-glyph" aria-hidden="true">Σ</span>
              <span>
                <small>LIGUE IA AUTO-ÉVOLUTIVE</small>
                <strong>
                  {selfPlayWorkerLabel}
                </strong>
              </span>
              <span className="ai-status">
                {selfPlayLeague.duels} duels · N{game.config.aiDifficulty ?? 3}
              </span>
            </button>
            {showAi && (
              <LeaguePanelErrorBoundary>
                <div className="ai-details">
                <p>
                  Le cerveau actuel reste entier : quatre caractères, quatorze caractéristiques, phases et instincts. Une branche HexConv légère lit maintenant le voisinage hexagonal sur trois couches, puis fusionne son contexte avec ces 14 caractéristiques avant la décision.
                </p>
                <div className="brain-model" aria-label="Architecture du super-modèle IA">
                  <section className="brain-stage">
                    <div>
                      <span>1 · TRONC COMMUN</span>
                      <strong>
                        4 caractères × 4 niveaux · {Math.round(inspectedBrain.shares.shared * 100)} %
                      </strong>
                    </div>
                    <BrainWeightBars
                      weights={inspectedBrain.sharedWeights}
                      label="Poids du tronc commun"
                    />
                  </section>
                  <div className="brain-adapters" aria-label="Adaptateurs actifs">
                    <span>
                      Caractère · {AI_STRATEGY_META[inspectedAiStrategy].shortLabel}
                    </span>
                    <span>
                      Phase · {AI_STRATEGIC_PHASE_META[inspectedAiPhase].shortLabel}
                    </span>
                    <span>Mémoire vivante · {Math.round(inspectedBrain.shares.live * 100)} %</span>
                  </div>
                  <section className="brain-stage decision">
                    <div>
                      <span>2 · DÉCISION CONTEXTUELLE</span>
                      <strong>14 poids réellement utilisés maintenant</strong>
                    </div>
                    <BrainWeightBars
                      weights={inspectedDecisionWeights}
                      label="Poids de décision après caractère et phase"
                    />
                  </section>
                  <section className="brain-stage hexconv">
                    <div>
                      <span>3 · PERCEPTION HEXAGONALE</span>
                      <strong>
                        3 HexConv · rayon utile {HYBRID_HEX_BRAIN_ARCHITECTURE.trunk.receptiveRadius} · Float32 mobile
                      </strong>
                    </div>
                    <div className="hexconv-layers" aria-label="Filtres des trois couches HexConv">
                      {HYBRID_HEX_FILTERS.map((filters, index) => (
                        <span key={`${filters}-${index}`}>
                          H{index + 1}<b>{filters}</b>
                        </span>
                      ))}
                    </div>
                  </section>
                  <section className="brain-stage fusion">
                    <div>
                      <span>4 · FUSION POLICY + VALUE</span>
                      <strong>
                        48 cartes spatiales + 14 caractéristiques · masque des coups légaux · Value(6)
                      </strong>
                    </div>
                    <div className="hybrid-brain-metrics">
                      <span><b>{HYBRID_HEX_PARAMETER_COUNT.toLocaleString("fr-FR")}</b> paramètres</span>
                      <span><b>{hybridBrain.trainedSamples.toLocaleString("fr-FR")}</b> exemples</span>
                      <span><b>G{hybridBrain.generation}</b> génération</span>
                    </div>
                  </section>
                  <small className="brain-legend">
                    La sortie HexConv est résiduelle et démarre exactement à zéro : avant apprentissage, la décision est identique à la V2. Les garde-fous innés restent appliqués après la fusion.
                  </small>
                </div>
                <div className="strategy-grid">
                  {AI_STRATEGY_IDS.map((strategyId) => {
                    const profile = selfPlayLeague.profiles[strategyId];
                    const meta = AI_STRATEGY_META[strategyId];
                    const scores = strategicScoreAverages(profile);
                    return (
                      <article
                        className="strategy-profile"
                        key={strategyId}
                        style={{ "--strategy-color": meta.color } as React.CSSProperties}
                      >
                        <span>{meta.shortLabel}</span>
                        <strong>G{profile.memory.generation}</strong>
                        <small>
                          {profile.wins}V · {profile.losses}D · {profile.improvements}↑ · 4 niv.
                        </small>
                        <small className="strategic-score-line">
                          Reine {scores.queenSurvival}% · ponte {scores.spawnSpace}% · score {scores.combined}
                        </small>
                      </article>
                    );
                  })}
                </div>
                {hasHumanPlayers && (
                  <div className="counter-analysis">
                    <span>ADAPTATION À L’HUMAIN</span>
                    <strong>
                      {humanCounterAnalysis.samples
                        ? `${AI_STRATEGY_META[humanCounterAnalysis.humanStrategy].shortLabel} détectée → ${AI_STRATEGY_META[humanCounterAnalysis.strategy].label}`
                        : `Observation en cours → ${AI_STRATEGY_META[humanCounterAnalysis.strategy].label} provisoire`}
                    </strong>
                    <small>
                      Difficulté {game.config.aiDifficulty ?? 3}/4 · {AI_DIFFICULTY_META[game.config.aiDifficulty ?? 3].label}
                    </small>
                  </div>
                )}
                <button
                  className={`self-play-toggle ${selfPlayWorkerStatus}`}
                  type="button"
                  onClick={toggleSelfPlay}
                  aria-pressed={selfPlayLeague.trainingEnabled}
                >
                  <i aria-hidden="true" />
                  {!selfPlayLeague.trainingEnabled
                    ? "Relancer l’auto-entraînement"
                    : selfPlayWorkerStatus === "running"
                      ? `Entraînement actif · ${selfPlayLeague.positionsEvaluated} positions étudiées`
                      : selfPlayWorkerStatus === "recovering"
                        ? "Reprise automatique · poids préservés"
                        : selfPlayWorkerStatus === "unsupported"
                          ? "Workers indisponibles dans ce navigateur"
                          : "Worker d’entraînement en démarrage…"}
                </button>
                <label className="training-power-control">
                  <span>
                    <b>PUISSANCE D’ENTRAÎNEMENT</b>
                    <strong>
                      {TRAINING_POWER_META[trainingPower].label} · {TRAINING_POWER_META[trainingPower].percent} %
                    </strong>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="1"
                    value={trainingPower}
                    onChange={(event) =>
                      setTrainingPower(validateTrainingPower(event.target.value))
                    }
                    aria-label="Puissance donnée à l’entraînement"
                    aria-valuetext={`${TRAINING_POWER_META[trainingPower].label}, ${TRAINING_POWER_META[trainingPower].percent} pour cent`}
                  />
                  <small>
                    Un duel toutes les ≈ {trainingDelayMs(trainingPower, humanMatchActive)} ms {humanMatchActive ? "pendant la partie" : "en arrière-plan"}.
                  </small>
                </label>
                <button
                  className={`guardrail-toggle ${selfPlayLeague.guardrailsEnabled ? "active" : ""}`}
                  type="button"
                  onClick={toggleGuardrails}
                  aria-pressed={selfPlayLeague.guardrailsEnabled}
                >
                  <span>
                    <b>GARDE-FOUS IA</b>
                    <small>
                      {selfPlayLeague.guardrailsEnabled
                        ? "Instincts actifs : reine, cocon, pions couverts et ponte préservés"
                        : "Liberté totale : stratégies suicides possibles"}
                    </small>
                  </span>
                  <i aria-hidden="true">
                    {selfPlayLeague.guardrailsEnabled ? "ON" : "OFF"}
                  </i>
                </button>
                <section
                  className="training-corpus-card"
                  aria-label="Corpus d’entraînement FabHexaBrain V2"
                >
                  <div className="training-corpus-heading">
                    <div>
                      <span>FABHEXABRAIN · T2 → T3</span>
                      <strong>Corpus préparé pour le cerveau actif</strong>
                    </div>
                    <i className={trainingCorpusReady ? "ready" : "loading"}>
                      {trainingCorpusReady ? "PRÊT" : "CHARGEMENT"}
                    </i>
                  </div>
                  <p>
                    Importe les victoires humaines, les replays et les corpus FabHexaBrain V2, puis dédoublonne les décisions. L’import seul ne change rien ; le bouton d’entraînement les transmet par petits lots au Worker HexConv.
                  </p>
                  <div className="training-corpus-metrics">
                    <span><b>{trainingStats.games}</b> parties</span>
                    <span><b>{trainingStats.samples}</b> décisions</span>
                    <span><b>{trainingStats.humanSamples}</b> humaines</span>
                    <span><b>{trainingStats.replaySamples + trainingStats.selfPlaySamples}</b> replay / self-play</span>
                    <span><b>{trainingStats.sources}</b> sources</span>
                    <span><b>{trainingStats.samples}/{trainingStats.capacity}</b> capacité locale</span>
                  </div>
                  <div className="training-corpus-badges" aria-label="Architecture préparée">
                    <span>{FAB_HEXA_BRAIN_ARCHITECTURE.input.boardShape.join(" × ")}</span>
                    <span>HexConv {HYBRID_HEX_FILTERS.join(" → ")}</span>
                    <span>Fusion 14 caractéristiques</span>
                    <span>Queen Escape · 6 signaux</span>
                    <span>Policy + Value({FAB_HEXA_BRAIN_ARCHITECTURE.value.heads})</span>
                    <span>Masque légal</span>
                  </div>
                  <div className="training-corpus-actions">
                    <button
                      type="button"
                      disabled={!trainingCorpusReady}
                      onClick={() => trainingImportInput.current?.click()}
                    >
                      Importer des fichiers
                    </button>
                    <button
                      type="button"
                      disabled={!trainingCorpusReady || fabExportsBusy}
                      onClick={() => void importBundledFabTraining()}
                    >
                      Ajouter les exports Fab · 880 décisions
                    </button>
                    <button
                      type="button"
                      disabled={!trainingCorpusReady}
                      onClick={() => void addLocalTrainingData()}
                    >
                      Ajouter la mémoire locale
                    </button>
                    <button
                      type="button"
                      disabled={
                        !hybridBrainReady ||
                        !trainingStats.samples ||
                        selfPlayWorkerStatus === "unsupported"
                      }
                      onClick={trainHybridFromCorpus}
                    >
                      Entraîner HexConv T3
                    </button>
                    <button
                      type="button"
                      disabled={!trainingStats.samples}
                      onClick={exportTrainingCorpus}
                    >
                      Exporter FabHexaBrain V2
                    </button>
                    <button
                      type="button"
                      className="danger-quiet"
                      disabled={!trainingCorpusReady || !trainingStats.samples}
                      onClick={() => void resetTrainingCorpus()}
                    >
                      Effacer le corpus
                    </button>
                  </div>
                  <p className="training-corpus-status" aria-live="polite">
                    {trainingCorpusStatus}
                  </p>
                  <p className="training-corpus-status hybrid" aria-live="polite">
                    {hybridBrainStatus}
                  </p>
                  <input
                    ref={trainingImportInput}
                    type="file"
                    accept="application/json,.json"
                    multiple
                    hidden
                    onChange={(event) =>
                      void importTrainingFiles(event.target.files)
                    }
                  />
                </section>
                <section className="ai-sharing-card" aria-label="Poids actifs hérités de la V2">
                  <div>
                    <span>POIDS ACTIFS · HÉRITAGE V2</span>
                    <strong>Cycle {selfPlayLeague.cycle} · génération {memory.generation}</strong>
                  </div>
                  <p className="ai-seed-proof">
                    Graine T2 intégrée · ligue cycle {T2_IMPORTED_LEAGUE_META.cycle} · {T2_IMPORTED_LEAGUE_META.positionsEvaluated.toLocaleString("fr-FR")} positions évaluées. Les exports V3 de Fab sont disponibles hors connexion : leur chargement est volontaire et ne remplace pas silencieusement le cerveau actif.
                  </p>
                  <p>
                    L’export T3 utilise des modules nommés et versionnés : Core 14 poids, Queen Escape et HexConv. Un import ancien ou partiel ne remplace que les modules compatibles présents ; tout module absent, inconnu ou incompatible laisse les poids locaux correspondants intacts.
                  </p>
                  <div className="ai-sharing-actions">
                    <button
                      type="button"
                      onClick={openAiImport}
                    >
                      Importer des modules
                    </button>
                    <button
                      type="button"
                      disabled={fabExportsBusy}
                      onClick={() => void importBundledFabAi()}
                    >
                      Charger le cerveau Fab · cycle 1341
                    </button>
                    <button
                      type="button"
                      disabled={!hasAiImportBackup}
                      onClick={restoreAiBeforeImport}
                    >
                      Annuler l’import
                    </button>
                  </div>
                </section>
                <div className="button-row">
                  <button type="button" onClick={exportAi}>Exporter le cerveau T3</button>
                  <button type="button" className="danger-quiet" onClick={resetAi}>Réinitialiser tous les poids</button>
                </div>
                <input
                  ref={importInput}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => void importAi(event.target.files?.[0])}
                />
                <section className="human-learning-card" aria-label="Mémoire des victoires humaines">
                  <div>
                    <span>MÉMOIRE HUMAINE</span>
                    <strong>
                      {humanStats.games} victoire{humanStats.games !== 1 ? "s" : ""} · {humanStats.frames} décision{humanStats.frames !== 1 ? "s" : ""}
                    </strong>
                  </div>
                  <p>
                    Seuls les coups du joueur humain victorieux sont conservés sur cet appareil, prêts pour un futur réseau neuronal.
                  </p>
                  <button
                    type="button"
                    onClick={exportHumanTraining}
                    disabled={humanStats.games === 0}
                  >
                    Exporter les parties gagnantes
                  </button>
                </section>
                </div>
              </LeaguePanelErrorBoundary>
            )}
          </section>

          <section className="panel-card territory-card">
            <div>
              <span className="section-kicker">TERRITOIRE ACTIF</span>
              <h2>{activeTerritory?.shape ?? "Aucun"}</h2>
            </div>
            <div className="territory-metrics">
              <span><b>{activeTerritory?.cells.length ?? 0}</b> cases</span>
              <span><b>{activeTerritory?.richness ?? 0}</b> richesse</span>
              <span><b>{currentLegalCount}</b> options</span>
            </div>
            <p>
              Chaque case conquise garde une aura, même vide : plus elle est riche, plus sa couleur brille. Une frontière ne bloque jamais un mouvement ni une capture.
            </p>
          </section>
        </aside>
      </main>

      <footer className="game-footer">
        <span>Partie sauvegardée automatiquement sur cet appareil</span>
        <button type="button" onClick={() => setShowRules(true)}>Voir les règles provisoires</button>
      </footer>

      {showHistory && (
        <div
          className="modal-backdrop history-backdrop"
          role="presentation"
          onPointerDown={closeHistory}
        >
          <section
            className="modal-card history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={closeHistory}
              aria-label="Fermer"
            >
              ×
            </button>
            <span className="section-kicker">ARCHIVES TACTIQUES</span>
            <h2 id="history-title">Historique des parties</h2>
            <p>
              Les huit parties les plus récentes restent sur cet appareil. La
              lecture démarre automatiquement et peut être pilotée image par image.
            </p>
            {matchHistory.matches.length ? (
              <div className="history-layout">
                <aside className="history-list" aria-label="Parties enregistrées">
                  {matchHistory.matches.map((entry) => {
                    const finalFrame = entry.frames[entry.frames.length - 1];
                    const winner = finalFrame?.players.find(
                      (player) => player.id === finalFrame.winnerId,
                    );
                    return (
                      <button
                        type="button"
                        className={entry.id === replayMatchId ? "selected" : ""}
                        onClick={() => selectHistoryMatch(entry)}
                        key={entry.id}
                      >
                        <span>{historyDateLabel(entry.startedAt)}</span>
                        <strong>
                          {winner
                            ? `Victoire ${winner.name}`
                            : finalFrame?.drawReason
                              ? "Victoire reportée — roi échappé"
                            : entry.id === game.matchId
                              ? "Partie en cours"
                              : "Partie interrompue"}
                        </strong>
                        <small>
                          {entry.config.playerCount} royaumes · {finalFrame?.moveNumber ?? 0} coups
                        </small>
                      </button>
                    );
                  })}
                </aside>
                <div className="history-player">
                  {replayMatch && replayState ? (
                    <>
                      <div className="replay-heading">
                        <div>
                          <span>IMAGE {replayFrameIndex + 1}/{replayMatch.frames.length}</span>
                          <strong>
                            {replayState.winnerId !== undefined
                              ? `Victoire de ${replayState.players.find((player) => player.id === replayState.winnerId)?.name ?? "la colonie"}`
                              : replayState.drawReason
                                ? "Victoire reportée — roi échappé"
                              : `Tour de ${replayState.players.find((player) => player.id === currentPlayerId(replayState))?.name ?? "la colonie"}`}
                          </strong>
                        </div>
                        <span>Manche {replayState.round} · Coup {replayState.moveNumber}</span>
                      </div>
                      <ReplayBoard state={replayState} />
                      <p className="replay-event" aria-live="polite">
                        {replayState.event}
                      </p>
                      <input
                        className="replay-timeline"
                        type="range"
                        min={0}
                        max={Math.max(0, replayMatch.frames.length - 1)}
                        value={replayFrameIndex}
                        onChange={(event) => {
                          setReplayPlaying(false);
                          setReplayFrameIndex(Number(event.target.value));
                        }}
                        aria-label="Position dans la partie"
                      />
                      <div className="replay-controls">
                        <button
                          type="button"
                          onClick={replayPrevious}
                          disabled={replayFrameIndex <= 0}
                          aria-label="Reculer d’un coup"
                        >
                          <span aria-hidden="true">←</span>
                          <small>Reculer</small>
                        </button>
                        <button
                          className="replay-main-control"
                          type="button"
                          onClick={toggleReplay}
                          disabled={replayMatch.frames.length < 2}
                          aria-label={replayPlaying ? "Mettre en pause" : "Lire la partie"}
                        >
                          <span aria-hidden="true">{replayPlaying ? "Ⅱ" : "▶"}</span>
                          <small>{replayPlaying ? "Pause" : "Lecture"}</small>
                        </button>
                        <button
                          type="button"
                          onClick={replayNext}
                          disabled={replayFrameIndex >= replayMatch.frames.length - 1}
                          aria-label="Avancer d’un coup"
                        >
                          <span aria-hidden="true">→</span>
                          <small>Avancer</small>
                        </button>
                        <button
                          className="replay-speed-control"
                          type="button"
                          onClick={cycleReplaySpeed}
                          aria-label={`Vitesse de lecture ${replaySpeed}`}
                        >
                          <span>×{replaySpeed}</span>
                          <small>Vitesse</small>
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="history-empty">Sélectionnez une partie à relire.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="history-empty">
                La partie actuelle apparaîtra ici dès son premier coup.
              </p>
            )}
          </section>
        </div>
      )}

      {showAudioPanel && (
        <div
          className="modal-backdrop"
          role="presentation"
          onPointerDown={() => setShowAudioPanel(false)}
        >
          <section
            className={`modal-card audio-modal ${nativePlayerVisible ? "has-native-player" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setShowAudioPanel(false)}
              aria-label="Fermer"
            >
              ×
            </button>
            <span className="section-kicker">AUDIO DES COLONIES</span>
            <h2 id="audio-title">Choisissez puis testez</h2>
            <p>
              Chaque bouton active directement le moteur sonore. Le test doit être
              audible immédiatement, sans attendre le prochain déplacement.
            </p>
            <div className="audio-track-now" aria-label="Musique intégrée">
              <span>PISTE DU JEU</span>
              <strong>{GAME_SOUNDTRACK.title}</strong>
              <small>5 min 30 · piste complète · boucle continue sans raccord</small>
            </div>
            <div className="audio-mode-grid" role="group" aria-label="Modes audio">
              {AUDIO_MODE_ORDER.map((mode) => (
                <button
                  type="button"
                  className={audioMode === mode ? "selected" : ""}
                  aria-pressed={audioMode === mode}
                  onClick={() => void changeAudioMode(mode)}
                  key={mode}
                >
                  <span aria-hidden="true">{AUDIO_MODE_META[mode].symbol}</span>
                  <strong>{AUDIO_MODE_META[mode].label}</strong>
                  <small>{AUDIO_MODE_META[mode].description}</small>
                </button>
              ))}
            </div>
            <div className="volume-controls" aria-label="Volumes séparés">
              <label>
                <span>
                  <b>Musique</b>
                  <strong>{Math.round(musicVolume * 100)} %</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(musicVolume * 100)}
                  onChange={(event) =>
                    setMusicVolume(
                      validateAudioVolume(
                        Number(event.target.value) / 100,
                        DEFAULT_MUSIC_VOLUME,
                      ),
                    )
                  }
                  aria-label="Volume de la musique"
                  aria-valuetext={`${Math.round(musicVolume * 100)} pour cent`}
                />
              </label>
              <label>
                <span>
                  <b>Sons du jeu</b>
                  <strong>{Math.round(fxVolume * 100)} %</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(fxVolume * 100)}
                  onChange={(event) =>
                    setFxVolume(
                      validateAudioVolume(
                        Number(event.target.value) / 100,
                        DEFAULT_FX_VOLUME,
                      ),
                    )
                  }
                  aria-label="Volume des sons du jeu"
                  aria-valuetext={`${Math.round(fxVolume * 100)} pour cent`}
                />
              </label>
            </div>
            <div className="audio-test-row">
              <button
                className="audio-test-button"
                type="button"
                disabled={audioMode === "silent"}
                onClick={() => void testAudio()}
              >
                Tester le son maintenant
              </button>
              <span className={`audio-status-badge status-${audioStatus}`}>
                {audioMode === "silent"
                  ? "Silence choisi"
                  : audioStatus === "ready"
                    ? "Audio prêt"
                    : audioStatus === "partial"
                      ? "Audio partiel"
                    : audioStatus === "starting"
                      ? "Activation…"
                      : audioStatus === "blocked"
                        ? "Audio suspendu"
                        : "Touchez Tester"}
              </span>
            </div>
            {audioStatus === "blocked" && (
              <p className="audio-help">
                Le navigateur a suspendu le lecteur personnalisé. Touchez directement
                ▶ dans le lecteur système affiché en bas : ce geste est géré par
                Chrome ou DuckDuckGo lui-même.
              </p>
            )}
            {audioStatus === "partial" && (
              <p className="audio-help">
                La musique et les effets démarrent séparément. Retouchez Tester
                pour réveiller le canal encore suspendu sans couper celui qui joue.
              </p>
            )}
            {nativePlayerVisible && (
              <p className="native-player-help">
                Solution de secours mobile : le lecteur système reste disponible en
                bas de l’écran. Il lance la piste complète, sans coupures de 15 s.
              </p>
            )}
          </section>
        </div>
      )}

      {showNewGame && (
        <div className="modal-backdrop" role="presentation" onPointerDown={() => setShowNewGame(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-game-title" onPointerDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setShowNewGame(false)} aria-label="Fermer">×</button>
            <span className="section-kicker">NOUVELLE CONQUÊTE</span>
            <h2 id="new-game-title">Préparez jusqu’aux six coins</h2>
            <p>Chaque royaume commence avec une reine, un roi et cinq pions. Jouez contre l’IA ou partagez l’appareil en tour par tour.</p>
            <fieldset>
              <legend>Nombre de royaumes</legend>
              <div className="segmented-control player-count">
                {([2, 3, 4, 5, 6] as const).map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={newConfig.playerCount === count ? "selected" : ""}
                    onClick={() => setNewConfig((current) => ({
                      ...current,
                      playerCount: count,
                      humanCount: Math.min(current.humanCount, count),
                    }))}
                  >
                    {count} joueurs
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Joueurs humains</legend>
              <div className="segmented-control human-count">
                {Array.from({ length: newConfig.playerCount + 1 }, (_, count) => (
                  <button
                    key={count}
                    type="button"
                    className={newConfig.humanCount === count ? "selected" : ""}
                    onClick={() => setNewConfig((current) => ({ ...current, humanCount: count }))}
                  >
                    {count === 0 ? "Démo IA" : count}
                  </button>
                ))}
              </div>
            </fieldset>
            {newConfig.humanCount > 0 && (
              <fieldset>
                <legend>Nom et couleur de votre colonie</legend>
                <div className="team-customization-list">
                  {playerIdsForCount(newConfig.playerCount)
                    .slice(0, newConfig.humanCount)
                    .map((playerId, index) => {
                      const color = newConfig.teamColors[playerId] ?? PLAYER_META[playerId].color;
                      return (
                        <label className="team-customization-row" key={playerId}>
                          <span
                            className="team-color-preview"
                            style={{ "--player-color": color } as React.CSSProperties}
                            aria-hidden="true"
                          />
                          <span>Équipe humaine {index + 1}</span>
                          <input
                            type="text"
                            maxLength={24}
                            value={newConfig.teamNames[playerId] ?? PLAYER_META[playerId].name}
                            onChange={(event) =>
                              setNewConfig((current) => ({
                                ...current,
                                teamNames: {
                                  ...current.teamNames,
                                  [playerId]: event.target.value,
                                },
                              }))
                            }
                            aria-label={`Nom de l’équipe humaine ${index + 1}`}
                          />
                          <input
                            className="team-color-input"
                            type="color"
                            value={color}
                            onChange={(event) =>
                              setNewConfig((current) => ({
                                ...current,
                                teamColors: {
                                  ...current.teamColors,
                                  [playerId]: event.target.value,
                                },
                              }))
                            }
                            aria-label={`Couleur de l’équipe humaine ${index + 1}`}
                          />
                        </label>
                      );
                    })}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend>Difficulté des IA · quatre poids historiques par profil</legend>
              <div className="segmented-control ai-difficulty">
                {([1, 2, 3, 4] as AIDifficulty[]).map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    className={newConfig.aiDifficulty === difficulty ? "selected" : ""}
                    onClick={() => setNewConfig((current) => ({
                      ...current,
                      aiDifficulty: difficulty,
                    }))}
                  >
                    <b>N{difficulty}</b>
                    <span>{AI_DIFFICULTY_META[difficulty].label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <button className="modal-primary" type="button" onClick={startNewGame}>Lancer la partie</button>
          </section>
        </div>
      )}

      {journalPlayerId !== undefined && (() => {
        const player = game.players.find(
          (candidate) => candidate.id === journalPlayerId,
        );
        if (!player) return null;
        const entries = game.teamLogs?.[journalPlayerId] ?? [];
        return (
          <div
            className="modal-backdrop"
            role="presentation"
            onPointerDown={() => setJournalPlayerId(undefined)}
          >
            <section
              className="modal-card journal-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="journal-title"
              onPointerDown={(event) => event.stopPropagation()}
              style={{ "--player-color": player.color } as React.CSSProperties}
            >
              <button
                className="modal-close"
                type="button"
                onClick={() => setJournalPlayerId(undefined)}
                aria-label="Fermer"
              >
                ×
              </button>
              <span className="section-kicker">JOURNAL DU ROYAUME</span>
              <h2 id="journal-title">{player.name}</h2>
              <p>
                {entries.length} message{entries.length !== 1 ? "s" : ""} conservé{entries.length !== 1 ? "s" : ""} sur cet appareil.
              </p>
              <div className="journal-list">
                {entries.length ? entries.map((entry) => (
                  <article className={`journal-entry ${entry.kind}`} key={entry.id}>
                    <span>Tour {entry.turn} · Manche {entry.round}</span>
                    <p>{entry.message}</p>
                  </article>
                )) : (
                  <p className="journal-empty">Aucun message pour ce royaume.</p>
                )}
              </div>
            </section>
          </div>
        );
      })()}

      {showAdmin && (() => {
        const selectedAnimation = ADMIN_ANIMATIONS.find(
          (animation) => animation.kind === adminAnimationKind,
        ) ?? ADMIN_ANIMATIONS[0];
        return (
          <div
            className="modal-backdrop admin-backdrop"
            role="presentation"
            onPointerDown={() => setShowAdmin(false)}
          >
            <section
              className="modal-card admin-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-title"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button className="modal-close" type="button" onClick={() => setShowAdmin(false)} aria-label="Fermer">×</button>
              <span className="section-kicker">PANNEAU ADMINISTRATEUR · V3 T3.5.1</span>
              <h2 id="admin-title">Laboratoire des évolutions et animations</h2>
              <p>Chaque test crée une scène isolée avec le vrai plateau et les vrais FX. Votre partie, son historique et l’entraînement ne sont jamais modifiés.</p>
              <div className="admin-lab-layout">
                <section className="admin-preview-panel" aria-labelledby="admin-preview-title">
                  <div className="admin-preview-heading">
                    <div>
                      <span>ESSAI EN COURS</span>
                      <h3 id="admin-preview-title">{selectedAnimation.label}</h3>
                      <p>{selectedAnimation.description}</p>
                    </div>
                    <strong>{(selectedAnimation.durationMs / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s</strong>
                  </div>
                  <AnimationLabBoard preview={adminPreview} />
                  <button
                    className="admin-replay-button"
                    type="button"
                    onClick={() => runAdminAnimation(selectedAnimation.kind)}
                  >
                    Rejouer l’animation avec les FX
                  </button>
                  <p className="admin-audio-note">Pour entendre les effets, choisissez « Sons » ou « Musique + sons » dans le panneau audio.</p>
                </section>

                <section className="admin-animation-catalog" aria-labelledby="animation-catalog-title">
                  <div className="admin-section-heading">
                    <div>
                      <span>CATALOGUE COMPLET</span>
                      <h3 id="animation-catalog-title">{ADMIN_ANIMATIONS.length} animations à tester</h3>
                    </div>
                  </div>
                  <div className="admin-animation-list">
                    {ADMIN_ANIMATIONS.map((animation) => (
                      <article className={animation.kind === adminAnimationKind ? "selected" : ""} key={animation.kind}>
                        <div>
                          <strong>{animation.label}</strong>
                          <p>{animation.description}</p>
                          <small>Durée {(animation.durationMs / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s</small>
                        </div>
                        <button type="button" onClick={() => runAdminAnimation(animation.kind)}>Tester</button>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <section className="admin-evolutions" aria-labelledby="evolutions-title">
                <div className="admin-section-heading">
                  <div>
                    <span>JOURNAL PRODUIT</span>
                    <h3 id="evolutions-title">Toutes les grandes évolutions actives</h3>
                  </div>
                  <strong>{GAME_EVOLUTIONS.length} étapes</strong>
                </div>
                <div className="admin-evolution-grid">
                  {GAME_EVOLUTIONS.map((evolution) => (
                    <article key={`${evolution.version}-${evolution.title}`}>
                      <span>{evolution.version}</span>
                      <div>
                        <strong>{evolution.title}</strong>
                        <p>{evolution.detail}</p>
                      </div>
                      <b>ACTIF</b>
                    </article>
                  ))}
                </div>
              </section>
              <p className="admin-unlock-reminder">Accès secret : {ADMIN_UNLOCK_TAPS} pressions rapprochées, au même endroit, en moins de {ADMIN_UNLOCK_WINDOW_MS / 1_000} secondes. Une fois déverrouillé, le bouton Σ Admin reste visible jusqu’au rechargement.</p>
            </section>
          </div>
        );
      })()}

      {showRules && (
        <div className="modal-backdrop" role="presentation" onPointerDown={() => setShowRules(false)}>
          <section className="modal-card rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onPointerDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setShowRules(false)} aria-label="Fermer">×</button>
            <span className="section-kicker">MODE D’EMPLOI · RÈGLES V3 T3.5.1</span>
            <h2 id="rules-title">Jouer, progresser et comprendre les effets</h2>
            <section className="user-quickstart" aria-labelledby="quickstart-title">
              <div>
                <span>PRISE EN MAIN</span>
                <h3 id="quickstart-title">Comment jouer</h3>
                <p>Le bouton ? reste visible en haut, y compris sur téléphone. Il ouvre toujours ce guide sans interrompre la partie.</p>
              </div>
              <ol>
                <li><b>1</b><span><strong>Préparez les royaumes</strong>Choisissez 2 à 6 équipes, les joueurs humains et la difficulté.</span></li>
                <li><b>2</b><span><strong>Déplacez une pièce</strong>Touchez la pièce puis une case éclairée. Le tour passe automatiquement.</span></li>
                <li><b>3</b><span><strong>Fermez un territoire</strong>Reliez au moins trois pièces pour gagner du potentiel et agrandir la colonie.</span></li>
                <li><b>4</b><span><strong>Protégez la famille royale</strong>Gardez des sorties au roi, préservez la reine et défendez les œufs proches de l’éclosion.</span></li>
              </ol>
              <p className="user-quickstart-tip"><b>Astuce :</b> le bouton audio règle séparément la musique et les sons. « Historique » permet de revoir les parties. « Installer le jeu » ajoute la bonne icône FabHexaGrogne à l’écran d’accueil.</p>
            </section>
            <div className="rules-grid">
              <article><b>01</b><h3>Déplacements</h3><p>Roi : une case. Reine : elle attaque les 12 cases de la couronne complète à distance 2 et saute par-dessus toute pièce amie ou ennemie. Si elle passe exactement au-dessus d’une reine adverse, elle la dissout immédiatement par un jet d’acide, sans action ni tour supplémentaire. Pion : comme un petit roi, il avance, recule et capture sur n’importe laquelle des six cases voisines.</p></article>
              <article><b>02</b><h3>Territoires</h3><p>Trois pièces ou plus ferment un triangle, quadrilatère ou hexagone. Toutes les cases enfermées conservent l’aura du royaume, même sans pièce. De la bordure au cœur, la richesse vaut 1, 2, 3, 4, puis bondit à 12 sur les six cases centrales et à 30 sur la super-case du milieu. Trois points de richesse ouvrent 1 potentiel de population.</p></article>
              <article><b>03</b><h3>Potentiel, œufs et ponte</h3><p>Les cristaux sont une capacité, pas une monnaie cumulée. Le nid apporte 31 potentiels de base. Un pion ou un œuf mobilise 1 potentiel, le roi 10 et la première reine 20. Avant son éclosion à trois tours, un œuf est totalement inerte : il ne se déplace pas, n’attaque pas, ne menace ni roi ni reine, ne peut provoquer ni échec ni mat, ne dessine aucun territoire et ne compte pas comme termite active. Toute pièce peut atterrir dessus et l’écraser, y compris une pièce de sa propre colonie. Sous la pression, la coquille explose alors en une onde unique qui détruit toute pièce, alliée ou ennemie, sur les six cases voisines ; la pièce qui écrase l’œuf survit au centre et les œufs voisins détruits ne déclenchent pas de réaction en chaîne. Une pièce protégée par une forteresse-cocon reste imprenable. Une reine ne pond désormais que dans une case qu’aucun adversaire ne peut légalement écraser avant le prochain tour de sa colonie ; sans nurserie sûre, la ponte est suspendue et l’IA cherche d’abord à déplacer la reine vers un abri.</p></article>
              <article><b>04</b><h3>Départ, promotion et fertilité</h3><p>De deux à six royaumes occupent les coins disponibles. Un pion arrivé au coin opposé devient une reine stérile si la capacité le permet. Elle doit rejoindre son roi au plus vite. À leur contact, une forteresse-cocon opaque se ferme pendant {ROYAL_COCOON_TURNS} tours de sa colonie : la reine devient ensuite fertile. Les reines vivantes occupent des paliers exponentiels : 20 pour la première, puis 40, 80, 160…</p></article>
              <article><b>05</b><h3>Échec</h3><p>Un roi menacé est en échec. Déplacer le roi, interposer une pièce ou capturer la pièce attaquante reste permis dès que le coup supprime toutes les menaces. Le territoire ne bloque jamais ces actions.</p></article>
              <article><b>06</b><h3>Mat, évasion et dernier recours</h3><p>Le pat disparaît. Un roi non menacé dont le royaume n’a plus aucun coup creuse un passage en tourbillonnant et s’échappe : la victoire est reportée à une autre partie. Si aucun coup ordinaire n’existe mais qu’un pion ou une reine alliée bouche une case sûre, cette pièce se sacrifie dans une explosion et le roi prend sa place. Sans reine ni pion pendant {KING_SOLITUDE_ESCAPE_TURNS} tours personnels consécutifs, le roi s’échappe aussi ; un œuf n’arrête pas ce compteur, mais son éclosion en pion le remet à zéro. Un véritable échec et mat fait éclater le roi en feu d’artifice aux couleurs des deux adversaires.</p></article>
              <article><b>07</b><h3>Ligue IA et corpus T2</h3><p>En arrière-plan, les quatre tendances comparent victoire, mobilité royale, sécurité du roi, survie des reines et nurseries réellement sûres. Sans reine ou en forte infériorité, un pion n’avance vers le danger que s’il possède une couverture devant lui, ou si la conquête ouvre réellement une ponte. Il peut reculer pour attirer un assaillant à découvert. Un roi condamné sans reine lance ses derniers pions à l’attaque afin de préparer l’évasion en vortex. Dès qu’un coup sûr existe, l’IA refuse tout état final où une de ses reines a disparu ou reste capturable, y compris par l’onde d’un œuf écrasable ; cette règle dure s’applique quel que soit le cerveau ou l’entraînement chargé. L’unique échange royal volontaire exige simultanément la prise décisive d’une reine adverse, une armée d’au moins dix termites actives avec cinq unités d’avance et un pion à deux pas ou moins d’une promotion dont la route est sûre. T2 réunit et dédoublonne les replays compatibles dans un corpus séparé ; les poids ne sont jamais moyennés et toute architecture incompatible est explicitement rejetée.</p></article>
              <article><b>08</b><h3>Langage des colonies</h3><p>L’audio possède quatre états : sons seuls par défaut, silence, musique seule ou musique avec effets. La piste « Le Petit Robot Qui Dormait » est lue en boucle dans les deux modes Musique. À intervalles irréguliers, un pion émet une vibration vers son roi et sa reine. Les œufs peuvent aussi craquer, osciller puis transmettre une onde de proche en proche aux autres œufs ; chaque colonie conserve sa propre fréquence.</p></article>
              <article><b>09</b><h3>Archives tactiques</h3><p>Les huit parties les plus récentes sont mémorisées localement. Leur lecture animée démarre automatiquement ; les flèches reculent ou avancent d’un coup, le bouton central alterne lecture et pause, et la vitesse passe de ×1 à ×8. Si le stockage du navigateur se remplit, les anciennes images et données d’apprentissage sont échantillonnées automatiquement afin de conserver la victoire la plus récente.</p></article>
              <article><b>10</b><h3>Forteresse de fertilité</h3><p>Pendant le rituel, le roi et la nouvelle reine restent enfermés dans un cocon opaque. Toute pièce, alliée ou ennemie, située à distance {ROYAL_COCOON_RADIUS} ou moins du couple est immobilisée : elle ne peut ni se déplacer ni attaquer. Les adversaires ne peuvent pas entrer dans cette zone imprenable. Si toutes les pièces d’une colonie sont enfermées, son tour de forteresse passe automatiquement et le compte à rebours continue sans élimination. La poussière étoilée, les fils et la bosse alternée restent visibles pendant dix secondes avec le son magique. Après l’ouverture, toutes les pièces sont libérées et la nouvelle reine devient fertile.</p></article>
              <article><b>11</b><h3>Répétition abusive et termite zombie</h3><p>Chaque colonie est surveillée séparément. Le moteur reconnaît une même position tactique, un cycle de positions et les trajets réellement répétés. Chaque déplacement mémorise la pièce, son type, sa case de départ et sa case d’arrivée : avancer successivement de C0 vers C1, puis C2, puis C3 est une progression et ne compte jamais comme une boucle. En revanche, revenir de C2 vers C1 puis C0 avant de reprendre C0 → C1 → C2 réutilise bien deux transitions déjà parcourues, dans le même ordre. Des fragments identiques dispersés ne forment pas à eux seuls une séquence. Une oscillation du contour territorial ne suffit pas à effacer cette mémoire : seul un gain territorial inédit au cours du cycle, une capture, une ponte, une éclosion, une explosion, une promotion ou l’absence d’autre coup légal et sûr remet la surveillance à zéro. L’alerte paraît à 3/5 ; avant la quatrième répétition, l’IA tente une unique évasion avec une copie temporairement modulée de ses poids non protégés, sans toucher aux trois HexConv ni aux sauvegardes. À la cinquième transition consécutive réellement réutilisée, un termite zombie de la colonie fautive apparaît sur la case libérée et inflige une forte pénalité d’apprentissage. Il est invincible, autonome et s’active visiblement après chaque tour de sa colonie, humaine comme IA, même lorsqu’il doit rôder sur place. Pendant dix activations, il poursuit l’unité alliée non royale accessible la plus proche, mange les pions et les œufs de sa couleur, ignore les unités ordinaires ennemies et ne cible jamais un roi ou une reine. Il peut toutefois dévorer un royal ennemi rencontré directement sur son trajet. Après sa dixième activation, il explose et disparaît sur sa seule case, sans rayon voisin.</p></article>
              <article><b>12</b><h3>Analyse contextuelle à quatre tours</h3><p>La répétition exacte n’est plus le seul signal : chaque IA mesure aussi sa progression stratégique personnelle. Quatre tours sans capture, ponte, éclosion, promotion, gain territorial, nouvelle nurserie sûre, réduction de mobilité ennemie ni rapprochement inédit d’une promotion déclenchent une analyse. Selon la sécurité de ses royaux, ses potentiels libres, les cases de ponte, le rapport de forces et la frontière adverse, elle choisit pendant trois tours : sécuriser les royaux, ouvrir une nurserie, pondre, presser une frontière, percer une ligne ou préparer une promotion. À chaque décision, une copie des 14 poids reçoit une modulation contextuelle bornée et une infime variation reproductible ; les poids de sécurité, les trois HexConv et toutes les sauvegardes restent intacts. Un pion exposé n’est accepté comme sacrifice que s’il obtient une capture, ouvre une ponte, gagne du territoire, réduit la mobilité ennemie ou prépare une promotion. Deux sacrifices sans gain imposent immédiatement un nouvel objectif.</p></article>
              <article><b>13</b><h3>Queen Escape et passages apprenables</h3><p>Pour chaque coup candidat, un module indépendant mesure les destinations réellement légales et sûres de chaque reine, puis regarde une seule étape plus loin avec une importance nettement inférieure. Il distingue les pièces protectrices proches des alliés ou œufs qui occupent réellement une case d’atterrissage, récompense doucement un pion qui ouvre un passage et pénalise doucement un passage inutilement refermé. Le risque d’enfermement reste un score continu plafonné : il n’interdit jamais une attaque, une capture, une ponte, une promotion ni une protection tactiquement supérieure. Ses six poids apprennent avec le noyau sans modifier les 14 caractéristiques ni les trois HexConv. Les exports séparent désormais Core, Queen Escape et HexConv en modules nommés ; lors d’un import, les modules absents restent inchangés, les inconnus sont ignorés et une dimension compatible est migrée sans bloquer les autres.</p></article>
            </div>
            <p className="rules-note">À population maximale, tout le potentiel accessible est mobilisé ; perdre du territoire peut placer temporairement une colonie en surcharge et bloque alors la ponte. Les pertes libèrent à nouveau leur potentiel. Une reine peut s’éloigner du roi sans perdre son lien ; perdre le roi interrompt toute ponte. Si un humain gagne, ses positions et ses coups sont mémorisés localement pour entraîner une future IA neuronale.</p>
          </section>
        </div>
      )}

      {game.winnerId !== undefined && (
        <div className="victory-banner" style={{ "--player-color": game.players.find((player) => player.id === game.winnerId)?.color ?? PLAYER_META[game.winnerId].color } as React.CSSProperties}>
          <span>VICTOIRE</span>
          <strong>{game.players.find((player) => player.id === game.winnerId)?.name ?? PLAYER_META[game.winnerId].name}</strong>
          <button type="button" onClick={() => setShowNewGame(true)}>Rejouer</button>
        </div>
      )}

      {game.drawReason && (
        <div className="victory-banner draw-banner" style={{ "--player-color": "#aebbd4" } as React.CSSProperties}>
          <span>VICTOIRE REPORTÉE</span>
          <strong>ROI ÉCHAPPÉ</strong>
          <p>{game.drawReason}</p>
          <button type="button" onClick={() => setShowNewGame(true)}>Rejouer</button>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </>
  );
}
