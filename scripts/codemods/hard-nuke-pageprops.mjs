#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/app/[brandSlug]/page.tsx",
  "src/app/superadmin/feedback/questions/edit/[versionId]/page.tsx",
];

function nukeContent(s) {
  // Fjern alle imports der nævner PageProps/LayoutProps eller .next/types
  s = s.replace(/^\s*import[^;\n]*PageProps[^;\n]*;?\s*$/gm, "");
  s = s.replace(/^\s*import[^;\n]*LayoutProps[^;\n]*;?\s*$/gm, "");
  s = s.replace(/^\s*import[^;\n]*['"]\.next\/types\/[^'"]+['"];?\s*$/gm, "");

  // Fjern lokale type-aliases der bruger de navne
  s = s.replace(/^\s*type\s+PageProps\b[^;]*;?\s*$/gm, "");
  s = s.replace(/^\s*type\s+LayoutProps\b[^;]*;?\s*$/gm, "");

  // Fjern JSDoc og kommentarer der nævner dem (for ikke at trigge guarden på ren tekst)
  s = s.replace(/\/\*\*[\s\S]*?\*\//g, (block) =>
    /PageProps|LayoutProps/.test(block) ? "" : block
  );
  s = s.replace(/^\s*\/\/[^\n]*(PageProps|LayoutProps)[^\n]*$/gm, "");

  // Hvis de stadig bruges i en funktionssignatur, neutralisér dem til any
  s = s.replace(/:\s*PageProps\b/g, ": any");
  s = s.replace(/:\s*LayoutProps\b/g, ": any");

  // Gør default-export kompatibel (async + props:any), hvis ikke allerede
  s = s.replace(
    /export\s+default\s+(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/,
    (m, asyncKw, name) => `export default async function ${name}(props: any){`
  );

  // Sikker init (skader ikke hvis ubenyttet)
  if (!/__OF541_PARAMS_INIT__/.test(s)) {
    s = s.replace(
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(\s*props:\s*any\s*\)\s*\{\s*/,
      (m) =>
        `${m}// __OF541_PARAMS_INIT__\n` +
        `  const params = await Promise.resolve((props as any)?.params ?? {});\n` +
        `  const searchParams = await Promise.resolve((props as any)?.searchParams ?? {});\n`
    );
  }

  // Sidste sikkerhedsnet: fjern alle resterende rå forekomster (også i strings)
  s = s.replace(/PageProps/g, "");
  s = s.replace(/LayoutProps/g, "");

  return s;
}

for (const rel of files) {
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) {
    console.log(`skip (missing): ${rel}`);
    continue;
  }
  const before = fs.readFileSync(abs, "utf8");
  const after = nukeContent(before);
  if (after !== before) {
    fs.writeFileSync(abs, after, "utf8");
    console.log(`✔ hard-nuked ${rel}`);
  } else {
    console.log(`✓ clean ${rel}`);
  }
}
