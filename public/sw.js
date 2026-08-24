const CACHE_NAME = "map-life-offline-v1";
const SHELL_ASSETS = ["/manifest.webmanifest", "/favicon.svg", "/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)));
    try {
      const response = await fetch(new Request("/", { cache: "reload", credentials: "include" }));
      if (response.ok) await cache.put(new Request("/"), response);
    } catch { /* first successful navigation will populate the offline shell */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith("map-life-offline-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new Request("/"), response.clone());
        }
        return response;
      } catch {
        return (await caches.match(new Request("/"))) || new Response("MAP 还没有完成离线准备。请联网打开一次后再试。", { headers: { "Content-Type": "text/plain; charset=utf-8" }, status: 503 });
      }
    })());
    return;
  }

  if (!["script", "style", "image", "font", "manifest"].includes(request.destination)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
