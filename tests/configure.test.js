import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, copyFile, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "posting-closed-config-"));
  t.after(async () => {
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(tmpdir()));
    assert.ok(path.basename(target).startsWith("posting-closed-config-"));
    await rm(target, {recursive: true, force: true});
  });
  await mkdir(path.join(directory, "scripts"));
  for (const file of ["manifest.example.json", "scripts/configure.mjs"]) {
    await copyFile(new URL(`../${file}`, import.meta.url), path.join(directory, file));
  }
  return {
    directory,
    configure: (origin) => execFileSync(process.execPath,
      [path.join(directory, "scripts/configure.mjs"), origin], {encoding: "utf8", stdio: "pipe"}),
  };
}

test("configure creates only a local manifest and preserves the public template", async (t) => {
  const {directory, configure} = await fixture(t);
  const original = await readFile(path.join(directory, "manifest.example.json"), "utf8");
  configure("http://localhost:8000");
  const local = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  assert.deepEqual(local.host_permissions, ["http://localhost:8000/*"]);
  assert.equal(await readFile(path.join(directory, "manifest.example.json"), "utf8"), original);
  assert.deepEqual({...local, host_permissions: JSON.parse(original).host_permissions}, JSON.parse(original));
});

test("invalid configuration cannot overwrite the working local manifest", async (t) => {
  const {directory, configure} = await fixture(t);
  configure("https://tracker.example");
  const original = await readFile(path.join(directory, "manifest.json"), "utf8");
  for (const value of ["not-a-url", "http://tracker.example/api", "https://user:pass@tracker.example", "https://tracker.example/?query", "file:///tmp/tracker"]) {
    assert.throws(() => configure(value));
    assert.equal(await readFile(path.join(directory, "manifest.json"), "utf8"), original);
  }
});
