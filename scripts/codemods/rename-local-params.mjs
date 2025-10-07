
import { globby } from "globby";
import fs from "node:fs/promises";

// Meget målrettet til page.tsx, for at undgå sideeffekter i komponenter
const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  const lines = s.split("\n");
  const protectedLines = new Set();

  // Beskyt imports og default export signaturen
  lines.forEach((line, idx) => {
    if (
      /^\s*import\s/.test(line) ||
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(/.test(line)
    ) protectedLines.add(idx);
  });

  function mapLines(mapper) {
    for (let i = 0; i < lines.length; i++) lines[i] = mapper(lines[i], i);
  }

  // 1) Lokale destruktureringer
  mapLines((ln, i) => {
    if (protectedLines.has(i)) return ln;
    return ln.replace(/\b(const|let|var)\s*{\s*([^}]+)\s*}\s*=\s*(.+);?/, (m, kw, inner, rhs) => {
      let changed = inner.replace(/\bparams\b/g, "routeParamsLocal")
                         .replace(/\bsearchParams\b/g, "queryLocal");
      return `${kw} { ${changed} } = ${rhs};`;
    });
  });

  // 2) Lokale deklarationer
  mapLines((ln, i) => {
    if (protectedLines.has(i)) return ln;
    return ln
      .replace(/\b(const|let|var)\s+params\b/g, (_m, kw) => `${kw} routeParamsLocal`)
      .replace(/\b(const|let|var)\s+searchParams\b/g, (_m, kw) => `${kw} queryLocal`);
  });

  // 3) Lokale funktionsparametre (ikke default export)
  mapLines((ln, i) => {
    if (protectedLines.has(i) || /resolveParams\(|resolveSearchParams\(/.test(ln)) return ln;
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

  // 4) Erstat øvrig brug i ikke-beskyttede linjer
  mapLines((ln, i) => {
    if (protectedLines.has(i) || /resolveParams\(|resolveSearchParams\(/.test(ln)) return ln;
    return ln
      .replace(/\bparams\b/g, "routeParamsLocal")
      .replace(/\bsearchParams\b/g, "queryLocal");
  });

  const out = lines.join("\n");
  if (out !== o) {
    await fs.writeFile(f, out, "utf8");
    console.log(`[RenameLocal] ${f}`);
  }
}
