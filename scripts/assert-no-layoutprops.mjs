#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const root = "src/app";
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(p)) {
      const txt = readFileSync(p, "utf8");
      if (/\bLayoutProps\b/.test(txt)) hits.push(p);
      if (/export\s+default\s+function\s+Layout\s*\(\s*\{\s*children/i.test(txt)) hits.push(p); // forbyd destrukturering
      if (/:\s*Promise<\s*any\s*>/.test(txt)) hits.push(p); // forbyd Promise<any>-params
    }
  }
}
try { walk(root); } catch {}

if (hits.length) {
  console.error("✖ Guard: forbidden patterns found in:", hits);
  process.exit(1);
} else {
  console.log("✔ Guard: OK (no forbidden patterns in src/app layouts)");
}
