#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const root = "src/app";
let hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(p)) {
      const txt = readFileSync(p, "utf8");
      if (/\bLayoutProps\b/.test(txt)) hits.push(p);
    }
  }
}

try {
  walk(root);
} catch {}

if (hits.length) {
  console.error("✖ assert-no-layoutprops: 'LayoutProps' found in:", hits);
  process.exit(1);
} else {
  console.log("✔ assert-no-layoutprops: OK (no 'LayoutProps' in src/app)");
}
