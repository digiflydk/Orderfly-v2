import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Finder mønsteret hvor resolve-linjer havnede inde i parameterlisten
  s = s.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*{[^)]*}\s*:\s*AppTypes\.AsyncPageProps\)\s*\{/m,
    (_m, name) => `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {`
  );

  // Hvis resolve-linjer figurerer i parameter-listen, flyt dem ned som første linjer i body
  // Simpelt fix: sørg for at de findes efter '{' i body:
  if (!/const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(s)) {
    s = s.replace(
      /(export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*)/m,
      (_m, head) => `${head}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
  }

  // Erstat uheldige "queryLocal"/"routeParamsLocal" i vores resolve-linjer
  s = s.replace(/resolveSearchParams\(\s*queryLocal\s*\)/g, "resolveSearchParams(searchParams)");
  s = s.replace(/const\s+{[^}]*}\s*=\s*routeParamsLocal;?/g, (m) => m.replace(/routeParamsLocal/g, "routeParams"));
  s = s.replace(/\brouteParamsLocal\b/g, "routeParams"); // hvis den er brugt konsekvent

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixParamInject] ${f}`);
  }
}
