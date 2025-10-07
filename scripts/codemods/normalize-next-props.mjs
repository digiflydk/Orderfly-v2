#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';

const files = await globby(['src/app/**/page.tsx']);

for (const f of files) {
  let src = await fs.readFile(f, 'utf8');

  // 1) Sørg for import af helpers
  if (!src.includes('resolve-props')) {
    src = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + src;
  }

  // 2) Tving signaturen til AppTypes.AsyncPageProps
  src = src.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*{([^}]*)}\s*:\s*([^)]+)\)/m,
    (m, name) => `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps)`
  );
  src = src.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(\s*{([^}]*)}\s*\)/m,
    (m, name) => `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps)`
  );

  // 3) generateMetadata signatur
  src = src.replace(
    /export\s+async\s+function\s+generateMetadata\s*\(\s*{([^}]*)}\s*:\s*([^)]+)\)/m,
    () => `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`
  ).replace(
    /export\s+async\s+function\s+generateMetadata\s*\(\s*{([^}]*)}\s*\)/m,
    () => `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`
  );

  // 4) Indsæt resolves (naiv, men effektiv)
  if (!src.includes('const routeParams = await resolveParams(params);')) {
    src = src.replace(
      /export\s+default\s+async\s+function[^{]+\{\s*/m,
      (m) => `${m}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
  }
  if (!src.includes('const routeParams = await resolveParams(params);') && src.includes('generateMetadata')) {
    src = src.replace(
      /export\s+async\s+function\s+generateMetadata[^{]+\{\s*/m,
      (m) => `${m}  const routeParams = await resolveParams(params);\n`
    );
  }

  // 5) Tilføj AppTypes reference hvis ikke til stede
  if (!/AppTypes\./.test(src) && !/import type { AppTypes }/.test(src)) {
    src = `import type { AppTypes } from "@/types/next-async-props";\n` + src;
  }

  await fs.writeFile(f, src, 'utf8');
  console.log(`[Codemod] Normalized ${f}`);
}
