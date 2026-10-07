import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ROYAL_COCOON_DURATION_MS } from "../app/game-effects";
import {
  MAX_VALID_ROYAL_INPUT_LOCK_MS,
  canHumanUseBoard,
  isRoyalInputLocked,
} from "../app/game-input-guard";

test("un ancien indicateur de réflexion IA ne peut plus bloquer un tour humain", () => {
  assert.equal(
    canHumanUseBoard({
      playerRole: "human",
      gameFinished: false,
      royalLockUntil: 0,
      now: 10_000,
    }),
    true,
  );
});

test("seule une animation royale récente bloque temporairement le plateau", () => {
  const now = 20_000;
  assert.equal(isRoyalInputLocked(now + 2_000, now), true);
  assert.equal(
    canHumanUseBoard({
      playerRole: "human",
      gameFinished: false,
      royalLockUntil: now + 2_000,
      now,
    }),
    false,
  );
  assert.equal(isRoyalInputLocked(now - 1, now), false);
  assert.equal(
    isRoyalInputLocked(now + ROYAL_COCOON_DURATION_MS, now),
    true,
  );
});

test("un horodatage royal corrompu ne peut jamais imposer un redémarrage", () => {
  const now = 30_000;
  const staleFuture = now + MAX_VALID_ROYAL_INPUT_LOCK_MS + 60_000;
  assert.equal(isRoyalInputLocked(staleFuture, now), false);
  assert.equal(
    canHumanUseBoard({
      playerRole: "human",
      gameFinished: false,
      royalLockUntil: staleFuture,
      now,
    }),
    true,
  );
});

test("les tours IA et les parties terminées restent correctement protégés", () => {
  assert.equal(
    canHumanUseBoard({
      playerRole: "ai",
      gameFinished: false,
      royalLockUntil: 0,
      now: 1,
    }),
    false,
  );
  assert.equal(
    canHumanUseBoard({
      playerRole: "human",
      gameFinished: true,
      royalLockUntil: 0,
      now: 1,
    }),
    false,
  );
});

test("le contrôleur du jeu possède les deux récupérations automatiques", async () => {
  const source = await readFile(
    new URL("../app/fab-hexa-game.tsx", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf("const handleCellClick"),
    source.indexOf("const startNewGame"),
  );
  assert.match(handler, /canHumanUseBoard/);
  assert.doesNotMatch(handler, /if \(thinking/);
  assert.match(source, /choice\?\.move \?\? allLegalMoves\(game, activePlayerId\)\[0\]/);
  assert.match(source, /Décision IA récupérée automatiquement/);
});
