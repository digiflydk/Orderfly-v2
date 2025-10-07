
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // 1) Normaliser default-export signaturen (uanset hvad der står nu)
  //    => export default async function Page({ params, searchParams }: AppTypes.AsyncPageProps) {
  s = s.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/m,
    (_m, name) =>
      `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {\n`
  );

  // 2) Fjern spor af "OF-538" blokke i parameterlisten, hvis de blev liggende som tekst
  //    (vi rydder linjer der starter med const rawParams/rawSearch eller kommentaren)
  s = s.replace(/^\s*\/\/\s*OF-538[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+rawParams[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+rawSearch[^\n]*\n/gm, "");
  s = s.replace(/^\s*const\s+routeParams\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");
  s = s.replace(/^\s*const\s+query(Local)?\s*=\s*await\s*Promise\.resolve\([^)]+\);\s*\n/gm, "");

  // 3) Sørg for at resolve-linjer findes tidligt i funktionskroppen
  if (!/const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(s)) {
    s = s.replace(
      /(export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*)/m,
      (_m, head) =>
        `${head}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
  }

  // 4) Hvis nogen har brugt "queryLocal"/"routeParamsLocal", så skift dem til vores navne
  s = s.replace(/\brouteParamsLocal\b/g, "routeParams");
  s = s.replace(/\bqueryLocal\b/g, "query");

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[RemoveDefensiveParams] ${f}`);
  }
}
