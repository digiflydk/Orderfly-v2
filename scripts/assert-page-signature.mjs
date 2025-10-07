
import { globby } from "globby";
import fs from "node:fs/promises";

const pages = await globby(["src/app/**/page.tsx"]);
const bad = [];

for (const f of pages) {
  const s = await fs.readFile(f, "utf8");
  const m = s.match(/export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(([^)]*)\)/m);
  if (!m) continue;
  const sig = m[1].replace(/\s+/g, " ").trim();

  // Krav: kun "params" og evt. "searchParams" via vores type
  const ok = /{\s*params\s*,\s*searchParams\s*}\s*:\s*AppTypes\.AsyncPageProps/.test(sig)
          || /{\s*params\s*}\s*:\s*AppTypes\.AsyncPageProps/.test(sig)
          || sig === ''; // Tillad tom parameterliste for sider der ikke bruger props

  if (!ok) bad.push({ f, sig });
}

if (bad.length) {
  console.error("[Guard][FEJL] Forkert default-export page-signatur:");
  bad.forEach(b => console.error(` - ${b.f}\n   (${b.sig})`));
  process.exit(1);
} else {
  console.log("[Guard] OK: Page-signaturer er korrekte.");
}
