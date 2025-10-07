
import { globby } from "globby";
import fs from "node:fs/promises";

const pageFiles = await globby(["src/app/**/page.tsx"]);

for (const file of pageFiles) {
  let s = await fs.readFile(file, "utf8");
  const original = s;

  // Skip client components
  const head = s.slice(0, 200);
  const isClient = /^\s*["']use client["'];?/m.test(head);
  if (isClient) {
    continue; // we don't touch client pages
  }

  // Heuristic: does the page use route props?
  const usesParams = /\b[^.\s]params\b|\brouteParams\b/.test(s);
  const usesSearch = /\bsearchParams\b|\bquery\b/.test(s);

  const ensureTypeImport = () => {
    if (!/from\s+["']@\/types\/next-async-props["']/.test(s)) {
      s = `import type { AppTypes } from "@/types/next-async-props";\n` + s;
    }
  };
  const ensureHelpersImport = () => {
    if (!/from\s+["']@\/lib\/next\/resolve-props["']/.test(s)) {
      s = `import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";\n` + s;
    }
  };

  // Normalize default export signature
  if (usesParams || usesSearch) {
    ensureTypeImport();
    ensureHelpersImport();
    // Make the signature uniform
    s = s.replace(
      /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/m,
      (_, name) =>
        `export default async function ${name}({ params, searchParams }: AppTypes.AsyncPageProps) {`
    );
    // Insert resolvers at the start of the body if they're missing
    if (!/const\s+routeParams\s*=\s*await\s+resolveParams\s*\(\s*params\s*\)/.test(s)) {
      s = s.replace(
        /(export\s+default\s+async\s+function[^{]+\{\s*)/m,
        (m) =>
          `${m}\n  const routeParams = await resolveParams(params);\n  const query = await resolveSearchParams(searchParams);\n`
      );
    }
  } else {
    // No route props: remove any arguments
    s = s.replace(
      /export\s+default\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)/m,
      (_, name) => `export default async function ${name}()`
    );
    // Clean up unused imports
    s = s.replace(/import\s*{\s*resolveParams\s*,\s*resolveSearchParams\s*}\s*from\s*["']@\/lib\/next\/resolve-props["'];?\n?/g, "");
    s = s.replace(/import\s*{\s*resolveParams\s*}\s*from\s*["']@\/lib\/next\/resolve-props["'];?\n?/g, "");
    s = s.replace(/import\s*{\s*resolveSearchParams\s*}\s*from\s*["']@\/lib\/next\/resolve-props["'];?\n?/g, "");
    s = s.replace(/import\s+type\s*{\s*AppTypes\s*}\s*from\s*["']@\/types\/next-async-props["'];?\n?/g, "");
  }

  // Normalize generateMetadata if it exists
  if (/export\s+async\s+function\s+generateMetadata\s*\(/.test(s)) {
    ensureTypeImport();
    ensureHelpersImport();
    s = s.replace(
      /export\s+async\s+function\s+generateMetadata\s*\([^)]*\)/m,
      () => `export async function generateMetadata({ params }: AppTypes.AsyncPageProps)`
    );
    if (!/resolveParams\s*\(\s*params\s*\)/.test(s)) {
      s = s.replace(
        /(export\s+async\s+function\s+generateMetadata[^{]+\{\s*)/m,
        (m) => `${m}\n  const routeParams = await resolveParams(params);\n`
      );
    }
  }

  if (s !== original) {
    await fs.writeFile(file, s, "utf8");
    console.log(`[Normalize] ${file}`);
  }
}
