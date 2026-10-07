import {
  AIDifficulty,
  AIMemory,
  AIStrategicPhase,
  DEFAULT_WEIGHTS,
  GameState,
  Move,
  PlayerId,
  antiLoopLearningPenalty,
  applyMove,
  chooseAiMove,
  contextLearningAdjustment,
  createDefaultAIMemory,
  createNewGame,
  currentPlayerId,
  evolveAfterGame,
  immediateReward,
  kingSafetyValue,
  queenDisciplineValue,
  queenEscapeWeightsForMemory,
  queenSpawnSpaceRatio,
  reinforceAi,
  royalPairAlive,
  territoryForPlayer,
  validateImportedMemory,
} from "./game-engine";
import { DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS } from "./queen-escape-context";
import {
  trainHybridHexBrainOnDecision,
  type HybridTrainingSession,
} from "./hexconv-brain";

export const SELF_PLAY_STORAGE_KEY = "fabhexagrogne-v3-self-play-v1";

export type TrainingPower = 1 | 2 | 3 | 4;

export const TRAINING_POWER_META: Record<
  TrainingPower,
  { label: string; percent: number; foregroundDelayMs: number; backgroundDelayMs: number }
> = {
  1: { label: "Éco", percent: 25, foregroundDelayMs: 1800, backgroundDelayMs: 900 },
  2: { label: "Normal", percent: 50, foregroundDelayMs: 1200, backgroundDelayMs: 500 },
  3: { label: "Rapide", percent: 75, foregroundDelayMs: 900, backgroundDelayMs: 320 },
  4: { label: "Max", percent: 100, foregroundDelayMs: 500, backgroundDelayMs: 220 },
};

export function validateTrainingPower(value: unknown): TrainingPower {
  const numeric = Number(value);
  return numeric === 1 || numeric === 2 || numeric === 3 || numeric === 4
    ? numeric
    : 3;
}

export function trainingDelayMs(
  power: TrainingPower,
  humanMatchActive: boolean,
): number {
  const profile = TRAINING_POWER_META[power];
  return humanMatchActive
    ? profile.foregroundDelayMs
    : profile.backgroundDelayMs;
}

export const AI_STRATEGY_IDS = [
  "aggressive",
  "expansionist",
  "balanced",
  "reproduction",
] as const;

export type AIStrategyId = (typeof AI_STRATEGY_IDS)[number];

export const AI_DIFFICULTY_META: Record<
  AIDifficulty,
  { label: string; explorationRate: number; explorationPool: number }
> = {
  1: { label: "Initié", explorationRate: 0.34, explorationPool: 9 },
  2: { label: "Tacticien", explorationRate: 0.19, explorationPool: 6 },
  3: { label: "Expert", explorationRate: 0.09, explorationPool: 4 },
  4: { label: "Maître", explorationRate: 0.035, explorationPool: 2 },
};

export const AI_STRATEGY_META: Record<
  AIStrategyId,
  { label: string; shortLabel: string; color: string }
> = {
  aggressive: {
    label: "Agressive",
    shortLabel: "Attaque",
    color: "#ff766b",
  },
  expansionist: {
    label: "Expansionniste",
    shortLabel: "Territoire",
    color: "#6fcde7",
  },
  balanced: {
    label: "Équilibrée",
    shortLabel: "Équilibre",
    color: "#b09aff",
  },
  reproduction: {
    label: "Reproduction optimisée",
    shortLabel: "Reproduction",
    color: "#7ce2a7",
  },
};

export interface AIStrategyProfile {
  id: AIStrategyId;
  memory: AIMemory;
  wins: number;
  losses: number;
  draws: number;
  improvements: number;
  championHistory: AIChampionSnapshot[];
  strategicScores: AIStrategicScoreTotals;
}

export interface AIStrategicScoreTotals {
  queenSurvivalTotal: number;
  spawnSpaceTotal: number;
  samples: number;
}

export interface AIChampionSnapshot {
  generation: number;
  bestFitness: number;
  recordedAfterDuels: number;
  weights: number[];
}

export interface StrategyMatchupStats {
  wins: number;
  losses: number;
  draws: number;
}

export interface SelfPlayLeague {
  schema: "fabhexagrogne-self-play";
  version: 1;
  trainingEnabled: boolean;
  guardrailsEnabled: boolean;
  duels: number;
  positionsEvaluated: number;
  cycle: number;
  mergeCount: number;
  lastMergedAt?: string;
  lastImprovedStrategy?: AIStrategyId;
  lastUpdatedAt?: string;
  profiles: Record<AIStrategyId, AIStrategyProfile>;
  matchups: Record<
    AIStrategyId,
    Record<AIStrategyId, StrategyMatchupStats>
  >;
}

const STRATEGY_SEEDS: Record<AIStrategyId, number[]> = {
  aggressive: [2.35, 2.1, 0.25, 0.35, 1.55, -0.62, 0.24, 0.28, 0.48, 1.6, 0.85, 0.08, 1.15, 0.35],
  expansionist: [0.82, 0.68, 1.55, 2.05, 1.15, -1.05, 0.72, 1.65, 0.95, 0.42, 1, 0.08, 1.35, 0.72],
  balanced: [...DEFAULT_WEIGHTS],
  reproduction: [0.72, 0.62, 0.52, 1.3, 1.22, -1.18, 1.3, 1.35, 0.72, 0.38, 2.55, 0.08, 1.9, 2.48],
};

const STRATEGIC_WEIGHT_FLOORS: Record<
  AIStrategyId,
  { breeding: number; queen: number; spawn: number }
> = {
  aggressive: { breeding: 0.85, queen: 1.15, spawn: 0.35 },
  expansionist: { breeding: 1, queen: 1.35, spawn: 0.72 },
  balanced: { breeding: 1.35, queen: 1.8, spawn: 1.25 },
  reproduction: { breeding: 2.55, queen: 1.9, spawn: 2.48 },
};

function stabilizeStrategyWeights(
  id: AIStrategyId,
  weights: number[],
): number[] {
  const stabilized = DEFAULT_WEIGHTS.map(
    (fallback, index) => weights[index] ?? fallback,
  );
  const floors = STRATEGIC_WEIGHT_FLOORS[id];
  stabilized[10] = Math.max(stabilized[10], floors.breeding);
  stabilized[12] = Math.max(stabilized[12], floors.queen);
  stabilized[13] = Math.max(stabilized[13], floors.spawn);
  return stabilized;
}

function stabilizeStrategyMemory(
  id: AIStrategyId,
  memory: AIMemory,
): AIMemory {
  return {
    ...memory,
    weights: stabilizeStrategyWeights(id, memory.weights),
    championWeights: stabilizeStrategyWeights(id, memory.championWeights),
  };
}

const PAIRINGS: Array<[AIStrategyId, AIStrategyId]> = [
  ["aggressive", "expansionist"],
  ["balanced", "reproduction"],
  ["aggressive", "balanced"],
  ["expansionist", "reproduction"],
  ["aggressive", "reproduction"],
  ["expansionist", "balanced"],
];

function initialChampionHistory(
  id: AIStrategyId,
  memory: AIMemory,
): AIChampionSnapshot[] {
  const profileIndex = AI_STRATEGY_IDS.indexOf(id) + 1;
  return ([1, 2, 3, 4] as AIDifficulty[]).map((difficulty) => {
    if (difficulty === 4) {
      return {
        generation: memory.generation,
        bestFitness: memory.bestFitness,
        recordedAfterDuels: 0,
        weights: [...memory.championWeights],
      };
    }
    const strength = [0, 0.36, 0.58, 0.8][difficulty];
    const noise = [0, 0.52, 0.3, 0.14][difficulty];
    return {
      generation: 0,
      bestFitness: -9999 + difficulty,
      recordedAfterDuels: 0,
      weights: memory.championWeights.map((weight, index) => {
        const neutral = DEFAULT_WEIGHTS[index] ?? 0;
        const variation = Math.sin((index + 1) * profileIndex * 1.73) * noise;
        return weight * strength + neutral * (1 - strength) * 0.42 + variation;
      }),
    };
  });
}

function emptyMatchups(): SelfPlayLeague["matchups"] {
  const rows = {} as SelfPlayLeague["matchups"];
  AI_STRATEGY_IDS.forEach((strategy) => {
    rows[strategy] = {} as Record<AIStrategyId, StrategyMatchupStats>;
    AI_STRATEGY_IDS.forEach((opponent) => {
      rows[strategy][opponent] = { wins: 0, losses: 0, draws: 0 };
    });
  });
  return rows;
}

function createProfile(
  id: AIStrategyId,
  legacyMemory?: AIMemory,
): AIStrategyProfile {
  const memory = strategyMemory(id, legacyMemory);
  return {
    id,
    memory,
    wins: 0,
    losses: 0,
    draws: 0,
    improvements: 0,
    championHistory: initialChampionHistory(id, memory),
    strategicScores: {
      queenSurvivalTotal: 0,
      spawnSpaceTotal: 0,
      samples: 0,
    },
  };
}

function strategyMemory(
  id: AIStrategyId,
  legacyMemory?: AIMemory,
): AIMemory {
  const base = createDefaultAIMemory();
  const weights =
    id === "balanced" && legacyMemory
      ? [...legacyMemory.championWeights]
      : [...STRATEGY_SEEDS[id]];
  return {
    ...base,
    weights,
    championWeights: [...weights],
    modules:
      id === "balanced" && legacyMemory
        ? {
            queenEscapeContext: {
              version: base.modules.queenEscapeContext.version,
              weights: queenEscapeWeightsForMemory(legacyMemory),
              championWeights: queenEscapeWeightsForMemory(
                legacyMemory,
                true,
              ),
            },
          }
        : base.modules,
    learningRate: id === "balanced" ? 0.032 : 0.038,
  };
}

export function createDefaultSelfPlayLeague(
  legacyMemory?: AIMemory,
): SelfPlayLeague {
  return {
    schema: "fabhexagrogne-self-play",
    version: 1,
    trainingEnabled: true,
    guardrailsEnabled: true,
    duels: 0,
    positionsEvaluated: 0,
    cycle: 1,
    mergeCount: 0,
    profiles: {
      aggressive: createProfile("aggressive"),
      expansionist: createProfile("expansionist"),
      balanced: createProfile("balanced", legacyMemory),
      reproduction: createProfile("reproduction"),
    },
    matchups: emptyMatchups(),
  };
}

export function validateSelfPlayLeague(
  value: unknown,
  legacyMemory?: AIMemory,
  localLeague?: SelfPlayLeague,
): SelfPlayLeague {
  const fallback = localLeague ?? createDefaultSelfPlayLeague(legacyMemory);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<SelfPlayLeague>;
  if (
    candidate.schema !== fallback.schema ||
    candidate.version !== 1 ||
    !candidate.profiles ||
    typeof candidate.profiles !== "object"
  ) {
    return fallback;
  }
  const guardrailsEnabled = candidate.guardrailsEnabled !== false;
  const profiles = { ...fallback.profiles };
  AI_STRATEGY_IDS.forEach((id) => {
    const raw = (candidate.profiles as Partial<
      Record<AIStrategyId, AIStrategyProfile>
    >)[id];
    const importedMemory = validateImportedMemory(
      raw?.memory,
      fallback.profiles[id].memory,
    );
    if (!raw || !importedMemory) return;
    const memory = importedMemory;
    const validatedHistory = Array.isArray(raw.championHistory)
      ? raw.championHistory
          .filter(
            (snapshot) =>
              snapshot &&
              typeof snapshot === "object" &&
              Array.isArray(snapshot.weights) &&
              (snapshot.weights.length === 12 ||
                snapshot.weights.length === DEFAULT_WEIGHTS.length) &&
              snapshot.weights.every(
                (weight) => typeof weight === "number" && Number.isFinite(weight),
              ),
          )
          .map((snapshot) => ({
            generation: Math.max(0, Number(snapshot.generation) || 0),
            bestFitness: Number.isFinite(snapshot.bestFitness)
              ? snapshot.bestFitness
              : -9999,
            recordedAfterDuels: Math.max(
              0,
              Number(snapshot.recordedAfterDuels) || 0,
            ),
            weights: DEFAULT_WEIGHTS.map(
              (defaultWeight, index) =>
                snapshot.weights[index] ??
                memory.championWeights[index] ??
                defaultWeight,
            ),
          }))
      : [];
    const championHistory =
      validatedHistory.length > 48
        ? [...validatedHistory.slice(0, 4), ...validatedHistory.slice(-44)]
        : validatedHistory;
    profiles[id] = {
      id,
      memory,
      wins: Math.max(0, Number(raw.wins) || 0),
      losses: Math.max(0, Number(raw.losses) || 0),
      draws: Math.max(0, Number(raw.draws) || 0),
      improvements: Math.max(0, Number(raw.improvements) || 0),
      championHistory: championHistory.length
        ? championHistory
        : initialChampionHistory(id, memory),
      strategicScores: {
        queenSurvivalTotal: Math.max(
          0,
          Number(raw.strategicScores?.queenSurvivalTotal) || 0,
        ),
        spawnSpaceTotal: Math.max(
          0,
          Number(
            raw.strategicScores?.spawnSpaceTotal ??
              (raw.strategicScores as unknown as { rearSpaceTotal?: number })
                ?.rearSpaceTotal,
          ) || 0,
        ),
        samples: Math.max(0, Number(raw.strategicScores?.samples) || 0),
      },
    };
  });
  const matchups = emptyMatchups();
  AI_STRATEGY_IDS.forEach((strategy) => {
    AI_STRATEGY_IDS.forEach((opponent) => {
      const raw = candidate.matchups?.[strategy]?.[opponent];
      if (!raw) return;
      matchups[strategy][opponent] = {
        wins: Math.max(0, Number(raw.wins) || 0),
        losses: Math.max(0, Number(raw.losses) || 0),
        draws: Math.max(0, Number(raw.draws) || 0),
      };
    });
  });
  return {
    ...fallback,
    trainingEnabled: candidate.trainingEnabled !== false,
    guardrailsEnabled,
    duels: Math.max(0, Number(candidate.duels) || 0),
    positionsEvaluated: Math.max(
      0,
      Number(candidate.positionsEvaluated) || 0,
    ),
    cycle: Math.max(1, Number(candidate.cycle) || 1),
    mergeCount: Math.max(0, Number(candidate.mergeCount) || 0),
    lastMergedAt:
      typeof candidate.lastMergedAt === "string"
        ? candidate.lastMergedAt
        : undefined,
    lastImprovedStrategy: AI_STRATEGY_IDS.includes(
      candidate.lastImprovedStrategy as AIStrategyId,
    )
      ? candidate.lastImprovedStrategy
      : undefined,
    lastUpdatedAt:
      typeof candidate.lastUpdatedAt === "string"
        ? candidate.lastUpdatedAt
        : undefined,
    profiles,
    matchups,
  };
}

export function strategyForAiPlayer(
  state: GameState,
  playerId: PlayerId,
): AIStrategyId {
  const aiPlayers = state.players.filter((player) => player.role === "ai");
  if (aiPlayers.length <= 1) return "balanced";
  const index = aiPlayers.findIndex((player) => player.id === playerId);
  return AI_STRATEGY_IDS[Math.max(0, index) % AI_STRATEGY_IDS.length];
}

export function difficultySnapshot(
  profile: AIStrategyProfile,
  difficulty: AIDifficulty,
): AIChampionSnapshot {
  const history = profile.championHistory.length
    ? profile.championHistory
    : initialChampionHistory(profile.id, profile.memory);
  const index = Math.round(((difficulty - 1) / 3) * (history.length - 1));
  return history[index] ?? history[history.length - 1];
}

function mergeWeights(
  localWeights: number[],
  importedWeights: number[],
  importedShare: number,
): number[] {
  const share = Math.max(0, Math.min(1, importedShare));
  return DEFAULT_WEIGHTS.map((fallback, index) => {
    const local = localWeights[index] ?? fallback;
    const imported = importedWeights[index] ?? fallback;
    return Math.max(-4, Math.min(4, local * (1 - share) + imported * share));
  });
}

export function mergeAiMemories(
  local: AIMemory,
  imported: AIMemory,
  importedShare = 0.5,
): AIMemory {
  const share = Math.max(0, Math.min(1, importedShare));
  return {
    ...local,
    weights: mergeWeights(local.weights, imported.weights, share),
    championWeights: mergeWeights(
      local.championWeights,
      imported.championWeights,
      share,
    ),
    generation: Math.max(local.generation, imported.generation) + 1,
    decisions: local.decisions + imported.decisions,
    games: local.games + imported.games,
    fitness: 0,
    bestFitness: Math.max(local.bestFitness, imported.bestFitness),
    learningRate:
      local.learningRate * (1 - share) + imported.learningRate * share,
    modules: {
      queenEscapeContext: {
        version: local.modules.queenEscapeContext.version,
        weights: DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.map(
          (fallback, index) =>
            (queenEscapeWeightsForMemory(local)[index] ?? fallback) *
              (1 - share) +
            (queenEscapeWeightsForMemory(imported)[index] ?? fallback) * share,
        ),
        championWeights: DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.map(
          (fallback, index) =>
            (queenEscapeWeightsForMemory(local, true)[index] ?? fallback) *
              (1 - share) +
            (queenEscapeWeightsForMemory(imported, true)[index] ?? fallback) *
              share,
        ),
      },
    },
    wasmReady: local.wasmReady,
  };
}

export function mergeSelfPlayLeagues(
  local: SelfPlayLeague,
  imported: SelfPlayLeague,
  importedShare = 0.5,
): SelfPlayLeague {
  const share = Math.max(0, Math.min(1, importedShare));
  const mergedAt = new Date().toISOString();
  const profiles = {} as SelfPlayLeague["profiles"];
  AI_STRATEGY_IDS.forEach((id) => {
    const localProfile = local.profiles[id];
    const importedProfile = imported.profiles[id];
    const championHistory = ([1, 2, 3, 4] as AIDifficulty[]).map(
      (difficulty) => {
        const localSnapshot = difficultySnapshot(localProfile, difficulty);
        const importedSnapshot = difficultySnapshot(
          importedProfile,
          difficulty,
        );
        return {
          generation:
            Math.max(localSnapshot.generation, importedSnapshot.generation) + 1,
          bestFitness: Math.max(
            localSnapshot.bestFitness,
            importedSnapshot.bestFitness,
          ),
          recordedAfterDuels: local.duels + imported.duels,
          weights: mergeWeights(
            localSnapshot.weights,
            importedSnapshot.weights,
            share,
          ),
        };
      },
    );
    const memory = mergeAiMemories(
      localProfile.memory,
      importedProfile.memory,
      share,
    );
    profiles[id] = {
      id,
      memory: {
        ...memory,
        championWeights: [...championHistory[3].weights],
      },
      wins: localProfile.wins + importedProfile.wins,
      losses: localProfile.losses + importedProfile.losses,
      draws: localProfile.draws + importedProfile.draws,
      improvements:
        localProfile.improvements + importedProfile.improvements + 1,
      championHistory,
      strategicScores: {
        queenSurvivalTotal:
          localProfile.strategicScores.queenSurvivalTotal +
          importedProfile.strategicScores.queenSurvivalTotal,
        spawnSpaceTotal:
          localProfile.strategicScores.spawnSpaceTotal +
          importedProfile.strategicScores.spawnSpaceTotal,
        samples:
          localProfile.strategicScores.samples +
          importedProfile.strategicScores.samples,
      },
    };
  });

  const matchups = emptyMatchups();
  AI_STRATEGY_IDS.forEach((strategy) => {
    AI_STRATEGY_IDS.forEach((opponent) => {
      const localStats = local.matchups[strategy][opponent];
      const importedStats = imported.matchups[strategy][opponent];
      matchups[strategy][opponent] = {
        wins: localStats.wins + importedStats.wins,
        losses: localStats.losses + importedStats.losses,
        draws: localStats.draws + importedStats.draws,
      };
    });
  });

  return {
    ...local,
    duels: local.duels + imported.duels,
    positionsEvaluated:
      local.positionsEvaluated + imported.positionsEvaluated,
    cycle: Math.max(local.cycle, imported.cycle) + 1,
    mergeCount: local.mergeCount + imported.mergeCount + 1,
    lastMergedAt: mergedAt,
    lastUpdatedAt: mergedAt,
    profiles,
    matchups,
  };
}

export function inferHumanStrategy(state: GameState): {
  strategy: AIStrategyId;
  confidence: number;
  samples: number;
} {
  const humanIds = new Set(
    state.players
      .filter((player) => player.role === "human")
      .map((player) => player.id),
  );
  const frames = (state.humanMoveTrace ?? [])
    .filter(
      (frame) =>
        humanIds.has(frame.playerId) && Array.isArray(frame.features),
    )
    .slice(-64);
  if (!frames.length) {
    return { strategy: "balanced", confidence: 0, samples: 0 };
  }
  const scores: Record<"aggressive" | "expansionist" | "reproduction", number> = {
    aggressive: 0,
    expansionist: 0,
    reproduction: 0,
  };
  frames.forEach((frame) => {
    const features = frame.features;
    scores.aggressive +=
      Math.max(0, features[0] ?? 0) * 1.4 +
      Math.max(0, features[1] ?? 0) * 1.2 +
      Math.max(0, features[9] ?? 0) * 0.65;
    scores.expansionist +=
      Math.max(0, features[2] ?? 0) * 0.7 +
      Math.max(0, features[3] ?? 0) * 1.25 +
      Math.max(0, features[7] ?? 0) * 0.22 +
      Math.max(0, features[8] ?? 0) * 0.55;
    scores.reproduction +=
      Math.max(0, features[10] ?? 0) * 1.5 +
      Math.max(0, features[6] ?? 0) * 0.32 +
      Math.max(0, features[12] ?? 0) * 0.3 +
      Math.max(0, features[13] ?? 0) * 1.15;
  });
  const ranked = Object.entries(scores)
    .map(([strategy, score]) => ({
      strategy: strategy as "aggressive" | "expansionist" | "reproduction",
      score: score / frames.length,
    }))
    .sort((a, b) => b.score - a.score);
  const lead = ranked[0];
  const second = ranked[1];
  const confidence = Math.max(
    0,
    Math.min(1, lead.score * 0.75 + (lead.score - second.score) * 1.8),
  );
  if (lead.score < 0.09 || lead.score - second.score < 0.025) {
    return { strategy: "balanced", confidence, samples: frames.length };
  }
  return {
    strategy: lead.strategy,
    confidence,
    samples: frames.length,
  };
}

export function bestStrategyAgainstHuman(
  league: SelfPlayLeague,
  state: GameState,
): {
  strategy: AIStrategyId;
  humanStrategy: AIStrategyId;
  confidence: number;
  samples: number;
} {
  const human = inferHumanStrategy(state);
  const preferredCounters: Record<AIStrategyId, AIStrategyId> = {
    aggressive: "balanced",
    expansionist: "aggressive",
    balanced: "expansionist",
    reproduction: "aggressive",
  };
  const ranked = AI_STRATEGY_IDS.map((strategy) => {
    const matchup = league.matchups[strategy][human.strategy];
    const matchupGames = matchup.wins + matchup.losses + matchup.draws;
    const matchupRate =
      (matchup.wins + matchup.draws * 0.5 + 1) / (matchupGames + 2);
    const profile = league.profiles[strategy];
    const profileGames = profile.wins + profile.losses + profile.draws;
    const overallRate =
      (profile.wins + profile.draws * 0.5 + 1) / (profileGames + 2);
    const strategicRate = strategicScoreAverages(profile).combined / 100;
    const counterBonus =
      strategy === preferredCounters[human.strategy]
        ? matchupGames < 6
          ? 0.14
          : 0.04
        : 0;
    return {
      strategy,
      score:
        matchupRate * 0.66 +
        overallRate * 0.22 +
        strategicRate * 0.08 +
        counterBonus,
    };
  }).sort((a, b) => b.score - a.score);
  return {
    strategy: ranked[0].strategy,
    humanStrategy: human.strategy,
    confidence: human.confidence,
    samples: human.samples,
  };
}

export function styleReward(
  strategy: AIStrategyId,
  features: number[],
  phase?: AIStrategicPhase,
): number {
  const phaseBonus = (() => {
    if (phase === "brood_protection") {
      return features[6] * 0.24 + features[12] * 0.36 + features[13] * 0.16;
    }
    if (phase === "reproduction") {
      return features[10] * 0.3 + features[12] * 0.22 + features[13] * 0.42;
    }
    if (phase === "center_contest") {
      return features[2] * 0.34 + features[7] * 0.2 + features[3] * 0.12;
    }
    if (phase === "flank_attack") {
      return features[0] * 0.16 + features[8] * 0.26 + features[9] * 0.28;
    }
    if (phase === "royal_survival") {
      return features[6] * 0.18 + features[12] * 0.48 - features[5] * 0.34;
    }
    return features[2] * 0.08 + features[3] * 0.16;
  })();
  if (strategy === "aggressive") {
    return (
      features[0] * 0.42 +
      features[1] * 0.52 +
      features[9] * 0.28 +
      features[12] * 0.12 +
      phaseBonus
    );
  }
  if (strategy === "expansionist") {
    return (
      features[2] * 0.34 +
      features[3] * 0.5 +
      features[7] * 0.22 +
      features[8] * 0.16 +
      features[12] * 0.16 +
      features[13] * 0.2 +
      phaseBonus
    );
  }
  if (strategy === "reproduction") {
    return (
      features[10] * 0.72 +
      features[6] * 0.2 +
      features[7] * 0.16 +
      features[12] * 0.3 +
      features[13] * 0.62 +
      phaseBonus
    );
  }
  return (
    features[0] * 0.12 +
    features[2] * 0.1 +
    features[3] * 0.13 +
    features[6] * 0.08 +
    features[10] * 0.1 +
    features[12] * 0.24 +
    features[13] * 0.28 +
    phaseBonus
  );
}

export function strategicScoreAverages(profile: AIStrategyProfile): {
  queenSurvival: number;
  spawnSpace: number;
  combined: number;
} {
  const samples = profile.strategicScores.samples;
  if (!samples) return { queenSurvival: 0, spawnSpace: 0, combined: 0 };
  const queenSurvival = Math.round(
    profile.strategicScores.queenSurvivalTotal / samples,
  );
  const spawnSpace = Math.round(
    profile.strategicScores.spawnSpaceTotal / samples,
  );
  return {
    queenSurvival,
    spawnSpace,
    combined: Math.round(queenSurvival * 0.55 + spawnSpace * 0.45),
  };
}

function cloneMemory(memory: AIMemory): AIMemory {
  return {
    ...memory,
    weights: [...memory.weights],
    championWeights: [...memory.championWeights],
    modules: {
      queenEscapeContext: {
        ...memory.modules.queenEscapeContext,
        weights: queenEscapeWeightsForMemory(memory),
        championWeights: queenEscapeWeightsForMemory(memory, true),
      },
    },
  };
}

function scorePlayer(state: GameState, playerId: PlayerId): number {
  const values = { king: 20, queen: 9, pawn: 1, egg: 0 } as const;
  const material = state.pieces
    .filter((piece) => piece.playerId === playerId)
    .reduce((total, piece) => total + values[piece.type], 0);
  const player = state.players.find((candidate) => candidate.id === playerId);
  const pairBonus = royalPairAlive(state.pieces, playerId) ? 3.5 : -4;
  const spawnSpaceBonus = queenSpawnSpaceRatio(state.pieces, playerId) * 2.4;
  const royalSafetyBonus =
    kingSafetyValue(state.pieces, playerId) * 2.8 +
    queenDisciplineValue(state.pieces, playerId) * 3.2;
  return (
    material +
    (player?.resources ?? 0) * 0.18 +
    territoryForPlayer(state.pieces, playerId).richness * 0.12 +
    pairBonus +
    spawnSpaceBonus +
    royalSafetyBonus
  );
}

function observeStrategicPosition(
  state: GameState,
  playerId: PlayerId,
  totals: AIStrategicScoreTotals,
) {
  const queenAlive = state.pieces.some(
    (piece) => piece.playerId === playerId && piece.type === "queen",
  );
  totals.queenSurvivalTotal += queenAlive ? 100 : 0;
  totals.spawnSpaceTotal += queenSpawnSpaceRatio(state.pieces, playerId) * 100;
  totals.samples += 1;
}

function appendChampionSnapshot(
  history: AIChampionSnapshot[],
  memory: AIMemory,
  duels: number,
): AIChampionSnapshot[] {
  const updated = [
    ...history,
    {
      generation: memory.generation,
      bestFitness: memory.bestFitness,
      recordedAfterDuels: duels,
      weights: [...memory.championWeights],
    },
  ];
  return updated.length > 48
    ? [...updated.slice(0, 4), ...updated.slice(-44)]
    : updated;
}

export function runSelfPlayDuel(
  league: SelfPlayLeague,
  maxPlies = 140,
  hybridTraining?: HybridTrainingSession,
): SelfPlayLeague {
  const pairingIndex = league.duels % PAIRINGS.length;
  const reverseSides = Math.floor(league.duels / PAIRINGS.length) % 2 === 1;
  const basePair = PAIRINGS[pairingIndex];
  const pair: [AIStrategyId, AIStrategyId] = reverseSides
    ? [basePair[1], basePair[0]]
    : basePair;
  const playerStrategies: Record<0 | 2, AIStrategyId> = {
    0: pair[0],
    2: pair[1],
  };
  let state = createNewGame(2, 0);
  let firstMemory = cloneMemory(league.profiles[pair[0]].memory);
  let secondMemory = cloneMemory(league.profiles[pair[1]].memory);
  if (league.guardrailsEnabled) {
    firstMemory = stabilizeStrategyMemory(pair[0], firstMemory);
    secondMemory = stabilizeStrategyMemory(pair[1], secondMemory);
  }
  const firstStrategicScores: AIStrategicScoreTotals = {
    queenSurvivalTotal: 0,
    spawnSpaceTotal: 0,
    samples: 0,
  };
  const secondStrategicScores: AIStrategicScoreTotals = {
    queenSurvivalTotal: 0,
    spawnSpaceTotal: 0,
    samples: 0,
  };
  observeStrategicPosition(state, 0, firstStrategicScores);
  observeStrategicPosition(state, 2, secondStrategicScores);
  const hybridCandidates: Array<{
    state: GameState;
    playerId: PlayerId;
    move: Move;
    features: number[];
    reward: number;
    strategy: AIStrategyId;
  }> = [];
  const hybridBudget = Math.max(
    0,
    Math.min(6, Math.floor(hybridTraining?.maxUpdates ?? 0)),
  );

  while (
    state.winnerId === undefined &&
    !state.drawReason &&
    state.moveNumber < maxPlies
  ) {
    const playerId = currentPlayerId(state);
    const strategy = playerStrategies[playerId as 0 | 2];
    const memory = playerId === 0 ? firstMemory : secondMemory;
    const choice = chooseAiMove(
      state,
      playerId,
      blendedSuperModelWeights(
        league,
        strategy,
        memory,
        4,
        league.guardrailsEnabled,
      ),
      undefined,
      0.08,
      4,
      league.guardrailsEnabled,
      strategy,
      undefined,
      queenEscapeWeightsForMemory(memory),
    );
    if (!choice) break;
    const nextState = applyMove(state, choice.move);
    const reward = Math.max(
      -1,
      Math.min(
        1.5,
        immediateReward(state, choice.move, strategy) +
          styleReward(strategy, choice.features, choice.phase) +
          antiLoopLearningPenalty(nextState) +
          contextLearningAdjustment(nextState),
      ),
    );
    if (hybridTraining && hybridBudget > 0) {
      const candidate = {
        state,
        playerId,
        move: choice.move,
        features: choice.features,
        reward,
        strategy,
      };
      const decisionsSeen = state.moveNumber + 1;
      if (hybridCandidates.length < hybridBudget) {
        hybridCandidates.push(candidate);
      } else {
        const replacementIndex =
          ((decisionsSeen * 1_103_515_245 + (league.duels + 1) * 12_345) >>> 0) %
          decisionsSeen;
        if (replacementIndex < hybridBudget) {
          hybridCandidates[replacementIndex] = candidate;
        }
      }
    }
    const rawLearned = reinforceAi(
      memory,
      choice.features,
      reward,
      choice.queenEscapeFeatures,
    );
    const learned = league.guardrailsEnabled
      ? stabilizeStrategyMemory(strategy, rawLearned)
      : rawLearned;
    if (playerId === 0) firstMemory = learned;
    else secondMemory = learned;
    state = nextState;
    observeStrategicPosition(state, 0, firstStrategicScores);
    observeStrategicPosition(state, 2, secondStrategicScores);
  }

  let winningStrategy: AIStrategyId | undefined;
  if (state.winnerId === 0 || state.winnerId === 2) {
    winningStrategy = playerStrategies[state.winnerId];
  } else {
    const firstScore = scorePlayer(state, 0);
    const secondScore = scorePlayer(state, 2);
    if (Math.abs(firstScore - secondScore) > 0.25) {
      winningStrategy = firstScore > secondScore ? pair[0] : pair[1];
    }
  }

  if (hybridTraining) {
    hybridCandidates.forEach((candidate) => {
      const outcomeSignal =
        winningStrategy === undefined
          ? 0
          : candidate.strategy === winningStrategy
            ? 0.55
            : -0.55;
      const policyTarget = Math.max(
        -1,
        Math.min(1, candidate.reward * 0.55 + outcomeSignal),
      );
      hybridTraining.brain = trainHybridHexBrainOnDecision(
        hybridTraining.brain,
        candidate.state,
        candidate.playerId,
        candidate.move,
        candidate.features,
        policyTarget,
      );
      hybridTraining.updates += 1;
    });
  }

  const firstBefore = firstMemory.bestFitness;
  const secondBefore = secondMemory.bestFitness;
  const firstEvolved = evolveAfterGame(
    firstMemory,
    winningStrategy === pair[0],
  );
  const secondEvolved = evolveAfterGame(
    secondMemory,
    winningStrategy === pair[1],
  );
  firstMemory = league.guardrailsEnabled
    ? stabilizeStrategyMemory(pair[0], firstEvolved)
    : firstEvolved;
  secondMemory = league.guardrailsEnabled
    ? stabilizeStrategyMemory(pair[1], secondEvolved)
    : secondEvolved;
  const firstImproved = firstMemory.bestFitness > firstBefore;
  const secondImproved = secondMemory.bestFitness > secondBefore;
  const profiles = { ...league.profiles };
  profiles[pair[0]] = {
    ...profiles[pair[0]],
    memory: firstMemory,
    wins: profiles[pair[0]].wins + Number(winningStrategy === pair[0]),
    losses:
      profiles[pair[0]].losses +
      Number(winningStrategy !== undefined && winningStrategy !== pair[0]),
    draws: profiles[pair[0]].draws + Number(winningStrategy === undefined),
    improvements:
      profiles[pair[0]].improvements + Number(firstImproved),
    championHistory: firstImproved
      ? appendChampionSnapshot(
          profiles[pair[0]].championHistory,
          firstMemory,
          league.duels + 1,
        )
      : profiles[pair[0]].championHistory,
    strategicScores: {
      queenSurvivalTotal:
        profiles[pair[0]].strategicScores.queenSurvivalTotal +
        firstStrategicScores.queenSurvivalTotal,
      spawnSpaceTotal:
        profiles[pair[0]].strategicScores.spawnSpaceTotal +
        firstStrategicScores.spawnSpaceTotal,
      samples:
        profiles[pair[0]].strategicScores.samples +
        firstStrategicScores.samples,
    },
  };
  profiles[pair[1]] = {
    ...profiles[pair[1]],
    memory: secondMemory,
    wins: profiles[pair[1]].wins + Number(winningStrategy === pair[1]),
    losses:
      profiles[pair[1]].losses +
      Number(winningStrategy !== undefined && winningStrategy !== pair[1]),
    draws: profiles[pair[1]].draws + Number(winningStrategy === undefined),
    improvements:
      profiles[pair[1]].improvements + Number(secondImproved),
    championHistory: secondImproved
      ? appendChampionSnapshot(
          profiles[pair[1]].championHistory,
          secondMemory,
          league.duels + 1,
        )
      : profiles[pair[1]].championHistory,
    strategicScores: {
      queenSurvivalTotal:
        profiles[pair[1]].strategicScores.queenSurvivalTotal +
        secondStrategicScores.queenSurvivalTotal,
      spawnSpaceTotal:
        profiles[pair[1]].strategicScores.spawnSpaceTotal +
        secondStrategicScores.spawnSpaceTotal,
      samples:
        profiles[pair[1]].strategicScores.samples +
        secondStrategicScores.samples,
    },
  };
  const firstMatchup = { ...league.matchups[pair[0]][pair[1]] };
  const secondMatchup = { ...league.matchups[pair[1]][pair[0]] };
  if (winningStrategy === pair[0]) {
    firstMatchup.wins += 1;
    secondMatchup.losses += 1;
  } else if (winningStrategy === pair[1]) {
    firstMatchup.losses += 1;
    secondMatchup.wins += 1;
  } else {
    firstMatchup.draws += 1;
    secondMatchup.draws += 1;
  }
  const matchups = {
    ...league.matchups,
    [pair[0]]: {
      ...league.matchups[pair[0]],
      [pair[1]]: firstMatchup,
    },
    [pair[1]]: {
      ...league.matchups[pair[1]],
      [pair[0]]: secondMatchup,
    },
  };
  return {
    ...league,
    duels: league.duels + 1,
    positionsEvaluated: league.positionsEvaluated + state.moveNumber,
    cycle: Math.floor((league.duels + 1) / PAIRINGS.length) + 1,
    lastImprovedStrategy: firstImproved
      ? pair[0]
      : secondImproved
        ? pair[1]
        : league.lastImprovedStrategy,
    lastUpdatedAt: new Date().toISOString(),
    profiles,
    matchups,
  };
}

export interface SuperModelLayers {
  sharedWeights: number[];
  personalityWeights: number[];
  liveWeights: number[];
  blendedWeights: number[];
  shares: {
    shared: number;
    personality: number;
    live: number;
  };
}

export function buildSuperModelLayers(
  league: SelfPlayLeague,
  personality: AIStrategyId,
  liveMemory: AIMemory,
  difficulty: AIDifficulty = 3,
  guardrailsEnabled = true,
): SuperModelLayers {
  const specialists = AI_STRATEGY_IDS.map((strategy) => {
    const profile = league.profiles[strategy];
    const games = profile.wins + profile.losses + profile.draws;
    const reliability =
      1 +
      Math.min(0.35, games / 180) +
      strategicScoreAverages(profile).combined / 320;
    return {
      reliability,
      weights: difficultySnapshot(profile, difficulty).weights,
    };
  });
  const reliabilityTotal = specialists.reduce(
    (total, specialist) => total + specialist.reliability,
    0,
  );
  const sharedWeights = DEFAULT_WEIGHTS.map((fallback, index) =>
    specialists.reduce(
      (total, specialist) =>
        total +
        (specialist.weights[index] ?? fallback) *
          (specialist.reliability / reliabilityTotal),
      0,
    ),
  );
  const personalityWeights = difficultySnapshot(
    league.profiles[personality],
    difficulty,
  ).weights;
  const personalityShare = [0, 0.14, 0.19, 0.24, 0.29][difficulty];
  const liveShare = [0, 0.03, 0.06, 0.09, 0.13][difficulty];
  const sharedShare = 1 - personalityShare - liveShare;
  const liveWeights = DEFAULT_WEIGHTS.map(
    (fallback, index) => liveMemory.weights[index] ?? fallback,
  );
  const blended = DEFAULT_WEIGHTS.map((fallback, index) =>
    Math.max(
      -4,
      Math.min(
        4,
        (sharedWeights[index] ?? fallback) * sharedShare +
          (personalityWeights[index] ?? fallback) * personalityShare +
          liveWeights[index] * liveShare,
      ),
    ),
  );
  return {
    sharedWeights,
    personalityWeights: DEFAULT_WEIGHTS.map(
      (fallback, index) => personalityWeights[index] ?? fallback,
    ),
    liveWeights,
    blendedWeights: guardrailsEnabled
      ? stabilizeStrategyWeights(personality, blended)
      : blended,
    shares: {
      shared: sharedShare,
      personality: personalityShare,
      live: liveShare,
    },
  };
}

export function blendedSuperModelWeights(
  league: SelfPlayLeague,
  personality: AIStrategyId,
  liveMemory: AIMemory,
  difficulty: AIDifficulty = 3,
  guardrailsEnabled = true,
): number[] {
  return buildSuperModelLayers(
    league,
    personality,
    liveMemory,
    difficulty,
    guardrailsEnabled,
  ).blendedWeights;
}

export function blendedQueenEscapeContextWeights(
  league: SelfPlayLeague,
  personality: AIStrategyId,
  liveMemory: AIMemory,
  difficulty: AIDifficulty = 3,
): number[] {
  const specialists = AI_STRATEGY_IDS.map((strategy) => {
    const profile = league.profiles[strategy];
    const games = profile.wins + profile.losses + profile.draws;
    return {
      reliability:
        1 +
        Math.min(0.35, games / 180) +
        strategicScoreAverages(profile).combined / 320,
      weights: queenEscapeWeightsForMemory(profile.memory, true),
    };
  });
  const reliabilityTotal = specialists.reduce(
    (total, specialist) => total + specialist.reliability,
    0,
  );
  const shared = DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.map(
    (fallback, index) =>
      specialists.reduce(
        (total, specialist) =>
          total +
          (specialist.weights[index] ?? fallback) *
            (specialist.reliability / reliabilityTotal),
        0,
      ),
  );
  const personalityWeights = queenEscapeWeightsForMemory(
    league.profiles[personality].memory,
    true,
  );
  const liveWeights = queenEscapeWeightsForMemory(liveMemory);
  const personalityShare = [0, 0.14, 0.19, 0.24, 0.29][difficulty];
  const liveShare = [0, 0.03, 0.06, 0.09, 0.13][difficulty];
  const sharedShare = 1 - personalityShare - liveShare;
  return DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.map((fallback, index) =>
    Math.max(
      -4,
      Math.min(
        4,
        (shared[index] ?? fallback) * sharedShare +
          (personalityWeights[index] ?? fallback) * personalityShare +
          (liveWeights[index] ?? fallback) * liveShare,
      ),
    ),
  );
}

export function blendedStrategyWeights(
  profile: AIStrategyProfile,
  liveMemory: AIMemory,
  difficulty: AIDifficulty = 3,
  guardrailsEnabled = true,
): number[] {
  const snapshot = difficultySnapshot(profile, difficulty);
  const liveShare = [0, 0.03, 0.08, 0.13, 0.18][difficulty];
  const blended = snapshot.weights.map(
    (weight, index) =>
      weight * (1 - liveShare) +
      (liveMemory.weights[index] ?? weight) * liveShare,
  );
  return guardrailsEnabled
    ? stabilizeStrategyWeights(profile.id, blended)
    : blended;
}
