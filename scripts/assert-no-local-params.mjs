#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';

const files = await globby(['src/app/**/*.tsx', 'src/app/**/*.ts']);
const offenders = [];
const bad = [
  /\b(const|let|var)\s+params\s*=/,
  /\b(const|let|var)\s+searchParams\s*=/,
];

for (const f of files) {
  const txt = await fs.readFile(f, 'utf8');
  if (bad.some((re) => re.test(txt))) offenders.push(f);
}

if (offenders.length) {
  console.error(
    `[Guard] Lokale 'params'/'searchParams' fundet. Brug alias i funktionssignatur i stedet:\n` +
    offenders.map((f) => ` - ${f}`).join('\n')
  );
  process.exit(1);
}
