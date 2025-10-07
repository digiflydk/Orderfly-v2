#!/usr/bin/env node
/**
 * OF-538 codemod (stronger):
 * - Removes ANY import (incl. "import type") that mentions PageProps/LayoutProps or ".next/types/"
 * - Rewrites default export function signature to `async function X(props: any)` or `async function (props: any)`
 * - Injects defensive params/searchParams resolution if those identifiers appear in file
 */
import { readFileSync, writeFileSync } from "fs";
import { globby } from "globby";
import path from "path";

const ROOT = process.cwd();
const GLOBS = [
  "src/app/**/page.tsx",
  "src/app/**/layout.tsx",
];

// If you want to target only the four files, you can list them here.
// We keep it repo-wide but safe (regex-based).
function needsChange(src) {
  return /PageProps|LayoutProps|\.next\/types\//.test(src);
}

function stripTypeImports(src) {
  // remove any import or import type line that mentions PageProps/LayoutProps OR .next/types
  return src
    .replace(/^\s*import\s+type\s+{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+type\s+["']\.next\/types\/[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+{[^}]*}\s+from\s+["']\.next\/types\/[^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["']\.next\/types\/[^"']+["'];?\s*$/gm, "");
}

function normalizeSignature(src) {
  // Common signatures → async with props:any
  // named fn with destructuring + type
  src = src.replace(
    /export\s+default\s+async?\s*function\s+([A-Za-z0-9_]+)\s*\(\s*\{[^)]*\}\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function $1(props: any)"
  );
  // anon fn with destructuring + type
  src = src.replace(
    /export\s+default\s+async?\s*function\s*\(\s*\{[^)]*\}\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function (props: any)"
  );
  // named fn (props: PageProps)
  src = src.replace(
    /export\s+default\s+async?\s*function\s+([A-Za-z0-9_]+)\s*\(\s*props\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function $1(props: any)"
  );
  // anon fn (props: PageProps)
  src = src.replace(
    /export\s+default\s+async?\s*function\s*\(\s*props\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function (props: any)"
  );
  // non-async variants → make them async
  src = src.replace(
    /export\s+default\s+function\s+([A-Za-z0-9_]+)\s*\(\s*(?:props\s*:\s*(?:PageProps|LayoutProps)|\{[^)]*\}\s*:\s*(?:PageProps|LayoutProps))\s*\)/,
    "export default async function $1(props: any)"
  );
  src = src.replace(
    /export\s+default\s+function\s*\(\s*(?:props\s*:\s*(?:PageProps|LayoutProps)|\{[^)]*\}\s*:\s*(?:PageProps|LayoutProps))\s*\)/,
    "export default async function (props: any)"
  );

  // Also catch inline annotations on separate lines like:
  // const Page = (props: PageProps) => { ... }
  src = src.replace(
    /(\bconst\s+[A-Za-z0-9_]+\s*=\s*\()props\s*:\s*(PageProps|LayoutProps)(\)\s*=>)/,
    "$1props: any$3"
  );

  return src;
}

function injectDefensiveAccess(src) {
  // only inject if these identifiers are used somewhere in the file
  const usesParams = /\bparams\b/.test(src);
  const usesSearch = /\bsearchParams\b/.test(src);
  if (!usesParams && !usesSearch) return src;

  const marker = "export default async function";
  const idx = src.indexOf(marker);
  if (idx === -1) return src;
  const braceIdx = src.indexOf("{", idx);
  if (braceIdx === -1) return src;

  const inject = `
  // OF-538: defensive props handling (Next may pass Promise<any>)
  const rawParams = (props && typeof props === "object") ? (props as any).params : undefined;
  const rawSearch = (props && typeof props === "object") ? (props as any).searchParams : undefined;
  const params = await Promise.resolve(rawParams ?? {});
  const searchParams = await Promise.resolve(rawSearch ?? {});
`;
  return src.slice(0, braceIdx + 1) + inject + src.slice(braceIdx + 1);
}

(async () => {
  const files = await globby(GLOBS);
  let changed = 0;

  for (const rel of files) {
    const full = path.join(ROOT, rel);
    let src = readFileSync(full, "utf8");
    if (!needsChange(src)) continue;

    const before = src;
    src = stripTypeImports(src);
    src = normalizeSignature(src);
    src = injectDefensiveAccess(src);

    if (src !== before) {
      writeFileSync(full, src, "utf8");
      console.log("✔ patched", rel);
      changed++;
    }
  }

  if (!changed) {
    console.log("No files needed patching.");
  }
})();
