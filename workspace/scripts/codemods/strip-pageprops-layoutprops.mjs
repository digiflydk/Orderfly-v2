#!/usr/bin/env node
// Cleans PageProps/LayoutProps from the entire src/app/** tree (imports, types, generics, comments)
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby([
  "src/app/**/*.tsx",
  "src/app/**/*.ts",
]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  let o = s;

  // Remove imports of PageProps/LayoutProps from next
  s = s.replace(
    /import\s+type\s*{\s*[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*["']next["'];?\n?/g,
    ""
  );
  s = s.replace(
    /import\s*{\s*[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*["']next["'];?\n?/g,
    ""
  );

  // Remove local aliases
  s = s.replace(/type\s+PageProps\b[\s\S]*?;\n?/g, "");
  s = s.replace(/type\s+LayoutProps\b[\s\S]*?;\n?/g, "");
  s = s.replace(/interface\s+PageProps\b[\s\S]*?\}\n?/g, "");
  s = s.replace(/interface\s+LayoutProps\b[\s\S]*?\}\n?/g, "");

  // Generics + annotations + extends
  s = s.replace(/<\s*PageProps\s*>/g, "");
  s = s.replace(/<\s*LayoutProps\s*>/g, "");
  s = s.replace(/:\s*PageProps\b/g, ": unknown");
  s = s.replace(/:\s*LayoutProps\b/g, ": unknown");
  s = s.replace(/extends\s+PageProps\b/g, "");
  s = s.replace(/extends\s+LayoutProps\b/g, "");

  // React.FC<PageProps> -> React.FC
  s = s.replace(/\bReact\.FC\s*<\s*unknown\s*>/g, "React.FC");
  s = s.replace(/\bReact\.FC\s*<\s*PageProps\s*>/g, "React.FC");
  s = s.replace(/\bFC\s*<\s*PageProps\s*>/g, "FC");

  // Clean comments/JSDoc mentioning the words
  s = s.replace(/\/\/[^\n]*(PageProps|LayoutProps)[^\n]*\n/g, "\n");
  s = s.replace(/\/\*[\s\S]*?(PageProps|LayoutProps)[\s\S]*?\*\//g, "");

  // Minor cosmetic cleanups
  s = s.replace(/[ \t]+(\n)/g, "$1");     // trailing spaces
  s = s.replace(/\n{3,}/g, "\n\n");       // too many empty lines

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[Strip] Cleaned ${f}`);
  }
}
