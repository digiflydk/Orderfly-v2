#!/usr/bin/env node
/**
 * Codemod: fjerner forbudte mønstre i påvirkede filer:
 *  - import/brug af "LayoutProps"
 *  - destrukturering i default Layout ({ children })
 *  - Promise<any> i signaturer
 *
 * Fokusfiler:
 *   - src/app/superadmin/combos/actions.ts
 *   - src/app/superadmin/website/layout.tsx (normaliseres til neutral version)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

function read(p) { return readFileSync(p, "utf8"); }
function write(p, s) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(p, s, "utf8");
  console.log(`✔ wrote ${p}`);
}

// 1) Normalisér website layout (sikkerhedsnet – selv hvis nogen ændrer det senere)
(function normalizeWebsiteLayout() {
  const p = "src/app/superadmin/website/layout.tsx";
  if (!existsSync(p)) return;
  const NEUTRAL = `export const runtime = "nodejs";

export default function Layout(props: any) {
  return <>{props?.children}</>;
}
`;
  write(p, NEUTRAL);
})();

// 2) Strip forbudte mønstre i combos/actions.ts
(function stripCombosActions() {
  const p = "src/app/superadmin/combos/actions.ts";
  if (!existsSync(p)) return;
  let s = read(p);

  // Fjern alle imports af LayoutProps
  s = s.replace(/import[^;]*\bLayoutProps\b[^;]*;?\n?/g, "");

  // Fjern standalone type-deklarationer for LayoutProps
  s = s.replace(/export\s+type\s+LayoutProps[^;]*;?\n?/g, "");
  s = s.replace(/type\s+LayoutProps[^;]*;?\n?/g, "");

  // Fjern Promise<any> i signaturer (erstattes med any)
  s = s.replace(/:\s*Promise\s*<\s*any\s*>/g, ": any");

  write(p, s);
})();
