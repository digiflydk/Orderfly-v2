
#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';

const files = await globby(['src/app/**/*.tsx', 'src/app/**/*.ts']);

const offenders = [];
const localParamPatterns = [
  /\bconst\s+params\s*=/,
  /\blet\s+params\s*=/,
  /\bvar\s+params\s*=/,
  /\bconst\s+searchParams\s*=/,
  /\blet\s+searchParams\s*=/,
  /\bvar\s+searchParams\s*=/,
];

for (const f of files) {
  const txt = await fs.readFile(f, 'utf8');
  if (localParamPatterns.some((re) => re.test(txt))) {
    offenders.push(f);
  }
}

if (offenders.length) {
  console.error(
    `[Guard] Lokale 'params'/'searchParams' fundet. Alias i funktionssignatur i stedet:\n` +
    offenders.map((f) => ` - ${f}`).join('\n')
  );
  process.exit(1);
}
