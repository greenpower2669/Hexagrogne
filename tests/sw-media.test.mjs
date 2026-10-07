import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("le service worker transforme un média complet en réponses Range 206", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(source, /fabhexagrogne-v3-t4-cache-v9/);
  assert.match(source, /fabhexagrogne-f-v3-maskable-512\.png/);
  const listeners = new Map();
  const storedResponses = new Map();
  let networkRequests = 0;
  const cache = {
    async add() {},
    async match(key) {
      return storedResponses.get(String(key))?.clone();
    },
    async put(key, response) {
      storedResponses.set(String(key), response.clone());
    },
  };

  vm.runInNewContext(source, {
    URL,
    Request,
    Response,
    Promise,
    console,
    caches: {
      async open() {
        return cache;
      },
      async keys() {
        return [];
      },
      async delete() {
        return true;
      },
      async match(key) {
        return cache.match(key);
      },
    },
    fetch: async (request) => {
      networkRequests += 1;
      if (typeof request !== "string") {
        assert.match(request.url, /\/intro\/fabhexagrogne-film\.mp4$/);
        return new Response(Uint8Array.from([3, 4, 5]), {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": "bytes 3-5/8",
          },
        });
      }
      assert.equal(typeof request, "string", "le repli réseau retire Range");
      return new Response(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    },
    self: {
      location: { origin: "https://fab.test" },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      skipWaiting() {},
      clients: { claim: async () => undefined },
    },
  });

  const fetchListener = listeners.get("fetch");
  assert.equal(typeof fetchListener, "function");

  const requestRange = async (range) => {
    let responsePromise;
    let cachePromise;
    fetchListener({
      request: new Request(
        "https://fab.test/audio/le-petit-robot-qui-dormait.mp3",
        { headers: { Range: range } },
      ),
      respondWith(value) {
        responsePromise = value;
      },
      waitUntil(value) {
        cachePromise = value;
      },
    });
    const response = await responsePromise;
    await cachePromise;
    return response;
  };

  const first = await requestRange("bytes=2-4");
  assert.equal(first.status, 206);
  assert.equal(first.headers.get("Content-Range"), "bytes 2-4/8");
  assert.deepEqual(Array.from(new Uint8Array(await first.arrayBuffer())), [2, 3, 4]);

  const second = await requestRange("bytes=5-7");
  assert.equal(second.status, 206);
  assert.equal(second.headers.get("Content-Range"), "bytes 5-7/8");
  assert.deepEqual(Array.from(new Uint8Array(await second.arrayBuffer())), [5, 6, 7]);
  assert.equal(networkRequests, 1, "la seconde portion vient du cache complet");

  let videoResponsePromise;
  fetchListener({
    request: new Request(
      "https://fab.test/intro/fabhexagrogne-film.mp4",
      { headers: { Range: "bytes=3-5" } },
    ),
    respondWith(value) {
      videoResponsePromise = value;
    },
    waitUntil() {
      assert.fail("la vidéo ne doit jamais être chargée entièrement en cache");
    },
  });
  const videoResponse = await videoResponsePromise;
  assert.equal(videoResponse.status, 206);
  assert.deepEqual(
    Array.from(new Uint8Array(await videoResponse.arrayBuffer())),
    [3, 4, 5],
  );
  assert.equal(networkRequests, 2, "la vidéo utilise directement le flux réseau");
});

test("l’introduction attend une image réelle puis révèle le jeu en fondu", async () => {
  const [component, game, css, manifestText, layout] = await Promise.all([
    readFile(new URL("../app/game-intro.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fab-hexa-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  const videoRule = css.match(/\.intro-video\s*\{[^}]+\}/)?.[0] ?? "";
  const introRule = css.match(/\.game-intro\s*\{[^}]+\}/)?.[0] ?? "";
  const manifest = JSON.parse(manifestText);

  assert.doesNotMatch(component, /response\.blob|createObjectURL/);
  assert.match(component, /requestVideoFrameCallback/);
  assert.match(component, /preload="metadata"/);
  assert.doesNotMatch(videoRule, /opacity|transition/);
  assert.match(introRule, /transition:\s*opacity 620ms/);
  assert.ok(component.indexOf("onRevealGame();") < component.indexOf("window.setTimeout(onComplete"));
  assert.match(game, /className="game-shell"[\s\S]{0,80}hidden=\{!gameRevealed\}/);
  assert.match(game, /if\s*\(\s*showIntro\s*\|\|/);
  assert.match(game, /Installer le jeu/);
  assert.equal(manifest.display, "fullscreen");
  assert.equal(
    manifest.id,
    "https://fabhexagrognev3.gnrationsia.chatgpt.site/",
  );
  assert.equal(manifest.version, "3.1.1-t3");
  assert.ok(
    manifest.icons.some(
      (icon) =>
        icon.src === "/icons/fabhexagrogne-f-v3-maskable-512.png" &&
        icon.purpose === "maskable",
    ),
  );
  assert.match(layout, /manifest\.webmanifest\?icon=f-v3-t351-league-fix/);
  assert.match(layout, /fabhexagrogne-f-v3-192\.png/);
  assert.match(layout, /favicon\.ico/);
  assert.match(game, /aria-label="Volume de la musique"/);
  assert.match(game, /aria-label="Volume des sons du jeu"/);
  assert.match(game, /Puissance donnée à l’entraînement/);
  assert.match(game, /Architecture du super-modèle IA/);
  assert.match(game, /AI_CORE_FEATURE_ORDER\.map/);
  assert.doesNotMatch(game, /\bAI_FEATURE_ORDER\b/);
  assert.match(game, /class LeaguePanelErrorBoundary/);
  assert.match(game, /La partie, l’auto-entraînement et les sauvegardes restent actifs/);
  assert.match(game, /FABHEXABRAIN · T2 → T3/);
  assert.match(game, /HexConv \{HYBRID_HEX_FILTERS\.join\(" → "\)\}/);
  assert.match(game, /Importer des fichiers/);
  assert.match(game, /Graine T2 intégrée/);
  assert.doesNotMatch(game, /Fusionner 50\/50/);
  assert.doesNotMatch(game, /mergeAiMemories\(/);
});

test("l’auto-entraînement reste indépendant de l’intro et se répare tout seul", async () => {
  const [game, worker] = await Promise.all([
    readFile(new URL("../app/fab-hexa-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/self-play-worker.ts", import.meta.url), "utf8"),
  ]);
  const lifecycle = game.match(
    /useEffect\(\(\) => \{\s*const t2LeagueSeed[\s\S]*?\n\s*\}, \[[^\]]*\]\);/,
  )?.[0] ?? "";

  assert.match(lifecycle, /SELF_PLAY_WATCHDOG_INTERVAL_MS/);
  assert.match(lifecycle, /visibilitychange/);
  assert.match(lifecycle, /worker\.onerror/);
  assert.match(lifecycle, /scheduleRestart/);
  assert.doesNotMatch(lifecycle, /showIntro|gameRevealed/);
  assert.match(worker, /type: "ping"/);
  assert.match(worker, /type: "heartbeat"/);
  assert.match(worker, /type: "recoverable-error"/);
  assert.match(worker, /catch \(error\)/);
  assert.match(game, /trainingDelayMs\(trainingPower, humanMatchActive\)/);
});

test("la V3 possède ses propres identifiants PWA et stockages locaux", async () => {
  const [game, humanTraining, selfPlay, matchHistory, trainingDataset, t2LeagueSeed, hexconvBrain] = await Promise.all([
    readFile(new URL("../app/fab-hexa-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/human-training.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/self-play.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/match-history.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/training-dataset.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/t2-league-seed.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/hexconv-brain.ts", import.meta.url), "utf8"),
  ]);

  [
    "fabhexagrogne-v3-game-v1",
    "fabhexagrogne-v3-ai-v1",
    "fabhexagrogne-v3-ai-import-backup-v1",
    "fabhexagrogne-v3-audio-mode-v1",
    "fabhexagrogne-v3-music-volume-v1",
    "fabhexagrogne-v3-fx-volume-v1",
    "fabhexagrogne-v3-training-power-v1",
  ].forEach((key) => assert.match(game, new RegExp(key)));
  assert.match(game, /serviceWorker\.register\("\/sw\.js\?v=3-t351-league-fix"\)/);
  assert.match(humanTraining, /fabhexagrogne-v3-human-victories-v1/);
  assert.match(selfPlay, /fabhexagrogne-v3-self-play-v1/);
  assert.match(matchHistory, /fabhexagrogne-v3-match-history-v1/);
  assert.match(trainingDataset, /fabhexagrogne-v3-t2-training/);
  assert.match(t2LeagueSeed, /fabhexagrogne-v3-t2-league-cycle-172-v1/);
  assert.match(hexconvBrain, /fabhexagrogne-v3-t3-brain/);
});

test("les œufs écrasés ont une onde explosive visuelle, sonore et haptique", async () => {
  const [game, board] = await Promise.all([
    readFile(new URL("../app/fab-hexa-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hex-board.tsx", import.meta.url), "utf8"),
  ]);
  const hatchFx = game.match(
    /if \(kind === "hatch"\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";
  const crushFx = game.match(
    /if \(kind === "egg-crush"\) \{[\s\S]*?\n  \}/,
  )?.[0] ?? "";

  assert.match(game, /createBufferSource\(\)/);
  assert.match(game, /capturedType === "egg"[\s\S]{0,100}emitFx\("egg-crush"\)/);
  assert.match(game, /navigator\.vibrate\?\.\(\[55, 28, 110\]\)/);
  assert.match(hatchFx, /crackShell\(\)/);
  assert.doesNotMatch(hatchFx, /lowpass|sawtooth/);
  assert.match(crushFx, /crackShell\(\)/);
  assert.match(crushFx, /"lowpass"/);
  assert.match(crushFx, /"sawtooth"/);
  assert.match(board, /neighbors\(move\.eggBlast\.center\)/);
  assert.match(board, /move\.eggBlast\.victims\.forEach/);
});
