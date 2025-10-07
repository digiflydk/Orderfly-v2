#!/usr/bin/env node
import { globby } from "globby";
import { readFileSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const files = await globby(["src/app/**/page.tsx", "src/app/**/layout.tsx"]);

const offenders = [];
for (const rel of files) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  if (/PageProps|LayoutProps|\.next\/types\//.test(src)) {
    offenders.push(rel);
  }
}

if (offenders.length) {
  console.error("✖ Guard: forbidden PageProps/LayoutProps usage in:", offenders);
  process.exit(1);
}
console.log("✔ Guard: OK (no PageProps/LayoutProps usage)");
