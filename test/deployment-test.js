/**
 * Tests for eXide.edit.Projects localStorage handling.
 *
 * Regression coverage for eXist-db/eXide#835: eXide 4.0.1 persisted a
 * malformed `{ "undefined": { packages: [...] } }` entry into
 * localStorage["eXide.projects"], which crashes eXide 3.x on load
 * (its getProjectFor reads `project.root.length` for every entry with
 * no guard). These tests pin that such an entry is never created, never
 * persisted, and is stripped from already-poisoned storage on load — so
 * a user alternating between eXide 3.x and 4.x against the same browser
 * storage is not broken.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// Projects reads preferences through the eXide.app singleton at runtime.
globalThis.eXide = { app: { getPreference () { return false; } } };
global.document = { getElementById () { return null; } };

const { Projects } = require(path.join(__dirname, "..", "src", "deployment.js"));

// eXist-db/eXide#835: the exact entry eXide 4.0.1 used to persist.
const POISON = { packages: [{ abbrev: "dashboard", path: "/db/apps/dashboard" }] };
const APP = { root: "/db/apps/my-app", abbrev: "my-app", title: "My App" };

beforeEach(() => {
    global.localStorage = {};
    global.fetch = function () { return Promise.resolve({ ok: false }); };
});

describe("eXide.edit.Projects — localStorage poisoning (#835)", () => {

    it("getProjectFor tolerates a malformed entry and still resolves the real project", () => {
        const p = new Projects();
        p.projects = { "my-app": APP, "undefined": POISON };
        assert.doesNotThrow(() => {
            assert.equal(p.getProjectFor("/db/apps/my-app/data.xml").abbrev, "my-app");
            assert.equal(p.getProjectFor("/db/other/thing.xml"), null);
        });
    });

    it("saveState never persists a malformed entry", () => {
        const p = new Projects();
        p.projects = { "my-app": APP, "undefined": POISON };
        p.saveState();
        const saved = JSON.parse(global.localStorage["eXide.projects"]);
        assert.deepEqual(Object.keys(saved), ["my-app"]);
        assert.ok(!("undefined" in saved), "the 'undefined' key must not be persisted");
    });

    it("restoreState heals storage already poisoned by an earlier build", () => {
        global.localStorage["eXide.projects"] = JSON.stringify({
            "my-app": APP,
            "undefined": POISON
        });
        const p = new Projects();
        p.restoreState();
        assert.deepEqual(Object.keys(p.projects), ["my-app"]);
    });

    it("getProject does not store an abbrev-less (package-list) response as 'undefined'", async () => {
        const p = new Projects();
        global.fetch = function () {
            return Promise.resolve({ ok: true, json () { return Promise.resolve(POISON); } });
        };
        const result = await new Promise((resolve) => {
            p.getProject("/db/apps/not-an-app", resolve);
        });
        assert.equal(result, null);
        assert.deepEqual(p.projects, {}, "no 'undefined' key may be created");
    });

    it("getProject still stores a well-formed project response", async () => {
        const p = new Projects();
        global.fetch = function () {
            return Promise.resolve({ ok: true, json () { return Promise.resolve(APP); } });
        };
        const result = await new Promise((resolve) => {
            p.getProject("/db/apps/my-app", resolve);
        });
        assert.equal(result.abbrev, "my-app");
        assert.deepEqual(Object.keys(p.projects), ["my-app"]);
    });

    it("eXide 3.x can read 4.x's persisted state without crashing (cross-version)", () => {
        // Exact getProjectFor from eXide 3.5.4 (src/deployment.js) — no guard,
        // reads project.root.length for every entry. Reproduces the #835 crash.
        function getProjectFor_3x(projects, collection) {
            for (const k in projects) {
                const project = projects[k];
                if (collection.substring(0, project.root.length) === project.root) {
                    return project;
                }
            }
            return null;
        }

        // 4.x has the poison entry in memory and saves...
        const p = new Projects();
        p.projects = { "my-app": APP, "undefined": POISON };
        p.saveState();
        const asSeenBy3x = JSON.parse(global.localStorage["eXide.projects"]);

        // ...and 3.x reads what 4.x wrote. Opening a document NOT under any
        // app forces getProjectFor to iterate every entry: with the old
        // saveState the persisted poison entry made it throw "Cannot read
        // properties of undefined (reading 'length')" — exactly the #835 crash.
        assert.doesNotThrow(() => {
            assert.equal(getProjectFor_3x(asSeenBy3x, "/db/other/note.xml"), null);
        });
        // and a document under the real app still resolves
        assert.equal(getProjectFor_3x(asSeenBy3x, "/db/apps/my-app/x.xml").abbrev, "my-app");
    });
});
