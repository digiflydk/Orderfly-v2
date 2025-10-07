import { globby } from "globby";
import fs from "node:fs/promises";

// Meget målrettet til page.tsx, for at undgå sideeffekter i komponenter
const files = await globby(["src/app/**/page.tsx"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Skip client components
  const head = s.slice(0, 200);
  const isClient = /^\s*["']use client["'];?/m.test(head);
  if (isClient) continue;

  // Beskyt funktionssignatur og imports ved at markere deres linjer
  const protectedLines = new Set();
  s.split("\n").forEach((line, idx) => {
    if (
      /export\s+default\s+async\s+function\s+[A-Za-z0-9_]+\s*\(/.test(line) ||
      /^\s*import\s/.test(line)
    ) protectedLines.add(idx);
  });

  const lines = s.split("\n");

  // Hjælpefunktion: sikker erstatning på linjen, hvis ikke beskyttet
  function replaceLine(i, re, rep) {
    if (!protectedLines.has(i)) lines[i] = lines[i].replace(re, rep);
  }

  // 1) Destrukturering: const { params, searchParams } = ...
  for (let i = 0; i < lines.length; i++) {
    replaceLine(i, /\bconst\s*{\s*([^}]*?)\s*}\s*=\s*(.+);?/, (m, inner, rhs) => {
      let changed = inner;
      changed = changed.replace(/\bparams\b/g, "routeParamsLocal");
      changed = changed.replace(/\bsearchParams\b/g, "queryLocal");
      if (changed !== inner) return `const { ${changed} } = ${rhs};`;
      return m;
    });
  }

  // 2) Enkelt-deklarationer: const/let/var params = ...
  for (let i = 0; i < lines.length; i++) {
    replaceLine(i, /\b(const|let|var)\s+params\b/, (m, kw) => `${kw} routeParamsLocal`);
    replaceLine(i, /\b(const|let|var)\s+searchParams\b/, (m, kw) => `${kw} queryLocal`);
  }

  // 3) Efter omdøbning i deklarationer: erstat sikre, hele-ords brug i resten af filen
  //   (vi undgår at ændre signatur/imports via protectedLines)
  const body = lines.map((ln, i) =>
    protectedLines.has(i)
      ? ln
      : ln
          .replace(/\bparams\b/g, "routeParamsLocal")
          .replace(/\bsearchParams\b/g, "queryLocal")
  );
  const result = body.join("\n");

  if (result !== o) {
    await fs.writeFile(f, result, "utf8");
    console.log(`[RenameLocal] ${f}`);
  }
}
