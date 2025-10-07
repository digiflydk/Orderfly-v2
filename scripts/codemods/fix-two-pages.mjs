#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/app/[brandSlug]/page.tsx",
  "src/app/superadmin/feedback/questions/edit/[versionId]/page.tsx",
];

function fixFile(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    console.log(`skip (missing): ${p}`);
    return;
  }
  let s = fs.readFileSync(abs, "utf8");

  // 1) Fjern forbudte imports (PageProps/LayoutProps/.next/types)
  s = s
    .replace(/import\s*\{\s*[^}]*PageProps[^}]*\}\s*from\s*['"][^'"]+['"];?\s*\n?/g, "")
    .replace(/import\s*\{\s*[^}]*LayoutProps[^}]*\}\s*from\s*['"][^'"]+['"];?\s*\n?/g, "")
    .replace(/from\s*['"]\.next\/types\/[^'"]+['"];?\s*\n?/g, "")
    .replace(/import\s+type\s+\{\s*[^}]*PageProps[^}]*\}\s*from\s*['"][^'"]+['"];?\s*\n?/g, "")
    .replace(/import\s+type\s+\{\s*[^}]*LayoutProps[^}]*\}\s*from\s*['"][^'"]+['"];?\s*\n?/g, "");

  // 2) Gør default-funktionen async og giv den (props:any)
  //    Eksempler der matches:
  //    export default function Page({ params }: PageProps) {
  //    export default async function Page({ params }: PageProps) {
  //    export default function Something(props: PageProps) {
  s = s.replace(
    /export\s+default\s+(async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/,
    (m, asyncKw, name) => {
      const asyncPart = asyncKw ? "async " : "async ";
      return `export default ${asyncPart}function ${name}(props: any){`;
    }
  );

  // 3) Efter første { i function body, indsæt defensiv params/searchParams init
  //    (kun hvis ikke allerede indsat tidligere)
  if (!/__OF540_PARAMS_INIT__/.test(s)) {
    s = s.replace(
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(\s*props:\s*any\s*\)\s*\{\s*/,
      (m) =>
        `${m}// __OF540_PARAMS_INIT__\n` +
        `  const params = await Promise.resolve((props as any)?.params ?? {});\n` +
        `  const searchParams = await Promise.resolve((props as any)?.searchParams ?? {});\n`
    );
  }

  fs.writeFileSync(abs, s, "utf8");
  console.log(`✔ patched ${p}`);
}

for (const f of files) fixFile(f);
