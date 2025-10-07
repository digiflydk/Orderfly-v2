
// scripts/codemods/normalize-pages.mjs
import { globby } from "globby";
import fs from "node:fs/promises";

const pages = await globby(["src/app/**/page.tsx"]);

for (const file of pages) {
  let src = await fs.readFile(file, "utf8");
  const original = src;

  // Skip client components
  const head = src.slice(0, 200);
  const isClient = /^\s*["']use client["'];?/m.test(head);
  if (isClient) {
    continue; // we don't touch client pages
  }

  // Heuristic: does the page use params/search?
  const usesParams = /\b[^.\s]params\b|\brouteParams\b/.test(src);
  const usesSearch = /\bsearchParams\b|\bquery\b/.test(src);

  const ensureTypeImport = () => {
    if (!/from\s+["']@\/types\/next-async-props["']/.test(src)) {
      src = `import type { AppTypes } from "@/types/next-async-props";\n` + src;
    }
  };

  const ensureHelpersImport = () => {
    if (!/from\s+["']@\/lib\/next\/resolve-props["']/.test(src)) {
      src = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + src;
    }
  };

  // Normalize default export signature
  if (usesParams || usesSearch) {
    ensureTypeImport();
    ensureHelpersImport();
    // Make the signature uniform
    src = src.replace(
      /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)/m,
      (_, name) => `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps)`
    );
    // Insert resolve lines at the start of the body if missing
    if (!/const\s+routeParams\s*=\s*await\s+resolveParams\(\s*params\s*\)/.test(src)) {
      src = src.replace(
        /export\s+default\s+async\s+function[^{]+\{\s*/m,
        (m) => `${m}  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
      );
    }
  } else {
    // Page doesn't use route props: remove any arguments
    src = src.replace(
      /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)/m,
      (_, name) => `export default async function ${name}()`
    );
    // Remove unused imports of helpers/types
    src = src.replace(/import\s*{\s*resolveParams\s*,\s*resolveSearchParams\s*}\s*from\s*["']@\/lib\/next\/resolve-props["'];?\n?/g, "");
    src = src.replace(/import\s*{\s*resolveParams\s*}\s*from\s*["']@\/lib\/next\/resolve-props["'];?\n?/g, "");
    src = src.replace(/import\s*{\s*resolveSearchParams\s*}\s*from\s*["']@\/lib\/next\/resolve-props["'];?\n?/g, "");
    src = src.replace(/import\s+type\s*{\s*AppTypes\s*}\s*from\s*["']@\/types\/next-async-props["'];?\n?/g, "");
  }

  // Normalize generateMetadata if it exists
  if (/export\s+async\s+function\s+generateMetadata\s*\(/.test(src)) {
    ensureTypeImport();
    ensureHelpersImport();
    src = src.replace(
      /export\s+async\s+function\s+generateMetadata\s*\([^)]*\)/m,
      () => `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`
    );
    if (!/resolveParams\s*\(\s*params\s*\)/.test(src)) {
      src = src.replace(
        /export\s+async\s+function\s+generateMetadata[^{]+\{\s*/m,
        (m) => `${m}  const routeParams = await resolveParams(params);\n`
      );
    }
  }

  if (src !== original) {
    await fs.writeFile(file, src, "utf8");
    console.log(`[Normalize] ${file}`);
  }
}
