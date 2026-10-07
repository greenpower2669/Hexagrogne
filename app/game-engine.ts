import {
  DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS,
  QUEEN_ESCAPE_CONTEXT_VERSION,
  type QueenEscapeContextVector,
  prepareQueenEscapeContext,
  queenEscapeContextForMove,
  scoreQueenEscapeContext,
} from "./queen-escape-context";

export type PlayerId = 0 | 1 | 2 | 3 | 4 | 5;
export type PlayerCount = 2 | 3 | 4 | 5 | 6;
export type PieceType = "king" | "queen" | "pawn" | "egg";
export type PlayerRole = "human" | "ai";
export type AIDifficulty = 1 | 2 | 3 | 4;
export type AIPersonalityId =
  | "aggressive"
  | "expansionist"
  | "balanced"
  | "reproduction";
export type AIStrategicPhase =
  | "expansion"
  | "reproduction"
  | "brood_protection"
  | "center_contest"
  | "flank_attack"
  | "royal_survival";

export type StrategicContextIntent =
  | "secure_royals"
  | "open_nursery"
  | "lay"
  | "border_pressure"
  | "breach"
  | "promotion";

export type StrategicContextResult =
  | "continuing"
  | "progress"
  | "stalled"
  | "sacrifice_progress"
  | "sacrifice_stalled";

export const AI_STRATEGIC_PHASE_META: Record<
  AIStrategicPhase,
  { label: string; shortLabel: string }
> = {
  expansion: { label: "Expansion", shortLabel: "Expansion" },
  reproduction: { label: "Déploiement du couvain", shortLabel: "Ponte" },
  brood_protection: { label: "Protection des éclosions", shortLabel: "Couvain" },
  center_contest: { label: "Contestation du centre", shortLabel: "Centre" },
  flank_attack: { label: "Attaque par les bords", shortLabel: "Flanc" },
  royal_survival: { label: "Survie royale", shortLabel: "Survie" },
};

export interface Coord {
  q: number;
  r: number;
}

export interface Piece extends Coord {
  id: string;
  playerId: PlayerId;
  type: PieceType;
  level: number;
  breedingTurns?: number;
  breedingPartnerId?: string;
  hatchTurns?: number;
  promoted?: boolean;
  queenBonded?: boolean;
  zombieActivationsRemaining?: number;
  zombieBornMoveNumber?: number;
}

export interface ZombiePiece extends Piece {
  type: "pawn";
  zombieActivationsRemaining: number;
}

export interface RoyalCocoonPair {
  playerId: PlayerId;
  king: Piece;
  queen: Piece;
  turnsRemaining: number;
}

export interface RoyalCocoonEffect {
  id: string;
  kind: "started" | "completed";
  playerId: PlayerId;
  kingId: string;
  queenId: string;
  kingCoord: Coord;
  queenCoord: Coord;
  turnsRemaining: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: string;
  role: PlayerRole;
  alive: boolean;
  resources: number;
  resourcesEarned: number;
  personalTurns: number;
  solitaryKingTurns: number;
  exitReason?: "escaped" | "checkmate";
}

export interface Move {
  pieceId: string;
  to: Coord;
  antiLoopEscape?: boolean;
  contextReplan?: boolean;
  contextIntent?: StrategicContextIntent;
  contextSacrifice?: boolean;
}

export interface RoyalSacrificeEffect {
  pieceId: string;
  pieceType: "queen" | "pawn";
  playerId: PlayerId;
  coord: Coord;
}

export interface RoyalExitEffect {
  id: string;
  kind: "escape" | "checkmate";
  reason: "blocked" | "solitude" | "checkmate" | "egg-blast" | "zombie";
  playerId: PlayerId;
  coord: Coord;
  opponentId?: PlayerId;
}

export interface ZombieEffect {
  id: string;
  zombieId: string;
  playerId: PlayerId;
  kind: "spawn" | "move" | "bite" | "expire";
  from: Coord;
  to: Coord;
  remainingActivations: number;
  victim?: {
    pieceId: string;
    playerId: PlayerId;
    pieceType: PieceType;
    coord: Coord;
  };
}

export interface EggBlastVictim {
  pieceId: string;
  playerId: PlayerId;
  pieceType: PieceType;
  coord: Coord;
}

export interface EggBlastEffect {
  center: Coord;
  victims: EggBlastVictim[];
}

export interface MoveRecord {
  pieceId: string;
  playerId: PlayerId;
  pieceType: PieceType;
  from: Coord;
  to: Coord;
  capturedType?: PieceType;
  promoted?: boolean;
  spawned?: boolean;
  spawnedCount?: number;
  spawnedCoords?: Coord[];
  hatchedCount?: number;
  hatchedCoords?: Coord[];
  acidVictimId?: string;
  acidVictimPlayerId?: PlayerId;
  acidVictimCoord?: Coord;
  eggBlast?: EggBlastEffect;
  royalSacrifice?: RoyalSacrificeEffect;
  royalCocoonEffects?: RoyalCocoonEffect[];
  royalExitEffects?: RoyalExitEffect[];
  zombieEffects?: ZombieEffect[];
  antiLoopEscape?: boolean;
  antiLoopPenalty?: boolean;
  contextReplan?: boolean;
  contextIntent?: StrategicContextIntent;
  contextReason?: string;
  contextResult?: StrategicContextResult;
  contextSacrifice?: boolean;
}

export interface GameNotice {
  id: string;
  playerId: PlayerId;
  kind: "reproduction-success" | "reproduction-resource-fail" | "reproduction-space-fail";
  pieceType: "egg";
  message: string;
}

export type TeamLogKind =
  | "system"
  | "move"
  | "capture"
  | "acid"
  | "reproduction"
  | "check"
  | "escape"
  | "sacrifice"
  | "loop"
  | "strategy"
  | "zombie"
  | "elimination"
  | "victory";

export interface TeamLogEntry {
  id: string;
  turn: number;
  round: number;
  kind: TeamLogKind;
  message: string;
}

export interface HumanMoveFrame {
  ply: number;
  round: number;
  playerId: PlayerId;
  canonicalPlayerId?: 0;
  perspectiveRotationSteps?: number;
  features: number[];
  position: {
    pieces: Array<{
      id: string;
      playerId: PlayerId;
      type: PieceType;
      q: number;
      r: number;
      level: number;
      breedingTurns: number;
      breedingPartnerId?: string;
      hatchTurns: number;
      promoted: boolean;
      queenBonded: boolean;
    }>;
    players: Array<{
      id: PlayerId;
      role: PlayerRole;
      alive: boolean;
      resources: number;
      resourcesEarned: number;
      personalTurns: number;
      solitaryKingTurns: number;
    }>;
  };
  action: {
    pieceId: string;
    pieceType: PieceType;
    from: Coord;
    to: Coord;
    capturedType?: PieceType;
    antiLoopEscape?: boolean;
  };
}

export interface LoopHistoryEntry {
  signature: string;
  hadSafeAlternative: boolean;
}

export interface ColonyLoopTracker {
  history: LoopHistoryEntry[];
  repeatCount: number;
  cycleLength: number;
  cycleSignatures: string[];
  actionHistory: string[];
  actionRepeatCount: number;
  actionPatternLength: number;
  actionPattern: string[];
  bestTerritoryPotential: number;
  escapeAttempted: boolean;
}

export interface StrategicProgressSnapshot {
  territoryPotential: number;
  nurseryCells: number;
  eggs: number;
  enemyMobility: number;
  promotionDistance: number;
}

export interface ColonyStrategyTracker {
  stagnantTurns: number;
  intent?: StrategicContextIntent;
  intentTurnsRemaining: number;
  replanPending: boolean;
  failedSacrifices: number;
  reason?: string;
  lastIntent?: StrategicContextIntent;
  best: StrategicProgressSnapshot;
}

export interface GameState {
  rulesVersion: 15;
  matchId: string;
  pieces: Piece[];
  players: PlayerState[];
  turnOrder: PlayerId[];
  turnIndex: number;
  round: number;
  moveNumber: number;
  lastMove?: MoveRecord;
  winnerId?: PlayerId;
  drawReason?: string;
  outcome?: "royal_escape";
  event: string;
  log: string[];
  teamLogs: Partial<Record<PlayerId, TeamLogEntry[]>>;
  notices: GameNotice[];
  humanMoveTrace: HumanMoveFrame[];
  loopTrackers?: Partial<Record<PlayerId, ColonyLoopTracker>>;
  strategicTrackers?: Partial<Record<PlayerId, ColonyStrategyTracker>>;
  config: {
    playerCount: PlayerCount;
    humanCount: number;
    aiDifficulty: AIDifficulty;
  };
}

export interface Territory {
  cells: Coord[];
  hull: Coord[];
  richness: number;
  potential: number;
  shape: "Aucun" | "Triangle" | "Quadrilatère" | "Hexagone";
}

export interface AIMemory {
  schema: "fabhexagrogne-ai";
  version: 1;
  weights: number[];
  championWeights: number[];
  generation: number;
  decisions: number;
  games: number;
  fitness: number;
  bestFitness: number;
  learningRate: number;
  wasmReady: boolean;
  modules: {
    queenEscapeContext: AIMemoryWeightModule;
  };
}

export interface AIMemoryWeightModule {
  version: number;
  weights: number[];
  championWeights: number[];
}

export interface AIChoice {
  move: Move;
  features: number[];
  queenEscapeFeatures: number[];
  queenEscapeContextScore: number;
  predictedScore: number;
  phase: AIStrategicPhase;
}

export interface AIMoveScoreContext {
  state: GameState;
  move: Move;
  features: number[];
  queenEscapeFeatures: number[];
  queenEscapeContextScore: number;
  legacyScore: number;
  decisionWeights: number[];
  phase: AIStrategicPhase;
  personality: AIPersonalityId;
}

export type AIMoveScoreAugmenter = (context: AIMoveScoreContext) => number;

export interface AIStrategicAssessment {
  phase: AIStrategicPhase;
  phaseScores: Record<AIStrategicPhase, number>;
  eggs: number;
  threatenedEggRatio: number;
  hatchingSoonRatio: number;
  queenThreatRatio: number;
  kingSafety: number;
  queenSafety: number;
  spawnSpaceRatio: number;
  centerOwner?: PlayerId;
}

export const BOARD_RADIUS = 5;
export const EGG_HATCH_TURNS = 3;
export const ROYAL_COCOON_TURNS = 3;
export const ROYAL_COCOON_RADIUS = 4;
export const KING_SOLITUDE_ESCAPE_TURNS = 10;
export const LOOP_REPETITION_LIMIT = 5;
export const LOOP_ESCAPE_REPETITION = 4;
export const LOOP_WARNING_REPETITION = 3;
export const LOOP_ACTION_PATTERN_MAX_LENGTH = 5;
export const STRATEGIC_STAGNATION_TURNS = 4;
export const STRATEGIC_INTENT_TURNS = 3;
export const STRATEGIC_SACRIFICE_FAILURE_LIMIT = 2;
export const ZOMBIE_ACTIVATIONS = 10;
export const ANTI_LOOP_LEARNING_PENALTY = -2.5;
export const PAWN_RESOURCE_COST = 1;
export const EGG_RESOURCE_COST = PAWN_RESOURCE_COST;
export const KING_RESOURCE_COST = 10;
export const QUEEN_RESOURCE_BASE_COST = 20;
export const MAX_CELL_RICHNESS = 30;
export const TERRITORY_RESOURCE_DIVISOR = 3;
// Le nid finance exactement la formation initiale : sa zone de départ cumule
// 12 points de richesse, soit 4 potentiels, auxquels le nid ajoute 31.
export const COLONY_NEST_RESOURCE_RESERVE = 31;

export const STRATEGIC_INTENT_LABEL: Record<
  StrategicContextIntent,
  string
> = {
  secure_royals: "SÉCURISER LES ROYAUX",
  open_nursery: "OUVRIR UNE NURSERIE",
  lay: "PONDRE",
  border_pressure: "PRESSER LA FRONTIÈRE",
  breach: "PERCER UNE LIGNE",
  promotion: "PRÉPARER UNE PROMOTION",
};

export const HEX_DIRECTIONS: Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const PLAYER_META: Record<
  PlayerId,
  { name: string; color: string; home: Coord; opposite: Coord; forward: number }
> = {
  0: {
    name: "Aurore",
    color: "#f5b942",
    home: { q: 0, r: -BOARD_RADIUS },
    opposite: { q: 0, r: BOARD_RADIUS },
    forward: 5,
  },
  1: {
    name: "Braise",
    color: "#ff6b5d",
    home: { q: BOARD_RADIUS, r: -BOARD_RADIUS },
    opposite: { q: -BOARD_RADIUS, r: BOARD_RADIUS },
    forward: 4,
  },
  2: {
    name: "Azur",
    color: "#55c8e8",
    home: { q: 0, r: BOARD_RADIUS },
    opposite: { q: 0, r: -BOARD_RADIUS },
    forward: 2,
  },
  3: {
    name: "Crépuscule",
    color: "#9b79ff",
    home: { q: -BOARD_RADIUS, r: BOARD_RADIUS },
    opposite: { q: BOARD_RADIUS, r: -BOARD_RADIUS },
    forward: 1,
  },
  4: {
    name: "Émeraude",
    color: "#65d18c",
    home: { q: BOARD_RADIUS, r: 0 },
    opposite: { q: -BOARD_RADIUS, r: 0 },
    forward: 3,
  },
  5: {
    name: "Orchidée",
    color: "#f07ac6",
    home: { q: -BOARD_RADIUS, r: 0 },
    opposite: { q: BOARD_RADIUS, r: 0 },
    forward: 0,
  },
};

const PLAYER_IDS: PlayerId[] = [0, 1, 2, 3, 4, 5];

export function rotateHexCoord(coord: Coord, clockwiseSteps: number): Coord {
  let rotated = { ...coord };
  const steps = ((clockwiseSteps % 6) + 6) % 6;
  for (let index = 0; index < steps; index += 1) {
    rotated = { q: -rotated.r, r: rotated.q + rotated.r };
  }
  return {
    q: Object.is(rotated.q, -0) ? 0 : rotated.q,
    r: Object.is(rotated.r, -0) ? 0 : rotated.r,
  };
}

export function canonicalRotationStepsForPlayer(playerId: PlayerId): number {
  // La direction 5 est la perspective de référence : le royaume actif part
  // toujours du coin supérieur et avance vers le centre.
  return (PLAYER_META[playerId].forward + 1) % 6;
}

export function canonicalCoordForPlayer(
  coord: Coord,
  playerId: PlayerId,
): Coord {
  return rotateHexCoord(coord, canonicalRotationStepsForPlayer(playerId));
}

export function canonicalPlayerIdForPerspective(
  playerId: PlayerId,
  perspectivePlayerId: PlayerId,
): PlayerId {
  const steps = canonicalRotationStepsForPlayer(perspectivePlayerId);
  const rotatedForward = (PLAYER_META[playerId].forward - steps + 6) % 6;
  return (
    PLAYER_IDS.find(
      (candidateId) => PLAYER_META[candidateId].forward === rotatedForward,
    ) ?? 0
  );
}

export function canonicalMoveForPlayer(move: Move, playerId: PlayerId): Move {
  return {
    pieceId: move.pieceId,
    to: canonicalCoordForPlayer(move.to, playerId),
    antiLoopEscape: move.antiLoopEscape,
    contextReplan: move.contextReplan,
    contextIntent: move.contextIntent,
    contextSacrifice: move.contextSacrifice,
  };
}

export function canonicalStateForPlayer(
  state: GameState,
  perspectivePlayerId: PlayerId,
): GameState {
  const rotate = (coord: Coord) =>
    canonicalCoordForPlayer(coord, perspectivePlayerId);
  const remapPlayer = (playerId: PlayerId) =>
    canonicalPlayerIdForPerspective(playerId, perspectivePlayerId);
  const canonicalTeamLogs: Partial<Record<PlayerId, TeamLogEntry[]>> = {};
  PLAYER_IDS.forEach((playerId) => {
    const entries = state.teamLogs?.[playerId];
    if (entries) canonicalTeamLogs[remapPlayer(playerId)] = entries;
  });
  return {
    ...state,
    pieces: state.pieces.map((piece) => ({
      ...piece,
      ...rotate(piece),
      playerId: remapPlayer(piece.playerId),
    })),
    players: state.players.map((player) => ({
      ...player,
      id: remapPlayer(player.id),
    })),
    turnOrder: state.turnOrder.map(remapPlayer),
    winnerId:
      state.winnerId === undefined ? undefined : remapPlayer(state.winnerId),
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          playerId: remapPlayer(state.lastMove.playerId),
          from: rotate(state.lastMove.from),
          to: rotate(state.lastMove.to),
          spawnedCoords: state.lastMove.spawnedCoords?.map(rotate),
          hatchedCoords: state.lastMove.hatchedCoords?.map(rotate),
          acidVictimPlayerId:
            state.lastMove.acidVictimPlayerId === undefined
              ? undefined
              : remapPlayer(state.lastMove.acidVictimPlayerId),
          acidVictimCoord: state.lastMove.acidVictimCoord
            ? rotate(state.lastMove.acidVictimCoord)
            : undefined,
          eggBlast: state.lastMove.eggBlast
            ? {
                center: rotate(state.lastMove.eggBlast.center),
                victims: state.lastMove.eggBlast.victims.map((victim) => ({
                  ...victim,
                  playerId: remapPlayer(victim.playerId),
                  coord: rotate(victim.coord),
                })),
              }
            : undefined,
          royalSacrifice: state.lastMove.royalSacrifice
            ? {
                ...state.lastMove.royalSacrifice,
                playerId: remapPlayer(
                  state.lastMove.royalSacrifice.playerId,
                ),
                coord: rotate(state.lastMove.royalSacrifice.coord),
              }
            : undefined,
          royalCocoonEffects: state.lastMove.royalCocoonEffects?.map(
            (effect) => ({
              ...effect,
              playerId: remapPlayer(effect.playerId),
              kingCoord: rotate(effect.kingCoord),
              queenCoord: rotate(effect.queenCoord),
            }),
          ),
          royalExitEffects: state.lastMove.royalExitEffects?.map((effect) => ({
            ...effect,
            playerId: remapPlayer(effect.playerId),
            opponentId:
              effect.opponentId === undefined
                ? undefined
                : remapPlayer(effect.opponentId),
            coord: rotate(effect.coord),
          })),
          zombieEffects: state.lastMove.zombieEffects?.map((effect) => ({
            ...effect,
            playerId: remapPlayer(effect.playerId),
            from: rotate(effect.from),
            to: rotate(effect.to),
            victim: effect.victim
              ? {
                  ...effect.victim,
                  playerId: remapPlayer(effect.victim.playerId),
                  coord: rotate(effect.victim.coord),
                }
              : undefined,
          })),
        }
      : undefined,
    // Les signatures sont volontairement liées à l'orientation et aux
    // couleurs réelles de la partie. Elles ne participent jamais aux entrées
    // canoniques du cerveau.
    loopTrackers: undefined,
    strategicTrackers: undefined,
    teamLogs: canonicalTeamLogs,
    notices: state.notices.map((notice) => ({
      ...notice,
      playerId: remapPlayer(notice.playerId),
    })),
  };
}

function canonicalDecisionForPlayer(
  state: GameState,
  move: Move,
  playerId: PlayerId,
): { state: GameState; move: Move; rotationSteps: number } {
  return {
    state: canonicalStateForPlayer(state, playerId),
    move: canonicalMoveForPlayer(move, playerId),
    rotationSteps: canonicalRotationStepsForPlayer(playerId),
  };
}

export const PIECE_LABEL: Record<PieceType, string> = {
  king: "Roi",
  queen: "Reine",
  pawn: "Pion",
  egg: "Œuf",
};

const PIECE_VALUE: Record<PieceType, number> = {
  king: 20,
  queen: 9,
  pawn: 1,
  egg: 0.35,
};

function captureValueForMover(mover: Piece, target?: Piece): number {
  if (!target) return 0;
  if (target.playerId !== mover.playerId) return PIECE_VALUE[target.type];
  // Un œuf ami peut être volontairement écrasé pour ouvrir un passage, mais
  // l'IA ne doit pas prendre cette perte pour une récompense de capture.
  return target.type === "egg" ? -PIECE_VALUE.egg : 0;
}

const PIECE_LEVEL: Record<PieceType, number> = {
  king: 4,
  queen: 3,
  pawn: 1,
  egg: 0,
};

export const BOARD_CELLS: Coord[] = (() => {
  const cells: Coord[] = [];
  for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q += 1) {
    for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r += 1) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) <= BOARD_RADIUS) {
        cells.push({ q, r });
      }
    }
  }
  return cells;
})();

export function coordKey(coord: Coord): string {
  return `${coord.q},${coord.r}`;
}

export function isZombieTermite(
  piece: Piece | undefined,
): piece is ZombiePiece {
  return Boolean(
    piece &&
      piece.type === "pawn" &&
      Number.isFinite(piece.zombieActivationsRemaining) &&
      (piece.zombieActivationsRemaining ?? 0) > 0,
  );
}

function tacticalHash(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

export function strategicPositionSignature(state: GameState): string {
  const sideToMove = currentPlayerId(state);
  const players = state.players
    .map((player) =>
      [
        player.id,
        player.color.toLowerCase(),
        player.alive ? 1 : 0,
        player.solitaryKingTurns ?? 0,
      ].join(":"),
    )
    .sort()
    .join("|");
  const pieces = state.pieces
    .map((piece) =>
      [
        piece.q,
        piece.r,
        piece.playerId,
        isZombieTermite(piece) ? "zombie" : piece.type,
        piece.level,
        piece.hatchTurns ?? 0,
        piece.breedingTurns ?? 0,
        piece.breedingPartnerId ?? "-",
        piece.promoted ? 1 : 0,
        piece.queenBonded ? 1 : 0,
        piece.zombieActivationsRemaining ?? 0,
      ].join(":"),
    )
    .sort()
    .join("|");
  const tactical = `turn:${sideToMove};players:${players};pieces:${pieces}`;
  return `${tacticalHash(tactical, 2_166_136_261)}${tacticalHash(tactical, 2_246_822_519)}`;
}

export function emptyLoopTracker(
  bestTerritoryPotential = 0,
): ColonyLoopTracker {
  return {
    history: [],
    repeatCount: 0,
    cycleLength: 0,
    cycleSignatures: [],
    actionHistory: [],
    actionRepeatCount: 0,
    actionPatternLength: 0,
    actionPattern: [],
    bestTerritoryPotential,
    escapeAttempted: false,
  };
}

export function loopTrackerForPlayer(
  state: GameState,
  playerId: PlayerId,
): ColonyLoopTracker {
  const tracker = state.loopTrackers?.[playerId];
  return tracker
    ? {
        history: tracker.history.map((entry) => ({ ...entry })),
        repeatCount: tracker.repeatCount,
        cycleLength: tracker.cycleLength,
        cycleSignatures: [...tracker.cycleSignatures],
        actionHistory: Array.isArray(tracker.actionHistory)
          ? [...tracker.actionHistory]
          : [],
        actionRepeatCount: tracker.actionRepeatCount ?? 0,
        actionPatternLength: tracker.actionPatternLength ?? 0,
        actionPattern: Array.isArray(tracker.actionPattern)
          ? [...tracker.actionPattern]
          : [],
        bestTerritoryPotential: Number.isFinite(tracker.bestTerritoryPotential)
          ? tracker.bestTerritoryPotential
          : territoryForPlayer(state.pieces, playerId).potential,
        escapeAttempted: Boolean(tracker.escapeAttempted),
      }
    : emptyLoopTracker(territoryForPlayer(state.pieces, playerId).potential);
}

export function effectiveLoopRepetition(
  tracker: ColonyLoopTracker | undefined,
): number {
  if (!tracker) return 0;
  return Math.max(tracker.repeatCount, tracker.actionRepeatCount ?? 0);
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function addCoord(a: Coord, b: Coord, multiplier = 1): Coord {
  return { q: a.q + b.q * multiplier, r: a.r + b.r * multiplier };
}

export function isOnBoard(coord: Coord): boolean {
  return hexDistance(coord, { q: 0, r: 0 }) <= BOARD_RADIUS;
}

export function hexDistance(a: Coord, b: Coord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r + b.q + b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function neighbors(coord: Coord): Coord[] {
  return HEX_DIRECTIONS.map((direction) => addCoord(coord, direction)).filter(
    isOnBoard,
  );
}

export function cellRichness(coord: Coord): number {
  const distance = hexDistance(coord, { q: 0, r: 0 });
  // Le cœur est une super-case stratégique : 30 points au centre et 12 sur
  // les six cases qui le touchent. Les anneaux extérieurs conservent leur
  // progression douce de 1 à 4 afin que le bord reste pauvre.
  if (distance === 0) return MAX_CELL_RICHNESS;
  if (distance === 1) return 12;
  return Math.max(1, BOARD_RADIUS + 1 - distance);
}

export function playerIdsForCount(playerCount: PlayerCount): PlayerId[] {
  if (playerCount === 2) return [0, 2];
  if (playerCount === 3) return [0, 4, 3];
  if (playerCount === 4) return [0, 1, 2, 3];
  if (playerCount === 5) return [0, 1, 4, 2, 3];
  return [0, 1, 4, 2, 3, 5];
}

function startingFormation(
  playerId: PlayerId,
): Array<{ type: PieceType; coord: Coord }> {
  const { home, forward } = PLAYER_META[playerId];
  const forwardDirection = HEX_DIRECTIONS[forward];
  const leftDirection = HEX_DIRECTIONS[(forward + 5) % 6];
  const rightDirection = HEX_DIRECTIONS[(forward + 1) % 6];
  const king = addCoord(home, forwardDirection);
  const forwardPawn = addCoord(king, forwardDirection);
  return [
    { type: "queen", coord: home },
    { type: "king", coord: king },
    { type: "pawn", coord: addCoord(home, leftDirection) },
    { type: "pawn", coord: addCoord(home, rightDirection) },
    { type: "pawn", coord: addCoord(king, leftDirection) },
    { type: "pawn", coord: addCoord(king, rightDirection) },
    { type: "pawn", coord: forwardPawn },
  ];
}

export function createNewGame(
  playerCount: PlayerCount = 2,
  humanCount = 1,
  aiDifficulty: AIDifficulty = 3,
  teamNames: string[] = [],
  teamColors: string[] = [],
): GameState {
  const playerIds = playerIdsForCount(playerCount);
  let players = playerIds.map((id, index): PlayerState => ({
    id,
    name: teamNames[index]?.trim()
      ? teamNames[index].trim().slice(0, 24)
      : PLAYER_META[id].name,
    color: /^#[0-9a-f]{6}$/i.test(teamColors[index] ?? "")
      ? teamColors[index]
      : PLAYER_META[id].color,
    role: index < humanCount ? "human" : "ai",
    alive: true,
    resources: 0,
    resourcesEarned: 0,
    personalTurns: 0,
    solitaryKingTurns: 0,
  }));
  const pieces: Piece[] = [];
  playerIds.forEach((playerId) => {
    startingFormation(playerId).forEach(({ type, coord }, index) => {
      pieces.push({
        id: `p${playerId}-${type}-${index}`,
        playerId,
        type,
        level: PIECE_LEVEL[type],
        breedingTurns: 0,
        queenBonded: type === "queen",
        ...coord,
      });
    });
  });
  players = synchronizePlayerResources(players, pieces);
  const teamLogs: Partial<Record<PlayerId, TeamLogEntry[]>> = {};
  playerIds.forEach((playerId) => {
    const playerName = players.find((player) => player.id === playerId)?.name ??
      PLAYER_META[playerId].name;
    teamLogs[playerId] = [
      {
        id: `journal-start-${playerId}`,
        turn: 0,
        round: 1,
        kind: "system",
        message: `${playerName} déploie sa formation autour de son coin.`,
      },
    ];
  });
  return {
    rulesVersion: 15,
    matchId: `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    pieces,
    players,
    turnOrder: playerIds,
    turnIndex: 0,
    round: 1,
    moveNumber: 0,
    event: `${players[0]?.name ?? "Aurore"} ouvre la conquête.`,
    log: ["La partie commence. Les frontières attendent d’être dessinées."],
    teamLogs,
    notices: [],
    humanMoveTrace: [],
    loopTrackers: Object.fromEntries(
      playerIds.map((playerId) => [
        playerId,
        emptyLoopTracker(territoryForPlayer(pieces, playerId).potential),
      ]),
    ) as Partial<Record<PlayerId, ColonyLoopTracker>>,
    strategicTrackers: {},
    config: {
      playerCount,
      humanCount: Math.min(humanCount, playerCount),
      aiDifficulty,
    },
  };
}

export function currentPlayerId(state: GameState): PlayerId {
  return state.turnOrder[state.turnIndex];
}

export function pieceAt(pieces: Piece[], coord: Coord): Piece | undefined {
  return pieces.find((piece) => sameCoord(piece, coord));
}

export function activeRoyalCocoons(
  pieces: Piece[],
): RoyalCocoonPair[] {
  const pairs: RoyalCocoonPair[] = [];
  const seen = new Set<string>();
  pieces.forEach((king) => {
    if (
      king.type !== "king" ||
      !king.breedingPartnerId ||
      (king.breedingTurns ?? 0) <= 0 ||
      seen.has(king.id)
    ) {
      return;
    }
    const queen = pieces.find(
      (candidate) =>
        candidate.id === king.breedingPartnerId &&
        candidate.playerId === king.playerId &&
        candidate.type === "queen" &&
        candidate.breedingPartnerId === king.id &&
        (candidate.breedingTurns ?? 0) > 0 &&
        hexDistance(candidate, king) === 1,
    );
    if (!queen) return;
    const turnsRemaining = Math.min(
      king.breedingTurns ?? 0,
      queen.breedingTurns ?? 0,
    );
    if (turnsRemaining <= 0) return;
    seen.add(king.id);
    seen.add(queen.id);
    pairs.push({
      playerId: king.playerId,
      king,
      queen,
      turnsRemaining,
    });
  });
  return pairs;
}

export function isCellProtectedByRoyalCocoon(
  pieces: Piece[],
  coord: Coord,
  playerId: PlayerId,
): boolean {
  return activeRoyalCocoons(pieces).some(
    (pair) =>
      pair.playerId === playerId &&
      (hexDistance(coord, pair.king) <= ROYAL_COCOON_RADIUS ||
        hexDistance(coord, pair.queen) <= ROYAL_COCOON_RADIUS),
  );
}

export function isPieceFrozenByRoyalCocoon(
  pieces: Piece[],
  piece: Piece,
): boolean {
  return activeRoyalCocoons(pieces).some(
    (pair) =>
      hexDistance(piece, pair.king) <= ROYAL_COCOON_RADIUS ||
      hexDistance(piece, pair.queen) <= ROYAL_COCOON_RADIUS,
  );
}

function enemyRoyalCocoonAt(
  pieces: Piece[],
  attackerId: PlayerId,
  coord: Coord,
): RoyalCocoonPair | undefined {
  return activeRoyalCocoons(pieces).find(
    (pair) =>
      pair.playerId !== attackerId &&
      (hexDistance(coord, pair.king) <= ROYAL_COCOON_RADIUS ||
        hexDistance(coord, pair.queen) <= ROYAL_COCOON_RADIUS),
  );
}

function jumpMidpoint(from: Coord, to: Coord): Coord | undefined {
  const qTotal = from.q + to.q;
  const rTotal = from.r + to.r;
  if (qTotal % 2 !== 0 || rTotal % 2 !== 0) return undefined;
  return { q: qTotal / 2, r: rTotal / 2 };
}

function preservesRoyalCocoonContact(
  pieces: Piece[],
  piece: Piece,
  target: Coord,
): boolean {
  if (!piece.breedingPartnerId || (piece.breedingTurns ?? 0) <= 0) {
    return true;
  }
  const partner = pieces.find(
    (candidate) =>
      candidate.id === piece.breedingPartnerId &&
      candidate.playerId === piece.playerId &&
      (candidate.breedingTurns ?? 0) > 0,
  );
  return !partner || hexDistance(target, partner) === 1;
}

function moveRespectsRoyalCocoons(
  pieces: Piece[],
  piece: Piece,
  target: Coord,
): boolean {
  if (!preservesRoyalCocoonContact(pieces, piece, target)) return false;
  if (enemyRoyalCocoonAt(pieces, piece.playerId, target)) return false;
  if (piece.type !== "queen" || hexDistance(piece, target) !== 2) {
    return true;
  }
  const midpoint = jumpMidpoint(piece, target);
  if (!midpoint) return true;
  const startsInside = Boolean(
    enemyRoyalCocoonAt(pieces, piece.playerId, piece),
  );
  return startsInside || !enemyRoyalCocoonAt(
    pieces,
    piece.playerId,
    midpoint,
  );
}

function queenTargets(piece: Piece): Coord[] {
  return BOARD_CELLS.filter((cell) => hexDistance(piece, cell) === 2);
}

function attackTargets(piece: Piece): Coord[] {
  if (piece.type === "egg" || isZombieTermite(piece)) return [];
  if (piece.type === "queen") return queenTargets(piece);
  return neighbors(piece);
}

export function isSquareAttacked(
  pieces: Piece[],
  coord: Coord,
  protectedPlayerId: PlayerId,
): boolean {
  if (isCellProtectedByRoyalCocoon(pieces, coord, protectedPlayerId)) {
    return false;
  }
  return pieces.some(
    (piece) =>
      piece.playerId !== protectedPlayerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece) &&
      !isPieceFrozenByRoyalCocoon(pieces, piece) &&
      moveRespectsRoyalCocoons(pieces, piece, coord) &&
      attackTargets(piece).some((target) => sameCoord(target, coord)),
  );
}

export function checkingPieces(
  pieces: Piece[],
  protectedPlayerId: PlayerId,
): Piece[] {
  const king = pieces.find(
    (piece) =>
      piece.playerId === protectedPlayerId && piece.type === "king",
  );
  if (!king) return [];
  if (isCellProtectedByRoyalCocoon(pieces, king, protectedPlayerId)) {
    return [];
  }
  return pieces.filter(
    (piece) =>
      piece.playerId !== protectedPlayerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece) &&
      !isPieceFrozenByRoyalCocoon(pieces, piece) &&
      moveRespectsRoyalCocoons(pieces, piece, king) &&
      attackTargets(piece).some((target) => sameCoord(target, king)),
  );
}

export function isInCheck(pieces: Piece[], playerId: PlayerId): boolean {
  const king = pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  return king ? checkingPieces(pieces, playerId).length > 0 : true;
}

function pseudoMoveTargets(piece: Piece, pieces: Piece[]): Coord[] {
  if (isZombieTermite(piece) || isPieceFrozenByRoyalCocoon(pieces, piece)) return [];
  const canLand = (target: Coord) => {
    const occupant = pieceAt(pieces, target);
    return moveRespectsRoyalCocoons(pieces, piece, target) && (
      !occupant ||
      (!isZombieTermite(occupant) &&
        (occupant.type === "egg" ||
          (occupant.playerId !== piece.playerId && occupant.type !== "king")))
    );
  };

  if (piece.type === "egg") return [];
  if (piece.type === "pawn") {
    return neighbors(piece).filter(canLand);
  }

  if (piece.type === "queen") return queenTargets(piece).filter(canLand);
  if (piece.type === "king") return neighbors(piece).filter(canLand);
  return [];
}

function prependTeamLogEntries(
  teamLogs: Partial<Record<PlayerId, TeamLogEntry[]>> | undefined,
  playerId: PlayerId,
  entries: TeamLogEntry[],
): Partial<Record<PlayerId, TeamLogEntry[]>> {
  return {
    ...(teamLogs ?? {}),
    [playerId]: [...entries, ...(teamLogs?.[playerId] ?? [])].slice(0, 120),
  };
}

export function queenPromotionCost(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const livingQueens = pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "queen",
  ).length;
  // La première reine mobilise 20 potentiels. Chaque reine suivante double
  // le palier : 20, 40, 80, 160… La promotion vise le palier suivant.
  return Math.min(
    1_000_000,
    QUEEN_RESOURCE_BASE_COST * 2 ** Math.max(0, livingQueens),
  );
}

export function queenCrossedByJump(
  pieces: Piece[],
  move: Move,
): Piece | undefined {
  const mover = pieces.find((piece) => piece.id === move.pieceId);
  if (!mover || mover.type !== "queen" || hexDistance(mover, move.to) !== 2) {
    return undefined;
  }
  const midpoint = jumpMidpoint(mover, move.to);
  if (!midpoint) return undefined;
  const crossed = pieceAt(pieces, midpoint);
  return crossed?.type === "queen" &&
      crossed.playerId !== mover.playerId &&
      !isCellProtectedByRoyalCocoon(pieces, crossed, crossed.playerId)
    ? crossed
    : undefined;
}

export function eggBlastVictimsForMove(
  pieces: Piece[],
  move: Move,
): Piece[] {
  const mover = pieces.find((piece) => piece.id === move.pieceId);
  const egg = pieceAt(pieces, move.to);
  if (!mover || egg?.type !== "egg") return [];
  // Une seule onde naît de l'œuf directement écrasé. Les œufs voisins sont
  // détruits comme les autres pièces mais ne déclenchent pas de chaîne.
  return pieces.filter(
    (piece) =>
      piece.id !== mover.id &&
      piece.id !== egg.id &&
      hexDistance(piece, egg) === 1 &&
      !isZombieTermite(piece) &&
      !isPieceFrozenByRoyalCocoon(pieces, piece),
  );
}

function eggBlastMaterialSwing(
  pieces: Piece[],
  move: Move,
  playerId: PlayerId,
): number {
  return eggBlastVictimsForMove(pieces, move).reduce(
    (swing, victim) =>
      swing +
      (victim.playerId === playerId
        ? -PIECE_VALUE[victim.type]
        : PIECE_VALUE[victim.type]),
    0,
  );
}

function movePieces(pieces: Piece[], move: Move): Piece[] {
  const mover = pieces.find((piece) => piece.id === move.pieceId);
  if (!mover) return pieces;
  const opposite = PLAYER_META[mover.playerId].opposite;
  const acidVictim = queenCrossedByJump(pieces, move);
  const eggBlastVictimIds = new Set(
    eggBlastVictimsForMove(pieces, move).map((piece) => piece.id),
  );
  return pieces
    .filter(
      (piece) =>
        piece.id === mover.id ||
        (piece.id !== acidVictim?.id &&
          !eggBlastVictimIds.has(piece.id) &&
          !sameCoord(piece, move.to)),
    )
    .map((piece) => {
      if (piece.id !== mover.id) return piece;
      const promotes =
        piece.type === "pawn" &&
        !isZombieTermite(piece) &&
        sameCoord(move.to, opposite);
      return {
        ...piece,
        ...move.to,
        type: promotes ? ("queen" as const) : piece.type,
        level: promotes ? PIECE_LEVEL.queen : piece.level,
        promoted: promotes || piece.promoted,
        queenBonded: promotes ? false : piece.queenBonded,
        breedingTurns: promotes ? 0 : piece.breedingTurns,
        breedingPartnerId: promotes ? undefined : piece.breedingPartnerId,
      };
    });
}

function enemyCanLegallyCrushEgg(
  pieces: Piece[],
  egg: Piece,
  protectedPlayerId: PlayerId,
  requiredBlastVictimId?: string,
): boolean {
  return pieces
    .filter(
      (piece) =>
        piece.playerId !== protectedPlayerId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece),
    )
    .some((attacker) =>
      pseudoMoveTargets(attacker, pieces).some((to) => {
        if (!sameCoord(to, egg)) return false;
        const move = { pieceId: attacker.id, to };
        if (
          requiredBlastVictimId &&
          !eggBlastVictimsForMove(pieces, move).some(
            (victim) => victim.id === requiredBlastVictimId,
          )
        ) {
          return false;
        }
        return !isInCheck(movePieces(pieces, move), attacker.playerId);
      }),
    );
}

export function isEggImmediatelyCrushable(
  pieces: Piece[],
  eggCoord: Coord,
  protectedPlayerId: PlayerId,
): boolean {
  const occupant = pieceAt(pieces, eggCoord);
  if (occupant && occupant.type !== "egg") return false;
  const egg: Piece = occupant ?? {
    id: `__provisional-egg-${protectedPlayerId}-${coordKey(eggCoord)}`,
    playerId: protectedPlayerId,
    type: "egg",
    level: PIECE_LEVEL.egg,
    hatchTurns: EGG_HATCH_TURNS,
    ...eggCoord,
  };
  const projectedPieces = occupant ? pieces : [...pieces, egg];
  return enemyCanLegallyCrushEgg(
    projectedPieces,
    egg,
    protectedPlayerId,
  );
}

export function isQueenTacticallyCapturable(
  pieces: Piece[],
  queen: Piece,
  protectedPlayerId: PlayerId,
): boolean {
  if (isSquareAttacked(pieces, queen, protectedPlayerId)) return true;
  const acidCapture = pieces
    .filter(
      (piece) =>
        piece.playerId !== protectedPlayerId && piece.type === "queen",
    )
    .some((enemyQueen) =>
      pseudoMoveTargets(enemyQueen, pieces).some((to) => {
        const move = { pieceId: enemyQueen.id, to };
        return (
          queenCrossedByJump(pieces, move)?.id === queen.id &&
          !isInCheck(movePieces(pieces, move), enemyQueen.playerId)
        );
      }),
    );
  if (acidCapture) return true;
  return pieces
    .filter(
      (piece) =>
        piece.type === "egg" && hexDistance(piece, queen) === 1,
    )
    .some((egg) =>
      enemyCanLegallyCrushEgg(
        pieces,
        egg,
        protectedPlayerId,
        queen.id,
      ),
    );
}

export function queenHatchTrapRisk(
  pieces: Piece[],
  playerId: PlayerId,
  queenId: string,
): number {
  const queen = pieces.find(
    (piece) =>
      piece.id === queenId &&
      piece.playerId === playerId &&
      piece.type === "queen",
  );
  if (!queen) return 0;
  // Tant que la conversion en pion n'a pas réellement eu lieu, l'œuf ne
  // produit ni attaque, ni pression tactique anticipée sur le roi ou la reine.
  return 0;
}

function ordinaryLegalMovesForPiece(
  state: GameState,
  pieceId: string,
): Move[] {
  const piece = state.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return [];
  // Un territoire est uniquement visuel et économique : il ne participe
  // jamais au calcul d'un déplacement ou d'une capture.
  return pseudoMoveTargets(piece, state.pieces)
    .map((to) => ({ pieceId, to }))
    .filter((move) => {
      const promotes =
        piece.type === "pawn" &&
        sameCoord(move.to, PLAYER_META[piece.playerId].opposite);
      if (!promotes) return true;
      const promotedPieces = movePieces(state.pieces, move);
      const status = resourceStatusForPlayer(promotedPieces, piece.playerId);
      return status.used <= status.capacity;
    })
    .filter((move) => !isInCheck(movePieces(state.pieces, move), piece.playerId));
}

export function ordinaryLegalMovesForPlayer(
  state: GameState,
  playerId: PlayerId,
): Move[] {
  return state.pieces
    .filter((piece) => piece.playerId === playerId)
    .flatMap((piece) => ordinaryLegalMovesForPiece(state, piece.id));
}

export function ordinaryLegalMoveCount(
  state: GameState,
  playerId: PlayerId,
  limit = Number.POSITIVE_INFINITY,
): number {
  let count = 0;
  for (const piece of state.pieces) {
    if (piece.playerId !== playerId) continue;
    count += ordinaryLegalMovesForPiece(state, piece.id).length;
    if (count >= limit) return limit;
  }
  return count;
}

function emergencyRoyalSacrificeMoves(
  state: GameState,
  king: Piece,
): Move[] {
  if (
    king.type !== "king" ||
    isPieceFrozenByRoyalCocoon(state.pieces, king)
  ) {
    return [];
  }
  return neighbors(king)
    .filter((cell) => {
      const occupant = pieceAt(state.pieces, cell);
      return (
        occupant?.playerId === king.playerId &&
        (occupant.type === "pawn" || occupant.type === "queen") &&
        !isZombieTermite(occupant) &&
        (occupant.breedingTurns ?? 0) <= 0 &&
        moveRespectsRoyalCocoons(state.pieces, king, cell)
      );
    })
    .map((to) => ({ pieceId: king.id, to }))
    .filter(
      (move) => !isInCheck(movePieces(state.pieces, move), king.playerId),
    );
}

export function legalMovesForPiece(state: GameState, pieceId: string): Move[] {
  const ordinary = ordinaryLegalMovesForPiece(state, pieceId);
  if (ordinary.length) return ordinary;
  const piece = state.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || piece.type !== "king") return [];
  if (ordinaryLegalMoveCount(state, piece.playerId, 1)) return [];
  return emergencyRoyalSacrificeMoves(state, piece);
}

export function allLegalMoves(state: GameState, playerId: PlayerId): Move[] {
  const ordinary = ordinaryLegalMovesForPlayer(state, playerId);
  if (ordinary.length) return ordinary;
  const king = state.pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  return king ? emergencyRoyalSacrificeMoves(state, king) : [];
}

export function isGuardrailSafeMove(
  state: GameState,
  playerId: PlayerId,
  move: Move,
): boolean {
  const mover = state.pieces.find(
    (piece) => piece.id === move.pieceId && piece.playerId === playerId,
  );
  if (!mover || isZombieTermite(mover)) return false;
  const legal = legalMovesForPiece(state, move.pieceId).some((candidate) =>
    sameCoord(candidate.to, move.to),
  );
  if (!legal) return false;
  const target = pieceAt(state.pieces, move.to);
  if (target?.playerId === playerId && target.type === "egg") return false;
  const beforeProtected = state.pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      (piece.type === "king" || piece.type === "queen" || piece.type === "egg"),
  );
  const afterPieces = movePieces(state.pieces, move);
  if (isInCheck(afterPieces, playerId)) return false;
  if (
    beforeProtected.some(
      (piece) => !afterPieces.some((candidate) => candidate.id === piece.id),
    )
  ) {
    return false;
  }
  return afterPieces
    .filter(
      (piece) => piece.playerId === playerId && piece.type === "queen",
    )
    .every(
      (queen) =>
        !isQueenTacticallyCapturable(afterPieces, queen, playerId) &&
        queenHatchTrapRisk(afterPieces, playerId, queen.id) < 0.95,
    );
}

function hasOtherLegalSafeMove(
  state: GameState,
  playerId: PlayerId,
  chosenMove: Move,
): boolean {
  return allLegalMoves(state, playerId).some(
    (candidate) =>
      (candidate.pieceId !== chosenMove.pieceId ||
        !sameCoord(candidate.to, chosenMove.to)) &&
      isGuardrailSafeMove(state, playerId, candidate),
  );
}

function turnBlockedOnlyByEnemyCocoon(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const enemyPairs = activeRoyalCocoons(state.pieces).filter(
    (pair) => pair.playerId !== playerId,
  );
  if (!enemyPairs.length) return false;
  const releasedIds = new Set(
    enemyPairs.flatMap((pair) => [pair.king.id, pair.queen.id]),
  );
  const releasedPieces = state.pieces.map((piece) =>
    releasedIds.has(piece.id)
      ? {
          ...piece,
          breedingTurns: 0,
          breedingPartnerId: undefined,
        }
      : piece,
  );
  return allLegalMoves({ ...state, pieces: releasedPieces }, playerId).length > 0;
}

export function kingSafetyValue(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const king = pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  if (!king) return -1;
  const adjacentCells = neighbors(king);
  const adjacentOtherGuards = pieces.filter(
    (piece) =>
      piece.id !== king.id &&
      piece.playerId === playerId &&
      piece.type !== "egg" &&
      piece.type !== "pawn" &&
      hexDistance(piece, king) === 1,
  ).length;
  const pawnShield = kingPawnShieldValue(pieces, playerId);
  const safeEscapes = pseudoMoveTargets(king, pieces).filter(
    (cell) =>
      !isInCheck(
        movePieces(pieces, { pieceId: king.id, to: cell }),
        playerId,
      ),
  ).length;
  const escapeRatio = safeEscapes / Math.max(1, adjacentCells.length);
  const enemyPressure = pieces
    .filter(
      (piece) =>
        piece.playerId !== playerId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece),
    )
    .reduce((pressure, piece) => {
      const distance = hexDistance(piece, king);
      if (piece.type === "queen") {
        if (distance === 2) return pressure + 1.2;
        if (distance <= 4) return pressure + (5 - distance) * 0.18;
        return pressure;
      }
      if (distance === 1) return pressure + 1.15;
      if (distance === 2) return pressure + 0.42;
      if (distance === 3) return pressure + 0.12;
      return pressure;
    }, 0);
  const activeChecks = checkingPieces(pieces, playerId).length;
  const guardValue =
    pawnShield * 0.44 + Math.min(1, adjacentOtherGuards / 2) * 0.06;
  const exposedShieldPenalty = Math.max(0, 0.55 - pawnShield) * 0.28;
  const crampedPenalty =
    safeEscapes === 0 ? 0.42 : safeEscapes === 1 ? 0.16 : 0;
  return Math.max(
    -1,
    Math.min(
      1,
      escapeRatio * 0.48 +
        guardValue -
        Math.min(0.72, enemyPressure * 0.22) -
        activeChecks * 0.8 -
        exposedShieldPenalty -
        crampedPenalty,
    ),
  );
}

export function kingPawnShieldValue(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const king = pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  if (!king) return 0;
  const adjacentPawns = pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "pawn" &&
      !isZombieTermite(piece) &&
      hexDistance(piece, king) === 1,
  ).length;
  const secondLinePawns = pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "pawn" &&
      !isZombieTermite(piece) &&
      hexDistance(piece, king) === 2,
  ).length;
  return Math.max(
    0,
    Math.min(
      1,
      Math.min(1, adjacentPawns / 3) * 0.82 +
        Math.min(1, secondLinePawns / 4) * 0.18,
    ),
  );
}

function axialPoint(coord: Coord): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * (coord.q + coord.r / 2),
    y: 1.5 * coord.r,
  };
}

function cross(
  origin: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return (a.x - origin.x) * (b.y - origin.y) -
    (a.y - origin.y) * (b.x - origin.x);
}

function convexHull(coords: Coord[]): Coord[] {
  const unique = [...new Map(coords.map((coord) => [coordKey(coord), coord])).values()];
  if (unique.length < 3) return [];
  const points = unique
    .map((coord) => ({ coord, ...axialPoint(coord) }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: typeof points = [];
  points.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  });
  const upper: typeof points = [];
  [...points].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  });
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].map((point) => point.coord);
}

function pointOnSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const area = Math.abs(cross(a, b, point));
  if (area > 0.001) return false;
  return (
    point.x >= Math.min(a.x, b.x) - 0.001 &&
    point.x <= Math.max(a.x, b.x) + 0.001 &&
    point.y >= Math.min(a.y, b.y) - 0.001 &&
    point.y <= Math.max(a.y, b.y) + 0.001
  );
}

function pointInPolygon(point: { x: number; y: number }, hull: Coord[]): boolean {
  const polygon = hull.map(axialPoint);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    if (pointOnSegment(point, polygon[j], polygon[i])) return true;
    const intersects =
      polygon[i].y > point.y !== polygon[j].y > point.y &&
      point.x <
        ((polygon[j].x - polygon[i].x) * (point.y - polygon[i].y)) /
          (polygon[j].y - polygon[i].y) +
          polygon[i].x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function territoryForPlayer(
  pieces: Piece[],
  playerId: PlayerId,
): Territory {
  const owned = pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece),
  );
  const hull = convexHull(owned);
  if (hull.length < 3) {
    return { cells: [], hull: [], richness: 0, potential: 0, shape: "Aucun" };
  }
  const cells = BOARD_CELLS.filter((cell) => {
    const occupant = pieceAt(pieces, cell);
    if (
      occupant &&
      occupant.type !== "egg" &&
      !isZombieTermite(occupant) &&
      occupant.playerId !== playerId
    ) {
      return false;
    }
    return pointInPolygon(axialPoint(cell), hull);
  });
  const richness = cells.reduce((sum, cell) => sum + cellRichness(cell), 0);
  const potential = Math.floor(richness / TERRITORY_RESOURCE_DIVISOR);
  const shape =
    hull.length <= 3
      ? "Triangle"
      : hull.length === 4
        ? "Quadrilatère"
        : "Hexagone";
  return { cells, hull, richness, potential, shape };
}

export function queenSpawnCells(pieces: Piece[], queen: Piece): Coord[] {
  if (queen.type !== "queen" || !queen.queenBonded) return [];
  // Un œuf ne naît que dans une vraie nurserie : aucun adversaire ne doit
  // pouvoir l'écraser légalement avant le prochain tour de sa colonie.
  return neighbors(queen).filter(
    (cell) =>
      !pieceAt(pieces, cell) &&
      !isEggImmediatelyCrushable(pieces, cell, queen.playerId),
  );
}

function nextQueenSpawnCell(pieces: Piece[], queen: Piece): Coord | undefined {
  return queenSpawnCells(pieces, queen).sort(
    (a, b) => cellRichness(b) - cellRichness(a),
  )[0];
}

export function royalPairAlive(
  pieces: Piece[],
  playerId: PlayerId,
): boolean {
  return (
    pieces.some(
      (piece) => piece.playerId === playerId && piece.type === "king",
    ) &&
    pieces.some(
      (piece) => piece.playerId === playerId && piece.type === "queen",
    )
  );
}

export function queenSpawnSpaceRatio(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const queens = pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "queen" &&
      piece.queenBonded,
  );
  const possibleCells = queens.flatMap((queen) => neighbors(queen));
  if (!possibleCells.length) return 0;
  const safeCells = queens.flatMap((queen) => queenSpawnCells(pieces, queen));
  return safeCells.length / possibleCells.length;
}

export function queenSpawnReadiness(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  if (
    !pieces.some(
      (piece) => piece.playerId === playerId && piece.type === "king",
    )
  ) {
    return -1;
  }
  const fertileQueens = pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "queen" &&
      piece.queenBonded &&
      queenSpawnCells(pieces, piece).length > 0,
  );
  if (!fertileQueens.length) return -1;
  return 1;
}

export function populationForPlayer(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  return pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece),
  ).length;
}

export function usedResources(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const colonyPieces = pieces.filter((piece) => piece.playerId === playerId);
  const queens = colonyPieces.filter((piece) => piece.type === "queen").length;
  const queenPotential = Array.from(
    { length: queens },
    (_, index) => QUEEN_RESOURCE_BASE_COST * 2 ** index,
  ).reduce((sum, cost) => Math.min(1_000_000, sum + cost), 0);
  return colonyPieces.reduce((sum, piece) => {
    if (isZombieTermite(piece)) return sum;
    if (piece.type === "queen") return sum;
    if (piece.type === "king") return sum + KING_RESOURCE_COST;
    return sum + PAWN_RESOURCE_COST;
  }, queenPotential);
}

export function resourceCapacityForPlayer(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  if (!pieces.some((piece) => piece.playerId === playerId)) return 0;
  return COLONY_NEST_RESOURCE_RESERVE +
    territoryForPlayer(pieces, playerId).potential;
}

export function resourceStatusForPlayer(
  pieces: Piece[],
  playerId: PlayerId,
): { used: number; capacity: number; free: number; overload: number } {
  const used = usedResources(pieces, playerId);
  const capacity = resourceCapacityForPlayer(pieces, playerId);
  return {
    used,
    capacity,
    free: Math.max(0, capacity - used),
    overload: Math.max(0, used - capacity),
  };
}

export function synchronizePlayerResources(
  players: PlayerState[],
  pieces: Piece[],
): PlayerState[] {
  return players.map((player) => {
    const status = resourceStatusForPlayer(pieces, player.id);
    return {
      ...player,
      resources: status.free,
      // Nom historique conservé pour la compatibilité des sauvegardes : cette
      // valeur représente désormais la capacité, jamais un cumul de récoltes.
      resourcesEarned: status.capacity,
    };
  });
}

export function queenDisciplineValue(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const king = pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  const queens = pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "queen",
  );
  if (!king || !queens.length) return -1;
  const scores = queens.map((queen) => {
    const attacked = isQueenTacticallyCapturable(pieces, queen, playerId);
    const enemyPressure = pieces
      .filter(
        (piece) =>
          piece.playerId !== playerId &&
          piece.type !== "egg" &&
          !isZombieTermite(piece),
      )
      .reduce((pressure, piece) => {
        const distance = hexDistance(piece, queen);
        if (piece.type === "queen") {
          if (distance === 2) return pressure + 1;
          if (distance <= 4) return pressure + (5 - distance) * 0.13;
          return pressure;
        }
        if (distance === 1) return pressure + 0.9;
        if (distance === 2) return pressure + 0.24;
        return pressure;
      }, 0);
    const safety = attacked
      ? -1
      : Math.max(-1, Math.min(1, 1 - enemyPressure * 0.2));
    const distanceToKing = hexDistance(queen, king);
    const cohesion =
      !queen.queenBonded
        ? Math.max(-1, 1 - distanceToKing * 0.24)
        : Math.max(-1, 1 - Math.max(0, distanceToKing - 4) * 0.28);
    const nearbyAllies = pieces.filter(
      (piece) =>
        piece.id !== queen.id &&
        piece.playerId === playerId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece) &&
        hexDistance(piece, queen) <= 2,
    ).length;
    const lineSupport = Math.min(1, nearbyAllies / 2) * 2 - 1;
    const nurseryRatio =
      queenSpawnCells(pieces, queen).length /
      Math.max(1, neighbors(queen).length);
    const nurserySpace = queen.queenBonded
      ? nurseryRatio * 2 - 1
      : -0.25;
    return (
      safety * 0.58 +
      lineSupport * 0.16 +
      nurserySpace * 0.2 +
      cohesion * 0.06
    );
  });
  const weakestQueen = Math.min(...scores);
  const averageQueen =
    scores.reduce((sum, score) => sum + score, 0) / scores.length;
  // Une seconde reine en danger ne peut plus être masquée par une reine sûre.
  return weakestQueen * 0.72 + averageQueen * 0.28;
}

function withEliminatedPlayer(
  state: GameState,
  playerId: PlayerId,
  exitReason: "escaped" | "checkmate",
): GameState {
  const pieces = state.pieces.filter((piece) => piece.playerId !== playerId);
  return {
    ...state,
    pieces,
    players: synchronizePlayerResources(
      state.players.map((player) =>
        player.id === playerId
          ? { ...player, alive: false, exitReason }
          : player,
      ),
      pieces,
    ),
  };
}

const LOOP_HISTORY_LIMIT = 256;
const LOOP_MAX_CYCLE_LENGTH = 24;
const LOOP_ACTION_HISTORY_LIMIT = 40;

export function loopActionSignatureForMove(
  state: GameState,
  playerId: PlayerId,
  move: Move,
): string {
  const mover = state.pieces.find(
    (piece) => piece.id === move.pieceId && piece.playerId === playerId,
  );
  const source = mover ?? move.to;
  return [
    "route-v1",
    playerId,
    mover?.id ?? move.pieceId,
    mover?.type ?? "unknown",
    `${source.q},${source.r}>${move.to.q},${move.to.r}`,
  ].join("|");
}

export function isLoopActionSignature(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 160 &&
    /^route-v1\|[0-5]\|[^|]{1,96}\|(king|queen|pawn|egg|unknown)\|-?\d+,-?\d+>-?\d+,-?\d+$/.test(
      value,
    )
  );
}

export function repeatedActionTail(actions: string[]): {
  repeatCount: number;
  patternLength: number;
  pattern: string[];
} {
  const empty = { repeatCount: 0, patternLength: 0, pattern: [] as string[] };
  const maximum = Math.min(
    LOOP_ACTION_PATTERN_MAX_LENGTH,
    Math.max(0, actions.length - 1),
  );
  for (let length = maximum; length >= 1; length -= 1) {
    const suffixStart = actions.length - length;
    const suffix = actions.slice(suffixStart);
    for (let start = 0; start < suffixStart; start += 1) {
      if (
        suffix.every(
          (signature, offset) => actions[start + offset] === signature,
        )
      ) {
        return {
          repeatCount: length,
          patternLength: length,
          pattern: suffix,
        };
      }
    }
  }
  return empty;
}

function repeatedTail(history: LoopHistoryEntry[]): {
  repeatCount: number;
  cycleLength: number;
  cycleSignatures: string[];
} {
  const signatures = history.map((entry) => entry.signature);
  let best = { repeatCount: Math.min(1, signatures.length), cycleLength: 0, cycleSignatures: [] as string[] };
  const maximum = Math.min(
    LOOP_MAX_CYCLE_LENGTH,
    Math.floor(signatures.length / 2),
  );
  for (let period = 1; period <= maximum; period += 1) {
    const block = signatures.slice(-period);
    let occurrences = 1;
    for (
      let cursor = signatures.length - period * 2;
      cursor >= 0;
      cursor -= period
    ) {
      const previous = signatures.slice(cursor, cursor + period);
      if (previous.some((signature, index) => signature !== block[index])) break;
      occurrences += 1;
    }
    if (
      occurrences > best.repeatCount ||
      (occurrences === best.repeatCount &&
        occurrences > 1 &&
        (best.cycleLength === 0 || period < best.cycleLength))
    ) {
      best = {
        repeatCount: occurrences,
        cycleLength: period,
        cycleSignatures: block,
      };
    }
  }
  return best;
}

function decisiveLoopProgress(after: GameState): boolean {
  const record = after.lastMove;
  return Boolean(
    record?.capturedType ||
    record?.acidVictimId ||
    record?.eggBlast ||
    record?.promoted ||
    (record?.spawnedCount ?? 0) > 0 ||
    (record?.hatchedCount ?? 0) > 0 ||
    record?.zombieEffects?.some(
      (effect) => effect.kind === "bite" || effect.kind === "expire",
    ),
  );
}

function safeNurseryCellCount(
  pieces: Piece[],
  playerId: PlayerId,
): number {
  const cells = new Set<string>();
  pieces
    .filter(
      (piece) =>
        piece.playerId === playerId &&
        piece.type === "queen" &&
        piece.queenBonded &&
        (piece.breedingTurns ?? 0) <= 0,
    )
    .forEach((queen) =>
      queenSpawnCells(pieces, queen).forEach((coord) => cells.add(coordKey(coord))),
    );
  return cells.size;
}

function mobilityProxyForPlayer(
  state: GameState,
  playerId: PlayerId,
): number {
  return state.pieces
    .filter(
      (piece) =>
        piece.playerId === playerId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece),
    )
    .reduce(
      (total, piece) =>
        total + Math.min(2, pseudoMoveTargets(piece, state.pieces).length),
      0,
    );
}

export function strategicProgressSnapshot(
  state: GameState,
  playerId: PlayerId,
): StrategicProgressSnapshot {
  const promotionDistance = Math.min(
    BOARD_RADIUS * 2,
    ...state.pieces
      .filter(
        (piece) =>
          piece.playerId === playerId &&
          piece.type === "pawn" &&
          !isZombieTermite(piece),
      )
      .map((pawn) => hexDistance(pawn, PLAYER_META[playerId].opposite)),
  );
  const enemyMobility = state.players
    .filter((player) => player.alive && player.id !== playerId)
    .reduce(
      (total, player) => total + mobilityProxyForPlayer(state, player.id),
      0,
    );
  return {
    territoryPotential: territoryForPlayer(state.pieces, playerId).potential,
    nurseryCells: safeNurseryCellCount(state.pieces, playerId),
    eggs: state.pieces.filter(
      (piece) => piece.playerId === playerId && piece.type === "egg",
    ).length,
    enemyMobility,
    promotionDistance,
  };
}

export function emptyStrategyTracker(
  state: GameState,
  playerId: PlayerId,
): ColonyStrategyTracker {
  return {
    stagnantTurns: 0,
    intent: undefined,
    intentTurnsRemaining: 0,
    replanPending: false,
    failedSacrifices: 0,
    reason: undefined,
    lastIntent: undefined,
    best: strategicProgressSnapshot(state, playerId),
  };
}

export function strategyTrackerForPlayer(
  state: GameState,
  playerId: PlayerId,
): ColonyStrategyTracker {
  const tracker = state.strategicTrackers?.[playerId];
  return tracker
    ? {
        ...tracker,
        best: { ...tracker.best },
      }
    : emptyStrategyTracker(state, playerId);
}

function hasPromotionCandidate(
  state: GameState,
  playerId: PlayerId,
): boolean {
  return state.pieces.some(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "pawn" &&
      !isZombieTermite(piece) &&
      hexDistance(piece, PLAYER_META[playerId].opposite) <= 2,
  );
}

export function selectStrategicContextIntent(
  state: GameState,
  playerId: PlayerId,
  previousIntent?: StrategicContextIntent,
  forceAlternative = false,
): StrategicContextIntent {
  const assessment = assessStrategicSituation(state, playerId);
  const status = resourceStatusForPlayer(state.pieces, playerId);
  const queens = state.pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "queen",
  );
  const hasBondedQueen = queens.some(
    (queen) => queen.queenBonded && (queen.breedingTurns ?? 0) <= 0,
  );
  const nurseryCells = safeNurseryCellCount(state.pieces, playerId);
  const eggs = state.pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "egg",
  ).length;
  const royalEmergency =
    isInCheck(state.pieces, playerId) ||
    assessment.kingSafety < -0.12 ||
    assessment.queenSafety < -0.28 ||
    assessment.queenThreatRatio > 0;
  if (royalEmergency) return "secure_royals";

  let preferred: StrategicContextIntent;
  if (hasBondedQueen && status.free >= EGG_RESOURCE_COST && nurseryCells === 0) {
    preferred = "open_nursery";
  } else if (
    hasBondedQueen &&
    status.free >= EGG_RESOURCE_COST &&
    nurseryCells > 0 &&
    eggs === 0
  ) {
    preferred = "lay";
  } else if (hasPromotionCandidate(state, playerId)) {
    preferred = "promotion";
  } else {
    const ownArmy = state.pieces.filter(
      (piece) =>
        piece.playerId === playerId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece),
    ).length;
    const strongestEnemy = Math.max(
      0,
      ...state.players
        .filter((player) => player.alive && player.id !== playerId)
        .map(
          (player) =>
            state.pieces.filter(
              (piece) =>
                piece.playerId === player.id &&
                piece.type !== "egg" &&
                !isZombieTermite(piece),
            ).length,
        ),
    );
    preferred = ownArmy >= strongestEnemy ? "breach" : "border_pressure";
  }

  if (!forceAlternative || preferred !== previousIntent) return preferred;
  if (previousIntent === "open_nursery" || previousIntent === "lay") {
    return "border_pressure";
  }
  if (previousIntent === "border_pressure") return "breach";
  if (previousIntent === "breach") {
    return hasPromotionCandidate(state, playerId) ? "promotion" : "open_nursery";
  }
  if (previousIntent === "promotion") return "border_pressure";
  return preferred;
}

function strategicIntentReason(
  state: GameState,
  playerId: PlayerId,
  intent: StrategicContextIntent,
): string {
  const snapshot = strategicProgressSnapshot(state, playerId);
  const status = resourceStatusForPlayer(state.pieces, playerId);
  if (intent === "secure_royals") {
    return "la sécurité du roi ou de la reine exige une réponse prioritaire";
  }
  if (intent === "open_nursery") {
    return `${status.free} potentiel${status.free > 1 ? "s" : ""} libre${status.free > 1 ? "s" : ""}, mais aucune case de ponte sûre`;
  }
  if (intent === "lay") {
    return `${snapshot.nurseryCells} case${snapshot.nurseryCells > 1 ? "s" : ""} de ponte sûre${snapshot.nurseryCells > 1 ? "s" : ""} disponible${snapshot.nurseryCells > 1 ? "s" : ""}`;
  }
  if (intent === "promotion") {
    return `un pion se trouve à ${snapshot.promotionDistance} pas au plus de la promotion`;
  }
  if (intent === "breach") {
    return "la force disponible permet de tenter une percée mesurable";
  }
  return "la frontière ennemie doit être mise sous pression sans exposer les royaux";
}

function strategicMoveMadeProgress(
  after: GameState,
  playerId: PlayerId,
  best: StrategicProgressSnapshot,
): boolean {
  const record = after.lastMove;
  if (
    record?.capturedType ||
    record?.acidVictimId ||
    record?.eggBlast ||
    record?.promoted ||
    (record?.spawnedCount ?? 0) > 0 ||
    (record?.hatchedCount ?? 0) > 0 ||
    record?.zombieEffects?.some(
      (effect) => effect.kind === "spawn" || effect.kind === "bite" || effect.kind === "expire",
    )
  ) {
    return true;
  }
  const current = strategicProgressSnapshot(after, playerId);
  return (
    current.territoryPotential > best.territoryPotential ||
    current.nurseryCells > best.nurseryCells ||
    current.eggs > best.eggs ||
    current.enemyMobility < best.enemyMobility ||
    current.promotionDistance < best.promotionDistance
  );
}

function updateStrategicTrackerAfterMove(
  before: GameState,
  after: GameState,
  playerId: PlayerId,
  move: Move,
): GameState {
  const previous = strategyTrackerForPlayer(before, playerId);
  const progressed = strategicMoveMadeProgress(after, playerId, previous.best);
  const player = after.players.find((candidate) => candidate.id === playerId);
  const usedIntent = move.contextIntent ?? previous.intent;
  let result: StrategicContextResult | undefined;
  let tracker: ColonyStrategyTracker;
  let strategyMessage: string | undefined;

  if (progressed) {
    if (usedIntent) {
      result = move.contextSacrifice ? "sacrifice_progress" : "progress";
      strategyMessage = `RÉORIENTATION RÉUSSIE : ${player?.name ?? PLAYER_META[playerId].name} obtient un progrès avec ${STRATEGIC_INTENT_LABEL[usedIntent]}.`;
    }
    tracker = emptyStrategyTracker(after, playerId);
    tracker.lastIntent = usedIntent ?? previous.lastIntent;
  } else {
    const stagnantTurns = Math.min(99, previous.stagnantTurns + 1);
    const remaining = previous.intent
      ? Math.max(0, previous.intentTurnsRemaining - 1)
      : 0;
    const failedSacrifices = Math.min(
      STRATEGIC_SACRIFICE_FAILURE_LIMIT,
      previous.failedSacrifices + (move.contextSacrifice ? 1 : 0),
    );
    const shouldCreatePlan =
      player?.role === "ai" &&
      !previous.intent &&
      stagnantTurns >= STRATEGIC_STAGNATION_TURNS;
    const shouldReplacePlan =
      player?.role === "ai" &&
      Boolean(previous.intent) &&
      (remaining === 0 ||
        failedSacrifices >= STRATEGIC_SACRIFICE_FAILURE_LIMIT);

    if (shouldCreatePlan || shouldReplacePlan) {
      const intent = selectStrategicContextIntent(
        after,
        playerId,
        previous.intent,
        shouldReplacePlan,
      );
      const reason = strategicIntentReason(after, playerId, intent);
      tracker = {
        stagnantTurns,
        intent,
        intentTurnsRemaining: STRATEGIC_INTENT_TURNS,
        replanPending: true,
        failedSacrifices: 0,
        reason,
        lastIntent: previous.intent ?? previous.lastIntent,
        best: { ...previous.best },
      };
      if (shouldReplacePlan) {
        result = move.contextSacrifice ? "sacrifice_stalled" : "stalled";
        strategyMessage = `RÉANALYSE STRATÉGIQUE : ${player?.name ?? PLAYER_META[playerId].name} abandonne ${STRATEGIC_INTENT_LABEL[previous.intent!]} et choisit ${STRATEGIC_INTENT_LABEL[intent]} — ${reason}.`;
      } else {
        strategyMessage = `ANALYSE STRATÉGIQUE — 4 TOURS SANS PROGRÈS : ${player?.name ?? PLAYER_META[playerId].name} choisit ${STRATEGIC_INTENT_LABEL[intent]} — ${reason}.`;
      }
    } else {
      result = previous.intent ? "continuing" : undefined;
      tracker = {
        ...previous,
        stagnantTurns,
        intentTurnsRemaining: remaining,
        replanPending: previous.replanPending && !move.contextReplan,
        failedSacrifices,
      };
    }
  }

  let nextState: GameState = {
    ...after,
    strategicTrackers: {
      ...(after.strategicTrackers ?? before.strategicTrackers ?? {}),
      [playerId]: tracker,
    },
    lastMove: after.lastMove
      ? {
          ...after.lastMove,
          contextReplan: Boolean(move.contextReplan),
          contextIntent: usedIntent,
          contextReason: previous.reason ?? tracker.reason,
          contextResult: result,
          contextSacrifice: Boolean(move.contextSacrifice),
        }
      : after.lastMove,
  };
  if (strategyMessage) {
    nextState = {
      ...nextState,
      event: `${nextState.event} ${strategyMessage}`,
      log: [strategyMessage, ...nextState.log].slice(0, 12),
      teamLogs: prependTeamLogEntries(nextState.teamLogs, playerId, [
        {
          id: `journal-${after.moveNumber}-${playerId}-strategy`,
          turn: after.moveNumber,
          round: after.round,
          kind: "strategy",
          message: strategyMessage,
        },
      ]),
    };
  }
  return nextState;
}

function deterministicIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  const hash = Number.parseInt(tacticalHash(seed, 2_166_136_261), 36);
  return (Number.isFinite(hash) ? hash >>> 0 : 0) % length;
}

function royalCocoonBlocksZombie(pieces: Piece[], coord: Coord): boolean {
  return activeRoyalCocoons(pieces).some(
    (pair) =>
      hexDistance(coord, pair.king) <= ROYAL_COCOON_RADIUS ||
      hexDistance(coord, pair.queen) <= ROYAL_COCOON_RADIUS,
  );
}

function zombiePathToTarget(
  pieces: Piece[],
  zombie: Piece,
  target: Piece,
): Coord[] | undefined {
  const queue: Array<{ coord: Coord; path: Coord[] }> = [
    { coord: { q: zombie.q, r: zombie.r }, path: [] },
  ];
  const visited = new Set([coordKey(zombie)]);
  while (queue.length) {
    const current = queue.shift()!;
    const nextCells = neighbors(current.coord).sort(
      (left, right) => left.q - right.q || left.r - right.r,
    );
    for (const cell of nextCells) {
      const key = coordKey(cell);
      if (visited.has(key)) continue;
      visited.add(key);
      const occupant = pieceAt(pieces, cell);
      const isTarget = occupant?.id === target.id;
      if (isTarget) return [...current.path, cell];
      if (royalCocoonBlocksZombie(pieces, cell)) continue;
      if (occupant) {
        const directlyEncounteredEnemyRoyal =
          occupant.playerId !== zombie.playerId &&
          (occupant.type === "king" || occupant.type === "queen");
        if (!directlyEncounteredEnemyRoyal) continue;
      }
      queue.push({ coord: cell, path: [...current.path, cell] });
    }
  }
  return undefined;
}

function activateZombieTermites(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const zombies = state.pieces
    .filter(
      (piece) => piece.playerId === playerId && isZombieTermite(piece),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!zombies.length) return state;

  let pieces = state.pieces;
  const effects: ZombieEffect[] = [];
  const messages: string[] = [];
  zombies.forEach((originalZombie) => {
    const zombie = pieces.find((piece) => piece.id === originalZombie.id);
    if (!zombie || !isZombieTermite(zombie)) return;
    const targets = pieces
      .filter(
        (piece) =>
          piece.playerId === playerId &&
          piece.id !== zombie.id &&
          !isZombieTermite(piece) &&
          (piece.type === "pawn" || piece.type === "egg"),
      )
      .map((target) => ({
        target,
        path: zombiePathToTarget(pieces, zombie, target),
      }))
      .filter(
        (candidate): candidate is { target: Piece; path: Coord[] } =>
          Boolean(candidate.path?.length),
      );
    const shortest = targets.length
      ? Math.min(...targets.map((candidate) => candidate.path.length))
      : Number.POSITIVE_INFINITY;
    const nearest = targets
      .filter((candidate) => candidate.path.length === shortest)
      .sort(
        (left, right) =>
          coordKey(left.target).localeCompare(coordKey(right.target)) ||
          left.target.id.localeCompare(right.target.id),
      );
    const activation =
      ZOMBIE_ACTIVATIONS - (zombie.zombieActivationsRemaining ?? ZOMBIE_ACTIVATIONS) + 1;
    const selected = nearest.length
      ? nearest[
          deterministicIndex(
            `${state.matchId}|${zombie.id}|${activation}|target`,
            nearest.length,
          )
        ]
      : undefined;
    const from = { q: zombie.q, r: zombie.r };
    const to = selected?.path[0] ?? from;
    const victim = pieceAt(pieces, to);
    const edibleVictim =
      victim && victim.id !== zombie.id &&
      ((victim.playerId === playerId &&
        !isZombieTermite(victim) &&
        (victim.type === "pawn" || victim.type === "egg")) ||
        (victim.playerId !== playerId &&
          (victim.type === "king" || victim.type === "queen")))
        ? victim
        : undefined;
    const remaining = Math.max(
      0,
      (zombie.zombieActivationsRemaining ?? ZOMBIE_ACTIVATIONS) - 1,
    );
    if (edibleVictim) {
      pieces = pieces.filter((piece) => piece.id !== edibleVictim.id);
    }
    pieces = pieces.map((piece) =>
      piece.id === zombie.id
        ? { ...piece, ...to, zombieActivationsRemaining: remaining }
        : piece,
    );
    const victimEffect = edibleVictim
      ? {
          pieceId: edibleVictim.id,
          playerId: edibleVictim.playerId,
          pieceType: edibleVictim.type,
          coord: { q: edibleVictim.q, r: edibleVictim.r },
        }
      : undefined;
    effects.push({
      id: `zombie-${state.moveNumber}-${zombie.id}-${activation}`,
      zombieId: zombie.id,
      playerId,
      kind: edibleVictim ? "bite" : "move",
      from,
      to: { ...to },
      remainingActivations: remaining,
      victim: victimEffect,
    });
    if (edibleVictim) {
      messages.push(
        edibleVictim.playerId === playerId
          ? `Le termite zombie de ${state.players.find((player) => player.id === playerId)?.name ?? PLAYER_META[playerId].name} dévore son ${PIECE_LABEL[edibleVictim.type].toLowerCase()}.`
          : `Le termite zombie rencontre directement la ${PIECE_LABEL[edibleVictim.type].toLowerCase()} ennemie de ${state.players.find((player) => player.id === edibleVictim.playerId)?.name ?? PLAYER_META[edibleVictim.playerId].name} et la dévore.`,
      );
    } else {
      const ownerName =
        state.players.find((player) => player.id === playerId)?.name ??
        PLAYER_META[playerId].name;
      messages.push(
        selected
          ? `Le termite zombie de ${ownerName} s’active, avance vers sa proie alliée et conserve ${remaining} activation${remaining > 1 ? "s" : ""}.`
          : `Le termite zombie de ${ownerName} s’active et rôde sur place faute de proie alliée accessible ; ${remaining} activation${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}.`,
      );
    }
    if (remaining === 0) {
      pieces = pieces.filter((piece) => piece.id !== zombie.id);
      effects.push({
        id: `zombie-${state.moveNumber}-${zombie.id}-expire`,
        zombieId: zombie.id,
        playerId,
        kind: "expire",
        from: { ...to },
        to: { ...to },
        remainingActivations: 0,
      });
      messages.push(
        "Après sa dixième activation, le termite zombie explose sur sa seule case et disparaît sans onde voisine.",
      );
    }
  });

  const message = messages.join(" ");
  return {
    ...state,
    pieces,
    players: synchronizePlayerResources(state.players, pieces),
    event: message ? `${state.event} ${message}` : state.event,
    log: message ? [message, ...state.log].slice(0, 12) : state.log,
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          zombieEffects: [
            ...(state.lastMove.zombieEffects ?? []),
            ...effects,
          ],
        }
      : state.lastMove,
    teamLogs: prependTeamLogEntries(state.teamLogs, playerId, [
      {
        id: `journal-${state.moveNumber}-${playerId}-zombie-activation`,
        turn: state.moveNumber,
        round: state.round,
        kind: "zombie",
        message: message || "Le termite zombie s'active mais ne trouve aucune proie accessible.",
      },
    ]),
  };
}

function spawnLoopZombie(
  state: GameState,
  playerId: PlayerId,
  source: Coord,
): GameState {
  if (pieceAt(state.pieces, source)) return state;
  const playerName =
    state.players.find((player) => player.id === playerId)?.name ??
    PLAYER_META[playerId].name;
  const zombie: Piece = {
    id: `p${playerId}-zombie-${state.moveNumber}`,
    playerId,
    type: "pawn",
    level: PIECE_LEVEL.pawn,
    q: source.q,
    r: source.r,
    breedingTurns: 0,
    zombieActivationsRemaining: ZOMBIE_ACTIVATIONS,
    zombieBornMoveNumber: state.moveNumber,
  };
  const effect: ZombieEffect = {
    id: `zombie-${state.moveNumber}-${playerId}-spawn`,
    zombieId: zombie.id,
    playerId,
    kind: "spawn",
    from: { ...source },
    to: { ...source },
    remainingActivations: ZOMBIE_ACTIVATIONS,
  };
  const message = `Répétition abusive : un termite zombie de ${playerName} surgit sur la case libérée. Invincible et autonome, il chassera les unités de sa propre colonie pendant exactement ${ZOMBIE_ACTIVATIONS} activations.`;
  const pieces = [...state.pieces, zombie];
  return {
    ...state,
    pieces,
    players: synchronizePlayerResources(state.players, pieces),
    event: `${state.event} ${message}`,
    log: [message, ...state.log].slice(0, 12),
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          antiLoopPenalty: true,
          zombieEffects: [...(state.lastMove.zombieEffects ?? []), effect],
        }
      : state.lastMove,
    teamLogs: prependTeamLogEntries(state.teamLogs, playerId, [
      {
        id: `journal-${state.moveNumber}-${playerId}-loop-zombie`,
        turn: state.moveNumber,
        round: state.round,
        kind: "zombie",
        message,
      },
    ]),
  };
}

function updateLoopTrackerAfterMove(
  before: GameState,
  after: GameState,
  playerId: PlayerId,
  move: Move,
  source: Coord,
  hadSafeAlternative: boolean,
): GameState {
  const previous = loopTrackerForPlayer(before, playerId);
  const beforeTerritoryPotential = territoryForPlayer(
    before.pieces,
    playerId,
  ).potential;
  const afterTerritoryPotential = territoryForPlayer(
    after.pieces,
    playerId,
  ).potential;
  const previousBestTerritoryPotential = Math.max(
    previous.bestTerritoryPotential,
    beforeTerritoryPotential,
  );
  const durableTerritoryProgress =
    afterTerritoryPotential > previousBestTerritoryPotential;
  const reset =
    decisiveLoopProgress(after) ||
    durableTerritoryProgress ||
    !hadSafeAlternative;
  let tracker = reset
    ? emptyLoopTracker(afterTerritoryPotential)
    : {
        ...previous,
        bestTerritoryPotential: previousBestTerritoryPotential,
      };
  if (!reset) {
    const actionHistory = [
      ...previous.actionHistory,
      loopActionSignatureForMove(before, playerId, move),
    ].slice(-LOOP_ACTION_HISTORY_LIMIT);
    const repeatedActions = repeatedActionTail(actionHistory);
    const signature = strategicPositionSignature(after);
    const expected = previous.cycleSignatures[0];
    const cycleBroken =
      previous.repeatCount > 1 &&
      previous.cycleSignatures.length > 0 &&
      signature !== expected;
    const history = [
      ...(cycleBroken ? [] : previous.history),
      { signature, hadSafeAlternative },
    ].slice(-LOOP_HISTORY_LIMIT);
    const repeated = repeatedTail(history);
    tracker = {
      history,
      ...repeated,
      actionHistory,
      actionRepeatCount: repeatedActions.repeatCount,
      actionPatternLength: repeatedActions.patternLength,
      actionPattern: repeatedActions.pattern,
      bestTerritoryPotential: previousBestTerritoryPotential,
      escapeAttempted:
        Math.max(repeated.repeatCount, repeatedActions.repeatCount) <= 1
          ? false
          : previous.escapeAttempted || Boolean(move.antiLoopEscape),
    };
  }
  let nextState: GameState = {
    ...after,
    loopTrackers: {
      ...(after.loopTrackers ?? before.loopTrackers ?? {}),
      [playerId]: tracker,
    },
    lastMove: after.lastMove
      ? { ...after.lastMove, antiLoopEscape: Boolean(move.antiLoopEscape) }
      : after.lastMove,
  };
  const colonyName =
    after.players.find((player) => player.id === playerId)?.name ??
    PLAYER_META[playerId].name;
  const effectiveRepetition = effectiveLoopRepetition(tracker);
  const previousEffectiveRepetition = effectiveLoopRepetition(previous);
  const repetitionKind =
    tracker.actionRepeatCount >= tracker.repeatCount &&
    tracker.actionRepeatCount > 0
      ? "une trajectoire exacte déjà parcourue"
      : "un cycle tactique";
  const loopMessage = move.antiLoopEscape
    ? `BOUCLE ${LOOP_ESCAPE_REPETITION}/${LOOP_REPETITION_LIMIT} — ÉVASION : ${colonyName} tente un unique coup hors cycle avec une copie temporairement perturbée de ses poids non protégés.`
    : effectiveRepetition >= LOOP_WARNING_REPETITION &&
        previousEffectiveRepetition < LOOP_WARNING_REPETITION
      ? `BOUCLE ${LOOP_WARNING_REPETITION}/${LOOP_REPETITION_LIMIT} : ${colonyName} répète ${repetitionKind} évitable. Une évasion sera imposée avant la cinquième répétition.`
      : undefined;
  if (loopMessage) {
    nextState = {
      ...nextState,
      event: `${nextState.event} ${loopMessage}`,
      log: [loopMessage, ...nextState.log].slice(0, 12),
      teamLogs: prependTeamLogEntries(nextState.teamLogs, playerId, [
        {
          id: `journal-${after.moveNumber}-${playerId}-anti-loop`,
          turn: after.moveNumber,
          round: after.round,
          kind: "loop",
          message: loopMessage,
        },
      ]),
    };
  }
  if (effectiveRepetition >= LOOP_REPETITION_LIMIT) {
    nextState = spawnLoopZombie(nextState, playerId, source);
    nextState = {
      ...nextState,
      loopTrackers: {
        ...(nextState.loopTrackers ?? {}),
        [playerId]: emptyLoopTracker(
          territoryForPlayer(nextState.pieces, playerId).potential,
        ),
      },
    };
  }
  return nextState;
}

export function antiLoopLearningPenalty(state: GameState): number {
  return state.lastMove?.antiLoopPenalty ? ANTI_LOOP_LEARNING_PENALTY : 0;
}

export function contextLearningAdjustment(state: GameState): number {
  const result = state.lastMove?.contextResult;
  if (result === "sacrifice_progress") return 0.48;
  if (result === "progress") return 0.34;
  if (result === "sacrifice_stalled") return -0.68;
  if (result === "stalled") return -0.42;
  return 0;
}

function royalCocoonEffect(
  kind: RoyalCocoonEffect["kind"],
  playerId: PlayerId,
  king: Piece,
  queen: Piece,
  turnsRemaining: number,
  completedTurn: number,
): RoyalCocoonEffect {
  return {
    id: `royal-cocoon-${completedTurn}-${playerId}-${queen.id}-${kind}`,
    kind,
    playerId,
    kingId: king.id,
    queenId: queen.id,
    kingCoord: { q: king.q, r: king.r },
    queenCoord: { q: queen.q, r: queen.r },
    turnsRemaining,
  };
}

function advanceRoyalCocoonCycle(
  previousPieces: Piece[],
  movedPieces: Piece[],
  playerId: PlayerId,
  completedTurn: number,
): {
  pieces: Piece[];
  effects: RoyalCocoonEffect[];
  completedQueens: number;
} {
  let pieces = movedPieces;
  const effects: RoyalCocoonEffect[] = [];
  let completedQueens = 0;

  activeRoyalCocoons(previousPieces)
    .filter((pair) => pair.playerId === playerId)
    .forEach((previousPair) => {
      const king = pieces.find((piece) => piece.id === previousPair.king.id);
      const queen = pieces.find((piece) => piece.id === previousPair.queen.id);
      if (
        !king ||
        !queen ||
        king.type !== "king" ||
        queen.type !== "queen" ||
        hexDistance(king, queen) !== 1
      ) {
        return;
      }
      const turnsRemaining = Math.max(0, previousPair.turnsRemaining - 1);
      if (turnsRemaining === 0) {
        pieces = pieces.map((piece) => {
          if (piece.id === king.id) {
            return {
              ...piece,
              breedingTurns: 0,
              breedingPartnerId: undefined,
            };
          }
          if (piece.id === queen.id) {
            return {
              ...piece,
              breedingTurns: 0,
              breedingPartnerId: undefined,
              queenBonded: true,
            };
          }
          return piece;
        });
        effects.push(
          royalCocoonEffect(
            "completed",
            playerId,
            king,
            queen,
            0,
            completedTurn,
          ),
        );
        completedQueens += 1;
        return;
      }
      pieces = pieces.map((piece) =>
        piece.id === king.id
          ? {
              ...piece,
              breedingTurns: turnsRemaining,
              breedingPartnerId: queen.id,
            }
          : piece.id === queen.id
            ? {
                ...piece,
                breedingTurns: turnsRemaining,
                breedingPartnerId: king.id,
              }
            : piece,
      );
    });

  let king = pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  if (!king || king.breedingPartnerId || (king.breedingTurns ?? 0) > 0) {
    return { pieces, effects, completedQueens };
  }
  const queen = pieces.find(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "queen" &&
      !piece.queenBonded &&
      !piece.breedingPartnerId &&
      (piece.breedingTurns ?? 0) <= 0 &&
      hexDistance(piece, king!) === 1,
  );
  if (!queen) return { pieces, effects, completedQueens };
  pieces = pieces.map((piece) =>
    piece.id === king!.id
      ? {
          ...piece,
          breedingTurns: ROYAL_COCOON_TURNS,
          breedingPartnerId: queen.id,
        }
      : piece.id === queen.id
        ? {
            ...piece,
            breedingTurns: ROYAL_COCOON_TURNS,
            breedingPartnerId: king!.id,
            queenBonded: false,
          }
        : piece,
  );
  king = pieces.find((piece) => piece.id === king!.id)!;
  const cocoonQueen = pieces.find((piece) => piece.id === queen.id)!;
  effects.push(
    royalCocoonEffect(
      "started",
      playerId,
      king,
      cocoonQueen,
      ROYAL_COCOON_TURNS,
      completedTurn,
    ),
  );
  return { pieces, effects, completedQueens };
}

function advanceFrozenRoyalCocoonTurn(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const activeBefore = activeRoyalCocoons(state.pieces).filter(
    (pair) => pair.playerId === playerId,
  );
  if (!activeBefore.length) return state;

  const completedTurn = state.moveNumber + 1;
  const cycle = advanceRoyalCocoonCycle(
    state.pieces,
    state.pieces,
    playerId,
    completedTurn,
  );
  const remainingPair = activeRoyalCocoons(cycle.pieces).find(
    (pair) => pair.playerId === playerId,
  );
  const playerName =
    state.players.find((player) => player.id === playerId)?.name ??
    PLAYER_META[playerId].name;
  const completed = cycle.completedQueens > 0;
  const restarted = cycle.effects.some((effect) => effect.kind === "started");
  const message = completed
    ? restarted
      ? `${playerName} achève un rituel, puis une autre reine rejoint aussitôt le roi : une nouvelle forteresse opaque se referme.`
      : `${playerName} achève ses trois tours de rituel. La forteresse s’ouvre, la reine devient fertile et toutes les pièces enfermées sont libérées.`
    : `${playerName} passe son tour dans la forteresse opaque : aucune pièce enfermée ne peut bouger. ${remainingPair?.turnsRemaining ?? 0} tour${(remainingPair?.turnsRemaining ?? 0) > 1 ? "s" : ""} de rituel restant${(remainingPair?.turnsRemaining ?? 0) > 1 ? "s" : ""}.`;
  const round = Math.floor(completedTurn / state.turnOrder.length) + 1;
  const players = synchronizePlayerResources(
    state.players.map((player) =>
      player.id === playerId
        ? { ...player, personalTurns: player.personalTurns + 1 }
        : player,
    ),
    cycle.pieces,
  );

  return {
    ...state,
    pieces: cycle.pieces,
    players,
    moveNumber: completedTurn,
    round,
    event: `${state.event} ${message}`,
    log: [message, ...state.log].slice(0, 12),
    teamLogs: prependTeamLogEntries(state.teamLogs, playerId, [
      {
        id: `journal-${completedTurn}-${playerId}-cocoon-fortress`,
        turn: completedTurn,
        round,
        kind: completed ? "reproduction" : "system",
        message,
      },
    ]),
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          royalCocoonEffects: cycle.effects,
        }
      : state.lastMove,
  };
}

export function isTurnBlockedByRoyalCocoon(
  state: GameState,
  playerId: PlayerId = currentPlayerId(state),
): boolean {
  if (allLegalMoves(state, playerId).length > 0) return false;
  return (
    activeRoyalCocoons(state.pieces).some(
      (pair) => pair.playerId === playerId,
    ) || turnBlockedOnlyByEnemyCocoon(state, playerId)
  );
}

export function passTurnBlockedByRoyalCocoon(state: GameState): GameState {
  if (state.winnerId !== undefined || state.drawReason) return state;
  const playerId = currentPlayerId(state);
  if (!isTurnBlockedByRoyalCocoon(state, playerId)) return state;
  const playerName =
    state.players.find((player) => player.id === playerId)?.name ??
    PLAYER_META[playerId].name;
  const ownsFortress = activeRoyalCocoons(state.pieces).some(
    (pair) => pair.playerId === playerId,
  );
  let nextState = ownsFortress
    ? advanceFrozenRoyalCocoonTurn(state, playerId)
    : state;

  if (!ownsFortress) {
    const pause = `${playerName} ne peut pas pénétrer dans la forteresse-cocon adverse. Son tour passe sans élimination.`;
    nextState = {
      ...nextState,
      event: `${nextState.event} ${pause}`,
      log: [pause, ...nextState.log].slice(0, 12),
      teamLogs: prependTeamLogEntries(nextState.teamLogs, playerId, [
        {
          id: `journal-${nextState.moveNumber}-${playerId}-cocoon-pause`,
          turn: nextState.moveNumber,
          round: nextState.round,
          kind: "system",
          message: pause,
        },
      ]),
      lastMove: nextState.lastMove
        ? { ...nextState.lastMove, royalCocoonEffects: [] }
        : nextState.lastMove,
    };
  }

  nextState = activateZombieTermites(nextState, playerId);
  nextState = {
    ...nextState,
    loopTrackers: {
      ...(nextState.loopTrackers ?? {}),
      [playerId]: emptyLoopTracker(
        territoryForPlayer(nextState.pieces, playerId).potential,
      ),
    },
    strategicTrackers: {
      ...(nextState.strategicTrackers ?? {}),
      [playerId]: emptyStrategyTracker(nextState, playerId),
    },
  };

  let cursor = (state.turnIndex + 1) % state.turnOrder.length;
  for (let attempts = 0; attempts < state.turnOrder.length; attempts += 1) {
    const candidateId = state.turnOrder[cursor];
    if (nextState.players.find((player) => player.id === candidateId)?.alive) {
      return { ...nextState, turnIndex: cursor };
    }
    cursor = (cursor + 1) % state.turnOrder.length;
  }
  return nextState;
}

interface ApplyMoveOptions {
  skipLoopTracking?: boolean;
}

export function applyMove(
  state: GameState,
  move: Move,
  options: ApplyMoveOptions = {},
): GameState {
  if (state.winnerId !== undefined || state.drawReason) return state;
  const activePlayerId = currentPlayerId(state);
  const mover = state.pieces.find((piece) => piece.id === move.pieceId);
  if (!mover || mover.playerId !== activePlayerId) return state;
  const legal = legalMovesForPiece(state, move.pieceId).some((candidate) =>
    sameCoord(candidate.to, move.to),
  );
  if (!legal) return state;
  const hadSafeAlternative = options.skipLoopTracking
    ? false
    : hasOtherLegalSafeMove(state, activePlayerId, move);

  const captured = pieceAt(state.pieces, move.to);
  const acidVictim = queenCrossedByJump(state.pieces, move);
  const eggBlastVictims = eggBlastVictimsForMove(state.pieces, move);
  const eggBlast: EggBlastEffect | undefined =
    captured?.type === "egg"
      ? {
          center: { q: captured.q, r: captured.r },
          victims: eggBlastVictims.map((victim) => ({
            pieceId: victim.id,
            playerId: victim.playerId,
            pieceType: victim.type,
            coord: { q: victim.q, r: victim.r },
          })),
        }
      : undefined;
  const royalSacrifice: RoyalSacrificeEffect | undefined =
    mover.type === "king" &&
    captured?.playerId === activePlayerId &&
    (captured.type === "pawn" || captured.type === "queen")
      ? {
          pieceId: captured.id,
          pieceType: captured.type,
          playerId: captured.playerId,
          coord: { q: captured.q, r: captured.r },
        }
      : undefined;
  const from = { q: mover.q, r: mover.r };
  const activePlayer = state.players.find(
    (player) => player.id === activePlayerId,
  );
  const playerName = (playerId: PlayerId) =>
    state.players.find((player) => player.id === playerId)?.name ??
    PLAYER_META[playerId].name;
  const willPromote =
    mover.type === "pawn" &&
    sameCoord(move.to, PLAYER_META[mover.playerId].opposite);
  const promotionCost = willPromote
    ? queenPromotionCost(state.pieces, activePlayerId)
    : 0;
  const promotionExtraCost = willPromote
    ? Math.max(0, promotionCost - PAWN_RESOURCE_COST)
    : 0;
  const canonicalHumanDecision =
    activePlayer?.role === "human"
      ? canonicalDecisionForPlayer(state, move, activePlayerId)
      : undefined;
  const canonicalHumanMover = canonicalHumanDecision?.state.pieces.find(
    (piece) => piece.id === mover.id,
  );
  const humanMoveFrame: HumanMoveFrame | undefined =
    activePlayer?.role === "human" &&
    canonicalHumanDecision &&
    canonicalHumanMover
      ? {
          ply: state.moveNumber + 1,
          round: state.round,
          playerId: activePlayerId,
          canonicalPlayerId: 0,
          perspectiveRotationSteps: canonicalHumanDecision.rotationSteps,
          features: moveFeatures(state, move),
          position: {
            pieces: canonicalHumanDecision.state.pieces.map((piece) => ({
              id: piece.id,
              playerId: piece.playerId,
              type: piece.type,
              q: piece.q,
              r: piece.r,
              level: piece.level,
              breedingTurns: piece.breedingTurns ?? 0,
              breedingPartnerId: piece.breedingPartnerId,
              hatchTurns: piece.hatchTurns ?? 0,
              promoted: Boolean(piece.promoted),
              queenBonded: Boolean(piece.queenBonded),
            })),
            players: canonicalHumanDecision.state.players.map((player) => ({
              id: player.id,
              role: player.role,
              alive: player.alive,
              resources: player.resources,
              resourcesEarned: player.resourcesEarned ?? player.resources,
              personalTurns: player.personalTurns,
              solitaryKingTurns: player.solitaryKingTurns ?? 0,
            })),
          },
          action: {
            pieceId: mover.id,
            pieceType: mover.type,
            from: { q: canonicalHumanMover.q, r: canonicalHumanMover.r },
            to: { ...canonicalHumanDecision.move.to },
            capturedType: royalSacrifice
              ? undefined
              : captured?.type ?? acidVictim?.type,
            antiLoopEscape: Boolean(move.antiLoopEscape),
          },
        }
      : undefined;
  let pieces = movePieces(state.pieces, move);
  const movedPiece = pieces.find((piece) => piece.id === mover.id)!;
  const promoted = mover.type === "pawn" && movedPiece.type === "queen";
  let spawned = false;
  const spawnedCoords: Coord[] = [];
  const hatchedCoords: Coord[] = [];
  const notices: GameNotice[] = [];
  let players = state.players.map((player) => {
    if (player.id !== activePlayerId) return player;
    const personalTurns = player.personalTurns + 1;
    return {
      ...player,
      personalTurns,
    };
  });
  const completedTurn = state.moveNumber + 1;
  pieces = pieces.map((piece) => {
    if (piece.playerId !== activePlayerId) return piece;
    if (piece.type === "egg") {
      const hatchTurns = Math.max(
        0,
        (piece.hatchTurns ?? EGG_HATCH_TURNS) - 1,
      );
      if (hatchTurns === 0) {
        hatchedCoords.push({ q: piece.q, r: piece.r });
        return {
          ...piece,
          type: "pawn" as const,
          level: PIECE_LEVEL.pawn,
          hatchTurns: undefined,
          breedingTurns: 0,
          breedingPartnerId: undefined,
        };
      }
      return {
        ...piece,
        hatchTurns,
        breedingTurns: 0,
        breedingPartnerId: undefined,
      };
    }
    return piece;
  });
  const cocoonCycle = advanceRoyalCocoonCycle(
    state.pieces,
    pieces,
    activePlayerId,
    completedTurn,
  );
  pieces = cocoonCycle.pieces;
  const royalCocoonEffects = cocoonCycle.effects;
  const newlyBondedQueens = cocoonCycle.completedQueens;
  const king = pieces.find(
    (piece) => piece.playerId === activePlayerId && piece.type === "king",
  );

  players = synchronizePlayerResources(players, pieces);
  let remainingResources = players.find(
    (player) => player.id === activePlayerId,
  )!.resources;
  const availableForSpawn = remainingResources;
  const fertileQueens = king
    ? pieces.filter(
        (piece) =>
          piece.playerId === activePlayerId &&
          piece.type === "queen" &&
          piece.queenBonded,
      )
    : [];
  fertileQueens.forEach((queen) => {
    let currentQueen = pieces.find((piece) => piece.id === queen.id) ?? queen;
    while (remainingResources >= EGG_RESOURCE_COST) {
      const spawnCell = nextQueenSpawnCell(pieces, currentQueen);
      if (!spawnCell) break;
      remainingResources -= EGG_RESOURCE_COST;
      spawnedCoords.push({ ...spawnCell });
      pieces = [
        ...pieces,
        {
          id: `p${activePlayerId}-egg-${state.moveNumber + 1}-${spawnedCoords.length - 1}`,
          playerId: activePlayerId,
          type: "egg",
          level: PIECE_LEVEL.egg,
          hatchTurns: EGG_HATCH_TURNS,
          breedingTurns: 0,
          ...spawnCell,
        },
      ];
      currentQueen = pieces.find((piece) => piece.id === queen.id) ?? queen;
    }
  });
  spawned = spawnedCoords.length > 0;
  const noticeBase = `${state.moveNumber + 1}-${activePlayerId}-eggs`;
  if (spawned) {
    const spent = spawnedCoords.length * EGG_RESOURCE_COST;
    const capacity = resourceCapacityForPlayer(pieces, activePlayerId);
    notices.push({
      id: `${noticeBase}-success`,
      playerId: activePlayerId,
      kind: "reproduction-success",
      pieceType: "egg",
      message: `😀 ${spawnedCoords.length} œuf${spawnedCoords.length > 1 ? "s" : ""} pondu${spawnedCoords.length > 1 ? "s" : ""} : ${spent} potentiel${spent > 1 ? "s" : ""} de cristal mobilisé${spent > 1 ? "s" : ""} sur ${availableForSpawn} libres · ${remainingResources} libres sur ${capacity}. Éclosion dans ${EGG_HATCH_TURNS} tours de la colonie.`,
    });
  } else if (fertileQueens.length > 0) {
    const hasSpace = fertileQueens.some(
      (queen) => queenSpawnCells(pieces, queen).length > 0,
    );
    notices.push({
      id: `${noticeBase}-failure`,
      playerId: activePlayerId,
      kind: hasSpace
        ? "reproduction-resource-fail"
        : "reproduction-space-fail",
      pieceType: "egg",
      message: hasSpace
        ? `😞 Ponte impossible : aucun potentiel de cristal libre ; ${EGG_RESOURCE_COST} nécessaire par œuf.`
        : `🛡️ Ponte suspendue : aucune case libre et sûre autour des reines. La colonie doit d’abord ouvrir une nurserie hors de portée d’un écrasement adverse ; ${availableForSpawn} potentiel${availableForSpawn > 1 ? "s" : ""} libre${availableForSpawn > 1 ? "s" : ""}.`,
    });
  }
  players = synchronizePlayerResources(players, pieces);
  const activePieces = pieces.filter(
    (piece) => piece.playerId === activePlayerId,
  );
  const activeKingIsAlone =
    activePieces.some((piece) => piece.type === "king") &&
    !activePieces.some(
      (piece) =>
        piece.type === "queen" ||
        (piece.type === "pawn" && !isZombieTermite(piece)),
    );
  players = players.map((player) =>
    player.id === activePlayerId
      ? {
          ...player,
          solitaryKingTurns: activeKingIsAlone
            ? (player.solitaryKingTurns ?? 0) + 1
            : 0,
        }
      : player,
  );

  const moveName = PIECE_LABEL[mover.type];
  const eventParts = [`${playerName(activePlayerId)} déplace son ${moveName.toLowerCase()}.`];
  if (captured?.type === "egg") {
    eventParts.push(
      captured.playerId === activePlayerId
        ? "Un œuf de la colonie est écrasé avant son éclosion."
        : `L’œuf de ${playerName(captured.playerId)} est écrasé avant son éclosion.`,
    );
  } else if (royalSacrifice) {
    eventParts.push(
      `${PIECE_LABEL[royalSacrifice.pieceType]} allié${royalSacrifice.pieceType === "queen" ? "e" : ""} sacrifié${royalSacrifice.pieceType === "queen" ? "e" : ""} dans une explosion : le roi prend sa place pour sauver le royaume.`,
    );
  } else if (captured) {
    eventParts.push(
      `${PIECE_LABEL[captured.type]} capturé${captured.type === "queen" ? "e" : ""}.`,
    );
  }
  if (eggBlast) {
    eventParts.push(
      eggBlast.victims.length > 0
        ? `La coquille éclate sous la pression : l’onde explosive balaie les six cases voisines et détruit ${eggBlast.victims.length} pièce${eggBlast.victims.length > 1 ? "s" : ""}.`
        : "La coquille éclate sous la pression : l’onde explosive balaie les six cases voisines, sans autre victime.",
    );
  }
  if (acidVictim) {
    eventParts.push(
      `Jet d’acide : la reine de ${playerName(activePlayerId)} dissout celle de ${playerName(acidVictim.playerId)} en la croisant, sans tour supplémentaire.`,
    );
  }
  if (promoted) {
    const promotionStatus = resourceStatusForPlayer(pieces, activePlayerId);
    eventParts.push(
      `Promotion : le pion devient reine de palier ${promotionCost} — ${promotionExtraCost} potentiels supplémentaires mobilisés ; ${promotionStatus.used}/${promotionStatus.capacity} occupés.`,
    );
  }
  const startedCocoons = royalCocoonEffects.filter(
    (effect) => effect.kind === "started",
  ).length;
  if (startedCocoons > 0) {
    eventParts.push(
      `Rituel de fertilité : le roi et la nouvelle reine tissent une forteresse opaque pour ${ROYAL_COCOON_TURNS} tours. Toute pièce située dans sa zone de distance ${ROYAL_COCOON_RADIUS} est imprenable et totalement immobilisée.`,
    );
  }
  if (newlyBondedQueens > 0) {
    eventParts.push(
      `Le cocon s’ouvre : ${newlyBondedQueens > 1 ? `${newlyBondedQueens} reines deviennent fertiles` : "la nouvelle reine devient fertile"}.`,
    );
  }
  if (hatchedCoords.length > 0) {
    eventParts.push(
      `${hatchedCoords.length} œuf${hatchedCoords.length > 1 ? "s" : ""} éclot${hatchedCoords.length > 1 ? "ent" : ""} en pion${hatchedCoords.length > 1 ? "s" : ""}.`,
    );
  }
  const moveSummary = eventParts.join(" ");
  notices.forEach((notice) => eventParts.push(notice.message));
  const completedRound = Math.floor(completedTurn / state.turnOrder.length) + 1;
  const journalEntries: TeamLogEntry[] = [
    ...royalCocoonEffects.map((effect, index) => ({
      id: `journal-${completedTurn}-${activePlayerId}-cocoon-${effect.kind}-${index}`,
      turn: completedTurn,
      round: completedRound,
      kind: "reproduction" as const,
      message:
        effect.kind === "started"
          ? `Le roi et la nouvelle reine entrent dans une forteresse de fertilité opaque pour ${ROYAL_COCOON_TURNS} tours. Toutes les pièces à distance ${ROYAL_COCOON_RADIUS} ou moins sont immobilisées.`
          : "Le rituel du cocon est accompli : la reine est désormais fertile et rejoint le cycle de ponte.",
    })),
    ...notices.map((notice, index) => ({
      id: `journal-${completedTurn}-${activePlayerId}-reproduction-${index}`,
      turn: completedTurn,
      round: completedRound,
      kind: "reproduction" as const,
      message: notice.message,
    })),
    {
      id: `journal-${completedTurn}-${activePlayerId}-move`,
      turn: completedTurn,
      round: completedRound,
      kind: "move",
      message: moveSummary,
    },
  ];

  let nextState: GameState = {
    ...state,
    pieces,
    players,
    moveNumber: completedTurn,
    round: completedRound,
    event: eventParts.join(" "),
    teamLogs: prependTeamLogEntries(
      state.teamLogs,
      activePlayerId,
      journalEntries,
    ),
    notices,
    humanMoveTrace: humanMoveFrame
      ? [...(state.humanMoveTrace ?? []), humanMoveFrame].slice(-192)
      : (state.humanMoveTrace ?? []),
    lastMove: {
      pieceId: mover.id,
      playerId: activePlayerId,
      pieceType: mover.type,
      from,
      to: move.to,
      capturedType: royalSacrifice ? undefined : captured?.type,
      promoted,
      spawned,
      spawnedCount: spawnedCoords.length,
      spawnedCoords,
      hatchedCount: hatchedCoords.length,
      hatchedCoords,
      acidVictimId: acidVictim?.id,
      acidVictimPlayerId: acidVictim?.playerId,
      acidVictimCoord: acidVictim
        ? { q: acidVictim.q, r: acidVictim.r }
        : undefined,
      eggBlast,
      royalSacrifice,
      royalCocoonEffects,
      royalExitEffects: [],
      zombieEffects: [],
      antiLoopEscape: Boolean(move.antiLoopEscape),
      contextReplan: Boolean(move.contextReplan),
      contextIntent: move.contextIntent,
      contextSacrifice: Boolean(move.contextSacrifice),
    },
    log: [eventParts.join(" "), ...state.log].slice(0, 12),
  };

  if (royalSacrifice) {
    nextState = {
      ...nextState,
      teamLogs: prependTeamLogEntries(nextState.teamLogs, activePlayerId, [
        {
          id: `journal-${completedTurn}-${activePlayerId}-royal-sacrifice`,
          turn: completedTurn,
          round: completedRound,
          kind: "sacrifice",
          message: `${PIECE_LABEL[royalSacrifice.pieceType]} allié${royalSacrifice.pieceType === "queen" ? "e" : ""} sacrifié${royalSacrifice.pieceType === "queen" ? "e" : ""} en dernier recours : le roi de ${playerName(activePlayerId)} prend sa case et échappe au blocage.`,
        },
      ]),
    };
  } else if (captured) {
    const capturedLabel = PIECE_LABEL[captured.type].toLowerCase();
    nextState = {
      ...nextState,
      teamLogs: prependTeamLogEntries(nextState.teamLogs, captured.playerId, [
        {
          id: `journal-${completedTurn}-${captured.playerId}-capture`,
          turn: completedTurn,
          round: completedRound,
          kind: "capture",
          message:
            captured.type === "egg"
              ? captured.playerId === activePlayerId
                ? `${playerName(activePlayerId)} écrase volontairement un de ses œufs avec son ${moveName.toLowerCase()} pour libérer la case.`
                : `${playerName(captured.playerId)} perd un œuf, écrasé avant l’éclosion par le ${moveName.toLowerCase()} de ${playerName(activePlayerId)}.`
              : `${playerName(captured.playerId)} perd son ${capturedLabel}, capturé par le ${moveName.toLowerCase()} de ${playerName(activePlayerId)}.`,
        },
      ]),
    };
  }

  if (eggBlast?.victims.length) {
    const affectedPlayers = Array.from(
      new Set(eggBlast.victims.map((victim) => victim.playerId)),
    );
    affectedPlayers.forEach((victimPlayerId) => {
      const victims = eggBlast.victims.filter(
        (victim) => victim.playerId === victimPlayerId,
      );
      const names = victims
        .map((victim) => PIECE_LABEL[victim.pieceType].toLowerCase())
        .join(", ");
      nextState = {
        ...nextState,
        teamLogs: prependTeamLogEntries(
          nextState.teamLogs,
          victimPlayerId,
          [
            {
              id: `journal-${completedTurn}-${victimPlayerId}-egg-blast`,
              turn: completedTurn,
              round: completedRound,
              kind: "capture",
              message: `${playerName(victimPlayerId)} perd ${victims.length} pièce${victims.length > 1 ? "s" : ""} dans l’onde de pression de l’œuf écrasé : ${names}.`,
            },
          ],
        ),
      };
    });
  }

  if (acidVictim) {
    nextState = {
      ...nextState,
      teamLogs: prependTeamLogEntries(nextState.teamLogs, acidVictim.playerId, [
        {
          id: `journal-${completedTurn}-${acidVictim.playerId}-acid`,
          turn: completedTurn,
          round: completedRound,
          kind: "acid",
          message: `La reine de ${playerName(acidVictim.playerId)} est dissoute par le jet d’acide de ${playerName(activePlayerId)} pendant son saut. Aucun tour supplémentaire n’est joué.`,
        },
      ]),
    };
  }

  // Chaque zombie déjà présent s'active après le tour de sa colonie. Un
  // zombie créé par ce même coup n'existe pas encore et gardera donc bien ses
  // dix activations complètes.
  nextState = activateZombieTermites(nextState, activePlayerId);

  const registerRoyalExit = (
    current: GameState,
    effect: RoyalExitEffect,
    message: string,
  ): GameState => {
    const exited = withEliminatedPlayer(
      current,
      effect.playerId,
      effect.kind === "checkmate" ? "checkmate" : "escaped",
    );
    return {
      ...exited,
      event: `${exited.event} ${message}`,
      log: [message, ...exited.log].slice(0, 12),
      lastMove: exited.lastMove
        ? {
            ...exited.lastMove,
            royalExitEffects: [
              ...(exited.lastMove.royalExitEffects ?? []),
              effect,
            ],
          }
        : exited.lastMove,
      teamLogs: prependTeamLogEntries(exited.teamLogs, effect.playerId, [
        {
          id: `journal-${completedTurn}-${effect.playerId}-${effect.kind}-${effect.reason}`,
          turn: completedTurn,
          round: completedRound,
          kind: effect.kind === "checkmate" ? "elimination" : "escape",
          message,
        },
      ]),
    };
  };

  // Une rencontre directe avec un roi est résolue immédiatement, même si ce
  // royaume n'est pas le prochain dans l'ordre d'une partie multijoueur.
  const zombieKingVictims = (nextState.lastMove?.zombieEffects ?? [])
    .filter(
      (effect) =>
        effect.kind === "bite" && effect.victim?.pieceType === "king",
    )
    .map((effect) => effect.victim!)
    .filter(
      (victim, index, victims) =>
        victims.findIndex((candidate) => candidate.playerId === victim.playerId) ===
        index,
    );
  zombieKingVictims.forEach((victim) => {
    const defeated = nextState.players.find(
      (player) => player.id === victim.playerId,
    );
    if (!defeated?.alive) return;
    const elimination = `${defeated.name} perd son roi, rencontré directement par le termite zombie de ${playerName(activePlayerId)} : la colonie est éliminée.`;
    nextState = registerRoyalExit(
      nextState,
      {
        id: `royal-exit-${completedTurn}-${victim.playerId}-zombie`,
        kind: "checkmate",
        reason: "zombie",
        playerId: victim.playerId,
        opponentId: activePlayerId,
        coord: { ...victim.coord },
      },
      elimination,
    );
  });

  const activeAfterMove = nextState.players.find(
    (player) => player.id === activePlayerId,
  );
  const solitaryKing = nextState.pieces.find(
    (piece) =>
      piece.playerId === activePlayerId && piece.type === "king",
  );
  if (
    activeAfterMove?.alive &&
    solitaryKing &&
    (activeAfterMove.solitaryKingTurns ?? 0) >=
      KING_SOLITUDE_ESCAPE_TURNS
  ) {
    const escape = `${activeAfterMove.name} est resté dix tours sans reine ni pion. Le roi tourbillonne, creuse un passage et s’échappe sous le plateau : cette victoire devra se décider dans une autre partie.`;
    nextState = registerRoyalExit(
      nextState,
      {
        id: `royal-exit-${completedTurn}-${activePlayerId}-solitude`,
        kind: "escape",
        reason: "solitude",
        playerId: activePlayerId,
        coord: { q: solitaryKing.q, r: solitaryKing.r },
      },
      escape,
    );
  }

  let cursor = (state.turnIndex + 1) % state.turnOrder.length;
  let foundNextPlayer = false;
  for (let attempts = 0; attempts < state.turnOrder.length; attempts += 1) {
    const candidateId = state.turnOrder[cursor];
    const candidate = nextState.players.find((player) => player.id === candidateId);
    if (candidate?.alive) {
      const probe = { ...nextState, turnIndex: cursor };
      if (allLegalMoves(probe, candidateId).length > 0) {
        nextState = { ...nextState, turnIndex: cursor };
        foundNextPlayer = true;
        break;
      }
      if (
        activeRoyalCocoons(probe.pieces).some(
          (pair) => pair.playerId === candidateId,
        )
      ) {
        nextState = { ...nextState, turnIndex: cursor };
        foundNextPlayer = true;
        break;
      }
      if (turnBlockedOnlyByEnemyCocoon(probe, candidateId)) {
        nextState = { ...nextState, turnIndex: cursor };
        foundNextPlayer = true;
        break;
      }
      const checkmate = isInCheck(nextState.pieces, candidateId);
      const candidateKing = nextState.pieces.find(
        (piece) =>
          piece.playerId === candidateId && piece.type === "king",
      );
      if (!candidateKing) {
        const blastedKing = nextState.lastMove?.eggBlast?.victims.find(
          (victim) =>
            victim.playerId === candidateId && victim.pieceType === "king",
        );
        const zombieKing = nextState.lastMove?.zombieEffects?.find(
          (effect) =>
            effect.kind === "bite" &&
            effect.victim?.playerId === candidateId &&
            effect.victim.pieceType === "king",
        )?.victim;
        if (zombieKing) {
          const elimination = `${candidate.name} perd son roi, rencontré directement par le termite zombie de ${playerName(activePlayerId)} : la colonie est éliminée.`;
          nextState = registerRoyalExit(
            nextState,
            {
              id: `royal-exit-${completedTurn}-${candidateId}-zombie`,
              kind: "checkmate",
              reason: "zombie",
              playerId: candidateId,
              opponentId: activePlayerId,
              coord: { ...zombieKing.coord },
            },
            elimination,
          );
        } else if (blastedKing) {
          const elimination = `${candidate.name} perd son roi dans l’onde de pression de l’œuf écrasé : la colonie est éliminée par ${playerName(activePlayerId)}.`;
          nextState = registerRoyalExit(
            nextState,
            {
              id: `royal-exit-${completedTurn}-${candidateId}-egg-blast`,
              kind: "checkmate",
              reason: "egg-blast",
              playerId: candidateId,
              opponentId: activePlayerId,
              coord: { ...blastedKing.coord },
            },
            elimination,
          );
        } else {
          nextState = withEliminatedPlayer(
            nextState,
            candidateId,
            checkmate ? "checkmate" : "escaped",
          );
        }
        cursor = (cursor + 1) % state.turnOrder.length;
        continue;
      }
      if (checkmate) {
        const decisiveChecker = checkingPieces(
          nextState.pieces,
          candidateId,
        )[0];
        const victorId = decisiveChecker?.playerId ?? activePlayerId;
        const elimination = `${candidate.name} est échec et mat : son roi est menacé et n’a aucune fuite, capture ni défense légale. Il éclate en un prodigieux feu d’artifice aux couleurs de ${candidate.name} et ${playerName(victorId)}, en l’honneur de son vainqueur.`;
        nextState = registerRoyalExit(
          nextState,
          {
            id: `royal-exit-${completedTurn}-${candidateId}-checkmate`,
            kind: "checkmate",
            reason: "checkmate",
            playerId: candidateId,
            opponentId: victorId,
            coord: { q: candidateKing.q, r: candidateKing.r },
          },
          elimination,
        );
      } else {
        const escape = `${candidate.name} n’est pas en échec mais son royaume n’a plus aucun coup légal. Son roi tourbillonne, creuse un trou et s’échappe sous le plateau : la victoire se décidera dans une autre partie.`;
        nextState = registerRoyalExit(
          nextState,
          {
            id: `royal-exit-${completedTurn}-${candidateId}-blocked`,
            kind: "escape",
            reason: "blocked",
            playerId: candidateId,
            coord: { q: candidateKing.q, r: candidateKing.r },
          },
          escape,
        );
      }
    }
    cursor = (cursor + 1) % state.turnOrder.length;
  }

  const survivors = nextState.players.filter((player) => player.alive);
  const escapedThisTurn = nextState.lastMove?.royalExitEffects?.some(
    (effect) => effect.kind === "escape",
  );
  if (!nextState.drawReason && survivors.length === 1 && escapedThisTurn) {
    const drawReason = `Victoire reportée : un roi s’est échappé. ${survivors[0].name} devra confirmer sa domination dans une autre partie.`;
    nextState = {
      ...nextState,
      drawReason,
      outcome: "royal_escape",
      event: `${nextState.event} ${drawReason}`,
      log: [drawReason, ...nextState.log].slice(0, 12),
    };
  } else if (!nextState.drawReason && survivors.length === 1) {
    const winner = survivors[0];
    const victory = `${winner.name} règne sur FabHexaGrogne !`;
    nextState = {
      ...nextState,
      winnerId: winner.id,
      event: `${nextState.event} ${victory}`,
      log: [victory, ...nextState.log].slice(0, 12),
      teamLogs: prependTeamLogEntries(nextState.teamLogs, winner.id, [
        {
          id: `journal-${completedTurn}-${winner.id}-victory`,
          turn: completedTurn,
          round: completedRound,
          kind: "victory",
          message: victory,
        },
      ]),
    };
  } else if (!nextState.drawReason && !foundNextPlayer) {
    const drawReason =
      "Victoire reportée : tous les rois encore en lice se sont échappés sous le plateau. Leur rivalité continuera dans une autre partie.";
    nextState = {
      ...nextState,
      drawReason,
      outcome: "royal_escape",
      event: `${nextState.event} ${drawReason}`,
      log: [drawReason, ...nextState.log].slice(0, 12),
    };
  } else if (!nextState.drawReason) {
    const nextId = currentPlayerId(nextState);
    if (isInCheck(nextState.pieces, nextId)) {
      const alert = `${nextState.players.find((player) => player.id === nextId)?.name ?? PLAYER_META[nextId].name} est en échec.`;
      nextState = {
        ...nextState,
        event: `${nextState.event} ${alert}`,
        log: [alert, ...nextState.log].slice(0, 12),
        teamLogs: prependTeamLogEntries(nextState.teamLogs, nextId, [
          {
            id: `journal-${completedTurn}-${nextId}-check`,
            turn: completedTurn,
            round: completedRound,
            kind: "check",
            message: alert,
          },
        ]),
      };
    }
  }
  if (!options.skipLoopTracking) {
    nextState = updateLoopTrackerAfterMove(
      state,
      nextState,
      activePlayerId,
      move,
      from,
      hadSafeAlternative,
    );
    nextState = updateStrategicTrackerAfterMove(
      state,
      nextState,
      activePlayerId,
      move,
    );
  }
  return nextState;
}

export const DEFAULT_WEIGHTS = [
  1.45, 1.2, 0.52, 0.8, 1.9, -1.15, 0.38, 0.34, 0.42, 0.72, 1.35, 0.08,
  1.8, 1.25,
];

export const AI_CORE_FEATURE_ORDER = [
  "capture",
  "echec",
  "centre",
  "territoire",
  "promotion",
  "exposition",
  "soutien",
  "richesse",
  "progression",
  "pression-roi",
  "cycle-ponte-reine",
  "biais",
  "discipline-et-survie-reine",
  "zone-spawn-reine",
] as const;

export function createDefaultAIMemory(): AIMemory {
  return {
    schema: "fabhexagrogne-ai",
    version: 1,
    weights: [...DEFAULT_WEIGHTS],
    championWeights: [...DEFAULT_WEIGHTS],
    generation: 1,
    decisions: 0,
    games: 0,
    fitness: 0,
    bestFitness: -9999,
    learningRate: 0.035,
    wasmReady: false,
    modules: {
      queenEscapeContext: {
        version: QUEEN_ESCAPE_CONTEXT_VERSION,
        weights: [...DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS],
        championWeights: [...DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS],
      },
    },
  };
}

export function queenEscapeWeightsForMemory(
  memory: AIMemory,
  champion = false,
): number[] {
  const weightModule = memory.modules?.queenEscapeContext;
  const source = champion
    ? weightModule?.championWeights
    : weightModule?.weights;
  return DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.map(
    (fallback, index) => source?.[index] ?? fallback,
  );
}

function moveFeaturesCanonical(state: GameState, move: Move): number[] {
  const mover = state.pieces.find((piece) => piece.id === move.pieceId)!;
  const target = pieceAt(state.pieces, move.to);
  const acidVictim = queenCrossedByJump(state.pieces, move);
  const blastMaterialSwing = eggBlastMaterialSwing(
    state.pieces,
    move,
    mover.playerId,
  );
  const beforeTerritory = territoryForPlayer(state.pieces, mover.playerId);
  const afterPieces = movePieces(state.pieces, move);
  const afterTerritory = territoryForPlayer(afterPieces, mover.playerId);
  const enemyIds = state.players
    .filter((player) => player.alive && player.id !== mover.playerId)
    .map((player) => player.id);
  const check = enemyIds.some((enemyId) => isInCheck(afterPieces, enemyId));
  const oldCenterDistance = hexDistance(mover, { q: 0, r: 0 });
  const newCenterDistance = hexDistance(move.to, { q: 0, r: 0 });
  const promotes = mover.type === "pawn" && sameCoord(move.to, PLAYER_META[mover.playerId].opposite);
  const movedPiece = afterPieces.find((piece) => piece.id === mover.id);
  const exposed =
    mover.type === "queen" && movedPiece
      ? isQueenTacticallyCapturable(
          afterPieces,
          movedPiece,
          mover.playerId,
        )
      : isSquareAttacked(afterPieces, move.to, mover.playerId);
  const support = neighbors(move.to).filter((cell) => {
    const piece = pieceAt(afterPieces, cell);
    return (
      piece?.playerId === mover.playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece)
    );
  }).length;
  const oldTargetDistance = hexDistance(mover, PLAYER_META[mover.playerId].opposite);
  const newTargetDistance = hexDistance(move.to, PLAYER_META[mover.playerId].opposite);
  const enemyKings = afterPieces.filter(
    (piece) => piece.type === "king" && piece.playerId !== mover.playerId,
  );
  const oldKingDistance = Math.min(
    ...enemyKings.map((king) => hexDistance(mover, king)),
  );
  const newKingDistance = Math.min(
    ...enemyKings.map((king) => hexDistance(move.to, king)),
  );
  const reproductionReadiness = queenSpawnReadiness(
    afterPieces,
    mover.playerId,
  );
  const queenDisciplineBefore = queenDisciplineValue(
    state.pieces,
    mover.playerId,
  );
  const queenDisciplineAfter = queenDisciplineValue(
    afterPieces,
    mover.playerId,
  );
  const gratuitousQueenMove =
    mover.type === "queen" &&
    queenDisciplineAfter <= queenDisciplineBefore + 0.05
      ? 0.2
      : 0;
  const queenPreservation = Math.max(
    -1,
    Math.min(
      1,
      queenDisciplineAfter -
        queenDisciplineBefore +
        (queenDisciplineAfter >= 0 ? queenDisciplineAfter * 0.08 : -0.18) -
        gratuitousQueenMove,
    ),
  );
  const spawnSpaceGain =
    queenSpawnSpaceRatio(afterPieces, mover.playerId) -
    queenSpawnSpaceRatio(state.pieces, mover.playerId);
  return [
    (captureValueForMover(mover, target) +
      (acidVictim ? PIECE_VALUE[acidVictim.type] : 0) +
      blastMaterialSwing) /
      9,
    check ? 1 : 0,
    (oldCenterDistance - newCenterDistance) / BOARD_RADIUS,
    Math.tanh((afterTerritory.richness - beforeTerritory.richness) / 18),
    promotes ? 1 : 0,
    exposed ? 1 : 0,
    support / 3,
    cellRichness(move.to) / MAX_CELL_RICHNESS,
    (oldTargetDistance - newTargetDistance) / BOARD_RADIUS,
    Number.isFinite(oldKingDistance)
      ? (oldKingDistance - newKingDistance) / BOARD_RADIUS
      : 0,
    reproductionReadiness,
    1,
    queenPreservation,
    spawnSpaceGain,
  ];
}

export function moveFeatures(state: GameState, move: Move): number[] {
  const mover = state.pieces.find((piece) => piece.id === move.pieceId);
  if (!mover) return DEFAULT_WEIGHTS.map(() => 0);
  const canonical = canonicalDecisionForPlayer(
    state,
    move,
    mover.playerId,
  );
  return moveFeaturesCanonical(canonical.state, canonical.move);
}

export function dotScore(weights: number[], features: number[]): number {
  return features.reduce((sum, feature, index) => sum + feature * (weights[index] ?? 0), 0);
}

const PERSONALITY_INPUT_DELTAS: Record<AIPersonalityId, number[]> = {
  aggressive: [0.8, 0.72, 0.08, 0.02, 0.1, -0.08, 0.02, 0.04, 0.18, 0.72, -0.16, 0, 0.16, -0.02],
  expansionist: [0.04, 0.02, 0.62, 0.88, 0.08, -0.18, 0.2, 0.42, 0.48, 0.04, 0.08, 0, 0.18, 0.28],
  balanced: [0.08, 0.08, 0.14, 0.18, 0.08, -0.2, 0.24, 0.08, 0.08, 0.08, 0.18, 0, 0.38, 0.34],
  reproduction: [-0.08, -0.04, 0.02, 0.18, 0.02, -0.32, 0.38, 0.08, -0.12, -0.08, 0.92, 0, 0.62, 0.9],
};

const PHASE_WEIGHT_DELTAS: Record<AIStrategicPhase, number[]> = {
  expansion: [0.02, 0.02, 0.42, 0.94, 0.1, -0.12, 0.18, 0.34, 0.34, 0.02, 0.08, 0, 0.18, 0.22],
  reproduction: [-0.08, -0.04, -0.1, 0.12, 0.02, -0.42, 0.52, 0.08, -0.16, -0.1, 1.18, 0, 0.94, 1.3],
  brood_protection: [0.08, 0.1, -0.18, 0.02, -0.04, -0.62, 0.94, 0.02, -0.28, -0.12, 0.3, 0, 0.92, 0.58],
  center_contest: [0.24, 0.18, 1.48, 0.36, 0.08, -0.24, 0.34, 0.92, 0.04, 0.18, 0.02, 0, 0.32, 0.12],
  flank_attack: [0.5, 0.42, -0.48, 0.48, 0.08, -0.18, 0.2, 0.08, 0.72, 0.68, -0.08, 0, 0.26, 0.06],
  royal_survival: [0.32, 0.18, -0.36, -0.08, -0.04, -1.12, 1.08, -0.08, -0.42, -0.12, 0.14, 0, 1.58, 0.32],
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function threatenedRatio(
  pieces: Piece[],
  playerId: PlayerId,
  type: "queen" | "egg",
): number {
  const targets = pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === type,
  );
  if (!targets.length) return 0;
  return (
    targets.filter((piece) =>
      type === "queen"
        ? isQueenTacticallyCapturable(pieces, piece, playerId)
        : isSquareAttacked(pieces, piece, playerId),
    ).length /
    targets.length
  );
}

function broodSafetyValue(pieces: Piece[], playerId: PlayerId): number {
  const eggs = pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "egg",
  );
  if (!eggs.length) return 0;
  const weighted = eggs.reduce((total, egg) => {
    const urgency = 1 + (EGG_HATCH_TURNS - (egg.hatchTurns ?? EGG_HATCH_TURNS)) * 0.24;
    return total + (isSquareAttacked(pieces, egg, playerId) ? -0.8 : 1) * urgency;
  }, 0);
  const maximum = eggs.reduce(
    (total, egg) =>
      total +
      1 +
      (EGG_HATCH_TURNS - (egg.hatchTurns ?? EGG_HATCH_TURNS)) * 0.24,
    0,
  );
  return maximum ? weighted / maximum : 0;
}

export function assessStrategicSituation(
  state: GameState,
  playerId: PlayerId,
  personality: AIPersonalityId = "balanced",
): AIStrategicAssessment {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const eggs = state.pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "egg",
  );
  const queens = state.pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "queen",
  );
  const unbondedQueens = queens.filter(
    (queen) =>
      !queen.queenBonded &&
      (queen.breedingTurns ?? 0) <= 0,
  );
  const activeCocoon = activeRoyalCocoons(state.pieces).some(
    (pair) => pair.playerId === playerId,
  );
  const threatenedEggRatio = threatenedRatio(state.pieces, playerId, "egg");
  const queenThreatRatio = threatenedRatio(state.pieces, playerId, "queen");
  const hatchingSoonRatio = eggs.length
    ? eggs.filter((egg) => (egg.hatchTurns ?? EGG_HATCH_TURNS) <= 1).length /
      eggs.length
    : 0;
  const kingSafety = kingSafetyValue(state.pieces, playerId);
  const pawnShield = kingPawnShieldValue(state.pieces, playerId);
  const queenSafety = queenDisciplineValue(state.pieces, playerId);
  const spawnSpaceRatio = queenSpawnSpaceRatio(state.pieces, playerId);
  const centerPiece = pieceAt(state.pieces, { q: 0, r: 0 });
  const centerOwner =
    centerPiece && centerPiece.type !== "egg" && !isZombieTermite(centerPiece)
      ? centerPiece.playerId
      : undefined;
  const enemyCenterPressure = state.pieces.filter(
    (piece) =>
      piece.playerId !== playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece) &&
      hexDistance(piece, { q: 0, r: 0 }) <= 1,
  ).length;
  const ownCenterPressure = state.pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece) &&
      hexDistance(piece, { q: 0, r: 0 }) <= 1,
  ).length;
  const personalTurns = player?.personalTurns ?? 0;
  const solitaryKingTurns = player?.solitaryKingTurns ?? 0;
  const earlyGame = clamp(1 - personalTurns / 6, 0, 1);
  const territoryRichness = territoryForPlayer(state.pieces, playerId).richness;
  const resourceStatus = resourceStatusForPlayer(state.pieces, playerId);
  const hasBondedQueen = queens.some((queen) => queen.queenBonded);
  const hasReproductionWindow =
    hasBondedQueen &&
    (resourceStatus.free >= EGG_RESOURCE_COST ||
      spawnSpaceRatio < 0.42 ||
      (eggs.length === 0 && personalTurns > 0));
  const personalityBias: Record<
    AIPersonalityId,
    Partial<Record<AIStrategicPhase, number>>
  > = {
    aggressive: {
      expansion: 0.08,
      center_contest: 0.38,
      flank_attack: 0.72,
      reproduction: -0.14,
    },
    expansionist: {
      expansion: 0.72,
      center_contest: 0.24,
      flank_attack: 0.18,
    },
    balanced: {
      brood_protection: 0.16,
      center_contest: 0.1,
      royal_survival: 0.18,
    },
    reproduction: {
      reproduction: 0.92,
      brood_protection: 0.42,
      royal_survival: 0.12,
    },
  };
  const phaseScores: Record<AIStrategicPhase, number> = {
    expansion:
      0.78 +
      earlyGame * 0.58 +
      (territoryRichness < 70 ? 0.24 : 0) +
      (ownCenterPressure === 0 ? 0.1 : 0),
    reproduction:
      (hasReproductionWindow ? 0.86 : -0.55) +
      (unbondedQueens.length ? 2.35 : 0) +
      (activeCocoon ? 1.45 : 0) +
      (eggs.length === 0 ? 0.44 : -0.1) +
      (spawnSpaceRatio < 0.55 ? 0.48 : 0.08) +
      (resourceStatus.free >= EGG_RESOURCE_COST && spawnSpaceRatio < 0.34
        ? 1.08
        : 0) +
      earlyGame * 0.18,
    brood_protection:
      (eggs.length ? 0.74 : -0.65) +
      threatenedEggRatio * 2.65 +
      hatchingSoonRatio * 1.5 +
      (eggs.length && personalTurns <= 2 ? 1.08 : 0),
    center_contest:
      0.34 +
      (centerOwner !== undefined && centerOwner !== playerId ? 0.92 : 0) +
      (centerOwner === undefined ? 0.24 : 0) +
      Math.min(0.42, enemyCenterPressure * 0.14) +
      (personalTurns >= 3 ? 0.24 : 0) -
      (centerOwner === playerId ? 0.3 : 0),
    flank_attack:
      0.16 +
      (centerOwner !== undefined && centerOwner !== playerId ? 0.42 : 0) +
      Math.min(0.32, enemyCenterPressure * 0.08) +
      (personalTurns >= 4 ? 0.36 : 0),
    royal_survival:
      -0.32 +
      (isInCheck(state.pieces, playerId) ? 4.8 : 0) +
      Math.max(0, -kingSafety) * 2.8 +
      Math.max(0, 0.65 - pawnShield) * 1.7 +
      Math.min(4.2, solitaryKingTurns * 0.48) +
      (queens.length ? queenThreatRatio * 3.15 : 0) +
      (queens.length ? Math.max(0, -queenSafety) * 1.5 : 0) +
      (unbondedQueens.length ? 0.72 : 0),
  };
  Object.entries(personalityBias[personality]).forEach(([phase, bonus]) => {
    phaseScores[phase as AIStrategicPhase] += bonus ?? 0;
  });
  let phase = (Object.entries(phaseScores) as Array<
    [AIStrategicPhase, number]
  >).sort((a, b) => b[1] - a[1])[0][0];
  if (personalTurns === 0 && phaseScores.royal_survival < 2.4) {
    phase = "expansion";
  }
  return {
    phase,
    phaseScores,
    eggs: eggs.length,
    threatenedEggRatio,
    hatchingSoonRatio,
    queenThreatRatio,
    kingSafety,
    queenSafety,
    spawnSpaceRatio,
    centerOwner,
  };
}

export function selectStrategicPhase(
  state: GameState,
  playerId: PlayerId,
  personality: AIPersonalityId = "balanced",
): AIStrategicPhase {
  return assessStrategicSituation(state, playerId, personality).phase;
}

export function conditionAiWeights(
  weights: number[],
  phase: AIStrategicPhase,
  personality: AIPersonalityId = "balanced",
): number[] {
  return DEFAULT_WEIGHTS.map((fallback, index) =>
    clamp(
      (weights[index] ?? fallback) +
        (PHASE_WEIGHT_DELTAS[phase][index] ?? 0) * 0.72 +
        (PERSONALITY_INPUT_DELTAS[personality][index] ?? 0) * 0.28,
      -4,
      4,
    ),
  );
}

function minimumDistanceToBrood(
  pieces: Piece[],
  playerId: PlayerId,
  coord: Coord,
): number {
  const eggs = pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "egg",
  );
  if (!eggs.length) return BOARD_RADIUS;
  return Math.min(...eggs.map((egg) => hexDistance(coord, egg)));
}

function phaseMoveBonus(
  state: GameState,
  mover: Piece,
  move: Move,
  afterPieces: Piece[],
  features: number[],
  phase: AIStrategicPhase,
): number {
  const canonicalFrom = canonicalCoordForPlayer(mover, mover.playerId);
  const canonicalTo = canonicalCoordForPlayer(move.to, mover.playerId);
  if (phase === "reproduction") {
    return features[13] * 2.25 + features[12] * 0.72 + features[6] * 0.28;
  }
  if (phase === "brood_protection") {
    const safetyGain =
      broodSafetyValue(afterPieces, mover.playerId) -
      broodSafetyValue(state.pieces, mover.playerId);
    const distanceGain =
      minimumDistanceToBrood(state.pieces, mover.playerId, mover) -
      minimumDistanceToBrood(afterPieces, mover.playerId, move.to);
    return safetyGain * 3.4 + distanceGain * 0.24 + features[6] * 0.38;
  }
  if (phase === "center_contest") {
    const centerGain =
      hexDistance(mover, { q: 0, r: 0 }) -
      hexDistance(move.to, { q: 0, r: 0 });
    return centerGain * 0.46 + features[7] * 0.55 + features[3] * 0.28;
  }
  if (phase === "flank_attack") {
    const lateralGain = Math.abs(canonicalTo.q) - Math.abs(canonicalFrom.q);
    return lateralGain * 0.34 + features[9] * 0.48 + features[8] * 0.3;
  }
  if (phase === "royal_survival") {
    return features[12] * 1.65 + features[6] * 0.58 - features[5] * 0.72;
  }
  return features[3] * 0.58 + features[2] * 0.24 + features[8] * 0.18;
}

function queenFutureValue(
  pieces: Piece[],
  playerId: PlayerId,
  queen: Piece,
): number {
  const nearbyEggPotential = pieces
    .filter(
      (piece) =>
        piece.playerId === playerId &&
        piece.type === "egg" &&
        hexDistance(piece, queen) <= 2,
    )
    .reduce(
      (total, egg) =>
        total +
        0.8 +
        (EGG_HATCH_TURNS - (egg.hatchTurns ?? EGG_HATCH_TURNS)) * 0.28,
      0,
    );
  return (
    PIECE_VALUE.queen +
    (queen.queenBonded
      ? 3.2
      : (queen.breedingTurns ?? 0) > 0
        ? 2.4
        : 0.8) +
    queenSpawnCells(pieces, queen).length * 0.42 +
    nearbyEggPotential
  );
}

function activeArmySize(pieces: Piece[], playerId: PlayerId): number {
  return pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece),
  ).length;
}

export function isSeverelyOutnumbered(
  pieces: Piece[],
  playerId: PlayerId,
): boolean {
  const ownArmy = activeArmySize(pieces, playerId);
  const enemyArmies = PLAYER_IDS.filter((candidate) => candidate !== playerId)
    .map((candidate) => activeArmySize(pieces, candidate))
    .filter((size) => size > 0);
  const largestEnemyArmy = Math.max(0, ...enemyArmies);
  if (ownArmy <= 2) return largestEnemyArmy >= ownArmy + 2;
  return (
    largestEnemyArmy >= ownArmy + 3 &&
    largestEnemyArmy >= Math.ceil(ownArmy * 1.5)
  );
}

function nearestEnemy(
  pieces: Piece[],
  playerId: PlayerId,
  coord: Coord,
): Piece | undefined {
  return pieces
    .filter(
      (piece) =>
        piece.playerId !== playerId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece),
    )
    .sort(
      (a, b) =>
        hexDistance(coord, a) - hexDistance(coord, b) ||
        PIECE_VALUE[b.type] - PIECE_VALUE[a.type],
    )[0];
}

function nearestEnemyDistance(
  pieces: Piece[],
  playerId: PlayerId,
  coord: Coord,
): number {
  const enemy = nearestEnemy(pieces, playerId, coord);
  return enemy ? hexDistance(coord, enemy) : BOARD_RADIUS * 2;
}

export function pawnHasForwardCover(
  pieces: Piece[],
  playerId: PlayerId,
  pawnId: string,
): boolean {
  const pawn = pieces.find(
    (piece) =>
      piece.id === pawnId &&
      piece.playerId === playerId &&
      piece.type === "pawn" &&
      !isZombieTermite(piece),
  );
  if (!pawn) return false;
  const enemy = nearestEnemy(pieces, playerId, pawn);
  if (!enemy) return true;
  const pawnDangerDistance = hexDistance(pawn, enemy);
  return pieces.some(
    (piece) =>
      piece.id !== pawn.id &&
      piece.playerId === playerId &&
      piece.type === "pawn" &&
      !isZombieTermite(piece) &&
      hexDistance(piece, pawn) <= 2 &&
      hexDistance(piece, enemy) < pawnDangerDistance,
  );
}

export function moveEnablesQueenReproduction(
  state: GameState,
  move: Move,
): boolean {
  const mover = state.pieces.find((piece) => piece.id === move.pieceId);
  if (!mover || mover.type !== "pawn") return false;
  const beforeQueens = state.pieces.filter(
    (piece) =>
      piece.playerId === mover.playerId &&
      piece.type === "queen" &&
      piece.queenBonded,
  );
  if (!beforeQueens.length) return false;
  const afterPieces = movePieces(state.pieces, move);
  const beforeReady =
    resourceStatusForPlayer(state.pieces, mover.playerId).free >=
      EGG_RESOURCE_COST &&
    beforeQueens.some((queen) => queenSpawnCells(state.pieces, queen).length > 0);
  const afterQueens = afterPieces.filter(
    (piece) =>
      piece.playerId === mover.playerId &&
      piece.type === "queen" &&
      piece.queenBonded,
  );
  const afterReady =
    resourceStatusForPlayer(afterPieces, mover.playerId).free >=
      EGG_RESOURCE_COST &&
    afterQueens.some((queen) => queenSpawnCells(afterPieces, queen).length > 0);
  if (!afterReady) return false;
  const territoryGain =
    territoryForPlayer(afterPieces, mover.playerId).richness -
    territoryForPlayer(state.pieces, mover.playerId).richness;
  const spawnSpaceGain =
    queenSpawnSpaceRatio(afterPieces, mover.playerId) -
    queenSpawnSpaceRatio(state.pieces, mover.playerId);
  return !beforeReady || territoryGain > 0 || spawnSpaceGain > 0;
}

function safePromotionRoute(
  pieces: Piece[],
  pawn: Piece,
  target: Coord,
  stepsRemaining: number,
): boolean {
  const distance = hexDistance(pawn, target);
  if (distance === 0) return true;
  if (stepsRemaining <= 0 || distance > stepsRemaining) return false;
  return neighbors(pawn)
    .filter((cell) => hexDistance(cell, target) === distance - 1)
    .some((cell) => {
      const occupant = pieceAt(pieces, cell);
      if (
        occupant &&
        occupant.type !== "egg" &&
        (occupant.playerId === pawn.playerId || occupant.type === "king")
      ) {
        return false;
      }
      const simulated = movePieces(pieces, { pieceId: pawn.id, to: cell });
      const advanced = simulated.find((piece) => piece.id === pawn.id);
      if (!advanced || isInCheck(simulated, pawn.playerId)) return false;
      if (isSquareAttacked(simulated, advanced, pawn.playerId)) return false;
      if (sameCoord(cell, target)) {
        const status = resourceStatusForPlayer(simulated, pawn.playerId);
        return (
          advanced.type === "queen" &&
          status.used <= status.capacity &&
          !isQueenTacticallyCapturable(simulated, advanced, pawn.playerId)
        );
      }
      return safePromotionRoute(
        simulated,
        advanced,
        target,
        stepsRemaining - 1,
      );
    });
}

export function unstoppablePromotionPawn(
  pieces: Piece[],
  playerId: PlayerId,
): Piece | undefined {
  const target = PLAYER_META[playerId].opposite;
  return pieces.find(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "pawn" &&
      hexDistance(piece, target) <= 2 &&
      safePromotionRoute(
        pieces,
        piece,
        target,
        hexDistance(piece, target),
      ),
  );
}

export function hasOverwhelmingArmyForQueenTrade(
  pieces: Piece[],
  playerId: PlayerId,
): boolean {
  const activeCount = (candidateId: PlayerId) =>
    pieces.filter(
      (piece) =>
        piece.playerId === candidateId &&
        piece.type !== "egg" &&
        !isZombieTermite(piece),
    ).length;
  const ownArmy = activeCount(playerId);
  const opposingArmies = PLAYER_IDS.filter((id) => id !== playerId).map(
    activeCount,
  );
  const strongestOpponent = Math.max(0, ...opposingArmies);
  // Une formation initiale de sept termites ne suffit jamais. L'exception
  // exige au moins dix unités actives et cinq unités d'avance sur la plus
  // grande colonie adverse.
  return ownArmy >= 10 && ownArmy >= strongestOpponent + 5;
}

export function isVortexPreparationMode(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const ownActivePieces = state.pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type !== "egg" &&
      !isZombieTermite(piece),
  );
  const queens = ownActivePieces.filter((piece) => piece.type === "queen");
  const pawns = ownActivePieces.filter((piece) => piece.type === "pawn");
  if (queens.length) return false;
  const aloneWithOnePawn =
    pawns.length === 1 && ownActivePieces.length === 2;
  const doomedByNumbers =
    isSeverelyOutnumbered(state.pieces, playerId) &&
    (kingSafetyValue(state.pieces, playerId) < -0.18 ||
      ordinaryLegalMoveCount(state, playerId, 3) <= 2 ||
      isInCheck(state.pieces, playerId));
  return aloneWithOnePawn || doomedByNumbers;
}

// Capture, échec, promotion, exposition, soutien, reproduction, préservation
// royale et espace de ponte restent intouchables pendant l'unique évasion.
const ANTI_LOOP_PROTECTED_WEIGHT_INDICES = new Set([
  0, 1, 4, 5, 6, 10, 12, 13,
]);

function antiLoopTemporaryWeights(
  weights: number[],
  state: GameState,
  playerId: PlayerId,
): number[] {
  return weights.map((weight, index) => {
    if (ANTI_LOOP_PROTECTED_WEIGHT_INDICES.has(index)) return weight;
    const hash = tacticalHash(
      `${state.matchId}|${state.moveNumber}|${playerId}|${index}|anti-loop`,
      2_246_822_519,
    );
    const unit = (Number.parseInt(hash, 36) >>> 0) / 0xffff_ffff;
    const amplitude = Math.max(0.035, Math.abs(weight) * 0.065);
    return weight + (unit * 2 - 1) * amplitude;
  });
}

const CONTEXT_WEIGHT_MASKS: Record<
  StrategicContextIntent,
  number[]
> = {
  secure_royals: [0, 0, -0.45, -0.3, 0, 0, 0, -0.2, -0.3, -0.25, 0, 0, 0, 0],
  open_nursery: [0, 0, -0.55, 0.65, 0, 0, 0, -0.25, -0.2, -0.35, 0, 0.15, 0, 0],
  lay: [0, 0, -0.35, 0.3, 0, 0, 0, -0.15, -0.2, -0.25, 0, 0.1, 0, 0],
  border_pressure: [0, 0, -0.6, 0.65, 0, 0, 0, 0.3, 0.3, 0.85, 0, 0.12, 0, 0],
  breach: [0, 0, -0.25, 0.75, 0, 0, 0, 0.2, 0.45, 1, 0, 0.15, 0, 0],
  promotion: [0, 0, -0.25, 0.2, 0, 0, 0, 0.2, 1, 0.15, 0, 0.1, 0, 0],
};

export function contextualTemporaryWeights(
  weights: number[],
  state: GameState,
  playerId: PlayerId,
  intent: StrategicContextIntent,
): number[] {
  return weights.map((weight, index) => {
    if (ANTI_LOOP_PROTECTED_WEIGHT_INDICES.has(index)) return weight;
    const mask = CONTEXT_WEIGHT_MASKS[intent][index] ?? 0;
    const hash = tacticalHash(
      `${state.matchId}|${state.moveNumber}|${playerId}|${index}|${intent}|context`,
      2_166_136_261,
    );
    const unit = (Number.parseInt(hash, 36) >>> 0) / 0xffff_ffff;
    const modulation = Math.max(0.04, Math.abs(weight) * 0.12) * mask;
    const jitter = Math.max(0.006, Math.abs(weight) * 0.015) * (unit * 2 - 1);
    return weight + modulation + jitter;
  });
}

const QUEEN_ESCAPE_RUNTIME = {
  movePieces,
  legalQueenMoves: ordinaryLegalMovesForPiece,
  queenPotentialTargets: queenTargets,
  pieceAt,
  isQueenTacticallyCapturable,
};

export function evaluateQueenEscapeContext(
  state: GameState,
  move: Move,
  playerId: PlayerId,
): QueenEscapeContextVector {
  return queenEscapeContextForMove(
    state,
    move,
    playerId,
    QUEEN_ESCAPE_RUNTIME,
  );
}

export function chooseAiMove(
  state: GameState,
  playerId: PlayerId,
  weights: number[],
  scorer: (weights: number[], features: number[]) => number = dotScore,
  explorationRate = 0.08,
  explorationPool = 4,
  guardrailsEnabled = true,
  personality: AIPersonalityId = "balanced",
  moveScoreAugmenter?: AIMoveScoreAugmenter,
  queenEscapeWeights: readonly number[] =
    DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS,
): AIChoice | undefined {
  const moves = allLegalMoves(state, playerId);
  if (!moves.length) return undefined;
  const loopTracker = loopTrackerForPlayer(state, playerId);
  const loopRepetition = effectiveLoopRepetition(loopTracker);
  const antiLoopEscape =
    loopRepetition >= LOOP_WARNING_REPETITION &&
    loopRepetition < LOOP_REPETITION_LIMIT &&
    (loopTracker.cycleSignatures.length > 0 ||
      loopTracker.actionPattern.length > 0) &&
    !loopTracker.escapeAttempted;
  const strategyTracker = strategyTrackerForPlayer(state, playerId);
  const contextIntent =
    strategyTracker.intent && strategyTracker.intentTurnsRemaining > 0
      ? strategyTracker.intent
      : undefined;
  const phase = selectStrategicPhase(state, playerId, personality);
  const contextWeights = contextIntent
    ? contextualTemporaryWeights([...weights], state, playerId, contextIntent)
    : weights;
  const decisionWeights = conditionAiWeights(
    antiLoopEscape
      ? antiLoopTemporaryWeights([...contextWeights], state, playerId)
      : contextWeights,
    phase,
    personality,
  );
  const canonicalState = canonicalStateForPlayer(state, playerId);
  const beforeKingSafety = kingSafetyValue(state.pieces, playerId);
  const beforePawnShield = kingPawnShieldValue(state.pieces, playerId);
  const beforeQueenSafety = queenDisciplineValue(state.pieces, playerId);
  const checkingIds = new Set(
    checkingPieces(state.pieces, playerId).map((piece) => piece.id),
  );
  const kingWasChecked = checkingIds.size > 0;
  const ownQueens = state.pieces.filter(
    (piece) => piece.playerId === playerId && piece.type === "queen",
  );
  const unbondedQueens = ownQueens.filter(
    (queen) =>
      !queen.queenBonded &&
      (queen.breedingTurns ?? 0) <= 0,
  );
  const ownKing = state.pieces.find(
    (piece) => piece.playerId === playerId && piece.type === "king",
  );
  const unbondedDistanceBefore =
    ownKing && unbondedQueens.length
      ? Math.min(
          ...unbondedQueens.map((queen) => hexDistance(queen, ownKing)),
        )
      : 0;
  const survivalFormation =
    ownQueens.length === 0 || isSeverelyOutnumbered(state.pieces, playerId);
  const vortexPreparation = isVortexPreparationMode(state, playerId);
  const promotionReserve = unstoppablePromotionPawn(state.pieces, playerId);
  const strategicQueenReserve = Boolean(
    promotionReserve &&
      hasOverwhelmingArmyForQueenTrade(state.pieces, playerId),
  );
  const bondedQueens = state.pieces.filter(
    (piece) =>
      piece.playerId === playerId &&
      piece.type === "queen" &&
      piece.queenBonded,
  );
  const queenEscapeForMove = prepareQueenEscapeContext(
    state,
    playerId,
    QUEEN_ESCAPE_RUNTIME,
  );
  let choices = moves.map((move) => {
    const canonicalMove = canonicalMoveForPlayer(move, playerId);
    const features = moveFeaturesCanonical(canonicalState, canonicalMove);
    const mover = state.pieces.find((piece) => piece.id === move.pieceId)!;
    const target = pieceAt(state.pieces, move.to);
    const acidVictim = queenCrossedByJump(state.pieces, move);
    const blastVictims = eggBlastVictimsForMove(state.pieces, move);
    const afterPieces = movePieces(state.pieces, move);
    const queenEscapeContext = queenEscapeForMove(move);
    const queenEscapeContextScore = scoreQueenEscapeContext(
      queenEscapeWeights,
      queenEscapeContext.features,
    );
    const futureState = { ...state, pieces: afterPieces };
    const futureOrdinaryMobility = ordinaryLegalMoveCount(
      futureState,
      playerId,
      3,
    );
    const ownPiecesAfterMove = afterPieces.filter(
      (piece) => piece.playerId === playerId,
    );
    const onlyKingRemains =
      ownPiecesAfterMove.some((piece) => piece.type === "king") &&
      !ownPiecesAfterMove.some(
        (piece) =>
          piece.type === "queen" ||
          (piece.type === "pawn" && !isZombieTermite(piece)),
      );
    const solitudeProgress = onlyKingRemains
      ? Math.min(
          1,
          ((state.players.find((player) => player.id === playerId)
            ?.solitaryKingTurns ?? 0) +
            1) /
            KING_SOLITUDE_ESCAPE_TURNS,
        )
      : 0;
    const kingSafety = kingSafetyValue(afterPieces, playerId);
    const safetyGain = kingSafety - beforeKingSafety;
    const kingPawnShield = kingPawnShieldValue(afterPieces, playerId);
    const pawnShieldGain = kingPawnShield - beforePawnShield;
    const breaksKingShield = pawnShieldGain < -0.08;
    const queenSafety = queenDisciplineValue(afterPieces, playerId);
    const queenSafetyGain = queenSafety - beforeQueenSafety;
    const nearestDangerBefore = nearestEnemyDistance(
      state.pieces,
      playerId,
      mover,
    );
    const nearestDangerAfter = nearestEnemyDistance(
      afterPieces,
      playerId,
      move.to,
    );
    const pawnAdvancesIntoDanger =
      mover.type === "pawn" && nearestDangerAfter < nearestDangerBefore;
    const pawnForwardCovered =
      mover.type === "pawn" &&
      pawnHasForwardCover(afterPieces, playerId, mover.id);
    const reproductionException = moveEnablesQueenReproduction(state, move);
    const retreatBait = Boolean(
      mover.type === "pawn" &&
        nearestDangerBefore <= 3 &&
        nearestDangerAfter > nearestDangerBefore &&
        (!isSquareAttacked(afterPieces, move.to, playerId) ||
          pawnForwardCovered),
    );
    const capturesChecker = Boolean(
      (target && checkingIds.has(target.id)) ||
        (acidVictim && checkingIds.has(acidVictim.id)) ||
        blastVictims.some((victim) => checkingIds.has(victim.id)),
    );
    const freesQueenCell =
      mover.type === "pawn" &&
      bondedQueens.some(
        (queen) =>
          hexDistance(mover, queen) === 1 &&
          hexDistance(move.to, queen) > 1,
      );
    const movedQueen =
      mover.type === "queen"
        ? afterPieces.find((piece) => piece.id === mover.id)
        : undefined;
    const openQueenNursery = movedQueen
      ? queenSpawnCells(afterPieces, movedQueen).length /
        Math.max(1, neighbors(movedQueen).length)
      : 0;
    const nurseryGain = Math.max(0, features[13]);
    const nurseryScore = guardrailsEnabled
      ? nurseryGain * 3.8 +
        (freesQueenCell ? 0.72 : 0) +
        (mover.type === "queen" && nurseryGain > 0
          ? 0.65 + openQueenNursery * 0.6
          : 0)
      : nurseryGain * 0.24;
    const unnecessaryKingWalk =
      mover.type === "king" && !kingWasChecked && safetyGain < 0.16 ? 0.62 : 0;
    const crushesFriendlyEgg =
      target?.playerId === playerId && target.type === "egg";
    const movedQueenAfter =
      mover.type === "queen"
        ? afterPieces.find((piece) => piece.id === mover.id)
        : undefined;
    const hatchTrapRisk = movedQueenAfter
      ? queenHatchTrapRisk(afterPieces, playerId, movedQueenAfter.id)
      : 0;
    const ownQueensAfterMove = afterPieces.filter(
      (piece) => piece.playerId === playerId && piece.type === "queen",
    );
    const queenLostByMove = ownQueens.some(
      (queen) =>
        !ownQueensAfterMove.some((afterQueen) => afterQueen.id === queen.id),
    );
    const ownQueenAtRiskAfterMove = ownQueensAfterMove.some(
      (queen) =>
        isQueenTacticallyCapturable(afterPieces, queen, playerId) ||
        queenHatchTrapRisk(afterPieces, playerId, queen.id) >= 0.95,
    );
    const ownQueenEndangered = queenLostByMove || ownQueenAtRiskAfterMove;
    const capturesEnemyQueen = Boolean(
      (target?.playerId !== playerId && target?.type === "queen") ||
        acidVictim?.type === "queen" ||
        blastVictims.some(
          (victim) =>
            victim.playerId !== playerId && victim.type === "queen",
        ),
    );
    const queenTradeWouldSacrifice = Boolean(
      capturesEnemyQueen && ownQueenEndangered,
    );
    const queenTradeBackedByPromotion = Boolean(
      !queenTradeWouldSacrifice || strategicQueenReserve,
    );
    const decisiveQueenTrade =
      capturesEnemyQueen && queenTradeBackedByPromotion;
    const queenSacrifice = ownQueenEndangered && !decisiveQueenTrade;
    const afterKing = afterPieces.find(
      (piece) => piece.playerId === playerId && piece.type === "king",
    );
    const unbondedDistanceAfter =
      afterKing && unbondedQueens.length
        ? Math.min(
            ...unbondedQueens.map((queen) => {
              const afterQueen = afterPieces.find(
                (piece) => piece.id === queen.id,
              );
              return afterQueen
                ? hexDistance(afterQueen, afterKing)
                : unbondedDistanceBefore;
            }),
          )
        : unbondedDistanceBefore;
    const royalBondGain = Math.max(
      0,
      unbondedDistanceBefore - unbondedDistanceAfter,
    );
    const startsRoyalCocoon =
      unbondedDistanceBefore > 1 && unbondedDistanceAfter === 1;
    const vortexAttack = Boolean(
      vortexPreparation &&
        mover.type === "pawn" &&
        ((target && target.playerId !== playerId) ||
          features[1] > 0 ||
          (pawnAdvancesIntoDanger &&
            isSquareAttacked(afterPieces, move.to, playerId))),
    );
    const pressureGain = Math.max(
      0,
      nearestDangerBefore - nearestDangerAfter,
    );
    const contextStrategicGain =
      Math.max(0, features[0]) * 2.4 +
      Math.max(0, features[3]) * 1.8 +
      Math.max(0, features[4]) * 3.2 +
      Math.max(0, features[8]) * 0.75 +
      Math.max(0, features[9]) * 0.85 +
      Math.max(0, features[13]) * 3.4 +
      pressureGain * 0.34 +
      (freesQueenCell ? 1.4 : 0) +
      (reproductionException ? 1.8 : 0);
    const movedPawnAfter =
      mover.type === "pawn"
        ? afterPieces.find((piece) => piece.id === mover.id)
        : undefined;
    const pawnWouldBeSacrificed = Boolean(
      movedPawnAfter &&
        isSquareAttacked(afterPieces, movedPawnAfter, playerId) &&
        !pawnForwardCovered,
    );
    const contextSacrificeApproved = Boolean(
      contextIntent &&
        (contextIntent === "border_pressure" || contextIntent === "breach") &&
        strategyTracker.failedSacrifices <
          STRATEGIC_SACRIFICE_FAILURE_LIMIT &&
        mover.type === "pawn" &&
        pawnWouldBeSacrificed &&
        contextStrategicGain >= 0.48 &&
        beforeKingSafety > -0.12 &&
        beforeQueenSafety > -0.28 &&
        !breaksKingShield &&
        !crushesFriendlyEgg,
    );
    let contextBonus = 0;
    if (contextIntent === "secure_royals") {
      contextBonus =
        safetyGain * 4.2 +
        queenSafetyGain * 3.2 +
        pawnShieldGain * 2.8 +
        (capturesChecker ? 3.4 : 0);
    } else if (contextIntent === "open_nursery") {
      contextBonus =
        nurseryGain * 7.4 +
        (freesQueenCell ? 3.2 : 0) +
        (reproductionException ? 3.6 : 0) +
        openQueenNursery * 2.2;
    } else if (contextIntent === "lay") {
      contextBonus =
        features[10] * 2.6 +
        nurseryGain * 5.4 +
        (freesQueenCell ? 2.1 : 0) +
        (reproductionException ? 2.8 : 0);
    } else if (contextIntent === "border_pressure") {
      contextBonus =
        pressureGain * 0.82 +
        Math.max(0, features[3]) * 2.2 +
        Math.max(0, features[9]) * 1.35 +
        (contextSacrificeApproved ? 2.3 : 0);
    } else if (contextIntent === "breach") {
      contextBonus =
        Math.max(0, features[0]) * 4.4 +
        pressureGain * 0.68 +
        Math.max(0, features[3]) * 2.6 +
        (contextSacrificeApproved ? 3.1 : 0);
    } else if (contextIntent === "promotion") {
      contextBonus =
        Math.max(0, features[4]) * 6.4 +
        Math.max(0, features[8]) * 2.8 +
        royalBondGain * 0.8;
    }
    const queenSacrificePenalty =
      guardrailsEnabled && queenSacrifice
        ? 7.5 +
          Math.max(
            0,
            ...ownQueens.map((queen) =>
              queenFutureValue(state.pieces, playerId, queen),
            ),
          ) *
            0.5
        : ownQueenEndangered
          ? 0.42
          : 0;
    const phaseScore = phaseMoveBonus(
      state,
      mover,
      move,
      afterPieces,
      features,
      phase,
    );
    const defensiveScore = guardrailsEnabled
      ? kingSafety * 1.32 +
        safetyGain * 3.45 +
        queenSafety * 1.08 +
        queenSafetyGain * 2.35 +
        (capturesChecker ? 2.4 : 0) -
        unnecessaryKingWalk
      : safetyGain * 0.28;
    const pawnShieldScore = guardrailsEnabled
      ? pawnShieldGain * 4.4 +
        (mover.type === "pawn" && pawnShieldGain > 0 ? 0.68 : 0) -
        (breaksKingShield ? 1.45 : 0)
      : pawnShieldGain * 0.15;
    const hatchTrapPenalty = hatchTrapRisk *
      (guardrailsEnabled ? 4.8 : 0.25);
    const royalMobilityPenalty = guardrailsEnabled
      ? (futureOrdinaryMobility === 0
          ? 4.9
          : futureOrdinaryMobility <= 2
            ? 1.15
            : 0) +
        solitudeProgress * 3.4
      : solitudeProgress * 0.2;
    const legacyScore = scorer(decisionWeights, features);
    let learnedResidual = 0;
    if (moveScoreAugmenter) {
      try {
        const candidate = moveScoreAugmenter({
          state: canonicalState,
          move: canonicalMove,
          features,
          queenEscapeFeatures: queenEscapeContext.features,
          queenEscapeContextScore,
          legacyScore,
          decisionWeights,
          phase,
          personality,
        });
        if (Number.isFinite(candidate)) {
          learnedResidual = Math.max(-1.25, Math.min(1.25, candidate));
        }
      } catch {
        // Le chemin de décision V2 reste disponible si la branche apprise
        // n'est pas exploitable sur un appareil.
      }
    }
    return {
      move: contextIntent
        ? {
            ...move,
            contextIntent,
            contextReplan: strategyTracker.replanPending,
            contextSacrifice: contextSacrificeApproved,
          }
        : move,
      features,
      queenEscapeFeatures: queenEscapeContext.features,
      queenEscapeContextScore,
      phase,
      kingSafety,
      kingPawnShield,
      pawnShieldGain,
      breaksKingShield,
      futureOrdinaryMobility,
      solitudeProgress,
      queenSafety,
      capturesChecker,
      capturesEnemyQueen,
      crushesFriendlyEgg,
      queenSacrifice,
      decisiveQueenTrade,
      queenTradeWouldSacrifice,
      queenTradeBackedByPromotion,
      hatchTrapRisk,
      pawnAdvancesIntoDanger,
      pawnForwardCovered,
      reproductionException,
      retreatBait,
      vortexAttack,
      royalBondGain,
      startsRoyalCocoon,
      contextSacrificeApproved,
      predictedScore:
        legacyScore +
        learnedResidual +
        queenEscapeContextScore +
        defensiveScore +
        pawnShieldScore +
        nurseryScore +
        phaseScore +
        contextBonus -
        queenSacrificePenalty -
        hatchTrapPenalty -
        royalMobilityPenalty -
        (crushesFriendlyEgg ? 4.6 : 0) +
        (guardrailsEnabled && survivalFormation && pawnForwardCovered
          ? 1.15
          : 0) +
        (guardrailsEnabled && retreatBait ? 1.75 : 0) +
        (guardrailsEnabled && reproductionException ? 1.55 : 0) +
        (guardrailsEnabled && vortexAttack ? 4.25 : 0) +
        (guardrailsEnabled ? royalBondGain * 5.2 : royalBondGain * 0.35) +
        (guardrailsEnabled && startsRoyalCocoon ? 4.4 : 0),
    };
  });
  // L'évasion doit pouvoir récupérer n'importe quel coup légal qui respecte
  // les protections du roi, de la reine et des œufs, même si une préférence
  // stratégique ordinaire l'aurait éliminé plus bas dans le pipeline.
  const antiLoopCandidatePool = [...choices];
  if (guardrailsEnabled && choices.length > 1) {
    const queenPreservingChoices = choices.filter(
      (choice) =>
        !choice.queenSacrifice &&
        (!choice.queenTradeWouldSacrifice ||
          choice.queenTradeBackedByPromotion),
    );
    // Un sacrifice royal reste un dernier recours : dès qu'un coup légal
    // préserve la reine, aucune pondération apprise ne peut le contourner.
    if (queenPreservingChoices.length) choices = queenPreservingChoices;
  }
  if (guardrailsEnabled && !vortexPreparation && choices.length > 1) {
    const lawfulQueenTrades = choices.filter(
      (choice) =>
        !choice.queenTradeWouldSacrifice ||
        choice.queenTradeBackedByPromotion,
    );
    if (lawfulQueenTrades.length) choices = lawfulQueenTrades;
  }
  const queenCaptureChoices = choices.filter(
    (choice) =>
      choice.capturesEnemyQueen &&
      (!choice.queenTradeWouldSacrifice ||
        choice.queenTradeBackedByPromotion),
  );
  if (queenCaptureChoices.length) choices = queenCaptureChoices;
  if (
    guardrailsEnabled &&
    unbondedQueens.length > 0 &&
    choices.length > 1
  ) {
    const cocoonChoices = choices.filter(
      (choice) =>
        choice.startsRoyalCocoon ||
        choice.capturesChecker ||
        choice.capturesEnemyQueen,
    );
    if (cocoonChoices.some((choice) => choice.startsRoyalCocoon)) {
      choices = cocoonChoices;
    } else {
      const bestBondGain = Math.max(
        0,
        ...choices.map((choice) => choice.royalBondGain),
      );
      if (bestBondGain > 0) {
        const homewardChoices = choices.filter(
          (choice) =>
            choice.royalBondGain >= bestBondGain ||
            choice.capturesChecker ||
            choice.capturesEnemyQueen,
        );
        if (homewardChoices.length) choices = homewardChoices;
      }
    }
  }
  if (guardrailsEnabled && vortexPreparation && choices.length > 1) {
    const sacrificialAttacks = choices.filter(
      (choice) => choice.vortexAttack,
    );
    if (sacrificialAttacks.length) choices = sacrificialAttacks;
  }
  if (
    guardrailsEnabled &&
    survivalFormation &&
    !vortexPreparation &&
    choices.length > 1
  ) {
    const coveredFormation = choices.filter(
      (choice) =>
        !choice.pawnAdvancesIntoDanger ||
        choice.pawnForwardCovered ||
        choice.contextSacrificeApproved ||
        choice.reproductionException ||
        choice.capturesChecker ||
        choice.capturesEnemyQueen,
    );
    if (coveredFormation.length) choices = coveredFormation;
    const retreats = choices.filter(
      (choice) =>
        choice.retreatBait ||
        choice.capturesChecker ||
        choice.capturesEnemyQueen,
    );
    if (retreats.some((choice) => choice.retreatBait)) choices = retreats;
  }
  if (guardrailsEnabled && !vortexPreparation && choices.length > 1) {
    const mobileChoices = choices.filter(
      (choice) =>
        choice.futureOrdinaryMobility > 0 ||
        choice.capturesEnemyQueen ||
        choice.capturesChecker ||
        choice.features[1] > 0,
    );
    if (mobileChoices.length) choices = mobileChoices;
  }
  if (guardrailsEnabled && !vortexPreparation && choices.length > 1) {
    const safest = Math.max(...choices.map((choice) => choice.kingSafety));
    const defensiveFloor = Math.max(-0.3, safest - 0.22);
    const kingSafeChoices = choices.filter(
      (choice) =>
        choice.kingSafety >= defensiveFloor || choice.capturesChecker,
    );
    if (kingSafeChoices.length) choices = kingSafeChoices;
  }
  if (guardrailsEnabled && !vortexPreparation && choices.length > 1) {
    const shieldPreservingChoices = choices.filter(
      (choice) =>
        !choice.breaksKingShield ||
        choice.capturesEnemyQueen ||
        choice.capturesChecker ||
        choice.features[1] > 0,
    );
    if (shieldPreservingChoices.length) choices = shieldPreservingChoices;
    const bestShield = Math.max(
      ...choices.map((choice) => choice.kingPawnShield),
    );
    if (
      beforePawnShield < 0.45 &&
      beforeKingSafety < 0.08 &&
      bestShield > beforePawnShield + 0.08
    ) {
      const shieldBuildingChoices = choices.filter(
        (choice) =>
          choice.kingPawnShield >= bestShield - 0.04 ||
          choice.capturesEnemyQueen ||
          choice.capturesChecker,
      );
      if (shieldBuildingChoices.length) choices = shieldBuildingChoices;
    }
  }
  if (
    guardrailsEnabled &&
    royalPairAlive(state.pieces, playerId) &&
    choices.length > 1
  ) {
    const safestQueen = Math.max(
      ...choices.map((choice) => choice.queenSafety),
    );
    const queenSafetyFloor = Math.max(-0.38, safestQueen - 0.28);
    const queenSafeChoices = choices.filter(
      (choice) =>
        choice.queenSafety >= queenSafetyFloor || choice.capturesChecker,
    );
    if (queenSafeChoices.length) choices = queenSafeChoices;
  }
  if (
    guardrailsEnabled &&
    royalPairAlive(state.pieces, playerId) &&
    choices.length > 1
  ) {
    const nonSacrificialChoices = choices.filter(
      (choice) => !choice.queenSacrifice || choice.decisiveQueenTrade,
    );
    if (nonSacrificialChoices.length) choices = nonSacrificialChoices;
  }
  if (
    guardrailsEnabled &&
    (phase === "brood_protection" || phase === "reproduction") &&
    choices.length > 1
  ) {
    const broodPreservingChoices = choices.filter(
      (choice) => !choice.crushesFriendlyEgg,
    );
    if (broodPreservingChoices.length) choices = broodPreservingChoices;
  }
  if (guardrailsEnabled && royalPairAlive(state.pieces, playerId)) {
    const spawnPreservingChoices = choices.filter(
      (choice) => choice.features[10] >= 0,
    );
    if (spawnPreservingChoices.length) choices = spawnPreservingChoices;
  }
  if (guardrailsEnabled) {
    const queenDisciplinedChoices = choices.filter((choice) => {
      const movingPiece = state.pieces.find(
        (piece) => piece.id === choice.move.pieceId,
      );
      if (movingPiece?.type !== "queen") return true;
      const tacticalException =
        choice.decisiveQueenTrade ||
        (choice.features[1] > 0 && choice.features[0] >= 0.9);
      return choice.features[12] >= 0 || tacticalException;
    });
    if (queenDisciplinedChoices.length) choices = queenDisciplinedChoices;
  }
  if (antiLoopEscape && choices.length) {
    const cycleSet = new Set([
      ...loopTracker.cycleSignatures,
      ...loopTracker.history
        .slice(-Math.max(2, loopTracker.cycleLength * 2))
        .map((entry) => entry.signature),
    ]);
    const recreatesActionPattern = (choice: AIChoice) =>
      repeatedActionTail([
        ...loopTracker.actionHistory,
        loopActionSignatureForMove(state, playerId, choice.move),
      ]).repeatCount >= LOOP_ESCAPE_REPETITION;
    const escapeOutcomes = antiLoopCandidatePool.map((choice) => {
      const simulated = applyMove(state, choice.move, {
        skipLoopTracking: true,
      });
      return {
        choice,
        recreatesCycle:
          cycleSet.has(strategicPositionSignature(simulated)) ||
          recreatesActionPattern(choice),
        safe: isGuardrailSafeMove(state, playerId, choice.move),
      };
    });
    const safeEscapes = escapeOutcomes.filter(
      (outcome) => outcome.safe && !outcome.recreatesCycle,
    );
    if (safeEscapes.length) {
      choices = safeEscapes.map(({ choice }) => ({
        ...choice,
        move: { ...choice.move, antiLoopEscape: true },
        predictedScore: choice.predictedScore + 8,
      }));
    } else {
      const outcomes = choices.map((choice) => {
        const simulated = applyMove(state, choice.move, {
          skipLoopTracking: true,
        });
        return {
          choice,
          recreatesCycle:
            cycleSet.has(strategicPositionSignature(simulated)) ||
            recreatesActionPattern(choice),
        };
      });
      choices = outcomes.map(({ choice, recreatesCycle }) => ({
        ...choice,
        move: { ...choice.move, antiLoopEscape: true },
        predictedScore: choice.predictedScore - (recreatesCycle ? 18 : 0),
      }));
    }
  }
  choices.sort((a, b) => b.predictedScore - a.predictedScore);
  if (choices.length > 2 && Math.random() < explorationRate) {
    return choices[
      Math.floor(Math.random() * Math.min(explorationPool, choices.length))
    ];
  }
  return choices[0];
}

export function immediateReward(
  state: GameState,
  move: Move,
  personality: AIPersonalityId = "balanced",
): number {
  const mover = state.pieces.find((piece) => piece.id === move.pieceId)!;
  const target = pieceAt(state.pieces, move.to);
  const acidVictim = queenCrossedByJump(state.pieces, move);
  const blastVictims = eggBlastVictimsForMove(state.pieces, move);
  const blastMaterialSwing = eggBlastMaterialSwing(
    state.pieces,
    move,
    mover.playerId,
  );
  const features = moveFeatures(state, move);
  const phase = selectStrategicPhase(state, mover.playerId, personality);
  const afterPieces = movePieces(state.pieces, move);
  const ownQueens = state.pieces.filter(
    (piece) =>
      piece.playerId === mover.playerId && piece.type === "queen",
  );
  const survivalFormation =
    ownQueens.length === 0 ||
    isSeverelyOutnumbered(state.pieces, mover.playerId);
  const vortexPreparation = isVortexPreparationMode(state, mover.playerId);
  const dangerBefore = nearestEnemyDistance(
    state.pieces,
    mover.playerId,
    mover,
  );
  const dangerAfter = nearestEnemyDistance(
    afterPieces,
    mover.playerId,
    move.to,
  );
  const pawnAdvancesIntoDanger =
    mover.type === "pawn" && dangerAfter < dangerBefore;
  const pawnForwardCovered =
    mover.type === "pawn" &&
    pawnHasForwardCover(afterPieces, mover.playerId, mover.id);
  const reproductionException = moveEnablesQueenReproduction(state, move);
  const retreatBait =
    mover.type === "pawn" &&
    dangerBefore <= 3 &&
    dangerAfter > dangerBefore &&
    (!isSquareAttacked(afterPieces, move.to, mover.playerId) ||
      pawnForwardCovered);
  const futureOrdinaryMobility = ordinaryLegalMoveCount(
    { ...state, pieces: afterPieces },
    mover.playerId,
    3,
  );
  const ownPiecesAfterMove = afterPieces.filter(
    (piece) => piece.playerId === mover.playerId,
  );
  const onlyKingRemains =
    ownPiecesAfterMove.some((piece) => piece.type === "king") &&
    !ownPiecesAfterMove.some(
      (piece) =>
        piece.type === "queen" ||
        (piece.type === "pawn" && !isZombieTermite(piece)),
    );
  const solitudeProgress = onlyKingRemains
    ? Math.min(
        1,
        ((state.players.find((player) => player.id === mover.playerId)
          ?.solitaryKingTurns ?? 0) +
          1) /
          KING_SOLITUDE_ESCAPE_TURNS,
      )
    : 0;
  const kingSafetyGain =
    kingSafetyValue(afterPieces, mover.playerId) -
    kingSafetyValue(state.pieces, mover.playerId);
  const pawnShieldGain =
    kingPawnShieldValue(afterPieces, mover.playerId) -
    kingPawnShieldValue(state.pieces, mover.playerId);
  const movedQueen =
    mover.type === "queen"
      ? afterPieces.find((piece) => piece.id === mover.id)
      : undefined;
  const hatchTrapRisk = movedQueen
    ? queenHatchTrapRisk(afterPieces, mover.playerId, movedQueen.id)
    : 0;
  const queenExposurePenalty =
    (movedQueen &&
    isQueenTacticallyCapturable(afterPieces, movedQueen, mover.playerId)
      ? queenFutureValue(state.pieces, mover.playerId, mover) * 0.045
      : 0) + hatchTrapRisk * 0.42;
  const capturesEnemyQueen = Boolean(
    (target?.playerId !== mover.playerId && target?.type === "queen") ||
      acidVictim?.type === "queen" ||
      blastVictims.some(
        (victim) =>
          victim.playerId !== mover.playerId && victim.type === "queen",
      ),
  );
  const strategicQueenReserve = Boolean(
    unstoppablePromotionPawn(state.pieces, mover.playerId) &&
      hasOverwhelmingArmyForQueenTrade(state.pieces, mover.playerId),
  );
  const queenTradeSacrifice = Boolean(
    capturesEnemyQueen &&
      movedQueen &&
      isQueenTacticallyCapturable(afterPieces, movedQueen, mover.playerId) &&
      !strategicQueenReserve,
  );
  const beforeKing = state.pieces.find(
    (piece) => piece.playerId === mover.playerId && piece.type === "king",
  );
  const afterKing = afterPieces.find(
    (piece) => piece.playerId === mover.playerId && piece.type === "king",
  );
  const unbondedQueens = state.pieces.filter(
    (piece) =>
      piece.playerId === mover.playerId &&
      piece.type === "queen" &&
      !piece.queenBonded &&
      (piece.breedingTurns ?? 0) <= 0,
  );
  const bondDistanceBefore =
    beforeKing && unbondedQueens.length
      ? Math.min(...unbondedQueens.map((queen) => hexDistance(queen, beforeKing)))
      : 0;
  const bondDistanceAfter =
    afterKing && unbondedQueens.length
      ? Math.min(
          ...unbondedQueens.map((queen) => {
            const moved = afterPieces.find((piece) => piece.id === queen.id);
            return moved ? hexDistance(moved, afterKing) : bondDistanceBefore;
          }),
        )
      : bondDistanceBefore;
  const royalBondGain = Math.max(0, bondDistanceBefore - bondDistanceAfter);
  const startsRoyalCocoon =
    bondDistanceBefore > 1 && bondDistanceAfter === 1;
  const vortexAttack =
    vortexPreparation &&
    mover.type === "pawn" &&
    ((target && target.playerId !== mover.playerId) ||
      features[1] > 0 ||
      (pawnAdvancesIntoDanger &&
        isSquareAttacked(afterPieces, move.to, mover.playerId)));
  const crushedFriendlyEgg =
    target?.playerId === mover.playerId && target.type === "egg";
  const phaseReward = phaseMoveBonus(
    state,
    mover,
    move,
    afterPieces,
    features,
    phase,
  );
  return Math.max(
    -1,
    Math.min(
      1.5,
      (captureValueForMover(mover, target) +
        (acidVictim ? PIECE_VALUE[acidVictim.type] : 0) +
        blastMaterialSwing) /
        12 +
        features[1] * 0.25 +
        features[3] * 0.14 +
        features[4] * 0.8 +
        features[2] * 0.08 -
        features[5] * (mover.type === "queen" ? 0.3 : 0.08) +
        features[10] * 0.12 +
        features[12] * 0.18 +
        features[13] * 0.28 +
        kingSafetyGain * 0.24 +
        pawnShieldGain * 0.3 +
        Math.min(1, futureOrdinaryMobility / 8) * 0.08 -
        (futureOrdinaryMobility === 0 ? 0.28 : 0) -
        solitudeProgress * 0.22 +
        (capturesEnemyQueen ? 0.55 : 0) +
        (survivalFormation && pawnForwardCovered ? 0.16 : 0) +
        (survivalFormation && pawnAdvancesIntoDanger &&
        !pawnForwardCovered &&
        !reproductionException &&
        !vortexPreparation
          ? -0.62
          : 0) +
        (retreatBait ? 0.24 : 0) +
        (reproductionException ? 0.22 : 0) +
        (vortexAttack ? 0.48 : 0) +
        royalBondGain * 0.34 +
        (startsRoyalCocoon ? 0.65 : 0) -
        (queenTradeSacrifice ? 0.95 : 0) +
        phaseReward * 0.16 -
        queenExposurePenalty -
        (crushedFriendlyEgg ? 0.72 : 0),
    ),
  );
}

export function reinforceAi(
  memory: AIMemory,
  features: number[],
  reward: number,
  queenEscapeFeatures: number[] = [],
): AIMemory {
  const prediction = Math.tanh(dotScore(memory.weights, features) / 4);
  const error = reward - prediction;
  const weights = memory.weights.map((weight, index) =>
    Math.max(
      -4,
      Math.min(4, weight + memory.learningRate * error * (features[index] ?? 0)),
    ),
  );
  const queenEscapeSource = queenEscapeWeightsForMemory(memory);
  const queenEscapePrediction = Math.tanh(
    dotScore(queenEscapeSource, queenEscapeFeatures) / 2,
  );
  const queenEscapeError = reward - queenEscapePrediction;
  const queenEscapeWeights = queenEscapeFeatures.length
    ? queenEscapeSource.map((weight, index) =>
        Math.max(
          -4,
          Math.min(
            4,
            weight +
              memory.learningRate *
                0.35 *
                queenEscapeError *
                (queenEscapeFeatures[index] ?? 0),
          ),
        ),
      )
    : queenEscapeSource;
  return {
    ...memory,
    weights,
    modules: {
      ...memory.modules,
      queenEscapeContext: {
        version: QUEEN_ESCAPE_CONTEXT_VERSION,
        weights: queenEscapeWeights,
        championWeights: queenEscapeWeightsForMemory(memory, true),
      },
    },
    decisions: memory.decisions + 1,
    fitness: memory.fitness + reward,
  };
}

export function evolveAfterGame(memory: AIMemory, aiWon: boolean): AIMemory {
  const finalFitness = memory.fitness + (aiWon ? 2 : -0.5);
  const improved = finalFitness > memory.bestFitness;
  const championWeights = improved ? [...memory.weights] : [...memory.championWeights];
  const base = improved ? memory.weights : memory.championWeights;
  const mutationScale = Math.max(0.012, 0.07 / Math.sqrt(memory.generation));
  const weights = base.map((weight) =>
    Math.max(-4, Math.min(4, weight + (Math.random() - 0.5) * mutationScale)),
  );
  const currentQueenEscapeWeights = queenEscapeWeightsForMemory(memory);
  const currentQueenEscapeChampion = queenEscapeWeightsForMemory(memory, true);
  const queenEscapeChampionWeights = improved
    ? currentQueenEscapeWeights
    : currentQueenEscapeChampion;
  const queenEscapeWeights = queenEscapeChampionWeights.map((weight) =>
    Math.max(
      -4,
      Math.min(4, weight + (Math.random() - 0.5) * mutationScale * 0.55),
    ),
  );
  return {
    ...memory,
    weights,
    championWeights,
    modules: {
      ...memory.modules,
      queenEscapeContext: {
        version: QUEEN_ESCAPE_CONTEXT_VERSION,
        weights: queenEscapeWeights,
        championWeights: [...queenEscapeChampionWeights],
      },
    },
    generation: memory.generation + 1,
    games: memory.games + 1,
    bestFitness: improved ? finalFitness : memory.bestFitness,
    fitness: 0,
  };
}

function finiteWeightArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (
    !value.length ||
    value.some(
      (weight) => typeof weight !== "number" || !Number.isFinite(weight),
    )
  ) {
    return undefined;
  }
  return value;
}

function migrateKnownWeightVector(
  imported: number[],
  local: readonly number[],
  expectedLength: number,
  moduleName: string,
  diagnostics: string[],
): number[] {
  if (imported.length !== expectedLength) {
    diagnostics.push(
      `${moduleName}: ${imported.length} paramètres reçus, migration sûre du préfixe vers ${expectedLength}.`,
    );
  }
  return Array.from(
    { length: expectedLength },
    (_, index) => imported[index] ?? local[index] ?? 0,
  );
}

export function validateImportedMemory(
  value: unknown,
  currentMemory?: AIMemory,
  diagnostics: string[] = [],
): AIMemory | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AIMemory> & {
    modules?: Record<string, unknown>;
  };
  const importedWeights = finiteWeightArray(candidate.weights);
  if (
    candidate.schema !== "fabhexagrogne-ai" ||
    candidate.version !== 1 ||
    !importedWeights ||
    importedWeights.length < 12
  ) {
    return undefined;
  }
  const fallback = currentMemory ?? createDefaultAIMemory();
  const weights = migrateKnownWeightVector(
    importedWeights,
    fallback.weights,
    DEFAULT_WEIGHTS.length,
    "core",
    diagnostics,
  );
  const importedChampion = finiteWeightArray(candidate.championWeights);
  const championWeights = importedChampion && importedChampion.length >= 12
    ? migrateKnownWeightVector(
        importedChampion,
        fallback.championWeights,
        DEFAULT_WEIGHTS.length,
        "core.championWeights",
        diagnostics,
      )
    : [...weights];
  const fallbackQueenWeights = queenEscapeWeightsForMemory(fallback);
  const fallbackQueenChampion = queenEscapeWeightsForMemory(fallback, true);
  const rawQueenModule = candidate.modules?.queenEscapeContext as
    | Partial<AIMemoryWeightModule>
    | undefined;
  let queenEscapeWeights = fallbackQueenWeights;
  let queenEscapeChampion = fallbackQueenChampion;
  if (rawQueenModule) {
    if (rawQueenModule.version !== QUEEN_ESCAPE_CONTEXT_VERSION) {
      diagnostics.push(
        `queenEscapeContext: version ${String(rawQueenModule.version)} incompatible, module local conservé.`,
      );
    } else {
      const importedQueenWeights = finiteWeightArray(rawQueenModule.weights);
      if (importedQueenWeights) {
        queenEscapeWeights = migrateKnownWeightVector(
          importedQueenWeights,
          fallbackQueenWeights,
          DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.length,
          "queenEscapeContext",
          diagnostics,
        );
      } else {
        diagnostics.push(
          "queenEscapeContext: paramètres invalides, module local conservé.",
        );
      }
      const importedQueenChampion = finiteWeightArray(
        rawQueenModule.championWeights,
      );
      queenEscapeChampion = importedQueenChampion
        ? migrateKnownWeightVector(
            importedQueenChampion,
            fallbackQueenChampion,
            DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.length,
            "queenEscapeContext.championWeights",
            diagnostics,
          )
        : [...queenEscapeWeights];
    }
  }
  return {
    ...fallback,
    ...candidate,
    schema: "fabhexagrogne-ai",
    version: 1,
    weights,
    championWeights,
    modules: {
      queenEscapeContext: {
        version: QUEEN_ESCAPE_CONTEXT_VERSION,
        weights: queenEscapeWeights,
        championWeights: queenEscapeChampion,
      },
    },
    wasmReady: false,
  };
}
