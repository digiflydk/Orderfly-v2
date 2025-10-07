
#!/usr/bin/env node
import { globby } from "globby";
import fs from "node:fs/promises";

// Rydder PageProps/LayoutProps i hele src/app/** (imports, typer, generics, kommentarer)
const files = await globby([
  "src/app/**/*.tsx",
  "src/app/**/*.ts",
]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  let o = s;

  // Fjern kommentarer/JSdoc der nævner ordene først
  s = s.replace(/\/\/[^\n]*(PageProps|LayoutProps)[^\n]*\n/g, "\n");
  s = s.replace(/\/\*[\s\S]*?(PageProps|LayoutProps)[\s\S]*?\*\//g, "");

  // Fjern imports af PageProps/LayoutProps fra next
  s = s.replace(
    /import\s+type\s*{\s*[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*["']next["'];?\n?/g,
    ""
  );
  s = s.replace(
    /import\s*{\s*[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*["']next["'];?\n?/g,
    ""
  );

  // Fjern lokale aliaser
  s = s.replace(/type\s+PageProps\b[\s\S]*?;\n?/g, "");
  s = s.replace(/type\s+LayoutProps\b[\s\S]*?;\n?/g, "");
  s = s.replace(/interface\s+PageProps\b[\s\S]*?\}\n?/g, "");
  s = s.replace(/interface\s+LayoutProps\b[\s\S]*?\}\n?/g, "");

  // Generics + annotationer + extends
  s = s.replace(/<\s*PageProps\s*>/g, "");
  s = s.replace(/<\s*LayoutProps\s*>/g, "");
  s = s.replace(/:\s*PageProps\b/g, ": unknown");
  s = s.replace(/:\s*LayoutProps\b/g, ": unknown");
  s = s.replace(/extends\s+PageProps\b/g, "");
  s = s.replace(/extends\s+LayoutProps\b/g, "");

  // React.FC<PageProps> → React.FC
  s = s.replace(/\bReact\.FC\s*<\s*unknown\s*>/g, "React.FC");
  s = s.replace(/\bReact\.FC\s*<\s*PageProps\s*>/g, "React.FC");
  s = s.replace(/\bFC\s*<\s*PageProps\s*>/g, "FC");

  // Små kosmetiske rydninger
  s = s.replace(/[ \t]+(\n)/g, "$1");     // trailing spaces
  s = s.replace(/\n{3,}/g, "\n\n");       // for mange tomme linjer

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[Strip] Cleaned ${f}`);
  }
}
