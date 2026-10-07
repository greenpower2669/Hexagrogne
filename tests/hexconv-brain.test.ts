import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WEIGHTS,
  allLegalMoves,
  chooseAiMove,
  createNewGame,
  currentPlayerId,
  moveFeatures,
} from "../app/game-engine";
import {
  HYBRID_HEX_FILTERS,
  HYBRID_HEX_PARAMETER_COUNT,
  createDefaultHybridHexBrain,
  createHybridMoveScoreAugmenter,
  parseHybridHexBrain,
  serializeHybridHexBrain,
  trainHybridHexBrainOnDecision,
} from "../app/hexconv-brain";
import {
  createDefaultSelfPlayLeague,
  runSelfPlayDuel,
} from "../app/self-play";

function parameterCount(brain: ReturnType<typeof createDefaultHybridHexBrain>) {
  return Object.values(brain.parameters).reduce(
    (total, parameter) => total + parameter.length,
    0,
  );
}

test("T3 installe exactement trois HexConv 32 → 32 → 48 dans 29 765 paramètres", () => {
  const brain = createDefaultHybridHexBrain(new Date("2026-08-28T00:00:00Z"));
  assert.deepEqual(HYBRID_HEX_FILTERS, [32, 32, 48]);
  assert.equal(parameterCount(brain), HYBRID_HEX_PARAMETER_COUNT);
  assert.equal(HYBRID_HEX_PARAMETER_COUNT, 29_765);
});

test("la branche résiduelle neuve laisse la décision V2 strictement inchangée", () => {
  const state = createNewGame(2, 0);
  const playerId = currentPlayerId(state);
  const baseline = chooseAiMove(
    state,
    playerId,
    DEFAULT_WEIGHTS,
    undefined,
    0,
    1,
    true,
    "balanced",
  );
  const hybrid = chooseAiMove(
    state,
    playerId,
    DEFAULT_WEIGHTS,
    undefined,
    0,
    1,
    true,
    "balanced",
    createHybridMoveScoreAugmenter(createDefaultHybridHexBrain()),
  );
  assert.ok(baseline);
  assert.ok(hybrid);
  assert.deepEqual(hybrid.move, baseline.move);
  assert.equal(hybrid.predictedScore, baseline.predictedScore);
});

test("l’apprentissage local traverse les trois couches et reste sérialisable", () => {
  const state = createNewGame(2, 0);
  const playerId = currentPlayerId(state);
  const move = allLegalMoves(state, playerId)[0];
  assert.ok(move);
  const features = moveFeatures(state, move);
  const initial = createDefaultHybridHexBrain(
    new Date("2026-08-28T00:00:00Z"),
  );
  const beforeConv3 = initial.parameters.conv3Kernel.slice();
  const first = trainHybridHexBrainOnDecision(
    initial,
    state,
    playerId,
    move,
    features,
    1,
    new Date("2026-08-28T00:00:01Z"),
  );
  const second = trainHybridHexBrainOnDecision(
    first,
    state,
    playerId,
    move,
    features,
    1,
    new Date("2026-08-28T00:00:02Z"),
  );
  assert.equal(second.trainedSamples, 2);
  assert.equal(second.selfPlaySamples, 2);
  assert.ok(
    second.parameters.conv3Kernel.some(
      (value, index) => value !== beforeConv3[index],
    ),
  );
  const restored = parseHybridHexBrain(serializeHybridHexBrain(second));
  assert.ok(restored);
  assert.equal(restored.trainedSamples, second.trainedSamples);
  assert.deepEqual(
    Array.from(restored.parameters.policyKernel),
    Array.from(second.parameters.policyKernel),
  );
});

test("l’auto-jeu distille ses décisions dans le cerveau HexConv partagé", () => {
  const league = createDefaultSelfPlayLeague();
  const session = {
    brain: createDefaultHybridHexBrain(),
    maxUpdates: 1,
    updates: 0,
  };
  const trainedLeague = runSelfPlayDuel(league, 8, session);
  assert.equal(trainedLeague.duels, league.duels + 1);
  assert.equal(session.updates, 1);
  assert.equal(session.brain.trainedSamples, 1);
  assert.equal(session.brain.selfPlaySamples, 1);
});
