// Looks for runtime import cycles, which TypeScript does not report and which
// surface on a device as "Property 'x' doesn't exist" — the module was still
// half-initialised when something reached into it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src"
);

function imports(file) {
  const s = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of s.matchAll(/^import\s+(type\s+)?([^;]*?)from\s+["']([^"']+)["']/gm)) {
    // `import type` is erased before the code ever runs, so it cannot cycle.
    if (m[1]) continue;
    if (!m[3].startsWith(".")) continue;
    out.push(m[3]);
  }
  return out;
}

function resolve(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const cycles = [];
const done = new Set();

function walk(file, stack) {
  const at = stack.indexOf(file);
  if (at !== -1) {
    cycles.push([...stack.slice(at), file].map(rel));
    return;
  }
  if (done.has(file)) return;
  for (const spec of imports(file)) {
    const r = resolve(file, spec);
    if (r) walk(r, [...stack, file]);
  }
  done.add(file);
}

function allFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

for (const f of allFiles(ROOT)) walk(f, []);

if (cycles.length === 0) {
  console.log("No runtime import cycles anywhere in src/");
} else {
  console.log(`${cycles.length} cycle(s):`);
  for (const c of cycles) console.log("  " + c.join(" -> "));
  process.exit(1);
}
