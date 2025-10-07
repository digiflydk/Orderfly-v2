
#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';

const pageFiles = await globby(['src/app/**/page.tsx']);

for (const f of pageFiles) {
  let src = await fs.readFile(f, 'utf8');
  // Skip client components
  if (src.trim().startsWith("'use client'")) {
    console.log(`[Normalize] Skipping client component: ${f}`);
    continue;
  }
  
  let changed = false;

  // 1) Ensure import of AppTypes
  if (!/import type { AppTypes }/.test(src)) {
    src = `import type { AppTypes } from "@/types/next-async-props";\n` + src;
    changed = true;
  }
  
  // 2) Ensure import of helpers
  if (!src.includes('resolve-props')) {
    src = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + src;
    changed = true;
  }

  // 3) Normalize default export function signature
  const pageRegex = /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/m;
  if (pageRegex.test(src)) {
    src = src.replace(pageRegex, (match, name, args) => {
        if (args.includes('AppTypes.AsyncPageProps')) return match;
        changed = true;
        return `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps)`;
    });
  }

  // 4) Normalize generateMetadata signature
  const metadataRegex = /export\s+async\s+function\s+generateMetadata\s*\(([^)]*)\)/m;
  if (metadataRegex.test(src)) {
    src = src.replace(metadataRegex, (match, args) => {
        if (args.includes('AppTypes.AsyncPageProps')) return match;
        changed = true;
        return `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`;
    });
  }
  
  // 5) Inject resolver helpers if they don't exist
  if (!src.includes('const routeParams = await resolveParams(params);')) {
    src = src.replace(
      /(export\s+default\s+async\s+function[^{]+{\s*)/m,
      `$1\n  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
    );
    changed = true;
  }
  if (src.includes('generateMetadata') && !/generateMetadata[^{]+{\s*const routeParams = await resolveParams\(params\);/.test(src)) {
    src = src.replace(
      /(export\s+async\s+function\s+generateMetadata[^{]+{\s*)/m,
      `$1\n  const routeParams = await resolveParams(params);\n`
    );
    changed = true;
  }

  if (changed) {
    await fs.writeFile(f, src, 'utf8');
    console.log(`[Normalize] Updated props for ${f}`);
  }
}
