// PlaylistVerse service worker
// Purpose: make the site installable (Add to Home Screen) and keep a few
// core assets available offline. Deliberately does NOT try to cache every
// playlist page — those should always load fresh so new pages/updates show
// up immediately without needing a cache-busting strategy.

const CACHE_NAME = "playlistverse-v1";

const CORE_ASSETS = [
    "/",
    "/style.css",
    "/js/include.js",
    "/favicon.webp",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Only handle same-origin GET requests. Let everything else
    // (Spotify embeds, cross-origin fonts/icons, POSTs) pass straight through.
    if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
        return;
    }

    // Core static assets: cache-first, so they load instantly and work offline.
    if (CORE_ASSETS.includes(new URL(request.url).pathname)) {
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request))
        );
        return;
    }

    // Everything else (playlist pages, JSON, etc.): network-first, falling
    // back to cache only if the network is unavailable. This way new or
    // edited pages always show up without stale content getting stuck.
    event.respondWith(
        fetch(request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                return response;
            })
            .catch(() => caches.match(request))
    );
});
