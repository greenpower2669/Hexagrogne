import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WEIGHTS,
  chooseAiMove,
  createDefaultAIMemory,
  createNewGame,
  currentPlayerId,
  queenEscapeWeightsForMemory,
  reinforceAi,
  validateImportedMemory,
} from "../app/game-engine";
import {
  importNamedWeightModules,
  serializeNamedWeightModules,
} from "../app/ai-weight-modules";
import {
  createDefaultHybridHexBrain,
  serializeHybridHexBrain,
} from "../app/hexconv-brain";

function localMemory() {
  const memory = createDefaultAIMemory();
  memory.modules.queenEscapeContext.weights = [
    0.81, 0.22, -0.31, 0.47, -0.58, -0.73,
  ];
  memory.modules.queenEscapeContext.championWeights = [
    0.78, 0.2, -0.29, 0.44, -0.55, -0.7,
  ];
  return memory;
}

test("E — un ancien fichier sans QueenEscapeContext conserve le module local", () => {
  const local = localMemory();
  const legacy = {
    schema: "fabhexagrogne-ai",
    version: 1,
    weights: DEFAULT_WEIGHTS.map((weight) => weight + 0.1),
    championWeights: [...DEFAULT_WEIGHTS],
    generation: 72,
    decisions: 1_200,
    games: 48,
    fitness: 0,
    bestFitness: 14,
    learningRate: 0.03,
    wasmReady: false,
  };
  const imported = validateImportedMemory(legacy, local);
  assert(imported);
  assert.equal(imported.generation, 72);
  assert.deepEqual(
    queenEscapeWeightsForMemory(imported),
    queenEscapeWeightsForMemory(local),
  );
  assert.notDeepEqual(imported.weights, local.weights);
});

test("F — un module inconnu est ignoré sans bloquer le module Core", () => {
  const local = localMemory();
  const brain = createDefaultHybridHexBrain();
  const importedCore = DEFAULT_WEIGHTS.map((weight) => weight - 0.2);
  const result = importNamedWeightModules(
    {
      core: {
        moduleVersion: 1,
        weights: importedCore,
        championWeights: importedCore,
      },
      futureSpatialMemory: {
        moduleVersion: 4,
        weights: [1, 2, 3],
      },
    },
    local,
    brain,
  );
  assert.deepEqual(result.memory.weights, importedCore);
  assert.deepEqual(
    queenEscapeWeightsForMemory(result.memory),
    queenEscapeWeightsForMemory(local),
  );
  assert.deepEqual(result.ignoredModules, ["futureSpatialMemory"]);
  assert.ok(
    result.diagnostics.some((message) =>
      /Unknown weight module ignored: futureSpatialMemory/.test(message),
    ),
  );
});

test("G — un import partiel et plus court ne remet aucun autre module à zéro", () => {
  const local = localMemory();
  const brain = createDefaultHybridHexBrain();
  const beforeBrain = serializeHybridHexBrain(brain);
  const result = importNamedWeightModules(
    {
      queenEscapeContext: {
        moduleVersion: 1,
        weights: [0.95, 0.15, -0.4],
      },
    },
    local,
    brain,
  );
  assert.deepEqual(result.memory.weights, local.weights);
  assert.deepEqual(queenEscapeWeightsForMemory(result.memory), [
    0.95,
    0.15,
    -0.4,
    0.47,
    -0.58,
    -0.73,
  ]);
  assert.deepEqual(
    serializeHybridHexBrain(result.hybridBrain),
    beforeBrain,
  );
  assert.ok(result.diagnostics.some((message) => /3 paramètres reçus/.test(message)));
});

test("un HexConv incompatible ne bloque pas l’import d’un module Core valide", () => {
  const local = localMemory();
  const brain = createDefaultHybridHexBrain();
  const beforeBrain = serializeHybridHexBrain(brain);
  const importedCore = DEFAULT_WEIGHTS.map((weight) => weight + 0.17);
  const result = importNamedWeightModules(
    {
      core: {
        moduleVersion: 1,
        weights: importedCore,
      },
      hexConv: {
        moduleVersion: 99,
        architectureId: "future-hexconv",
        brain: { weights: [1, 2, 3] },
      },
    },
    local,
    brain,
  );
  assert.deepEqual(result.memory.weights, importedCore);
  assert.deepEqual(serializeHybridHexBrain(result.hybridBrain), beforeBrain);
  assert.deepEqual(result.importedModules, ["core"]);
  assert.ok(
    result.diagnostics.some((message) =>
      /hexConv: (?:version|dimensions)/.test(message),
    ),
  );
});

test("H — une ancienne IA continue à choisir et apprendre sans corrompre ses poids", () => {
  const legacy = {
    ...createDefaultAIMemory(),
    modules: undefined,
    weights: DEFAULT_WEIGHTS.slice(0, 12),
    championWeights: DEFAULT_WEIGHTS.slice(0, 12),
  };
  const imported = validateImportedMemory(legacy);
  assert(imported);
  const state = createNewGame(2, 0, 4);
  const playerId = currentPlayerId(state);
  const choice = chooseAiMove(
    state,
    playerId,
    imported.weights,
    undefined,
    0,
    1,
    true,
    "balanced",
    undefined,
    queenEscapeWeightsForMemory(imported),
  );
  assert(choice);
  const learned = reinforceAi(
    imported,
    choice.features,
    0.8,
    choice.queenEscapeFeatures,
  );
  assert.equal(learned.weights.length, DEFAULT_WEIGHTS.length);
  assert.equal(queenEscapeWeightsForMemory(learned).length, 6);
  assert.ok(learned.weights.every(Number.isFinite));
  assert.ok(queenEscapeWeightsForMemory(learned).every(Number.isFinite));
  assert.equal(learned.decisions, imported.decisions + 1);
});

test("l’export annonce chaque module, sa version et son ordre de paramètres", () => {
  const modules = serializeNamedWeightModules(
    localMemory(),
    createDefaultHybridHexBrain(),
  ) as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(modules).sort(), [
    "core",
    "hexConv",
    "queenEscapeContext",
  ]);
  assert.equal(modules.core.moduleVersion, 1);
  assert.equal(modules.queenEscapeContext.moduleVersion, 1);
  assert.equal(modules.hexConv.moduleVersion, 3);
  assert.ok(Array.isArray(modules.core.featureOrder));
  assert.ok(Array.isArray(modules.queenEscapeContext.featureOrder));
});
