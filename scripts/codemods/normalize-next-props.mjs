
import { globby } from 'globby';
import fs from 'node:fs/promises';

const pageFiles = await globby([
  "src/app/**/page.tsx",
  "src/app/superadmin/**/page.tsx",
]);

for (const f of pageFiles) {
  let src = await fs.readFile(f, 'utf8');
  let changed = false;

  // Import helpers
  if (!src.includes('resolve-props')) {
    src = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + src;
    changed = true;
  }
  // AppTypes import (type only)
  if (!/AppTypes\./.test(src) && !/import type { AppTypes }/.test(src)) {
    src = `import type { AppTypes } from "@/types/next-async-props";\n` + src;
    changed = true;
  }
  // Default export signatur
  src = src.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)/m,
    (m, name) => {
      if (m.includes('AppTypes.AsyncPageProps')) return m;
      changed = true;
      return `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps)`;
    }
  );
  // generateMetadata signatur
  src = src.replace(
    /export\s+async\s+function\s+generateMetadata\s*\([^)]*\)/m,
    (m) => {
      if (m.includes('AppTypes.AsyncPageProps')) return m;
      changed = true;
      return `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`;
    }
  );
  // Indsæt resolves hvis ikke findes
  if (!src.includes('const routeParams = await resolveParams(params);')) {
    src = src.replace(
      /export\s+default\s+async\s+function[^{]+\{\s*/m,
      (m) => `${m}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
    changed = true;
  }
  if (src.includes('export async function generateMetadata') && !src.includes('resolveParams(params);')) {
    src = src.replace(
      /export\s+async\s+function\s+generateMetadata[^{]+\{\s*/m,
      (m) => `${m}  const routeParams = await resolveParams(params);\n`
    );
    changed = true;
  }

  if (changed) {
    await fs.writeFile(f, src, 'utf8');
    console.log(`[Normalize] ${f}`);
  }
}
