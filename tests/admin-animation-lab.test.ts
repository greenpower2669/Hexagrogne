import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADMIN_ANIMATIONS,
  ADMIN_UNLOCK_RADIUS_PX,
  ADMIN_UNLOCK_TAPS,
  ADMIN_UNLOCK_WINDOW_MS,
  GAME_EVOLUTIONS,
  createAdminAnimationPreview,
} from "../app/admin-animation-lab";
import {
  ROYAL_COCOON_DURATION_MS,
  ROYAL_ESCAPE_DURATION_MS,
  ROYAL_FIREWORKS_DURATION_MS,
  ROYAL_SACRIFICE_DURATION_MS,
} from "../app/game-effects";

test("le geste secret demande environ cinquante pressions groupées", () => {
  assert.equal(ADMIN_UNLOCK_TAPS, 48);
  assert.equal(ADMIN_UNLOCK_RADIUS_PX, 64);
  assert.equal(ADMIN_UNLOCK_WINDOW_MS, 16_000);
});

test("le laboratoire expose dix-neuf animations uniques et constructibles", () => {
  assert.equal(ADMIN_ANIMATIONS.length, 19);
  assert.equal(
    new Set(ADMIN_ANIMATIONS.map((animation) => animation.kind)).size,
    ADMIN_ANIMATIONS.length,
  );
  ADMIN_ANIMATIONS.forEach((animation, index) => {
    const preview = createAdminAnimationPreview(animation.kind, index + 1, 2_000);
    assert.equal(preview.state.moveNumber, index + 1);
    assert.match(preview.state.matchId, /^admin-lab-/);
    assert.ok(preview.state.players.length >= 2);
  });
});

test("les finales royales et le cocon restent assez longs pour être observés", () => {
  assert.ok(ROYAL_SACRIFICE_DURATION_MS >= 3_000);
  assert.ok(ROYAL_ESCAPE_DURATION_MS >= 6_000);
  assert.ok(ROYAL_FIREWORKS_DURATION_MS >= 7_000);
  assert.equal(ROYAL_COCOON_DURATION_MS, 10_000);

  const escape = createAdminAnimationPreview("royal-escape", 20, 0);
  const fireworks = createAdminAnimationPreview("royal-fireworks", 21, 0);
  const sacrifice = createAdminAnimationPreview("queen-sacrifice", 22, 0);
  const cocoon = createAdminAnimationPreview("royal-cocoon", 23, 0);
  assert.equal(escape.state.lastMove?.royalExitEffects?.[0]?.kind, "escape");
  assert.equal(fireworks.state.lastMove?.royalExitEffects?.[0]?.kind, "checkmate");
  assert.equal(fireworks.state.lastMove?.royalExitEffects?.[0]?.opponentId, 2);
  assert.equal(sacrifice.state.lastMove?.royalSacrifice?.pieceType, "queen");
  assert.equal(cocoon.state.lastMove?.royalCocoonEffects?.[0]?.kind, "started");
  assert.equal(cocoon.state.pieces.filter((piece) => piece.breedingTurns === 3).length, 2);
});

test("les signaux de soldat et d’œufs utilisent le vrai relais de colonie", () => {
  const soldier = createAdminAnimationPreview("soldier-signal", 30, 5_000);
  const eggs = createAdminAnimationPreview("egg-signal", 31, 5_000);
  assert.equal(soldier.colonySignal?.kind, "soldier");
  assert.equal(eggs.colonySignal?.kind, "egg");
  assert.equal(eggs.colonySignal?.relayPieceIds?.length, 2);
});

test("le laboratoire montre l’onde et ses victimes sur les six voisines", () => {
  const preview = createAdminAnimationPreview("egg-crush", 32, 5_000);
  assert.equal(preview.state.lastMove?.capturedType, "egg");
  assert.equal(preview.state.lastMove?.eggBlast?.victims.length, 3);
});

test("le laboratoire expose la naissance, la morsure et l’explosion locale du zombie", () => {
  const spawn = createAdminAnimationPreview("zombie-spawn", 40, 5_000);
  const bite = createAdminAnimationPreview("zombie-bite", 41, 5_000);
  const expire = createAdminAnimationPreview("zombie-expire", 42, 5_000);
  assert.equal(spawn.state.lastMove?.zombieEffects?.[0]?.kind, "spawn");
  assert.equal(
    spawn.state.pieces.find((piece) => piece.id === "lab-zombie")
      ?.zombieActivationsRemaining,
    10,
  );
  assert.equal(bite.state.lastMove?.zombieEffects?.[0]?.kind, "bite");
  assert.equal(expire.state.lastMove?.zombieEffects?.[0]?.kind, "expire");
  assert.equal(expire.state.pieces.some((piece) => piece.id === "lab-zombie"), false);
});

test("le journal administratif recense les évolutions majeures", () => {
  assert.equal(GAME_EVOLUTIONS.length, 20);
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Super-modèle exportable/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Perspective canonique/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Forteresse opaque/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Corpus FabHexaBrain V2/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Cerveau hybride HexConv/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Couvain à onde de pression/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Nurseries sûres/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /termites zombies/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /motifs courts/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /anti-oscillation/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /trajets exacts/.test(entry.title)));
  assert.ok(GAME_EVOLUTIONS.some((entry) => /Queen Escape/.test(entry.title)));
});

test("l’interface contient le mode d’emploi public et le laboratoire caché", async () => {
  const source = await readFile(
    new URL("../app/fab-hexa-game.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /MODE D’EMPLOI · RÈGLES V3 T3\.5\.1/);
  assert.match(source, /onPointerDownCapture=\{detectAdminGesture\}/);
  assert.match(source, /Laboratoire des évolutions et animations/);
  assert.match(source, /animations à tester/);
});

test("la forteresse-cocon est opaque dans WebGL comme dans le rendu Canvas", async () => {
  const source = await readFile(
    new URL("../app/hex-board.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /0\.72 \+ pulse \* 0\.06/);
  assert.match(source, /\[color\[0\], color\[1\], color\[2\], 0\.98\]/);
  assert.match(source, /globalCompositeOperation = "source-over"/);
  assert.match(source, /context\.globalAlpha = 0\.98/);
});
