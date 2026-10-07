import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDefaultSelfPlayLeague } from "../app/self-play";
import {
  T2_IMPORTED_LEAGUE_META,
  createT2LeagueSeed,
  shouldAdoptT2LeagueSeed,
} from "../app/t2-league-seed";

test("la ligue cycle 172 fournie devient une graine V2 complète", () => {
  const { memory, league } = createT2LeagueSeed();

  assert.equal(league.cycle, 172);
  assert.equal(league.duels, 1_029);
  assert.equal(league.positionsEvaluated, 143_372);
  assert.equal(memory.weights.length, 14);
  assert.equal(memory.championWeights.length, 14);
  assert.deepEqual(Object.keys(league.profiles).sort(), [
    "aggressive",
    "balanced",
    "expansionist",
    "reproduction",
  ]);
  Object.values(league.profiles).forEach((profile) => {
    assert.ok(profile.memory.generation >= 515);
    assert.equal(profile.memory.weights.length, 14);
    assert.ok(profile.championHistory.length >= 4);
  });
});

test("la migration adopte la graine sans écraser une ligue plus avancée", () => {
  assert.equal(shouldAdoptT2LeagueSeed(), true);
  assert.equal(shouldAdoptT2LeagueSeed(createDefaultSelfPlayLeague()), true);

  const stronger = createT2LeagueSeed().league;
  stronger.positionsEvaluated += 1;
  assert.equal(shouldAdoptT2LeagueSeed(stronger), false);
});

test("la graine embarquée reste figée après normalisation JSON", async () => {
  const bytes = await readFile(
    new URL("../app/fabhexagrogne-ai-league-cycle-172.json", import.meta.url),
  );
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, T2_IMPORTED_LEAGUE_META.embeddedSha256);
});
