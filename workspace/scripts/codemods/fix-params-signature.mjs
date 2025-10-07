import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // 0) Sørg for imports (idempotent)
  if (!/from\s+['"]@\/types\/next-async-props['"]/.test(s)) {
    s = `import type { AppTypes } from "@/types/next-async-props";\n` + s;
  }
  if (!/from\s+['"]@\/lib\/next\/resolve-props['"]/.test(s)) {
    s = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + s;
  }

  // 1) Normaliser default-export signaturen:
  //    ({ routeParams, query })  --> ({ params, searchParams }: AppTypes.AsyncPageProps)
  s = s.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*{[^)]*}\s*\)\s*\{/m,
    (_m, name) =>
      `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {\n`
  );

  // 2) Fjern OF-538-linjer og forvildede "defensive" deklarationer tæt på toppen
  s = s.replace(/^\s*\/\/\s*OF-538[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+rawParams[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+rawSearch[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+routeParams\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");
  s = s.replace(/^\s*const\s+query(Local|)\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");

  // 3) Indsæt præcis én korrekt resolve-blok øverst i body, hvis ikke tilstede
  const hasCorrectRoute = /const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(s);
  const hasCorrectQuery = /const\s+query\s*=\s*await\s+resolveSearchParams\(\s*searchParams\s*\)/.test(s);

  if (!hasCorrectRoute || !hasCorrectQuery) {
    s = s.replace(
      /(export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*)/m,
      (_m, head) =>
        `${head}${
          hasCorrectRoute ? "" : "  const routeParams = await resolveParams(params);\n"
        }${
          hasCorrectQuery ? "" : "  const query = await resolveSearchParams(searchParams);\n"
        }`
    );
  }

  // 4) Ryd dubletter: hvis nogen har ekstra "const routeParams =" eller "const query ="
  //    efter vores top, fjern dem
  s = s.replace(
    /(\n\s*const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)\s*;\s*)+/g,
    "\n  const routeParams = await resolveParams(params);\n"
  );
  s = s.replace(
    /(\n\s*const\s+query\s*=\s*await\s+resolveSearchParams\(\s*searchParams\s*\)\s*;\s*)+/g,
    "\n  const query = await resolveSearchParams(searchParams);\n"
  );

  // 5) Ensret brugte navne i resten af filen
  s = s.replace(/\brouteParamsLocal\b/g, "routeParams");
  s = s.replace(/\bqueryLocal\b/g, "query");

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixParamsSignature] ${f}`);
  }
}
