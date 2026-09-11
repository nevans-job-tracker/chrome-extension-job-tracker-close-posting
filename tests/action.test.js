import test from "node:test";
import assert from "node:assert/strict";
import {createActionController, DEFAULT_TITLE} from "../src/action.js";

const url = "https://example.com/jobs/123";
const tab = {id: 7, url, status: "complete"};
const result = {id: 42, company: "Acme", role_title: "Engineer", changed: true};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};

function setup(close = async () => result) {
  const currentTabs = new Map([[tab.id, {...tab}]]);
  const badges = new Map();
  const titles = new Map();
  const calls = [];
  const chromeApi = {
    action: {
      setBadgeText: async ({tabId, text}) => {badges.set(tabId, text);},
      setBadgeBackgroundColor: async () => {},
      setTitle: async ({tabId, title}) => {titles.set(tabId, title);},
    },
    tabs: {get: async (id) => {
      if (!currentTabs.has(id)) throw new Error("No tab");
      return currentTabs.get(id);
    }},
  };
  const controller = createActionController(chromeApi, (url) => {calls.push(url); return close(url);});
  return {controller, chromeApi, currentTabs, badges, titles, calls};
}

test("one click updates the captured URL and shows record identity", async () => {
  const s = setup();
  await s.controller.onClicked(tab);
  assert.deepEqual(s.calls, [url]);
  assert.equal(s.badges.get(tab.id), "DONE");
  assert.equal(s.titles.get(tab.id), "Posting Closed: #42 — Acme — Engineer");
});

test("repeated request can report already closed", async () => {
  const s = setup(async () => ({...result, changed: false}));
  await s.controller.onClicked(tab);
  assert.match(s.titles.get(tab.id), /Already Posting Closed/);
});

for (const invalid of [{}, {id: -1}, {...tab, url: "chrome://extensions/"}, {...tab, status: "loading"}, {...tab, pendingUrl: "https://other.test/"}]) {
  test(`refuses unsupported or navigating tab ${JSON.stringify(invalid)}`, async () => {
    const s = setup();
    await s.controller.onClicked(invalid);
    assert.equal(s.calls.length, 0);
  });
}

test("rapid clicks on the same URL share one request across tabs", async () => {
  const pending = deferred();
  const s = setup(() => pending.promise);
  const second = {...tab, id: 8};
  s.currentTabs.set(second.id, second);
  const clicks = [s.controller.onClicked(tab), s.controller.onClicked(tab), s.controller.onClicked(second)];
  await Promise.resolve();
  assert.deepEqual(s.calls, [url]);
  pending.resolve(result);
  await Promise.all(clicks);
  assert.equal(s.badges.get(tab.id), "DONE");
  assert.equal(s.badges.get(second.id), "DONE");
  await s.controller.onClicked(tab);
  assert.equal(s.calls.length, 2);
});

test("different posting URLs run independently and keep feedback on their own tab", async () => {
  const pending = deferred();
  const s = setup((link) => link === url ? pending.promise : result);
  const second = {...tab, id: 8, url: "https://example.com/jobs/456"};
  s.currentTabs.set(second.id, second);
  const firstClick = s.controller.onClicked(tab);
  await s.controller.onClicked(second);
  assert.equal(s.badges.get(second.id), "DONE");
  assert.notEqual(s.badges.get(tab.id), "DONE");
  pending.resolve(result);
  await firstClick;
  assert.deepEqual(s.calls, [url, second.url]);
});

test("failure is visible and a later click can retry", async () => {
  let attempts = 0;
  const s = setup(async () => {
    if (++attempts === 1) throw new Error("Multiple matches: #42, #43. Nothing changed.");
    return result;
  });
  await s.controller.onClicked(tab);
  assert.equal(s.badges.get(tab.id), "ERR");
  assert.match(s.titles.get(tab.id), /#42, #43/);
  await s.controller.onClicked(tab);
  assert.equal(s.badges.get(tab.id), "DONE");
});

for (const change of [{status: "loading"}, {url: "https://example.com/jobs/456"}]) {
  test(`navigation invalidates in-flight feedback: ${JSON.stringify(change)}`, async () => {
    const pending = deferred();
    const s = setup(() => pending.promise);
    const click = s.controller.onClicked(tab);
    await s.controller.onUpdated(tab.id, change);
    pending.resolve(result);
    await click;
    assert.equal(s.badges.get(tab.id), "");
    assert.equal(s.titles.get(tab.id), DEFAULT_TITLE);
  });
}

test("rechecks captured tab URL even if a navigation event was missed", async () => {
  const pending = deferred();
  const s = setup(() => pending.promise);
  const click = s.controller.onClicked(tab);
  s.currentTabs.set(tab.id, {...tab, url: "https://example.com/jobs/456"});
  pending.resolve(result);
  await click;
  assert.equal(s.badges.get(tab.id), "");
});

test("closing a tab does not cancel the update or leave unhandled UI errors", async () => {
  const pending = deferred();
  const s = setup(() => pending.promise);
  const click = s.controller.onClicked(tab);
  s.controller.onRemoved(tab.id);
  s.currentTabs.delete(tab.id);
  pending.resolve(result);
  await click;
  assert.equal(s.calls.length, 1);
  assert.notEqual(s.badges.get(tab.id), "DONE");
});

test("a Chrome UI failure never prevents the API request", async () => {
  const s = setup();
  s.chromeApi.action.setBadgeText = async () => {throw new Error("Tab closed");};
  s.currentTabs.delete(tab.id);
  await s.controller.onClicked(tab);
  assert.equal(s.calls.length, 1);
});

test("a late result from the previous posting cannot replace newer feedback", async () => {
  const pending = deferred();
  const s = setup((link) => link === url ? pending.promise : {...result, id: 99});
  const first = s.controller.onClicked(tab);
  const second = {...tab, url: "https://example.com/jobs/456"};
  s.currentTabs.set(tab.id, second);
  await s.controller.onUpdated(tab.id, {url: second.url});
  await s.controller.onClicked(second);
  pending.resolve(result);
  await first;
  assert.match(s.titles.get(tab.id), /#99/);
});

test("completion events do not erase a successful result", async () => {
  const s = setup();
  await s.controller.onClicked(tab);
  await s.controller.onUpdated(tab.id, {status: "complete"});
  assert.equal(s.badges.get(tab.id), "DONE");
});

test("navigation clears even a delayed title when another badge call fails", async () => {
  const pending = deferred();
  const slowTitle = deferred();
  const titleStarted = deferred();
  const s = setup(() => pending.promise);
  s.chromeApi.action.setBadgeText = async () => {throw new Error("UI failure");};
  const setTitle = s.chromeApi.action.setTitle;
  s.chromeApi.action.setTitle = async (value) => {
    if (value.title.startsWith("Updating")) {
      titleStarted.resolve();
      await slowTitle.promise;
    }
    await setTitle(value);
  };
  const click = s.controller.onClicked(tab);
  await titleStarted.promise;
  const reset = s.controller.onUpdated(tab.id, {status: "loading"});
  slowTitle.resolve();
  pending.resolve(result);
  await Promise.all([reset, click]);
  assert.equal(s.titles.get(tab.id), DEFAULT_TITLE);
});
