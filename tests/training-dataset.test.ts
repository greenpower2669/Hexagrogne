import assert from "node:assert/strict";
import test from "node:test";
import {
  allLegalMoves,
  applyMove,
  createNewGame,
  currentPlayerId,
} from "../app/game-engine";
import {
  archiveHumanVictory,
  createEmptyHumanTrainingArchive,
} from "../app/human-training";
import {
  appendMatchFrame,
  createEmptyMatchHistory,
} from "../app/match-history";
import {
  FAB_HEXA_BRAIN_ARCHITECTURE_ID,
  createEmptyTrainingCorpus,
  createTrainingExport,
  importTrainingPayload,
  tensorizeTrainingSample,
} from "../app/training-dataset";

function humanVictoryArchive() {
  const initial = createNewGame(2, 1);
  const move = allLegalMoves(initial, currentPlayerId(initial))[0];
  assert(move);
  const moved = applyMove(initial, move);
  assert.equal(moved.humanMoveTrace.length, 1);
  const result = archiveHumanVictory(
    createEmptyHumanTrainingArchive(),
    { ...moved, winnerId: 0 },
  );
  assert.equal(result.added, true);
  return { initial, move, moved, archive: result.archive };
}

test("une victoire humaine devient un échantillon Policy + Value(6) masqué", () => {
  const { archive } = humanVictoryArchive();
  const imported = importTrainingPayload(
    createEmptyTrainingCorpus(),
    archive,
    "victoire-humaine.json",
  );

  assert.equal(imported.report.status, "accepted");
  assert.equal(imported.report.addedSamples, 1);
  assert.equal(imported.corpus.samples.length, 1);
  const sample = imported.corpus.samples[0];
  assert.ok(sample.legalActionIndices.includes(sample.action.index));
  assert.equal(sample.valueTarget[0], 1);
  assert.equal(sample.valueTarget.filter((value) => value === -1).length, 1);
  assert.equal(sample.valueTarget.filter((value) => value === 0).length, 4);

  const tensor = tensorizeTrainingSample(sample);
  assert.equal(tensor.board.length, 30 * 11 * 11);
  assert.equal(tensor.globals.length, 32);
  assert.equal(tensor.legalMask.length, 11 * 11 * 11 * 11);
  assert.equal(tensor.legalMask[tensor.policyIndex], 1);
  assert.equal(tensor.valueTarget.length, 6);
  const boardMaskCells = Array.from(tensor.board.slice(0, 11 * 11)).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.equal(boardMaskCells, 91);
});

test("le corpus dédoublonne une décision déjà importée", () => {
  const { archive } = humanVictoryArchive();
  const first = importTrainingPayload(
    createEmptyTrainingCorpus(),
    archive,
    "premier-import.json",
  );
  const second = importTrainingPayload(
    first.corpus,
    archive,
    "second-import.json",
  );

  assert.equal(second.report.status, "duplicate");
  assert.equal(second.report.addedSamples, 0);
  assert.equal(second.report.duplicateSamples, 1);
  assert.equal(second.corpus.samples.length, 1);
});

test("T2 refuse les packs de poids hérités au lieu de les moyenner", () => {
  const result = importTrainingPayload(
    createEmptyTrainingCorpus(),
    { schema: "fabhexagrogne-ai-pack", version: 7 },
    "poids-v2.json",
  );

  assert.equal(result.report.status, "rejected");
  assert.equal(result.report.kind, "weights-only");
  assert.match(result.report.message, /refuse de moyenner les poids/i);
  assert.equal(result.corpus.samples.length, 0);
});

test("une architecture FabHexaBrain incompatible exige une conversion", () => {
  const result = importTrainingPayload(
    createEmptyTrainingCorpus(),
    {
      schema: "fabhexabrain",
      version: 2,
      architectureId: FAB_HEXA_BRAIN_ARCHITECTURE_ID + "-incompatible",
      architecture: {},
      samples: [],
    },
    "mauvaise-architecture.json",
  );

  assert.equal(result.report.status, "rejected");
  assert.match(result.report.message, /conversion explicite/i);
});

test("un export FabHexaBrain V2 se réimporte sans perte", () => {
  const { archive } = humanVictoryArchive();
  const first = importTrainingPayload(
    createEmptyTrainingCorpus(),
    archive,
    "source.json",
  );
  const exported = createTrainingExport(first.corpus, new Date(0));
  const restored = importTrainingPayload(
    createEmptyTrainingCorpus(),
    exported,
    "FabHexaBrain-V2.json",
  );

  assert.equal(restored.report.status, "accepted");
  assert.equal(restored.corpus.samples.length, 1);
  assert.deepEqual(restored.corpus.samples[0], first.corpus.samples[0]);
});

test("un historique terminé prépare le coup consécutif comme replay", () => {
  const { initial, moved } = humanVictoryArchive();
  const started = appendMatchFrame(
    createEmptyMatchHistory(),
    initial,
    new Date(0),
  );
  const completed = appendMatchFrame(
    started,
    { ...moved, winnerId: 0 },
    new Date(1),
  );
  const imported = importTrainingPayload(
    createEmptyTrainingCorpus(),
    completed,
    "historique-local.json",
  );

  assert.equal(imported.report.status, "accepted");
  assert.equal(imported.corpus.samples.length, 1);
  assert.ok(
    imported.corpus.samples[0].legalActionIndices.includes(
      imported.corpus.samples[0].action.index,
    ),
  );
});
