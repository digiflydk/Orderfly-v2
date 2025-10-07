
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/*.tsx", "src/app/**/*.ts"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  let o = s;

  // 1) Fjern kommentarer der nævner ordene (ofte årsag til guard-falskpositiver)
  s = s.replace(/\/\/[^\n]*(PageProps|LayoutProps)[^\n]*\n/g, "\n");
  s = s.replace(/\/\*[\s\S]*?(PageProps|LayoutProps)[\s\S]*?\*\//g, "");

  // 2) Fjern imports fra next
  s = s.replace(/import\s+type\s*{\s*[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*['"]next['"];?\n?/g, "");
  s = s.replace(/import\s*{\s*[^}]*\b(PageProps|LayoutProps)\b[^}]*}\s*from\s*['"]next['"];?\n?/g, "");

  // 3) Fjern lokale aliaser
  s = s.replace(/type\s+PageProps\b[\s\S]*?;\n?/g, "");
  s = s.replace(/type\s+LayoutProps\b[\s\S]*?;\n?/g, "");
  s = s.replace(/interface\s+PageProps\b[\s\S]*?\}\n?/g, "");
  s = s.replace(/interface\s+LayoutProps\b[\s\S]*?\}\n?/g, "");

  // 4) Generics / annotationer / extends
  s = s.replace(/<\s*PageProps\s*>/g, "");
  s = s.replace(/<\s*LayoutProps\s*>/g, "");
  s = s.replace(/:\s*PageProps\b/g, ": unknown");
  s = s.replace(/:\s*LayoutProps\b/g, ": unknown");
  s = s.replace(/extends\s+PageProps\b/g, "");
  s = s.replace(/extends\s+LayoutProps\b/g, "");

  // 5) React.FC<PageProps> → React.FC
  s = s.replace(/\bReact\.FC\s*<\s*unknown\s*>/g, "React.FC");
  s = s.replace(/\bReact\.FC\s*<\s*PageProps\s*>/g, "React.FC");
  s = s.replace(/\bFC\s*<\s*PageProps\s*>/g, "FC");

  // 6) Whitespace
  s = s.replace(/[ \t]+(\n)/g, "$1").replace(/\n{3,}/g, "\n\n");

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[Strip] Cleaned ${f}`);
  }
}
