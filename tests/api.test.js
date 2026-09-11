import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {closePosting, isPostingUrl, trackerOrigin} from "../src/api.js";

const url = "https://www.indeed.com/viewjob?jk=AbC123";
const origin = "http://tracker.test";
const success = {
  id: 123, company: "Acme", role_title: "Engineer", job_link: url,
  status: "posting_closed", changed: true,
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status});

test("sends only the exact URL and closure status to the configured API", async () => {
  const calls = [];
  const result = await closePosting(url, {origin, fetchImpl: async (...args) => {
    calls.push(args);
    return json(success);
  }});
  assert.deepEqual(result, success);
  assert.equal(calls.length, 1);
  const [endpoint, request] = calls[0];
  assert.equal(endpoint, `${origin}/api/applications/by-url/status`);
  assert.equal(request.method, "PATCH");
  assert.equal(request.redirect, "error");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), {job_link: url, status: "posting_closed"});
});

test("already closed is a successful response", async () => {
  const result = await closePosting(url, {origin, fetchImpl: async () => json({...success, changed: false})});
  assert.equal(result.changed, false);
});

for (const value of [undefined, null, "", "bad", "chrome://extensions/", "file:///job", "javascript:alert(1)", "https://example.com/" + "x".repeat(1024)]) {
  test(`rejects invalid tab URL ${String(value).slice(0, 40)} without sending`, async () => {
    assert.equal(isPostingUrl(value), false);
    await assert.rejects(closePosting(value, {origin, fetchImpl: () => assert.fail("must not fetch")}), /HTTP\(S\)/);
  });
}

for (const status of [404, 409, 422]) {
  test(`displays backend explanation for ${status}`, async () => {
    await assert.rejects(closePosting(url, {origin, fetchImpl: async () => json({detail: "Resolve #123 in Job Tracker"}, status)}), /Resolve #123/);
  });
}

test("formats FastAPI validation errors", async () => {
  await assert.rejects(closePosting(url, {origin, fetchImpl: async () => json({detail: [{loc: ["body", "job_link"], msg: "Too long"}]}, 422)}), /job_link: Too long/);
});

test("distinguishes a missing endpoint from an unmatched posting", async () => {
  await assert.rejects(closePosting(url, {origin, fetchImpl: async () => json({detail: "Not Found"}, 404)}), /Deploy the updated/);
});

test("handles a non-JSON error response", async () => {
  await assert.rejects(closePosting(url, {origin, fetchImpl: async () => new Response("<html>Forbidden</html>", {status: 403})}), /403/);
});

test("server and transport failures report uncertain results", async () => {
  await assert.rejects(closePosting(url, {origin, fetchImpl: async () => new Response("Bad Gateway", {status: 502})}), /Result unknown/);
  await assert.rejects(closePosting(url, {origin, fetchImpl: async () => {throw new TypeError("Failed to fetch");}}), /home LAN.*Result unknown/);
});

test("times out both the request and a stalled response body", async () => {
  for (const stallBody of [false, true]) {
    const fetchImpl = async (_url, {signal}) => {
      const stalled = new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {once: true});
      });
      return stallBody ? {ok: true, json: () => stalled} : stalled;
    };
    await assert.rejects(closePosting(url, {origin, fetchImpl, timeoutMs: 10}), /timed out.*Result unknown/);
  }
});

for (const body of [null, {}, {...success, id: "123"}, {...success, status: "interested"}, {...success, job_link: url.toLowerCase()}, {...success, changed: undefined}]) {
  test(`does not announce success for an invalid response: ${JSON.stringify(body)}`, async () => {
    await assert.rejects(closePosting(url, {origin, fetchImpl: async () => json(body)}), /Unexpected.*Result unknown/);
  });
}

test("does not announce success for HTML returned with HTTP 200", async () => {
  await assert.rejects(closePosting(url, {origin, fetchImpl: async () => new Response("<html>Login</html>")}), /Unexpected.*Result unknown/);
});

test("manifest is the single source for API origin and minimal permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.example.json", import.meta.url)));
  assert.match(trackerOrigin(manifest), /^https?:\/\//);
  assert.equal(trackerOrigin({host_permissions: ["http://localhost:8000/*"]}), "http://localhost:8000");
  assert.deepEqual(manifest.permissions, ["activeTab"]);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.background.type, "module");
  for (const hosts of [[], ["<all_urls>"], ["http://*.example.com/*"], ["http://one/*", "http://two/*"]]) {
    assert.throws(() => trackerOrigin({host_permissions: hosts}), /exactly one/);
  }
  for (const path of Object.values(manifest.icons)) {
    const data = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), "PNG");
  }
});
