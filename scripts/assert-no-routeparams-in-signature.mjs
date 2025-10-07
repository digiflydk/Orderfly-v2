import { globby } from "globby";
import fs from "node:fs/promises";

const pages = await globby(["src/app/**/page.tsx"]);
const bad = [];

for (const f of pages) {
  const s = await fs.readFile(f, "utf8");
  const m = s.match(/export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(([^)]*)\)/m);
  if (!m) continue;
  const sig = m[1];
  if (/\brouteParams\b|\bquery\b/.test(sig)) {
    bad.push({ f, sig: sig.replace(/\s+/g, " ").trim() });
  }
}

if (bad.length) {
  console.error("[Guard][FEJL] 'routeParams'/'query' må IKKE stå i funktions-parameterlisten:");
  bad.forEach(b => console.error(` - ${b.f}\n   (${b.sig})`));
  process.exit(1);
} else {
  console.log("[Guard] OK: ingen 'routeParams'/'query' i signaturer.");
}
