import {readFile, writeFile} from "node:fs/promises";

const supplied = process.argv[2];
let origin;
try {
  const url = new URL(supplied);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) throw new Error();
  origin = url.origin;
} catch {
  console.error("Usage: npm run configure -- http://your-tracker-host (origin only; no /api)");
  process.exit(1);
}
const file = new URL("../manifest.json", import.meta.url);
const template = new URL("../manifest.example.json", import.meta.url);
const manifest = JSON.parse(await readFile(template, "utf8"));
manifest.host_permissions = [`${origin}/*`];
await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Local manifest created for ${origin} (excluded from Git). Reload the extension in Chrome.`);
