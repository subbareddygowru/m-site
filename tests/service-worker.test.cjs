// Run with Node.js 18+: node --test tests/service-worker.test.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8");
const origin = "https://playlistverse.test";
const currentCache = "playlistverse-v2";

function worker() {
    const listeners = {};
    const stores = new Map();
    const state = {
        offline: false,
        storageUnavailable: false,
        writeFailure: false,
        status: 200,
        body: "fresh content",
        calls: [],
        skippedWaiting: false,
        claimed: false,
    };
    const key = (request) => new URL(
        typeof request === "string" ? request : request.url, origin
    ).href;

    async function network(request, options) {
        state.calls.push({ url: key(request), cache: options?.cache ?? request.cache });
        if (state.offline) throw new TypeError("Network unavailable");
        return new Response(state.body, { status: state.status });
    }

    const caches = {
        async open(name) {
            if (state.storageUnavailable) throw new Error("Storage unavailable");
            if (!stores.has(name)) stores.set(name, new Map());
            const entries = stores.get(name);
            return {
                async match(request) { return entries.get(key(request))?.clone(); },
                async put(request, response) {
                    if (state.writeFailure) throw new Error("Quota exceeded");
                    entries.set(key(request), response.clone());
                },
                async addAll(requests) {
                    const responses = await Promise.all(requests.map(network));
                    if (responses.some((response) => !response.ok)) throw new Error("Precache failed");
                    for (let i = 0; i < requests.length; i++) {
                        await this.put(requests[i], responses[i]);
                    }
                },
            };
        },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async match(request) {
            for (const entries of stores.values()) {
                const response = entries.get(key(request));
                if (response) return response.clone();
            }
        },
    };

    class WorkerRequest extends Request {
        constructor(input, options) {
            super(typeof input === "string" ? key(input) : input, options);
        }
    }

    vm.runInNewContext(source, {
        URL, Request: WorkerRequest, Response, caches,
        location: { origin },
        fetch: network,
        self: {
            addEventListener: (name, callback) => { listeners[name] = callback; },
            skipWaiting: async () => { state.skippedWaiting = true; },
            clients: { claim: async () => { state.claimed = true; } },
        },
    });

    return {
        state, caches,
        async lifecycle(name) {
            const promises = [];
            listeners[name]({ waitUntil: (promise) => promises.push(promise) });
            await Promise.all(promises);
        },
        async seed(url, body, name = currentCache) {
            await (await caches.open(name)).put(url, new Response(body));
        },
        async read(url, name = currentCache) {
            return (await (await caches.open(name)).match(url))?.text();
        },
        request(url, options = {}) {
            let response;
            listeners.fetch({
                request: { url: key(url), method: "GET", mode: "cors", ...options },
                respondWith: (promise) => { response = promise; },
            });
            return response;
        },
    };
}

for (const url of ["/", "/style.css", "/js/include.js"]) {
    test(`${url}: fetch the new deployment and retain it for offline use`, async () => {
        const app = worker();
        await app.seed(url, "old content");
        assert.equal(await (await app.request(url)).text(), "fresh content");
        assert.equal(app.state.calls[0].cache, "no-cache");
        assert.equal(await app.read(url), "fresh content");
        app.state.offline = true;
        assert.equal(await (await app.request(url)).text(), "fresh content");
    });
}

test("precache the offline shell and launch the installed app with its query string", async () => {
    const app = worker();
    await app.lifecycle("install");
    assert.equal(app.state.skippedWaiting, true);
    assert.ok(app.state.calls.every((call) => call.cache === "reload"));
    for (const call of app.state.calls) {
        assert.ok(fs.existsSync(path.join(__dirname, "..", new URL(call.url).pathname)));
    }
    app.state.offline = true;
    const home = await app.request("/?source=pwa", { mode: "navigate" });
    assert.equal(await home.text(), "fresh content");
    for (const url of ["/includes/header.html", "/includes/footer.html", "/search-index.json"]) {
        assert.equal(await (await app.request(url)).text(), "fresh content");
    }
});

test("failed precaching does not activate an incomplete replacement worker", async () => {
    const app = worker();
    app.state.status = 404;
    await assert.rejects(app.lifecycle("install"), /Precache failed/);
    assert.equal(app.state.skippedWaiting, false);
});

test("activation removes the old site cache and preserves unrelated caches", async () => {
    const app = worker();
    await app.seed("/", "old", "playlistverse-v1");
    await app.seed("/", "new");
    await app.seed("/", "other app", "another-app-v1");
    await app.lifecycle("activate");
    assert.deepEqual(await app.caches.keys(), [currentCache, "another-app-v1"]);
    assert.equal(app.state.claimed, true);
});

test("visited playlist pages remain available offline without substituting the homepage", async () => {
    const app = worker();
    const url = "/telugu/singers/shreya-ghoshal-top-100-hits.html";
    await app.seed("/", "homepage");
    await app.request(url, { mode: "navigate" });
    app.state.offline = true;
    assert.equal(await (await app.request(url, { mode: "navigate" })).text(), "fresh content");
    assert.equal((await app.request("/unvisited.html", { mode: "navigate" })).type, "error");
    assert.equal((await app.request("/search-index.json?other=value")).type, "error");
});

for (const status of [404, 500, 206]) {
    test(`HTTP ${status} does not overwrite the last complete successful response`, async () => {
        const app = worker();
        await app.seed("/style.css", "working CSS");
        app.state.status = status;
        assert.equal((await app.request("/style.css")).status, status);
        assert.equal(await app.read("/style.css"), "working CSS");
    });
}

for (const failure of ["writeFailure", "storageUnavailable"]) {
    test(`${failure}: a cache failure does not discard the online response`, async () => {
        const app = worker();
        app.state[failure] = true;
        assert.equal(await (await app.request("/style.css")).text(), "fresh content");
    });
}

test("external and non-GET requests bypass the service worker", () => {
    const app = worker();
    assert.equal(app.request("https://open.spotify.com/embed/playlist/example"), undefined);
    assert.equal(app.request("/contact", { method: "POST" }), undefined);
    assert.equal(app.request("/", { method: "HEAD" }), undefined);
    assert.equal(app.state.calls.length, 0);
});
