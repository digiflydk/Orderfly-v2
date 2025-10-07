#!/usr/bin/env node
/**
 * OF-537 codemod:
 *  - Finder pages/layouts under src/app/** der bruger PageProps eller .next/types
 *  - Skifter funktionssignatur til async (props: any)
 *  - Indfører defensiv læsning af params/searchParams med Promise.resolve
 *  - Bevarer alt eksisterende JSX/logic uændret
 */
import { readFileSync, writeFileSync } from "fs";
import { globby } from "globby";
import path from "path";

const ROOT = process.cwd();
const GLOBS = [
  "src/app/**/page.tsx",
  "src/app/**/layout.tsx",
];

const TARGET_FILES = [
  "src/app/[brandSlug]/page.tsx",
  "src/app/[brandSlug]/checkout/page.tsx",
  "src/app/[brandSlug]/checkout/confirmation/page.tsx",
  "src/app/[brandSlug]/[locationSlug]/page.tsx",
  "src/app/[brandSlug]/[locationSlug]/checkout/page.tsx",
  "src/app/[brandSlug]/[locationSlug]/checkout/layout.tsx",
  "src/app/admin/analytics/page.tsx",
];

function needsChange(src) {
  return (
    /PageProps|LayoutProps/.test(src) ||
    /from\s+["']\.next\/types\//.test(src)
  );
}

function applyPatch(src, isLayout) {
  // Fjern explicit imports af PageProps/LayoutProps og .next/types
  src = src
    .replace(/import\s*{[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*["'][^"']+["'];?\s*\n?/g, "")
    .replace(/import\s*["']\.next\/types\/[^"']+["'];?\s*\n?/g, "")
    .replace(/import\s*{[^}]*}\s*from\s*["']\.next\/types\/[^"']+["'];?\s*\n?/g, "");

  // Skift default export signature
  // case 1: export default function Name({ ... }: PageProps) { ... }
  src = src.replace(
    /export\s+default\s+async?\s*function\s+([A-Za-z0-9_]+)\s*\(\s*\{[^)]*\}\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function $1(props: any)"
  );
  // case 2: export default function ({ ... }: PageProps) { ... }
  src = src.replace(
    /export\s+default\s+async?\s*function\s*\(\s*\{[^)]*\}\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function (props: any)"
  );
  // case 3: export default function Name(props: PageProps) { ... }
  src = src.replace(
    /export\s+default\s+async?\s*function\s+([A-Za-z0-9_]+)\s*\(\s*props\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function $1(props: any)"
  );
  // case 4: export default function (props: PageProps) { ... }
  src = src.replace(
    /export\s+default\s+async?\s*function\s*\(\s*props\s*:\s*(PageProps|LayoutProps)\s*\)/,
    "export default async function (props: any)"
  );
  // case 5: hvis den ikke er async endnu
  src = src.replace(
    /export\s+default\s+function\s+([A-Za-z0-9_]+)\s*\(\s*(?:props\s*:\s*(?:PageProps|LayoutProps)|\{[^)]*\}\s*:\s*(?:PageProps|LayoutProps))\s*\)/,
    "export default async function $1(props: any)"
  );
  src = src.replace(
    /export\s+default\s+function\s*\(\s*(?:props\s*:\s*(?:PageProps|LayoutProps)|\{[^)]*\}\s*:\s*(?:PageProps|LayoutProps))\s*\)/,
    "export default async function (props: any)"
  );

  // Indsprøjt defensiv read af params/searchParams hvis de bruges i filen
  const usesParams = /\bparams\b/.test(src);
  const usesSearch = /\bsearchParams\b/.test(src);

  if (usesParams || usesSearch) {
    const marker = "export default async function";
    const idx = src.indexOf(marker);
    if (idx !== -1) {
      const braceIdx = src.indexOf("{", idx);
      if (braceIdx !== -1) {
        const inject =
`  // OF-537: defensive props handling (Next may pass Promise<any>)
  const rawParams = (props && typeof props === "object") ? (props as any).params : undefined;
  const rawSearch = (props && typeof props === "object") ? (props as any).searchParams : undefined;
  const params = await Promise.resolve(rawParams ?? {});
  const searchParams = await Promise.resolve(rawSearch ?? {});\n`;
        src = src.slice(0, braceIdx + 1) + "\n" + inject + src.slice(braceIdx + 1);
      }
    }
  }

  // Done
  return src;
}

(async () => {
  const all = await globby(GLOBS);
  let changed = 0;

  for (const rel of all) {
    // kun vores målfiler + enhver der matcher needsChange()
    if (!TARGET_FILES.includes(rel)) {
      // spring over filer der ikke indeholder PageProps-mønster
      const raw = readFileSync(path.join(ROOT, rel), "utf8");
      if (!needsChange(raw)) continue;
    }
    const full = path.join(ROOT, rel);
    const src = readFileSync(full, "utf8");
    if (!needsChange(src)) continue;

    const isLayout = /\/layout\.tsx$/.test(rel);
    const next = applyPatch(src, isLayout);
    if (next !== src) {
      writeFileSync(full, next, "utf8");
      console.log("✔ patched", rel);
      changed++;
    }
  }

  if (!changed) {
    console.log("No files needed patching.");
  }
})();
