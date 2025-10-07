#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { globby } from "globby";
import path from "path";

const files = await globby(["src/app/**/page.tsx", "src/app/**/layout.tsx"]);

let changed = 0;
for (const rel of files) {
  const full = path.join(process.cwd(), rel);
  let src = readFileSync(full, "utf8");
  const before = src;
  src = src
    .replace(/^\s*import\s+type\s+{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+type\s+["']\.next\/types\/[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+{[^}]*}\s+from\s+["']\.next\/types\/[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["']\.next\/types\/[^"']+["'];?\s*$/gm, "");
  if (src !== before) {
    writeFileSync(full, src, "utf8");
    console.log("✔ nuked imports in", rel);
    changed++;
  }
}
if (!changed) console.log("No offending imports found.");
