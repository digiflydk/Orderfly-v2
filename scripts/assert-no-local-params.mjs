#!/usr/bin/env node
import { globby } from 'globby';
import fs from 'node:fs/promises';

const pageFiles = await globby(['src/app/**/page.tsx']);
const otherFiles = await globby(['src/app/**/*.tsx', 'src/app/**/*.ts', '!src/app/**/page.tsx']);

const badDecl = [
  /\b(const|let|var)\s+params\s*=/,
  /\b(const|let|var)\s+searchParams\s*=/,
];

function findOffenders(files, txts) {
  const offenders = [];
  files.forEach((f, i) => {
    if (badDecl.some(re => re.test(txts[i]))) offenders.push(f);
  });
  return offenders;
}

const pageTxts = await Promise.all(pageFiles.map(f => fs.readFile(f, 'utf8')));
const otherTxts = await Promise.all(otherFiles.map(f => fs.readFile(f, 'utf8')));

const pageOffenders = findOffenders(pageFiles, pageTxts);
const otherOffenders = findOffenders(otherFiles, otherTxts);

if (otherOffenders.length) {
  console.warn(
    `[Guard][ADVARSEL] Lokale 'params'/'searchParams' i ikke-page filer:\n` +
    otherOffenders.map(f => ` - ${f}`).join('\n') +
    `\n(Dette blokerer ikke build, men bør rettes snarest.)`
  );
}

if (pageOffenders.length) {
  console.error(
    `[Guard][FEJL] Lokale 'params'/'searchParams' fundet i pages. Alias i funktionssignatur:\n` +
    pageOffenders.map(f => ` - ${f}`).join('\n')
  );
  process.exit(1);
}
