const CACHE_NAME = "fabhexagrogne-v3-t4-cache-v9";
const SOUNDTRACK_PATH = "/audio/le-petit-robot-qui-dormait.mp3";
const INTRO_VIDEO_PATH = "/intro/fabhexagrogne-film.mp4";
const CORE_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/fabhexagrogne-f-v3.svg",
  "/icons/fabhexagrogne-f-v3-64.png",
  "/icons/fabhexagrogne-f-v3-apple-180.png",
  "/icons/fabhexagrogne-f-v3-192.png",
  "/icons/fabhexagrogne-f-v3-512.png",
  "/icons/fabhexagrogne-f-v3-maskable-512.png",
  "/og.png",
  "/ai-score.wasm",
  "/intro/fabhexagrogne-intro.webp",
];

async function createRangeResponse(cached, rangeHeader, fallbackType) {
  const bytes = await cached.arrayBuffer();
  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader || "");
  if (!match) return cached;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : bytes.byteLength - 1;
  const end = Math.min(requestedEnd, bytes.byteLength - 1);
  if (!Number.isFinite(start) || start < 0 || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${bytes.byteLength}` },
    });
  }
  const chunk = bytes.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
      "Content-Type": cached.headers.get("Content-Type") || fallbackType,
    },
  });
}

function streamMediaAsset(event, fallbackType) {
  const request = event.request;
  const task = caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request.url);
    if (cached) {
      const response = request.headers.has("range")
        ? await createRangeResponse(
            cached,
            request.headers.get("range"),
            fallbackType,
          )
        : cached;
      return { response, cachePromise: Promise.resolve() };
    }

    // The static host may answer a Range request with a full 200 response.
    // Fetch the complete asset without Range, cache it, then manufacture the
    // standards-compliant 206 slice expected by Chromium's media pipeline.
    const response = request.headers.has("range")
      ? await fetch(request.url)
      : await fetch(request);
    const cachePromise =
      response.ok && response.status === 200
        ? cache.put(request.url, response.clone())
        : Promise.resolve();
    const mediaResponse =
      request.headers.has("range") && response.ok && response.status === 200
        ? await createRangeResponse(
            response.clone(),
            request.headers.get("range"),
            fallbackType,
          )
        : response;
    return { response: mediaResponse, cachePromise };
  });
  event.respondWith(task.then(({ response }) => response));
  event.waitUntil(
    task.then(({ cachePromise }) => cachePromise).catch(() => undefined),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset)));
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === SOUNDTRACK_PATH) {
    streamMediaAsset(event, "audio/mpeg");
    return;
  }

  if (url.pathname === INTRO_VIDEO_PATH) {
    // Keep the film on the browser's native media pipeline: no complete Blob,
    // no full Cache API read, and Range requests can stream progressively.
    event.respondWith(fetch(request));
    return;
  }

  if (request.headers.has("range")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
