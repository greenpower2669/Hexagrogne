import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders the complete FabHexaGrogne V3 T3 shell", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /<title>FabHexaGrogne V3<\/title>/);
  assert.match(html, /\/intro\/fabhexagrogne-intro\.webp/);
  assert.match(html, /\/intro\/fabhexagrogne-film\.mp4/);
  assert.match(html, /\/audio\/le-petit-robot-qui-dormait\.mp3/);
  assert.match(html, /FAB[\s\S]*HEXA[\s\S]*GROGNE/);
  assert.match(html, /Un toucher lance la vidéo avec son/);
  assert.match(html, /Lecteur musical système/);
  assert.match(html, /manifest\.webmanifest\?icon=f-v3-t351-league-fix/);
  assert.match(html, /fabhexagrogne-f-v3-192\.png/);
  assert.match(html, /href="\/favicon\.ico"/);
});
