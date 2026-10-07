import {
  BOARD_RADIUS,
  GameState,
  HumanMoveFrame,
  PlayerCount,
  PlayerId,
} from "./game-engine";

export const HUMAN_TRAINING_STORAGE_KEY =
  "fabhexagrogne-v3-human-victories-v1";

export interface HumanVictoryRecord {
  id: string;
  matchId: string;
  recordedAt: string;
  winnerId: PlayerId;
  winnerName: string;
  playerCount: PlayerCount;
  totalPlies: number;
  rulesVersion: number;
  frames: HumanMoveFrame[];
}

export interface HumanTrainingArchive {
  schema: "fabhexagrogne-human-victories";
  version: 1;
  game: "FabHexaGrogne";
  encoding: {
    coordinates: "axial-q-r";
    perspective: "active-player-as-player-0-north";
    boardRadius: number;
    tensorHint: {
      width: number;
      height: number;
      invalidCellsMasked: true;
    };
  };
  games: HumanVictoryRecord[];
}

export interface ArchiveHumanVictoryResult {
  archive: HumanTrainingArchive;
  added: boolean;
  frameCount: number;
}

const MAX_ARCHIVED_GAMES = 12;
const MAX_ARCHIVED_FRAMES = 480;
const MAX_FRAMES_PER_GAME = 72;
const EMERGENCY_ARCHIVED_GAMES = 4;
const EMERGENCY_FRAMES_PER_GAME = 24;

function sampleFrames(
  frames: HumanMoveFrame[],
  limit: number,
): HumanMoveFrame[] {
  if (frames.length <= limit) return frames;
  if (limit <= 1) return [frames[frames.length - 1]];
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (frames.length - 1)) / (limit - 1),
    );
    return frames[sourceIndex];
  });
}

function fitArchiveGames(
  games: HumanVictoryRecord[],
  maxGames: number,
  maxFrames: number,
  maxFramesPerGame: number,
): HumanVictoryRecord[] {
  const fitted: HumanVictoryRecord[] = [];
  let frameTotal = 0;
  games.slice(0, maxGames).forEach((game) => {
    const remaining = maxFrames - frameTotal;
    if (remaining <= 0) return;
    const frames = sampleFrames(
      game.frames,
      Math.min(maxFramesPerGame, remaining),
    );
    if (!frames.length) return;
    fitted.push({ ...game, frames });
    frameTotal += frames.length;
  });
  return fitted;
}

export function createEmptyHumanTrainingArchive(): HumanTrainingArchive {
  return {
    schema: "fabhexagrogne-human-victories",
    version: 1,
    game: "FabHexaGrogne",
    encoding: {
      coordinates: "axial-q-r",
      perspective: "active-player-as-player-0-north",
      boardRadius: BOARD_RADIUS,
      tensorHint: {
        width: BOARD_RADIUS * 2 + 1,
        height: BOARD_RADIUS * 2 + 1,
        invalidCellsMasked: true,
      },
    },
    games: [],
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

function isHumanMoveFrame(value: unknown): value is HumanMoveFrame {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HumanMoveFrame>;
  return (
    typeof candidate.ply === "number" &&
    typeof candidate.round === "number" &&
    isPlayerId(candidate.playerId) &&
    Boolean(candidate.position) &&
    Array.isArray(candidate.position?.pieces) &&
    Array.isArray(candidate.position?.players) &&
    Boolean(candidate.action) &&
    typeof candidate.action?.pieceId === "string" &&
    typeof candidate.action?.from?.q === "number" &&
    typeof candidate.action?.from?.r === "number" &&
    typeof candidate.action?.to?.q === "number" &&
    typeof candidate.action?.to?.r === "number"
  );
}

export function validateHumanTrainingArchive(
  value: unknown,
): HumanTrainingArchive {
  const empty = createEmptyHumanTrainingArchive();
  if (!value || typeof value !== "object") return empty;
  const candidate = value as Partial<HumanTrainingArchive>;
  if (
    candidate.schema !== empty.schema ||
    candidate.version !== 1 ||
    !Array.isArray(candidate.games)
  ) {
    return empty;
  }
  const validGames = candidate.games
    .filter((game): game is HumanVictoryRecord => {
      if (!game || typeof game !== "object") return false;
      return (
        typeof game.id === "string" &&
        typeof game.matchId === "string" &&
        typeof game.recordedAt === "string" &&
        isPlayerId(game.winnerId) &&
        Array.isArray(game.frames)
      );
    })
    .map((game) => ({
      ...game,
      rulesVersion: Number.isFinite(game.rulesVersion)
        ? game.rulesVersion
        : 12,
      frames: game.frames.filter(isHumanMoveFrame).map((frame) => ({
        ...frame,
        features: Array.isArray(frame.features) ? frame.features : [],
      })),
    }))
    .filter((game) => game.frames.length > 0);
  return {
    ...empty,
    games: fitArchiveGames(
      validGames,
      MAX_ARCHIVED_GAMES,
      MAX_ARCHIVED_FRAMES,
      MAX_FRAMES_PER_GAME,
    ),
  };
}

export function emergencyCompactHumanTrainingArchive(
  archive: HumanTrainingArchive,
): HumanTrainingArchive {
  return {
    ...archive,
    games: fitArchiveGames(
      archive.games,
      EMERGENCY_ARCHIVED_GAMES,
      EMERGENCY_ARCHIVED_GAMES * EMERGENCY_FRAMES_PER_GAME,
      EMERGENCY_FRAMES_PER_GAME,
    ),
  };
}

export function archiveHumanVictory(
  archive: HumanTrainingArchive,
  game: GameState,
): ArchiveHumanVictoryResult {
  if (game.winnerId === undefined) {
    return { archive, added: false, frameCount: 0 };
  }
  const winner = game.players.find((player) => player.id === game.winnerId);
  if (winner?.role !== "human") {
    return { archive, added: false, frameCount: 0 };
  }
  if (archive.games.some((record) => record.matchId === game.matchId)) {
    return { archive, added: false, frameCount: 0 };
  }
  const frames = sampleFrames(
    (game.humanMoveTrace ?? []).filter(
      (frame) => frame.playerId === winner.id,
    ),
    MAX_FRAMES_PER_GAME,
  );
  if (!frames.length) {
    return { archive, added: false, frameCount: 0 };
  }
  const record: HumanVictoryRecord = {
    id: `human-win-${game.matchId}`,
    matchId: game.matchId,
    recordedAt: new Date().toISOString(),
    winnerId: winner.id,
    winnerName: winner.name,
    playerCount: game.config.playerCount,
    totalPlies: game.moveNumber,
    rulesVersion: game.rulesVersion,
    frames,
  };
  const games = fitArchiveGames(
    [record, ...archive.games],
    MAX_ARCHIVED_GAMES,
    MAX_ARCHIVED_FRAMES,
    MAX_FRAMES_PER_GAME,
  );
  return {
    archive: { ...archive, games },
    added: true,
    frameCount: frames.length,
  };
}

export function humanTrainingStats(archive: HumanTrainingArchive): {
  games: number;
  frames: number;
} {
  return {
    games: archive.games.length,
    frames: archive.games.reduce(
      (total, game) => total + game.frames.length,
      0,
    ),
  };
}
