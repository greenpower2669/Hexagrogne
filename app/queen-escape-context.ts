import type {
  Coord,
  GameState,
  Move,
  Piece,
  PlayerId,
} from "./game-engine";

export const QUEEN_ESCAPE_CONTEXT_MODULE_NAME = "queenEscapeContext";
export const QUEEN_ESCAPE_CONTEXT_VERSION = 1;
export const QUEEN_ESCAPE_CONTEXT_FEATURE_ORDER = [
  "safeEscapeCount",
  "secondLevelEscape",
  "friendlyBlockers",
  "escapeCreatedByMove",
  "escapeRemovedByMove",
  "queenTrapRisk",
] as const;

export const DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS = [
  0.72,
  0.12,
  -0.18,
  0.46,
  -0.52,
  -0.68,
] as const;

export interface QueenEscapeContextVector {
  safeEscapeCount: number;
  secondLevelEscape: number;
  friendlyBlockers: number;
  escapeCreatedByMove: number;
  escapeRemovedByMove: number;
  queenTrapRisk: number;
  features: number[];
}

export interface QueenEscapeRuntime {
  movePieces: (pieces: Piece[], move: Move) => Piece[];
  legalQueenMoves: (state: GameState, queenId: string) => Move[];
  queenPotentialTargets: (queen: Piece) => Coord[];
  pieceAt: (pieces: Piece[], coord: Coord) => Piece | undefined;
  isQueenTacticallyCapturable: (
    pieces: Piece[],
    queen: Piece,
    playerId: PlayerId,
  ) => boolean;
}

interface QueenMobility {
  queenId: string;
  safeEscapeCount: number;
  secondLevelEscape: number;
  friendlyBlockers: number;
  trapRisk: number;
}

function sameCoord(a: Coord, b: Coord): boolean {
  return a.q === b.q && a.r === b.r;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function stateWithPieces(state: GameState, pieces: Piece[]): GameState {
  return { ...state, pieces };
}

function safeQueenMoves(
  state: GameState,
  queen: Piece,
  runtime: QueenEscapeRuntime,
): Move[] {
  return runtime.legalQueenMoves(state, queen.id).filter((move) => {
    const occupant = runtime.pieceAt(state.pieces, move.to);
    if (
      occupant?.playerId === queen.playerId &&
      occupant.type === "egg"
    ) {
      return false;
    }
    const projected = runtime.movePieces(state.pieces, move);
    const movedQueen = projected.find(
      (piece) =>
        piece.id === queen.id &&
        piece.playerId === queen.playerId &&
        piece.type === "queen",
    );
    return Boolean(
      movedQueen &&
        !runtime.isQueenTacticallyCapturable(
          projected,
          movedQueen,
          queen.playerId,
        ),
    );
  });
}

function trapRiskForSafeEscapes(safeEscapeCount: number): number {
  if (safeEscapeCount <= 0) return 4;
  if (safeEscapeCount === 1) return 3;
  if (safeEscapeCount === 2) return 1.5;
  if (safeEscapeCount === 3) return 0.5;
  return 0;
}

function queenMobility(
  state: GameState,
  queen: Piece,
  runtime: QueenEscapeRuntime,
  includeSecondLevel = true,
): QueenMobility {
  const directMoves = safeQueenMoves(state, queen, runtime);
  const secondLevelCounts = includeSecondLevel
    ? directMoves.slice(0, 4).map((directMove) => {
        const projected = runtime.movePieces(state.pieces, directMove);
        const movedQueen = projected.find(
          (piece) => piece.id === queen.id && piece.type === "queen",
        );
        if (!movedQueen) return 0;
        return Math.min(
          4,
          runtime
            .queenPotentialTargets(movedQueen)
            .filter((target) => {
              if (sameCoord(target, queen)) return false;
              const occupant = runtime.pieceAt(projected, target);
              if (!occupant) return true;
              if (occupant.playerId === queen.playerId) return false;
              return occupant.type !== "king";
            }).length,
        );
      })
    : [];
  const secondLevelEscape = secondLevelCounts.length
    ? secondLevelCounts.reduce(
        (total, count) => total + Math.min(4, count),
        0,
      ) / secondLevelCounts.length
    : 0;
  const friendlyBlockers = runtime
    .queenPotentialTargets(queen)
    .filter((target) => {
      const occupant = runtime.pieceAt(state.pieces, target);
      return Boolean(
        occupant &&
          occupant.id !== queen.id &&
          occupant.playerId === queen.playerId,
      );
    }).length;
  return {
    queenId: queen.id,
    safeEscapeCount: directMoves.length,
    secondLevelEscape,
    friendlyBlockers,
    trapRisk: trapRiskForSafeEscapes(directMoves.length),
  };
}

function weakestWeightedAverage(values: number[]): number {
  if (!values.length) return 0;
  const weakest = Math.min(...values);
  const average = values.reduce((total, value) => total + value, 0) /
    values.length;
  return weakest * 0.72 + average * 0.28;
}

function strongestWeightedAverage(values: number[]): number {
  if (!values.length) return 0;
  const strongest = Math.max(...values);
  const average = values.reduce((total, value) => total + value, 0) /
    values.length;
  return strongest * 0.72 + average * 0.28;
}

function mobilityByQueen(
  state: GameState,
  playerId: PlayerId,
  runtime: QueenEscapeRuntime,
  includeSecondLevel = true,
): QueenMobility[] {
  return state.pieces
    .filter(
      (piece) => piece.playerId === playerId && piece.type === "queen",
    )
    .map((queen) =>
      queenMobility(state, queen, runtime, includeSecondLevel),
    );
}

export function prepareQueenEscapeContext(
  state: GameState,
  playerId: PlayerId,
  runtime: QueenEscapeRuntime,
): (move: Move) => QueenEscapeContextVector {
  const before = mobilityByQueen(state, playerId, runtime, false);
  const beforeById = new Map(before.map((entry) => [entry.queenId, entry]));
  return (move) => {
    const afterPieces = runtime.movePieces(state.pieces, move);
    const afterState = stateWithPieces(state, afterPieces);
    const after = mobilityByQueen(afterState, playerId, runtime);
    const shared = after
      .map((entry) => ({ before: beforeById.get(entry.queenId), after: entry }))
      .filter(
        (entry): entry is { before: QueenMobility; after: QueenMobility } =>
          Boolean(entry.before),
      );
    const escapeCreatedByMove = strongestWeightedAverage(
      shared.map(({ before: previous, after: next }) =>
        Math.max(0, next.safeEscapeCount - previous.safeEscapeCount),
      ),
    );
    const escapeRemovedByMove = strongestWeightedAverage(
      shared.map(({ before: previous, after: next }) =>
        Math.max(0, previous.safeEscapeCount - next.safeEscapeCount),
      ),
    );
    const safeEscapeCount = weakestWeightedAverage(
      after.map((entry) => entry.safeEscapeCount),
    );
    const secondLevelEscape = weakestWeightedAverage(
      after.map((entry) => entry.secondLevelEscape),
    );
    const friendlyBlockers = strongestWeightedAverage(
      after.map((entry) => entry.friendlyBlockers),
    );
    const queenTrapRisk = strongestWeightedAverage(
      after.map((entry) => entry.trapRisk),
    );
    const features = after.length
      ? [
          clamp((Math.min(4, safeEscapeCount) - 1.5) / 2.5, -0.6, 1),
          clamp(secondLevelEscape / 4, 0, 1),
          clamp(friendlyBlockers / 6, 0, 1),
          clamp(escapeCreatedByMove / 2, 0, 1),
          clamp(escapeRemovedByMove / 2, 0, 1),
          clamp(queenTrapRisk / 4, 0, 1),
        ]
      : DEFAULT_QUEEN_ESCAPE_CONTEXT_WEIGHTS.map(() => 0);
    return {
      safeEscapeCount,
      secondLevelEscape,
      friendlyBlockers,
      escapeCreatedByMove,
      escapeRemovedByMove,
      queenTrapRisk,
      features,
    };
  };
}

export function queenEscapeContextForMove(
  state: GameState,
  move: Move,
  playerId: PlayerId,
  runtime: QueenEscapeRuntime,
): QueenEscapeContextVector {
  return prepareQueenEscapeContext(state, playerId, runtime)(move);
}

export function scoreQueenEscapeContext(
  weights: readonly number[],
  features: readonly number[],
): number {
  const score = features.reduce(
    (total, feature, index) => total + feature * (weights[index] ?? 0),
    0,
  );
  return Number.isFinite(score) ? clamp(score, -1.25, 1.25) : 0;
}
