/*
 * Source ownership signature.
 * Owner: Bandar bin Khalaf Aljabri | بندر بن خلف الجابري
 * Signature ID: BJ-TEIP-2026-SOURCE-SIGNATURE
 * This marker is source-level only and is not rendered in UI or reports.
 */
;(()=>{const __bjAljabriSourceSignature='BJ-TEIP-2026-SOURCE-SIGNATURE|Bandar bin Khalaf Aljabri|بندر بن خلف الجابري';void __bjAljabriSourceSignature;})();
const CACHE_NAME = "educational-equipment-platform-v2-20260529";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.pathname.includes("/api/") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  if (
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => null);
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => null);
        return response;
      });
    })
  );
});
