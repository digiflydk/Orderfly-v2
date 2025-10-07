
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // 1) Tving korrekt signatur
  s = s.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*{[^)]*}\s*:\s*AppTypes\.AsyncPageProps\)\s*\{/m,
    (_m, name) => `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {`
  );

  // 2) Sørg for resolve-linjer i body (ikke i parameterlisten)
  if (!/const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(s)) {
    s = s.replace(
      /(export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{\s*)/m,
      (_m, head) => `${head}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
  }

  // 3) Ryd op i forkert brug
  s = s.replace(/resolveSearchParams\(\s*queryLocal\s*\)/g, "resolveSearchParams(searchParams)");
  s = s.replace(/const\s+{[^}]*}\s*=\s*routeParamsLocal;?/g, (m) => m.replace(/routeParamsLocal/g, "routeParams"));
  s = s.replace(/\brouteParamsLocal\b/g, "routeParams"); // hvis den er brugt konsekvent

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixParamInject] ${f}`);
  }
}
