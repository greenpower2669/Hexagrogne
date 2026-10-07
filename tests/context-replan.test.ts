import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WEIGHTS,
  GameState,
  STRATEGIC_INTENT_TURNS,
  allLegalMoves,
  applyMove,
  chooseAiMove,
  contextLearningAdjustment,
  contextualTemporaryWeights,
  createNewGame,
  emptyStrategyTracker,
  isGuardrailSafeMove,
  queenSpawnCells,
  resourceStatusForPlayer,
  selectStrategicContextIntent,
  strategicPositionSignature,
  strategicProgressSnapshot,
  synchronizePlayerResources,
} from "../app/game-engine";

const PROTECTED_WEIGHT_INDICES = [0, 1, 4, 5, 6, 10, 12, 13];

function firstNonProgressMove(state: GameState) {
  return allLegalMoves(state, 0).find((move) => {
    const next = applyMove(state, move);
    return next.strategicTrackers?.[0]?.stagnantTurns === 1;
  });
}

test("quatre tours sans progrès déclenchent une analyse malgré une nouvelle signature", () => {
  const state = createNewGame(2, 0, 4);
  const move = firstNonProgressMove(state);
  assert(move);
  const beforeSignature = strategicPositionSignature(state);
  state.strategicTrackers = {
    0: {
      ...emptyStrategyTracker(state, 0),
      stagnantTurns: 3,
    },
  };
  const next = applyMove(state, move);
  const tracker = next.strategicTrackers?.[0];
  assert.notEqual(strategicPositionSignature(next), beforeSignature);
  assert.equal(tracker?.stagnantTurns, 4);
  assert(tracker?.intent);
  assert.equal(tracker.intentTurnsRemaining, STRATEGIC_INTENT_TURNS);
  assert.equal(tracker.replanPending, true);
  assert.match(next.event, /ANALYSE STRATÉGIQUE — 4 TOURS SANS PROGRÈS/);
});

test("zéro œuf avec du potentiel mais sans case sûre choisit d'ouvrir une nurserie", () => {
  const base = createNewGame(2, 0, 4);
  const pawn = base.pieces.find(
    (piece) => piece.playerId === 0 && piece.type === "pawn",
  );
  assert(pawn);
  const pieces = [
    ...base.pieces.map((piece) =>
      piece.id === pawn.id ? { ...piece, q: 0, r: 0 } : piece,
    ),
    { ...pawn, id: "nursery-replacement" },
  ];
  const state: GameState = {
    ...base,
    pieces,
    players: synchronizePlayerResources(base.players, pieces),
  };
  const queen = state.pieces.find(
    (piece) => piece.playerId === 0 && piece.type === "queen",
  );
  assert(queen);
  assert(resourceStatusForPlayer(state.pieces, 0).free > 0);
  assert.equal(queenSpawnCells(state.pieces, queen).length, 0);
  assert.equal(selectStrategicContextIntent(state, 0), "open_nursery");
});

test("la modulation contextuelle protège les poids sensibles et reste temporaire", () => {
  const state = createNewGame(2, 0, 4);
  const weights = [...DEFAULT_WEIGHTS];
  const adjusted = contextualTemporaryWeights(
    weights,
    state,
    0,
    "border_pressure",
  );
  PROTECTED_WEIGHT_INDICES.forEach((index) =>
    assert.equal(adjusted[index], weights[index]),
  );
  assert(
    adjusted.some(
      (weight, index) =>
        !PROTECTED_WEIGHT_INDICES.includes(index) && weight !== weights[index],
    ),
  );
  adjusted.forEach((weight, index) => {
    const maximumChange = Math.max(0.052, Math.abs(weights[index]) * 0.14);
    assert(Math.abs(weight - weights[index]) <= maximumChange);
  });
  assert.deepEqual(weights, DEFAULT_WEIGHTS);
});

test("la décision contextuelle marque le coup sans modifier l'état ni les poids", () => {
  const state = createNewGame(2, 0, 4);
  state.strategicTrackers = {
    0: {
      ...emptyStrategyTracker(state, 0),
      stagnantTurns: 4,
      intent: "border_pressure",
      intentTurnsRemaining: 3,
      replanPending: true,
      reason: "test de pression",
    },
  };
  const weights = [...DEFAULT_WEIGHTS];
  const snapshot = JSON.stringify(state);
  const choice = chooseAiMove(
    state,
    0,
    weights,
    undefined,
    0,
    1,
    true,
    "balanced",
  );
  assert(choice);
  assert.equal(choice.move.contextIntent, "border_pressure");
  assert.equal(choice.move.contextReplan, true);
  assert.equal(isGuardrailSafeMove(state, 0, choice.move), true);
  assert.deepEqual(weights, DEFAULT_WEIGHTS);
  assert.equal(JSON.stringify(state), snapshot);
});

test("un progrès clôt le plan et produit une récompense d'apprentissage", () => {
  const base = createNewGame(2, 0, 4);
  const pieces = [
    {
      id: "king-0",
      playerId: 0 as const,
      type: "king" as const,
      level: 4,
      q: -4,
      r: 0,
    },
    {
      id: "pawn-0",
      playerId: 0 as const,
      type: "pawn" as const,
      level: 1,
      q: 0,
      r: 0,
    },
    {
      id: "king-2",
      playerId: 2 as const,
      type: "king" as const,
      level: 4,
      q: 5,
      r: 0,
    },
    {
      id: "pawn-2",
      playerId: 2 as const,
      type: "pawn" as const,
      level: 1,
      q: 1,
      r: 0,
    },
  ];
  const state: GameState = {
    ...base,
    pieces,
    players: synchronizePlayerResources(base.players, pieces),
    strategicTrackers: {},
  };
  state.strategicTrackers = {
    0: {
      ...emptyStrategyTracker(state, 0),
      stagnantTurns: 4,
      intent: "breach",
      intentTurnsRemaining: 3,
      replanPending: true,
      reason: "ouvrir la ligne",
    },
  };
  const next = applyMove(state, {
    pieceId: "pawn-0",
    to: { q: 1, r: 0 },
    contextIntent: "breach",
    contextReplan: true,
  });
  assert.equal(next.pieces.some((piece) => piece.id === "pawn-2"), false);
  assert.equal(next.strategicTrackers?.[0]?.intent, undefined);
  assert.equal(next.lastMove?.contextResult, "progress");
  assert(contextLearningAdjustment(next) > 0);
});

test("deux sacrifices sans gain imposent un autre objectif", () => {
  const state = createNewGame(2, 0, 4);
  const move = firstNonProgressMove(state);
  assert(move);
  const best = strategicProgressSnapshot(state, 0);
  state.strategicTrackers = {
    0: {
      ...emptyStrategyTracker(state, 0),
      stagnantTurns: 5,
      intent: "border_pressure",
      intentTurnsRemaining: 3,
      replanPending: false,
      failedSacrifices: 1,
      reason: "pression test",
      best,
    },
  };
  const next = applyMove(state, {
    ...move,
    contextIntent: "border_pressure",
    contextSacrifice: true,
  });
  assert.equal(next.lastMove?.contextResult, "sacrifice_stalled");
  assert.notEqual(next.strategicTrackers?.[0]?.intent, "border_pressure");
  assert.equal(next.strategicTrackers?.[0]?.replanPending, true);
  assert.equal(next.strategicTrackers?.[0]?.failedSacrifices, 0);
  assert(contextLearningAdjustment(next) < 0);
});
