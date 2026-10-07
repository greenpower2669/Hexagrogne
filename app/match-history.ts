import type {
  GameState,
  MoveRecord,
  Piece,
  PlayerId,
  PlayerState,
} from "./game-engine";
import { synchronizePlayerResources } from "./game-engine";

export const MATCH_HISTORY_STORAGE_KEY = "fabhexagrogne-v3-match-history-v1";
export const MATCH_HISTORY_LIMIT = 8;
// Les positions sont volontairement étagées : une longue partie peut contenir
// beaucoup de termites et chaque image est alors coûteuse sur un téléphone.
// La partie récente reste détaillée, les anciennes deviennent progressivement
// un résumé fluide sans disparaître de l'historique.
export const MATCH_REPLAY_FRAME_LIMIT = 72;
const MATCH_REPLAY_WARM_LIMIT = 40;
const MATCH_REPLAY_COLD_LIMIT = 20;

export interface MatchReplayFrame {
  moveNumber: number;
  turnIndex: number;
  round: number;
  event: string;
  pieces: Piece[];
  players: PlayerState[];
  loopTrackers?: GameState["loopTrackers"];
  strategicTrackers?: GameState["strategicTrackers"];
  lastMove?: MoveRecord;
  winnerId?: PlayerId;
  drawReason?: string;
  outcome?: "royal_escape";
}

export interface MatchHistoryEntry {
  id: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  config: GameState["config"];
  turnOrder: PlayerId[];
  frames: MatchReplayFrame[];
}

export interface MatchHistoryArchive {
  schema: "fabhexagrogne-match-history";
  version: 1;
  matches: MatchHistoryEntry[];
}

export function createEmptyMatchHistory(): MatchHistoryArchive {
  return {
    schema: "fabhexagrogne-match-history",
    version: 1,
    matches: [],
  };
}

function captureFrame(game: GameState): MatchReplayFrame {
  return {
    moveNumber: game.moveNumber,
    turnIndex: game.turnIndex,
    round: game.round,
    event: game.event,
    pieces: game.pieces.map((piece) => ({ ...piece })),
    players: game.players.map((player) => ({ ...player })),
    loopTrackers: Object.fromEntries(
      Object.entries(game.loopTrackers ?? {}).map(([playerId, tracker]) => [
        playerId,
        tracker
          ? {
              ...tracker,
              history: tracker.history.map((entry) => ({ ...entry })),
              cycleSignatures: [...tracker.cycleSignatures],
              actionHistory: [...(tracker.actionHistory ?? [])],
              actionPattern: [...(tracker.actionPattern ?? [])],
            }
          : tracker,
      ]),
    ) as GameState["loopTrackers"],
    strategicTrackers: Object.fromEntries(
      Object.entries(game.strategicTrackers ?? {}).map(
        ([playerId, tracker]) => [
          playerId,
          tracker ? { ...tracker, best: { ...tracker.best } } : tracker,
        ],
      ),
    ) as GameState["strategicTrackers"],
    lastMove: game.lastMove
      ? {
          ...game.lastMove,
          from: { ...game.lastMove.from },
          to: { ...game.lastMove.to },
          spawnedCoords: game.lastMove.spawnedCoords?.map((coord) => ({ ...coord })),
          hatchedCoords: game.lastMove.hatchedCoords?.map((coord) => ({ ...coord })),
          eggBlast: game.lastMove.eggBlast
            ? {
                center: { ...game.lastMove.eggBlast.center },
                victims: game.lastMove.eggBlast.victims.map((victim) => ({
                  ...victim,
                  coord: { ...victim.coord },
                })),
              }
            : undefined,
          royalSacrifice: game.lastMove.royalSacrifice
            ? {
                ...game.lastMove.royalSacrifice,
                coord: { ...game.lastMove.royalSacrifice.coord },
              }
            : undefined,
          royalCocoonEffects: game.lastMove.royalCocoonEffects?.map(
            (effect) => ({
              ...effect,
              kingCoord: { ...effect.kingCoord },
              queenCoord: { ...effect.queenCoord },
            }),
          ),
          royalExitEffects: game.lastMove.royalExitEffects?.map((effect) => ({
            ...effect,
            coord: { ...effect.coord },
          })),
          zombieEffects: game.lastMove.zombieEffects?.map((effect) => ({
            ...effect,
            from: { ...effect.from },
            to: { ...effect.to },
            victim: effect.victim
              ? { ...effect.victim, coord: { ...effect.victim.coord } }
              : undefined,
          })),
        }
      : undefined,
    winnerId: game.winnerId,
    drawReason: game.drawReason,
    outcome: game.outcome,
  };
}

function compactFrames(
  frames: MatchReplayFrame[],
  limit = MATCH_REPLAY_FRAME_LIMIT,
): MatchReplayFrame[] {
  if (frames.length <= limit) return frames;
  if (limit <= 2) return [frames[0], frames[frames.length - 1]];
  const recentCount = Math.min(
    Math.max(6, Math.floor(limit * 0.56)),
    limit - 2,
  );
  const recent = frames.slice(-recentCount);
  const middle = frames.slice(1, -recentCount);
  const sampleCount = Math.max(0, limit - recent.length - 1);
  const sampled = Array.from({ length: sampleCount }, (_, index) => {
    const sourceIndex = Math.min(
      middle.length - 1,
      Math.floor((index * middle.length) / Math.max(1, sampleCount)),
    );
    return middle[sourceIndex];
  }).filter(Boolean);
  return [frames[0], ...sampled, ...recent];
}

function frameLimitForArchiveIndex(index: number): number {
  if (index === 0) return MATCH_REPLAY_FRAME_LIMIT;
  if (index < 3) return MATCH_REPLAY_WARM_LIMIT;
  return MATCH_REPLAY_COLD_LIMIT;
}

export function compactMatchHistoryArchive(
  archive: MatchHistoryArchive,
): MatchHistoryArchive {
  return {
    ...archive,
    matches: archive.matches.slice(0, MATCH_HISTORY_LIMIT).map((entry, index) => ({
      ...entry,
      frames: compactFrames(entry.frames, frameLimitForArchiveIndex(index)),
    })),
  };
}

export function emergencyCompactMatchHistoryArchive(
  archive: MatchHistoryArchive,
): MatchHistoryArchive {
  return {
    ...archive,
    matches: archive.matches.slice(0, MATCH_HISTORY_LIMIT).map((entry, index) => ({
      ...entry,
      frames: compactFrames(entry.frames, index === 0 ? 36 : index < 3 ? 12 : 2),
    })),
  };
}

export function appendMatchFrame(
  archive: MatchHistoryArchive,
  game: GameState,
  now = new Date(),
): MatchHistoryArchive {
  const timestamp = now.toISOString();
  const existingIndex = archive.matches.findIndex(
    (entry) => entry.id === game.matchId,
  );
  if (existingIndex >= 0) {
    const existing = archive.matches[existingIndex];
    const lastFrame = existing.frames[existing.frames.length - 1];
    if (
      lastFrame?.moveNumber === game.moveNumber &&
      lastFrame?.winnerId === game.winnerId &&
      lastFrame?.drawReason === game.drawReason
    ) {
      return archive;
    }
    const updated: MatchHistoryEntry = {
      ...existing,
      updatedAt: timestamp,
      completedAt:
        game.winnerId !== undefined || game.drawReason
          ? existing.completedAt ?? timestamp
          : existing.completedAt,
      frames: [...existing.frames, captureFrame(game)],
    };
    return compactMatchHistoryArchive({
      ...archive,
      matches: [
        updated,
        ...archive.matches.filter((_, index) => index !== existingIndex),
      ].slice(0, MATCH_HISTORY_LIMIT),
    });
  }
  const entry: MatchHistoryEntry = {
    id: game.matchId,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt:
      game.winnerId !== undefined || game.drawReason ? timestamp : undefined,
    config: { ...game.config },
    turnOrder: [...game.turnOrder],
    frames: [captureFrame(game)],
  };
  return compactMatchHistoryArchive({
    ...archive,
    matches: [entry, ...archive.matches].slice(0, MATCH_HISTORY_LIMIT),
  });
}

function validFrame(value: unknown): value is MatchReplayFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<MatchReplayFrame>;
  return (
    Number.isFinite(frame.moveNumber) &&
    Number.isFinite(frame.turnIndex) &&
    Number.isFinite(frame.round) &&
    typeof frame.event === "string" &&
    Array.isArray(frame.pieces) &&
    Array.isArray(frame.players)
  );
}

export function validateMatchHistory(value: unknown): MatchHistoryArchive {
  if (!value || typeof value !== "object") return createEmptyMatchHistory();
  const candidate = value as Partial<MatchHistoryArchive>;
  if (
    candidate.schema !== "fabhexagrogne-match-history" ||
    candidate.version !== 1 ||
    !Array.isArray(candidate.matches)
  ) {
    return createEmptyMatchHistory();
  }
  const matches = candidate.matches
    .filter((entry): entry is MatchHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const possible = entry as Partial<MatchHistoryEntry>;
      return (
        typeof possible.id === "string" &&
        typeof possible.startedAt === "string" &&
        typeof possible.updatedAt === "string" &&
        Array.isArray(possible.turnOrder) &&
        Array.isArray(possible.frames) &&
        possible.frames.some(validFrame) &&
        Boolean(possible.config)
      );
    })
    .map((entry, index) => ({
      ...entry,
      frames: compactFrames(
        entry.frames.filter(validFrame),
        frameLimitForArchiveIndex(index),
      ),
    }))
    .slice(0, MATCH_HISTORY_LIMIT);
  return compactMatchHistoryArchive({
    schema: "fabhexagrogne-match-history",
    version: 1,
    matches,
  });
}

export function replayFrameToGameState(
  match: MatchHistoryEntry,
  frameIndex: number,
): GameState | undefined {
  const frame = match.frames[Math.max(0, Math.min(frameIndex, match.frames.length - 1))];
  if (!frame) return undefined;
  const pieces = frame.pieces.map((piece) => ({ ...piece }));
  return {
    rulesVersion: 15,
    matchId: match.id,
    pieces,
    players: synchronizePlayerResources(
      frame.players.map((player) => ({
        ...player,
        solitaryKingTurns: player.solitaryKingTurns ?? 0,
      })),
      pieces,
    ),
    turnOrder: [...match.turnOrder],
    turnIndex: Math.max(0, Math.min(frame.turnIndex, match.turnOrder.length - 1)),
    round: frame.round,
    moveNumber: frame.moveNumber,
    lastMove: frame.lastMove
      ? {
          ...frame.lastMove,
          from: { ...frame.lastMove.from },
          to: { ...frame.lastMove.to },
          spawnedCoords: frame.lastMove.spawnedCoords?.map((coord) => ({ ...coord })),
          hatchedCoords: frame.lastMove.hatchedCoords?.map((coord) => ({ ...coord })),
          eggBlast: frame.lastMove.eggBlast
            ? {
                center: { ...frame.lastMove.eggBlast.center },
                victims: frame.lastMove.eggBlast.victims.map((victim) => ({
                  ...victim,
                  coord: { ...victim.coord },
                })),
              }
            : undefined,
          royalSacrifice: frame.lastMove.royalSacrifice
            ? {
                ...frame.lastMove.royalSacrifice,
                coord: { ...frame.lastMove.royalSacrifice.coord },
              }
            : undefined,
          royalCocoonEffects: frame.lastMove.royalCocoonEffects?.map(
            (effect) => ({
              ...effect,
              kingCoord: { ...effect.kingCoord },
              queenCoord: { ...effect.queenCoord },
            }),
          ),
          royalExitEffects: frame.lastMove.royalExitEffects?.map((effect) => ({
            ...effect,
            coord: { ...effect.coord },
          })),
          zombieEffects: frame.lastMove.zombieEffects?.map((effect) => ({
            ...effect,
            from: { ...effect.from },
            to: { ...effect.to },
            victim: effect.victim
              ? { ...effect.victim, coord: { ...effect.victim.coord } }
              : undefined,
          })),
        }
      : undefined,
    winnerId: frame.winnerId,
    drawReason: frame.drawReason,
    outcome: frame.outcome,
    event: frame.event,
    log: [],
    teamLogs: {},
    notices: [],
    humanMoveTrace: [],
    loopTrackers: Object.fromEntries(
      Object.entries(frame.loopTrackers ?? {}).map(([playerId, tracker]) => [
        playerId,
        tracker
          ? {
              ...tracker,
              history: tracker.history.map((entry) => ({ ...entry })),
              cycleSignatures: [...tracker.cycleSignatures],
              actionHistory: [...(tracker.actionHistory ?? [])],
              actionPattern: [...(tracker.actionPattern ?? [])],
            }
          : tracker,
      ]),
    ) as GameState["loopTrackers"],
    strategicTrackers: Object.fromEntries(
      Object.entries(frame.strategicTrackers ?? {}).map(
        ([playerId, tracker]) => [
          playerId,
          tracker ? { ...tracker, best: { ...tracker.best } } : tracker,
        ],
      ),
    ) as GameState["strategicTrackers"],
    config: { ...match.config },
  };
}
