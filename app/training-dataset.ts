import {
  BOARD_RADIUS,
  PLAYER_META,
  allLegalMoves,
  canonicalCoordForPlayer,
  canonicalPlayerIdForPerspective,
  moveFeatures,
  type Coord,
  type GameState,
  type HumanMoveFrame,
  type PieceType,
  type PlayerCount,
  type PlayerId,
  type PlayerRole,
  type StrategicContextIntent,
  type StrategicContextResult,
} from "./game-engine";
import {
  type HumanTrainingArchive,
  type HumanVictoryRecord,
  validateHumanTrainingArchive,
} from "./human-training";
import {
  type MatchHistoryArchive,
  replayFrameToGameState,
  validateMatchHistory,
} from "./match-history";

export const FAB_HEXA_BRAIN_ARCHITECTURE_ID =
  "fabhexabrain-v2-policy-value6-hex11-r15";
export const TRAINING_IMPORT_MAX_BYTES = 24 * 1024 * 1024;
export const TRAINING_DATASET_MAX_SAMPLES = 2_400;

const BOARD_SIZE = BOARD_RADIUS * 2 + 1;
const BOARD_CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const BOARD_CHANNELS = 30;
const GLOBAL_FEATURES = 32;
const ACTION_SPACE = BOARD_CELL_COUNT * BOARD_CELL_COUNT;
const CURRENT_RULES_VERSION = 15;
const PIECE_TYPES: readonly PieceType[] = ["king", "queen", "pawn", "egg"];
const PLAYER_IDS: readonly PlayerId[] = [0, 1, 2, 3, 4, 5];
const STRATEGIC_CONTEXT_INTENTS: readonly StrategicContextIntent[] = [
  "secure_royals",
  "open_nursery",
  "lay",
  "border_pressure",
  "breach",
  "promotion",
];
const STRATEGIC_CONTEXT_RESULTS: readonly StrategicContextResult[] = [
  "continuing",
  "progress",
  "stalled",
  "sacrifice_progress",
  "sacrifice_stalled",
];
const TRAINING_DB_NAME = "fabhexagrogne-v3-t2-training";
const TRAINING_DB_VERSION = 1;
const TRAINING_STORE_NAME = "corpora";
const TRAINING_CORPUS_KEY = "fabhexabrain-v2";

export const FAB_HEXA_BRAIN_ARCHITECTURE = {
  id: FAB_HEXA_BRAIN_ARCHITECTURE_ID,
  family: "shared-policy-value",
  targetParameterRange: {
    min: 100_000,
    max: 300_000,
  },
  input: {
    boardShape: [BOARD_CHANNELS, BOARD_SIZE, BOARD_SIZE],
    globalShape: [GLOBAL_FEATURES],
    coordinates: "axial-q-r-on-11x11-mask",
    perspective: "active-player-as-player-0-north",
    augmentation: "six-rotations-at-training-time",
  },
  policy: {
    encoding: "from-cell-to-cell",
    actionSpace: ACTION_SPACE,
    legalMask: "sparse-action-indices",
  },
  value: {
    heads: 6,
    range: [-1, 1],
    perspective: "canonical-player-order",
  },
  personalities: ["aggressive", "expansionist", "balanced"],
  difficulties: {
    count: 4,
    control: "search-and-randomness-only",
  },
} as const;

export type TrainingSourceKind = "human" | "replay" | "self-play";

export interface TensorReadyPosition {
  pieces: HumanMoveFrame["position"]["pieces"];
  players: HumanMoveFrame["position"]["players"];
}

export interface PreparedTrainingSample {
  id: string;
  gameId: string;
  sourceKind: TrainingSourceKind;
  rulesVersion: 15;
  playerCount: PlayerCount;
  ply: number;
  round: number;
  actorRole: PlayerRole;
  position: TensorReadyPosition;
  action: {
    pieceType: PieceType;
    from: Coord;
    to: Coord;
    index: number;
  };
  legalActionIndices: number[];
  valueTarget: [number, number, number, number, number, number];
  legacyFeatures: number[];
  antiLoopEscape?: boolean;
  contextReplan?: boolean;
  contextIntent?: StrategicContextIntent;
  contextResult?: StrategicContextResult;
  contextSacrifice?: boolean;
}

export interface TrainingCorpusSource {
  id: string;
  name: string;
  kind:
    | "human-victories-v1"
    | "match-history-v1"
    | "fabhexabrain-v2";
  importedAt: string;
  games: number;
  acceptedSamples: number;
  duplicateSamples: number;
}

export interface FabHexaBrainCorpus {
  schema: "fabhexabrain";
  version: 2;
  kind: "training-corpus";
  game: "FabHexaGrogne";
  rulesVersion: 15;
  architectureId: typeof FAB_HEXA_BRAIN_ARCHITECTURE_ID;
  architecture: typeof FAB_HEXA_BRAIN_ARCHITECTURE;
  mergePolicy: "deduplicate-replays-then-retrain";
  weightPolicy: "never-average-imported-weights";
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
  sources: TrainingCorpusSource[];
  samples: PreparedTrainingSample[];
}

export interface TrainingImportReport {
  sourceName: string;
  status: "accepted" | "duplicate" | "rejected";
  kind: TrainingCorpusSource["kind"] | "weights-only" | "unknown";
  games: number;
  addedSamples: number;
  duplicateSamples: number;
  rejectedSamples: number;
  trimmedSamples: number;
  message: string;
}

export interface TrainingCorpusStats {
  sources: number;
  games: number;
  samples: number;
  humanSamples: number;
  replaySamples: number;
  selfPlaySamples: number;
  capacity: number;
}

export interface TensorizedTrainingSample {
  board: Float32Array;
  globals: Float32Array;
  legalMask: Uint8Array;
  policyIndex: number;
  valueTarget: Float32Array;
}

function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function createEmptyTrainingCorpus(
  now = new Date(),
): FabHexaBrainCorpus {
  const timestamp = nowIso(now);
  return {
    schema: "fabhexabrain",
    version: 2,
    kind: "training-corpus",
    game: "FabHexaGrogne",
    rulesVersion: CURRENT_RULES_VERSION,
    architectureId: FAB_HEXA_BRAIN_ARCHITECTURE_ID,
    architecture: FAB_HEXA_BRAIN_ARCHITECTURE,
    mergePolicy: "deduplicate-replays-then-retrain",
    weightPolicy: "never-average-imported-weights",
    createdAt: timestamp,
    updatedAt: timestamp,
    sources: [],
    samples: [],
  };
}

function isPlayerId(value: unknown): value is PlayerId {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5
  );
}

function isPlayerCount(value: unknown): value is PlayerCount {
  return (
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6
  );
}

function isPieceType(value: unknown): value is PieceType {
  return (
    value === "king" ||
    value === "queen" ||
    value === "pawn" ||
    value === "egg"
  );
}

function isCoord(value: unknown): value is Coord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Coord>;
  return Number.isFinite(candidate.q) && Number.isFinite(candidate.r);
}

function isOnBoard(coord: Coord): boolean {
  const s = -coord.q - coord.r;
  return (
    Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(s)) <= BOARD_RADIUS
  );
}

export function coordToBoardIndex(coord: Coord): number | undefined {
  if (!isOnBoard(coord)) return undefined;
  const column = coord.q + BOARD_RADIUS;
  const row = coord.r + BOARD_RADIUS;
  if (
    column < 0 ||
    column >= BOARD_SIZE ||
    row < 0 ||
    row >= BOARD_SIZE
  ) {
    return undefined;
  }
  return row * BOARD_SIZE + column;
}

export function encodeTrainingAction(
  from: Coord,
  to: Coord,
): number | undefined {
  const fromIndex = coordToBoardIndex(from);
  const toIndex = coordToBoardIndex(to);
  if (fromIndex === undefined || toIndex === undefined) return undefined;
  return fromIndex * BOARD_CELL_COUNT + toIndex;
}

function normalizeLegacyFeatures(value: unknown): number[] {
  const source = Array.isArray(value)
    ? value.filter(
        (feature): feature is number =>
          typeof feature === "number" && Number.isFinite(feature),
      )
    : [];
  return Array.from({ length: 14 }, (_, index) => source[index] ?? 0);
}

function clonePosition(
  position: HumanMoveFrame["position"],
): TensorReadyPosition {
  return {
    pieces: position.pieces.map((piece) => ({
      ...piece,
      breedingTurns: piece.breedingTurns ?? 0,
      hatchTurns: piece.hatchTurns ?? 0,
      promoted: Boolean(piece.promoted),
      queenBonded: Boolean(piece.queenBonded),
    })),
    players: position.players.map((player) => ({
      ...player,
      resourcesEarned: player.resourcesEarned ?? player.resources,
      solitaryKingTurns: player.solitaryKingTurns ?? 0,
    })),
  };
}

function canonicalPosition(
  state: GameState,
  perspectivePlayerId: PlayerId,
): TensorReadyPosition {
  return {
    pieces: state.pieces.map((piece) => {
      const coord = canonicalCoordForPlayer(piece, perspectivePlayerId);
      return {
        id: piece.id,
        playerId: canonicalPlayerIdForPerspective(
          piece.playerId,
          perspectivePlayerId,
        ),
        type: piece.type,
        q: coord.q,
        r: coord.r,
        level: piece.level,
        breedingTurns: piece.breedingTurns ?? 0,
        breedingPartnerId: piece.breedingPartnerId,
        hatchTurns: piece.hatchTurns ?? 0,
        promoted: Boolean(piece.promoted),
        queenBonded: Boolean(piece.queenBonded),
      };
    }),
    players: state.players.map((player) => ({
      id: canonicalPlayerIdForPerspective(
        player.id,
        perspectivePlayerId,
      ),
      role: player.role,
      alive: player.alive,
      resources: player.resources,
      resourcesEarned: player.resourcesEarned ?? player.resources,
      personalTurns: player.personalTurns,
      solitaryKingTurns: player.solitaryKingTurns ?? 0,
    })),
  };
}

function stateFromHumanFrame(
  record: HumanVictoryRecord,
  frame: HumanMoveFrame,
): GameState | undefined {
  const position = clonePosition(frame.position);
  if (!position.players.some((player) => player.id === 0)) return undefined;
  const pieces = position.pieces.map((piece) => ({ ...piece }));
  const players = position.players.map((player) => ({
    ...player,
    name: PLAYER_META[player.id].name,
    color: PLAYER_META[player.id].color,
  }));
  const activeIds = players
    .filter((player) => player.alive)
    .map((player) => player.id);
  const turnOrder = [
    0,
    ...activeIds.filter((playerId) => playerId !== 0),
  ] as PlayerId[];
  if (!turnOrder.length) return undefined;
  return {
    rulesVersion: CURRENT_RULES_VERSION,
    matchId: record.matchId,
    pieces,
    players,
    turnOrder,
    turnIndex: 0,
    round: frame.round,
    moveNumber: Math.max(0, frame.ply - 1),
    event: "",
    log: [],
    teamLogs: {},
    notices: [],
    humanMoveTrace: [],
    config: {
      playerCount: record.playerCount,
      humanCount: players.filter((player) => player.role === "human").length,
      aiDifficulty: 3,
    },
  };
}

function legalActionIndices(
  state: GameState,
  playerId: PlayerId,
  transform: (coord: Coord) => Coord,
): number[] {
  const encoded = allLegalMoves(state, playerId)
    .map((move) => {
      const piece = state.pieces.find(
        (candidate) => candidate.id === move.pieceId,
      );
      return piece
        ? encodeTrainingAction(transform(piece), transform(move.to))
        : undefined;
    })
    .filter((index): index is number => index !== undefined);
  return [...new Set(encoded)].sort((left, right) => left - right);
}

function valueTarget(
  position: TensorReadyPosition,
  winnerId?: PlayerId,
): [number, number, number, number, number, number] {
  const participants = new Set(position.players.map((player) => player.id));
  return PLAYER_IDS.map((playerId) => {
    if (!participants.has(playerId) || winnerId === undefined) return 0;
    return playerId === winnerId ? 1 : -1;
  }) as [number, number, number, number, number, number];
}

function prepareHumanArchive(
  raw: HumanTrainingArchive,
): {
  samples: PreparedTrainingSample[];
  games: number;
  rejectedSamples: number;
} {
  const archive = validateHumanTrainingArchive(raw);
  const samples: PreparedTrainingSample[] = [];
  let games = 0;
  let rejectedSamples = 0;
  archive.games.forEach((record) => {
    if (
      record.rulesVersion !== CURRENT_RULES_VERSION ||
      !isPlayerCount(record.playerCount)
    ) {
      rejectedSamples += record.frames.length;
      return;
    }
    let acceptedInGame = 0;
    record.frames.forEach((frame) => {
      const state = stateFromHumanFrame(record, frame);
      const chosenIndex = encodeTrainingAction(
        frame.action.from,
        frame.action.to,
      );
      if (!state || chosenIndex === undefined) {
        rejectedSamples += 1;
        return;
      }
      const legalIndices = legalActionIndices(state, 0, (coord) => coord);
      if (!legalIndices.includes(chosenIndex)) {
        rejectedSamples += 1;
        return;
      }
      const position = clonePosition(frame.position);
      samples.push({
        id:
          record.matchId +
          ":" +
          frame.ply +
          ":" +
          chosenIndex,
        gameId: record.matchId,
        sourceKind: "human",
        rulesVersion: CURRENT_RULES_VERSION,
        playerCount: record.playerCount,
        ply: frame.ply,
        round: frame.round,
        actorRole:
          position.players.find((player) => player.id === 0)?.role ?? "human",
        position,
        action: {
          pieceType: frame.action.pieceType,
          from: { ...frame.action.from },
          to: { ...frame.action.to },
          index: chosenIndex,
        },
        legalActionIndices: legalIndices,
        valueTarget: valueTarget(position, 0),
        legacyFeatures: normalizeLegacyFeatures(frame.features),
        antiLoopEscape: Boolean(frame.action.antiLoopEscape),
      });
      acceptedInGame += 1;
    });
    if (acceptedInGame) games += 1;
  });
  return { samples, games, rejectedSamples };
}

function prepareMatchHistory(
  raw: MatchHistoryArchive,
): {
  samples: PreparedTrainingSample[];
  games: number;
  rejectedSamples: number;
} {
  const archive = validateMatchHistory(raw);
  const samples: PreparedTrainingSample[] = [];
  let games = 0;
  let rejectedSamples = 0;
  archive.matches.forEach((match) => {
    const finalFrame = match.frames[match.frames.length - 1];
    if (
      !finalFrame ||
      (finalFrame.winnerId === undefined &&
        !finalFrame.drawReason &&
        !match.completedAt)
    ) {
      return;
    }
    let acceptedInGame = 0;
    for (let index = 1; index < match.frames.length; index += 1) {
      const previous = match.frames[index - 1];
      const next = match.frames[index];
      const moveRecord = next.lastMove;
      if (
        !moveRecord ||
        next.moveNumber !== previous.moveNumber + 1 ||
        !isPlayerId(moveRecord.playerId)
      ) {
        continue;
      }
      const state = replayFrameToGameState(match, index - 1);
      const mover = state?.pieces.find(
        (piece) => piece.id === moveRecord.pieceId,
      );
      if (!state || !mover) {
        rejectedSamples += 1;
        continue;
      }
      const perspective = moveRecord.playerId;
      const transform = (coord: Coord) =>
        canonicalCoordForPlayer(coord, perspective);
      const from = transform(mover);
      const to = transform(moveRecord.to);
      const chosenIndex = encodeTrainingAction(from, to);
      if (chosenIndex === undefined) {
        rejectedSamples += 1;
        continue;
      }
      const legalIndices = legalActionIndices(
        state,
        perspective,
        transform,
      );
      if (!legalIndices.includes(chosenIndex)) {
        rejectedSamples += 1;
        continue;
      }
      const position = canonicalPosition(state, perspective);
      const winnerId =
        finalFrame.winnerId === undefined
          ? undefined
          : canonicalPlayerIdForPerspective(
              finalFrame.winnerId,
              perspective,
            );
      const actorRole =
        state.players.find((player) => player.id === perspective)?.role ?? "ai";
      samples.push({
        id:
          match.id +
          ":" +
          next.moveNumber +
          ":" +
          chosenIndex,
        gameId: match.id,
        sourceKind: actorRole === "human" ? "human" : "replay",
        rulesVersion: CURRENT_RULES_VERSION,
        playerCount: match.config.playerCount,
        ply: next.moveNumber,
        round: previous.round,
        actorRole,
        position,
        action: {
          pieceType: moveRecord.pieceType,
          from,
          to,
          index: chosenIndex,
        },
        legalActionIndices: legalIndices,
        valueTarget: valueTarget(position, winnerId),
        legacyFeatures: normalizeLegacyFeatures(
          moveFeatures(state, {
            pieceId: moveRecord.pieceId,
            to: moveRecord.to,
          }),
        ),
        antiLoopEscape: Boolean(moveRecord.antiLoopEscape),
        ...(moveRecord.contextReplan ? { contextReplan: true } : {}),
        ...(moveRecord.contextIntent
          ? { contextIntent: moveRecord.contextIntent }
          : {}),
        ...(moveRecord.contextResult
          ? { contextResult: moveRecord.contextResult }
          : {}),
        ...(moveRecord.contextSacrifice ? { contextSacrifice: true } : {}),
      });
      acceptedInGame += 1;
    }
    if (acceptedInGame) games += 1;
  });
  return { samples, games, rejectedSamples };
}

function validatePosition(value: unknown): TensorReadyPosition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<TensorReadyPosition>;
  if (!Array.isArray(candidate.pieces) || !Array.isArray(candidate.players)) {
    return undefined;
  }
  const pieces = candidate.pieces.filter((piece) => {
    return (
      piece &&
      typeof piece === "object" &&
      typeof piece.id === "string" &&
      isPlayerId(piece.playerId) &&
      isPieceType(piece.type) &&
      isCoord(piece) &&
      isOnBoard(piece)
    );
  });
  const players = candidate.players.filter((player) => {
    return (
      player &&
      typeof player === "object" &&
      isPlayerId(player.id) &&
      (player.role === "human" || player.role === "ai") &&
      typeof player.alive === "boolean"
    );
  });
  if (
    pieces.length !== candidate.pieces.length ||
    players.length !== candidate.players.length ||
    !players.length
  ) {
    return undefined;
  }
  return clonePosition({
    pieces,
    players,
  });
}

function validatePreparedSample(
  value: unknown,
): PreparedTrainingSample | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<PreparedTrainingSample>;
  const position = validatePosition(candidate.position);
  if (
    typeof candidate.id !== "string" ||
    !candidate.id ||
    typeof candidate.gameId !== "string" ||
    !candidate.gameId ||
    (candidate.sourceKind !== "human" &&
      candidate.sourceKind !== "replay" &&
      candidate.sourceKind !== "self-play") ||
    candidate.rulesVersion !== CURRENT_RULES_VERSION ||
    !isPlayerCount(candidate.playerCount) ||
    !Number.isFinite(candidate.ply) ||
    !Number.isFinite(candidate.round) ||
    (candidate.actorRole !== "human" && candidate.actorRole !== "ai") ||
    !position ||
    !candidate.action ||
    !isPieceType(candidate.action.pieceType) ||
    !isCoord(candidate.action.from) ||
    !isCoord(candidate.action.to) ||
    !Number.isInteger(candidate.action.index) ||
    candidate.action.index < 0 ||
    candidate.action.index >= ACTION_SPACE ||
    !Array.isArray(candidate.legalActionIndices) ||
    !Array.isArray(candidate.valueTarget) ||
    candidate.valueTarget.length !== 6
  ) {
    return undefined;
  }
  const encodedAction = encodeTrainingAction(
    candidate.action.from,
    candidate.action.to,
  );
  if (encodedAction !== candidate.action.index) return undefined;
  const legalActionIndices = [
    ...new Set(
      candidate.legalActionIndices.filter(
        (index): index is number =>
          Number.isInteger(index) && index >= 0 && index < ACTION_SPACE,
      ),
    ),
  ].sort((left, right) => left - right);
  if (!legalActionIndices.includes(candidate.action.index)) return undefined;
  const values = candidate.valueTarget.map((target) =>
    typeof target === "number" && Number.isFinite(target)
      ? Math.max(-1, Math.min(1, target))
      : Number.NaN,
  );
  if (values.some((target) => !Number.isFinite(target))) return undefined;
  const contextIntent = STRATEGIC_CONTEXT_INTENTS.includes(
    candidate.contextIntent as StrategicContextIntent,
  )
    ? candidate.contextIntent
    : undefined;
  const contextResult = STRATEGIC_CONTEXT_RESULTS.includes(
    candidate.contextResult as StrategicContextResult,
  )
    ? candidate.contextResult
    : undefined;
  return {
    id: candidate.id,
    gameId: candidate.gameId,
    sourceKind: candidate.sourceKind,
    rulesVersion: CURRENT_RULES_VERSION,
    playerCount: candidate.playerCount,
    ply: Number(candidate.ply),
    round: Number(candidate.round),
    actorRole: candidate.actorRole,
    position,
    action: {
      pieceType: candidate.action.pieceType,
      from: { ...candidate.action.from },
      to: { ...candidate.action.to },
      index: candidate.action.index,
    },
    legalActionIndices,
    valueTarget: values as [
      number,
      number,
      number,
      number,
      number,
      number,
    ],
    legacyFeatures: normalizeLegacyFeatures(candidate.legacyFeatures),
    antiLoopEscape: Boolean(candidate.antiLoopEscape),
    ...(candidate.contextReplan ? { contextReplan: true } : {}),
    ...(contextIntent ? { contextIntent } : {}),
    ...(contextResult ? { contextResult } : {}),
    ...(candidate.contextSacrifice ? { contextSacrifice: true } : {}),
  };
}

function architectureMatches(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    id?: unknown;
    input?: { boardShape?: unknown; globalShape?: unknown };
    policy?: { actionSpace?: unknown };
    value?: { heads?: unknown };
  };
  return (
    candidate.id === FAB_HEXA_BRAIN_ARCHITECTURE_ID &&
    Array.isArray(candidate.input?.boardShape) &&
    candidate.input.boardShape.join("|") ===
      FAB_HEXA_BRAIN_ARCHITECTURE.input.boardShape.join("|") &&
    Array.isArray(candidate.input?.globalShape) &&
    candidate.input.globalShape.join("|") ===
      FAB_HEXA_BRAIN_ARCHITECTURE.input.globalShape.join("|") &&
    candidate.policy?.actionSpace === ACTION_SPACE &&
    candidate.value?.heads === 6
  );
}

function mergeSamples(
  corpus: FabHexaBrainCorpus,
  incoming: PreparedTrainingSample[],
  source: Omit<
    TrainingCorpusSource,
    "id" | "importedAt" | "acceptedSamples" | "duplicateSamples"
  >,
  now = new Date(),
): {
  corpus: FabHexaBrainCorpus;
  addedSamples: number;
  duplicateSamples: number;
  trimmedSamples: number;
} {
  const existingIds = new Set(corpus.samples.map((sample) => sample.id));
  const incomingIds = new Set<string>();
  const uniqueIncoming = incoming.filter((sample) => {
    if (existingIds.has(sample.id) || incomingIds.has(sample.id)) return false;
    incomingIds.add(sample.id);
    return true;
  });
  const duplicateSamples = incoming.length - uniqueIncoming.length;
  const combined = [...uniqueIncoming, ...corpus.samples];
  const samples = combined.slice(0, TRAINING_DATASET_MAX_SAMPLES);
  const trimmedSamples = Math.max(0, combined.length - samples.length);
  const acceptedSamples = Math.min(uniqueIncoming.length, samples.length);
  const timestamp = nowIso(now);
  const nextSource: TrainingCorpusSource = {
    ...source,
    id: source.kind + ":" + timestamp + ":" + source.name,
    importedAt: timestamp,
    acceptedSamples,
    duplicateSamples,
  };
  return {
    corpus: {
      ...corpus,
      updatedAt: timestamp,
      sources:
        acceptedSamples || duplicateSamples
          ? [nextSource, ...corpus.sources].slice(0, 64)
          : corpus.sources,
      samples,
    },
    addedSamples: acceptedSamples,
    duplicateSamples,
    trimmedSamples,
  };
}

function rejectedReport(
  sourceName: string,
  kind: TrainingImportReport["kind"],
  message: string,
  rejectedSamples = 0,
): TrainingImportReport {
  return {
    sourceName,
    status: "rejected",
    kind,
    games: 0,
    addedSamples: 0,
    duplicateSamples: 0,
    rejectedSamples,
    trimmedSamples: 0,
    message,
  };
}

export function importTrainingPayload(
  corpus: FabHexaBrainCorpus,
  payload: unknown,
  sourceName: string,
  now = new Date(),
): {
  corpus: FabHexaBrainCorpus;
  report: TrainingImportReport;
} {
  if (!payload || typeof payload !== "object") {
    return {
      corpus,
      report: rejectedReport(
        sourceName,
        "unknown",
        "Le fichier ne contient pas un objet JSON exploitable.",
      ),
    };
  }
  const candidate = payload as {
    schema?: unknown;
    version?: unknown;
    architectureId?: unknown;
    architecture?: unknown;
    samples?: unknown;
    encoding?: {
      coordinates?: unknown;
      perspective?: unknown;
      boardRadius?: unknown;
    };
  };

  let prepared:
    | {
        samples: PreparedTrainingSample[];
        games: number;
        rejectedSamples: number;
      }
    | undefined;
  let kind: TrainingCorpusSource["kind"] | undefined;

  if (
    candidate.schema === "fabhexagrogne-human-victories" &&
    candidate.version === 1
  ) {
    if (
      candidate.encoding?.coordinates !== "axial-q-r" ||
      candidate.encoding?.perspective !==
        "active-player-as-player-0-north" ||
      candidate.encoding?.boardRadius !== BOARD_RADIUS
    ) {
      return {
        corpus,
        report: rejectedReport(
          sourceName,
          "human-victories-v1",
          "Archive humaine rejetée : la perspective canonique ou le rayon du plateau ne correspond pas à FabHexaBrain V2.",
        ),
      };
    }
    prepared = prepareHumanArchive(payload as HumanTrainingArchive);
    kind = "human-victories-v1";
  } else if (
    candidate.schema === "fabhexagrogne-match-history" &&
    candidate.version === 1
  ) {
    prepared = prepareMatchHistory(payload as MatchHistoryArchive);
    kind = "match-history-v1";
  } else if (candidate.schema === "fabhexabrain") {
    if (
      candidate.version !== 2 ||
      candidate.architectureId !== FAB_HEXA_BRAIN_ARCHITECTURE_ID ||
      !architectureMatches(candidate.architecture)
    ) {
      return {
        corpus,
        report: rejectedReport(
          sourceName,
          "fabhexabrain-v2",
          "Architecture incompatible : conversion explicite requise avant import dans FabHexaBrain V2.",
        ),
      };
    }
    if (!Array.isArray(candidate.samples)) {
      return {
        corpus,
        report: rejectedReport(
          sourceName,
          "fabhexabrain-v2",
          "Corpus FabHexaBrain V2 incomplet : aucun échantillon n’est présent.",
        ),
      };
    }
    const samples = candidate.samples
      .map(validatePreparedSample)
      .filter((sample): sample is PreparedTrainingSample => Boolean(sample));
    prepared = {
      samples,
      games: new Set(samples.map((sample) => sample.gameId)).size,
      rejectedSamples: candidate.samples.length - samples.length,
    };
    kind = "fabhexabrain-v2";
  } else if (
    candidate.schema === "fabhexagrogne-ai-pack" ||
    candidate.schema === "fabhexagrogne-ai" ||
    candidate.schema === "fabhexagrogne-self-play"
  ) {
    return {
      corpus,
      report: rejectedReport(
        sourceName,
        "weights-only",
        "Ce fichier contient des poids ou des statistiques, pas des replays. T2 refuse de moyenner les poids : importez des parties puis réentraînez.",
      ),
    };
  } else {
    return {
      corpus,
      report: rejectedReport(
        sourceName,
        "unknown",
        "Format d’entraînement inconnu ou version non prise en charge.",
      ),
    };
  }

  if (!prepared.samples.length || !kind) {
    return {
      corpus,
      report: rejectedReport(
        sourceName,
        kind ?? "unknown",
        prepared.rejectedSamples
          ? "Aucune décision compatible avec les règles V15 n’a pu être préparée."
          : "Ce fichier ne contient aucune décision d’entraînement.",
        prepared.rejectedSamples,
      ),
    };
  }

  const merged = mergeSamples(
    corpus,
    prepared.samples,
    {
      name: sourceName,
      kind,
      games: prepared.games,
    },
    now,
  );
  const status = merged.addedSamples ? "accepted" : "duplicate";
  const plural = merged.addedSamples > 1;
  return {
    corpus: merged.corpus,
    report: {
      sourceName,
      status,
      kind,
      games: prepared.games,
      addedSamples: merged.addedSamples,
      duplicateSamples: merged.duplicateSamples,
      rejectedSamples: prepared.rejectedSamples,
      trimmedSamples: merged.trimmedSamples,
      message: merged.addedSamples
        ? String(merged.addedSamples) +
          " décision" +
          (plural ? "s" : "") +
          " préparée" +
          (plural ? "s" : "") +
          " pour FabHexaBrain V2."
        : "Toutes les décisions de ce fichier étaient déjà présentes.",
    },
  };
}

export function validateTrainingCorpus(
  value: unknown,
  now = new Date(),
): FabHexaBrainCorpus {
  if (!value || typeof value !== "object") {
    return createEmptyTrainingCorpus(now);
  }
  const candidate = value as Partial<FabHexaBrainCorpus>;
  if (
    candidate.schema !== "fabhexabrain" ||
    candidate.version !== 2 ||
    candidate.kind !== "training-corpus" ||
    candidate.game !== "FabHexaGrogne" ||
    candidate.rulesVersion !== CURRENT_RULES_VERSION ||
    candidate.architectureId !== FAB_HEXA_BRAIN_ARCHITECTURE_ID ||
    !architectureMatches(candidate.architecture) ||
    !Array.isArray(candidate.samples)
  ) {
    return createEmptyTrainingCorpus(now);
  }
  const samples = candidate.samples
    .map(validatePreparedSample)
    .filter((sample): sample is PreparedTrainingSample => Boolean(sample))
    .slice(0, TRAINING_DATASET_MAX_SAMPLES);
  const sources = Array.isArray(candidate.sources)
    ? candidate.sources
        .filter(
          (source): source is TrainingCorpusSource =>
            Boolean(source) &&
            typeof source.id === "string" &&
            typeof source.name === "string" &&
            typeof source.importedAt === "string" &&
            (source.kind === "human-victories-v1" ||
              source.kind === "match-history-v1" ||
              source.kind === "fabhexabrain-v2"),
        )
        .slice(0, 64)
    : [];
  return {
    ...createEmptyTrainingCorpus(now),
    createdAt:
      typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : nowIso(now),
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : nowIso(now),
    exportedAt:
      typeof candidate.exportedAt === "string"
        ? candidate.exportedAt
        : undefined,
    sources,
    samples,
  };
}

export function trainingCorpusStats(
  corpus: FabHexaBrainCorpus,
): TrainingCorpusStats {
  return {
    sources: corpus.sources.length,
    games: new Set(corpus.samples.map((sample) => sample.gameId)).size,
    samples: corpus.samples.length,
    humanSamples: corpus.samples.filter(
      (sample) => sample.sourceKind === "human",
    ).length,
    replaySamples: corpus.samples.filter(
      (sample) => sample.sourceKind === "replay",
    ).length,
    selfPlaySamples: corpus.samples.filter(
      (sample) => sample.sourceKind === "self-play",
    ).length,
    capacity: TRAINING_DATASET_MAX_SAMPLES,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function tensorizeTrainingSample(
  sample: PreparedTrainingSample,
): TensorizedTrainingSample {
  const board = new Float32Array(BOARD_CHANNELS * BOARD_CELL_COUNT);
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r += 1) {
    for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q += 1) {
      const index = coordToBoardIndex({ q, r });
      if (index !== undefined) board[index] = 1;
    }
  }
  sample.position.pieces.forEach((piece) => {
    const cell = coordToBoardIndex(piece);
    const pieceIndex = PIECE_TYPES.indexOf(piece.type);
    if (cell === undefined || pieceIndex < 0) return;
    const pieceChannel = 1 + piece.playerId * PIECE_TYPES.length + pieceIndex;
    board[pieceChannel * BOARD_CELL_COUNT + cell] = 1;
    board[25 * BOARD_CELL_COUNT + cell] = clamp01((piece.level ?? 0) / 4);
    board[26 * BOARD_CELL_COUNT + cell] = clamp01(
      (piece.breedingTurns ?? 0) / 3,
    );
    board[27 * BOARD_CELL_COUNT + cell] = clamp01(
      (piece.hatchTurns ?? 0) / 3,
    );
    board[28 * BOARD_CELL_COUNT + cell] = piece.promoted ? 1 : 0;
    board[29 * BOARD_CELL_COUNT + cell] = piece.queenBonded ? 1 : 0;
  });

  const globals = new Float32Array(GLOBAL_FEATURES);
  sample.position.players.forEach((player) => {
    const offset = player.id * 5;
    globals[offset] = player.alive ? 1 : 0;
    globals[offset + 1] = clamp01(player.resources / 256);
    globals[offset + 2] = clamp01(player.resourcesEarned / 256);
    globals[offset + 3] = clamp01(player.personalTurns / 200);
    globals[offset + 4] = clamp01(player.solitaryKingTurns / 10);
  });
  globals[30] = clamp01(sample.round / 200);
  globals[31] = clamp01(sample.ply / 600);

  const legalMask = new Uint8Array(ACTION_SPACE);
  sample.legalActionIndices.forEach((index) => {
    legalMask[index] = 1;
  });
  return {
    board,
    globals,
    legalMask,
    policyIndex: sample.action.index,
    valueTarget: Float32Array.from(sample.valueTarget),
  };
}

export function createTrainingExport(
  corpus: FabHexaBrainCorpus,
  now = new Date(),
): FabHexaBrainCorpus {
  return {
    ...validateTrainingCorpus(corpus, now),
    exportedAt: nowIso(now),
  };
}

function openTrainingDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(
      new Error("IndexedDB indisponible dans ce navigateur."),
    );
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(
      TRAINING_DB_NAME,
      TRAINING_DB_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRAINING_STORE_NAME)) {
        database.createObjectStore(TRAINING_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Ouverture du corpus T2 impossible."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Lecture du corpus T2 impossible."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Écriture du corpus T2 impossible."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("Écriture du corpus T2 interrompue."),
      );
  });
}

export async function loadTrainingCorpus(): Promise<FabHexaBrainCorpus> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(TRAINING_STORE_NAME, "readonly");
    const value = await requestResult(
      transaction.objectStore(TRAINING_STORE_NAME).get(TRAINING_CORPUS_KEY),
    );
    return validateTrainingCorpus(value);
  } finally {
    database.close();
  }
}

export async function saveTrainingCorpus(
  corpus: FabHexaBrainCorpus,
): Promise<void> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(TRAINING_STORE_NAME, "readwrite");
    transaction
      .objectStore(TRAINING_STORE_NAME)
      .put(validateTrainingCorpus(corpus), TRAINING_CORPUS_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearTrainingCorpus(): Promise<void> {
  const database = await openTrainingDatabase();
  try {
    const transaction = database.transaction(TRAINING_STORE_NAME, "readwrite");
    transaction
      .objectStore(TRAINING_STORE_NAME)
      .delete(TRAINING_CORPUS_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
