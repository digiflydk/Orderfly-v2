
import { globby } from "globby";
import fs from "node:fs/promises";

const files = await globby(["src/**/*.{ts,tsx}"]);

for (const f of files) {
  let s = await fs.readFile(f, "utf8");
  const o = s;

  // Fjern hængende semikolon efter åbnende objekt-litteral: "({;" -> "({"
  s = s.replace(/(\{\s*);/g, "$1");

  // Dobbelt semikolon
  s = s.replace(/;;+/g, ";");

  if (s !== o) {
    await fs.writeFile(f, s, "utf8");
    console.log(`[FixSyntax] ${f}`);
  }
}
