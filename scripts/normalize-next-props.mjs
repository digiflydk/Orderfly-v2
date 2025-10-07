#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';
import path from 'node:path';

const files = await globby(['src/app/**/page.tsx']);
const report = {
  timestamp: new Date().toISOString(),
  files: [],
};

for (const f of files) {
  let src = await fs.readFile(f, 'utf8');
  let originalSrc = src;
  let changed = false;

  // 1) Sørg for import af helpers
  if (!src.includes('resolve-props')) {
    src = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + src;
    changed = true;
  }
  // 2) AppTypes import (type only)
  if (!/AppTypes\./.test(src) && !/import type { AppTypes }/.test(src)) {
    src = `import type { AppTypes } from "@/types/next-async-props";\n` + src;
    changed = true;
  }
  // 3) Default export signatur
  src = src.replace(
    /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)/m,
    (m, name) => {
      if (m.includes('AppTypes.AsyncPageProps')) return m;
      changed = true;
      return `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps)`;
    }
  );
  // 4) generateMetadata signatur
  src = src.replace(
    /export\s+async\s+function\s+generateMetadata\s*\([^)]*\)/m,
    (m) => {
      if (m.includes('AppTypes.AsyncPageProps')) return m;
      changed = true;
      return `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`;
    }
  );
  // 5) Indsæt resolves hvis ikke findes
  if (!src.includes('const routeParams = await resolveParams(params);')) {
    src = src.replace(
      /export\s+default\s+async\s+function[^{]+\{\s*/m,
      (m) => `${m}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
    changed = true;
  }
  if (src.includes('export async function generateMetadata') && !src.includes('const routeParams = await resolveParams(params);')) {
    src = src.replace(
      /export\s+async\s+function\s+generateMetadata[^{]+\{\s*/m,
      (m) => `${m}  const routeParams = await resolveParams(params);\n`
    );
    changed = true;
  }

  if (changed) {
    await fs.writeFile(f, src, 'utf8');
    report.files.push({ file: f, status: 'normalized' });
    console.log(`[Normalize] ${f}`);
  } else {
    report.files.push({ file: f, status: 'clean' });
  }
}

const reportPath = path.join(process.cwd(), 'public/build/audit/props-normalize.json');
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
