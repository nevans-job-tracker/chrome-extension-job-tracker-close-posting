import assert from "node:assert/strict";
import {closePosting} from "../src/api.js";
import {createActionController} from "../src/action.js";

const origin = process.argv[2];
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/, "Smoke client accepts loopback only");

async function request(path, method = "GET", body) {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: {"Content-Type": "application/json"},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}

// These exercise exact wire preservation; no job site is fetched by this test.
const postings = [
  "https://wellfound.com/jobs/123-smoke-test",
  "https://www.linkedin.com/jobs/view/123/",
  "https://www.indeed.com/viewjob?jk=AbC123",
  "https://builtin.com/job/smoke-test/123",
  "https://www.dice.com/job-detail/12345678-1234-1234-1234-123456789abc",
];
for (const [index, url] of postings.entries()) {
  const row = await request("/applications", "POST", {
    company: `Smoke Test ${index}`, role_title: "Disposable role", job_link: url,
    status: "interested", date_applied: null, next_action: "Apply", notes: "Preserve",
  });
  let badge, title;
  const tab = {id: index, url, status: "complete"};
  const controller = createActionController({
    action: {
      setBadgeText: async ({text}) => {badge = text;},
      setBadgeBackgroundColor: async () => {},
      setTitle: async (value) => {title = value.title;},
    },
    tabs: {get: async () => tab},
  }, (jobLink) => closePosting(jobLink, {origin}));
  await controller.onClicked(tab);
  assert.equal(badge, "DONE");
  assert.match(title, /Posting Closed/);
  const after = await request(`/applications/${row.id}`);
  assert.equal(after.status, "posting_closed");
  assert.equal(after.date_applied, null);
  assert.equal(after.next_action, "Apply");
  assert.equal(after.notes, "Preserve");
  const history = await request(`/applications/${row.id}/history`);
  assert.equal(history.length, 2);
  assert.equal(history[1].from_status, "interested");
  assert.equal(history[1].to_status, "posting_closed");
  await controller.onClicked(tab);
  assert.match(title, /Already Posting Closed/);
  assert.deepEqual(await request(`/applications/${row.id}/history`), history);
}
await assert.rejects(closePosting("https://example.com/untracked", {origin}), /No tracked application/);
console.log("PASS: real JS toolbar handler/client → HTTP → FastAPI → temporary SQLite; five URL forms, status/history, repeats, and no-match.");
