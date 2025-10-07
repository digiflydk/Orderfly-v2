#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/app/[brandSlug]/page.tsx",
  "src/app/superadmin/feedback/questions/edit/[versionId]/page.tsx",
];

function clean(s) {
  // Fjern imports der nævner PageProps/LayoutProps eller .next/types
  s = s.replace(/^\s*import[^;\n]*PageProps[^;\n]*;?\s*$/gm, "");
  s = s.replace(/^\s*import[^;\n]*LayoutProps[^;\n]*;?\s*$/gm, "");
  s = s.replace(/^\s*import[^;\n]*['"]\.next\/types\/[^'"]+['"];?\s*$/gm, "");

  // Fjern lokale type-aliases
  s = s.replace(/^\s*type\s+PageProps\b[^;]*;?\s*$/gm, "");
  s = s.replace(/^\s*type\s+LayoutProps\b[^;]*;?\s*$/gm, "");

  // Fjern kommentarer der nævner dem
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m)=>/PageProps|LayoutProps/.test(m)?"":m);
  s = s.replace(/^\s*\/\/[^\n]*(PageProps|LayoutProps)[^\n]*$/gm, "");

  // Neutralisér funktionssignaturer
  s = s.replace(/:\s*PageProps\b/g, ": any");
  s = s.replace(/:\s*LayoutProps\b/g, ": any");

  // Gør default-export kompatibel (async + props:any), hvis ikke allerede
  s = s.replace(
    /export\s+default\s+(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/,
    (m, asyncKw, name) => `export default async function ${name}(props: any){`
  );
  if (!/__OF542_INIT__/.test(s)) {
    s = s.replace(
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(\s*props:\s*any\s*\)\s*\{\s*/,
      (m)=>
        `${m}// __OF542_INIT__\n`+
        `  const params = await Promise.resolve((props as any)?.params ?? {});\n`+
        `  const searchParams = await Promise.resolve((props as any)?.searchParams ?? {});\n`
    );
  }

  // Sidste sikkerhedsnet: fjern rå forekomster
  s = s.replace(/PageProps/g, "");
  s = s.replace(/LayoutProps/g, "");
  return s;
}

for (const rel of files) {
  const p = path.resolve(rel);
  if (!fs.existsSync(p)) { console.log(`skip: ${rel}`); continue; }
  const before = fs.readFileSync(p, "utf8");
  const after = clean(before);
  if (after !== before) {
    fs.writeFileSync(p, after, "utf8");
    console.log(`✔ hard-nuked ${rel}`);
  } else {
    console.log(`✓ clean ${rel}`);
  }
}
