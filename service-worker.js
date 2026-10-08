// PlaylistVerse service worker
// Revalidate same-origin content online and use the most recent successful
// response offline. Precache the app shell; cache playlist pages as visited.

const CACHE_PREFIX = "playlistverse-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;

const CORE_ASSETS = [
    "/",
    "/style.css",
    "/js/include.js",
    "/includes/header.html",
    "/includes/footer.html",
    "/includes/explore-telugu.html",
    "/search-index.json",
    "/favicon.webp",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(
                CORE_ASSETS.map((path) => new Request(path, { cache: "reload" }))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    try {
        // Revalidate the HTTP cache too, so a newly deployed page, stylesheet,
        // or script is not hidden behind either layer of browser caching.
        const response = await fetch(request, { cache: "no-cache" });

        if (response.ok && response.status !== 206) {
            try {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            } catch {
                // A full or unavailable cache must not break an online response.
            }
        }

        return response;
    } catch {
        try {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            if (cached) return cached;

            // The installed app starts at /?source=pwa, while the precached
            // homepage is /. Only home navigations may use this fallback.
            if (request.mode === "navigate" && new URL(request.url).pathname === "/") {
                const home = await cache.match("/");
                if (home) return home;
            }
        } catch {
            // Cache storage may also be unavailable while offline.
        }

        return Response.error();
    }
}

self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Spotify embeds, cross-origin fonts/icons, and non-GET requests pass through.
    if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
        return;
    }

    event.respondWith(networkFirst(request));
});
