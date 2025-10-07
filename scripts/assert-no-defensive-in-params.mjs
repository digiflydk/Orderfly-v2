import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/page.tsx"]);

const BAD_TOKENS = ["rawParams", "rawSearch", "routeParamsLocal", "queryLocal"];

const offenders = [];

for (const f of files) {
  const s = await fs.readFile(f, "utf8");

  // Find default export signaturen
  const m = s.match(/export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(([^)]*)\)/m);
  if (!m) continue;
  const paramsSrc = m[1];

  if (BAD_TOKENS.some(tok => new RegExp(`\\b${tok}\\b`).test(paramsSrc))) {
    offenders.push({ f, paramsSrc: paramsSrc.trim() });
  }
}

if (offenders.length) {
  console.error("[Guard][FEJL] Defensive props må IKKE ligge i funktions-parameterlisten.\n" +
    offenders.map(o => ` - ${o.f}\n   Parametre: (${o.paramsSrc})`).join("\n"));
  process.exit(1);
} else {
  console.log("[Guard] OK: ingen defensive parametre i signaturer.");
}
