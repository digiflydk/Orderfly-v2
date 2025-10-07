
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Sørg for imports til typer/helpers (idempotent)
  if (!/from\s+["']@\/types\/next-async-props["']/.test(s)) {
    s = `import type { AppTypes } from "@/types/next-async-props";\n` + s;
  }
  if (!/from\s+["']@\/lib\/next\/resolve-props["']/.test(s)) {
    s = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + s;
  }

  // Genskab default-export header 100% deterministisk
  // Match fra "export default async function <Navn>(" frem til første "{"
  s = s.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/m,
    (_m, name) =>
      `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {\n`
  );

  // Fjern linjer der kan være injiceret forkert (OF-538 mv.) omkring toppen af funktionen
  s = s.replace(/^\s*\/\/\s*OF-538[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+rawParams[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+rawSearch[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+routeParams\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");
  s = s.replace(/^\s*const\s+query(Local|)\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");

  // Indsæt korrekte resolve-linjer øverst i body, hvis de ikke findes
  if (!/const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(s)) {
    s = s.replace(
      /(export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*)/m,
      (_m, head) =>
        `${head}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
  }

  // Ensret navne
  s = s.replace(/\brouteParamsLocal\b/g, "routeParams");
  s = s.replace(/\bqueryLocal\b/g, "query");

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixDefaultExportPage] ${f}`);
  }
}
