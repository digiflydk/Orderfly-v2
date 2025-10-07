
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/app/**/*.tsx", "src/app/**/*.ts"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  const lines = s.split("\n");
  const protectedLines = new Set();

  // Protect imports and default export signatures
  lines.forEach((line, idx) => {
    if (
      /^\s*import\s/.test(line) ||
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(/.test(line)
    ) protectedLines.add(idx);
  });

  function mapLines(mapper) {
    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i];
        const newLine = mapper(originalLine, i);
        if (originalLine !== newLine) {
            lines[i] = newLine;
        }
    }
  }

  // 1) Destructuring: const { params, searchParams } = ...
  mapLines((ln, i) => {
    if (protectedLines.has(i) || /resolveParams\(|resolveSearchParams\(/.test(ln)) return ln;
    return ln.replace(/\b(const|let|var)\s*{\s*([^}]+)\s*}\s*=\s*(.+);?/, (m, kw, inner, rhs) => {
      let changed = inner.replace(/\bparams\b/g, "routeParamsLocal")
                         .replace(/\bsearchParams\b/g, "queryLocal");
      return `${kw} { ${changed} } = ${rhs};`;
    });
  });

  // 2) Single declarations: const/let/var params = ...
  mapLines((ln, i) => {
    if (protectedLines.has(i) || /resolveParams\(|resolveSearchParams\(/.test(ln)) return ln;
    return ln
      .replace(/\b(const|let|var)\s+params\b/g, (_m, kw) => `${kw} routeParamsLocal`)
      .replace(/\b(const|let|var)\s+searchParams\b/g, (_m, kw) => `${kw} queryLocal`);
  });

  // 3) Local function parameters (not default export)
  mapLines((ln, i) => {
    if (protectedLines.has(i)) return ln;
    // function foo(params, searchParams) { ... }
    ln = ln.replace(
      /function\s+[A-Za-z0-9_]+\s*\(\s*([^)]*?)\s*\)/,
      (m, inner) => {
        const out = inner
          .replace(/\bparams\b/g, "routeParamsLocal")
          .replace(/\bsearchParams\b/g, "queryLocal");
        if (out !== inner) return m.replace(inner, out);
        return m;
      }
    );
    // (params, searchParams) => …
    ln = ln.replace(
      /\(\s*([^)]*?)\s*\)\s*=>/,
      (m, inner) => {
        const out = inner
          .replace(/\bparams\b/g, "routeParamsLocal")
          .replace(/\bsearchParams\b/g, "queryLocal");
        if (out !== inner) return m.replace(inner, out);
        return m;
      }
    );
    return ln;
  });

  // 4) Replace other uses in non-protected lines
  for (let i = 0; i < lines.length; i++) {
    if (!protectedLines.has(i) && !/resolveParams\(|resolveSearchParams\(/.test(lines[i])) {
      lines[i] = lines[i]
        .replace(/\bparams\b/g, "routeParamsLocal")
        .replace(/\bsearchParams\b/g, "queryLocal");
    }
  }

  const out = lines.join("\n");
  if (out !== o) {
    await fs.writeFile(f, out, "utf8");
    console.log(`[RenameLocal] ${f}`);
  }
}
