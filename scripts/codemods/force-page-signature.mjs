import { globby } from "globby";
import fs from "node:fs/promises";

const pages = await globby(["src/app/**/page.tsx"]);

for (const f of pages) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Sørg for imports (idempotent)
  if (!/from\s+['"]@\/types\/next-async-props['"]/.test(s))
    s = `import type { AppTypes } from "@/types/next-async-props";\n` + s;
  if (!/from\s+['"]@\/lib\/next\/resolve-props['"]/.test(s))
    s = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + s;

  // Normaliser default-export header 100% deterministisk
  s = s.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/m,
    (_m, name) => `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {\n`
  );

  // Ryd "defensive" og forvildede varianter tæt ved toppen
  s = s.replace(/^\s*\/\/\s*OF-\d+[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+(rawParams|rawSearch)[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+routeParams\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");
  s = s.replace(/^\s*const\s+query(Local|)\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");

  // Indsæt korrekt resolve-blok hvis mangler
  const hasRoute = /const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(s);
  const hasQuery = /const\s+query\s*=\s*await\s+resolveSearchParams\(\s*searchParams\s*\)/.test(s);
  if (!hasRoute || !hasQuery) {
    s = s.replace(
      /(export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*)/m,
      (_m, head) =>
        `${head}${hasRoute ? "" : "  const routeParams = await resolveParams(params);\n"}${
          hasQuery ? "" : "  const query = await resolveSearchParams(searchParams);\n"
        }`
    );
  }

  // Ryd dubletter længere nede
  s = s.replace(
    /(\n\s*const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)\s*;\s*)+/g,
    "\n  const routeParams = await resolveParams(params);\n"
  );
  s = s.replace(
    /(\n\s*const\s+query\s*=\s*await\s+resolveSearchParams\(\s*searchParams\s*\)\s*;\s*)+/g,
    "\n  const query = await resolveSearchParams(searchParams);\n"
  );

  // Ensret navne
  s = s.replace(/\brouteParams(Local)?\b/g, "routeParams");
  s = s.replace(/\bquery(Local)?\b/g, "query");

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[ForcePageSignature] ${f}`);
  }
}
