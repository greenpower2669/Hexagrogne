import {
  type AIMemory,
  createDefaultAIMemory,
  validateImportedMemory,
} from "./game-engine";
import {
  type SelfPlayLeague,
  validateSelfPlayLeague,
} from "./self-play";
import importedPack from "./fabhexagrogne-ai-league-cycle-172.json";

export const T2_IMPORTED_LEAGUE_STORAGE_KEY =
  "fabhexagrogne-v3-t2-league-cycle-172-v1";

export const T2_IMPORTED_LEAGUE_META = {
  cycle: 172,
  duels: 1_029,
  positionsEvaluated: 143_372,
  exportedAt: "2026-08-28T18:40:46.614Z",
  sourceFile: "FabHexaGrogne-IA-ligue-cycle-172.json",
  sourceSha256:
    "d59e059b9431d11740130bbc91c10f4a40a95142c88ea88e13d0a299bf34a1e1",
  embeddedSha256:
    "2d2f321ef49a46185cb3b8ae238da2dffb8560d5f08e457599861edc992fe545",
} as const;

export interface T2LeagueSeed {
  memory: AIMemory;
  league: SelfPlayLeague;
}

export function createT2LeagueSeed(): T2LeagueSeed {
  const memory =
    validateImportedMemory(importedPack.liveMemory) ?? createDefaultAIMemory();
  return {
    memory,
    league: validateSelfPlayLeague(importedPack.selfPlayLeague, memory),
  };
}

export function shouldAdoptT2LeagueSeed(
  savedLeague?: SelfPlayLeague,
): boolean {
  if (!savedLeague) return true;
  const seed = createT2LeagueSeed().league;
  if (savedLeague.positionsEvaluated !== seed.positionsEvaluated) {
    return savedLeague.positionsEvaluated < seed.positionsEvaluated;
  }
  if (savedLeague.duels !== seed.duels) {
    return savedLeague.duels < seed.duels;
  }
  return savedLeague.cycle < seed.cycle;
}
