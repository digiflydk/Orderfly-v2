import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// This is the previously observed test baseline, NOT a production rules source.
// Refuse any different live policy rather than replacing newer restrictions.
export const knownBaseline = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /marketingOrderOutbox/{document=**} { allow read, write: if false; }
    match /{collection}/{document=**} {
      allow read, write: if collection != 'marketingOrderOutbox';
    }
  }
}`;

export const internalCollections = [
  'platformAdminAudit', 'platformAdminControl', 'platformCompanies',
  'platformAccessPlans', 'platformAccessRoles', 'platformMemberships',
];
export const legacyCollections = ['users', 'roles', 'subscription_plans'];

function tokens(source) {
  // Tokenize strings before comments: whitespace inside quoted names is meaningful.
  const pattern = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z_0-9]*|!=|\*\*|[{}\/;=,:.]/gy;
  const result = [];
  let offset = 0;
  while (offset < source.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error('Unrecognized live Firestore rules. Review the current policy before preparing a targeted change.');
    const token = match[0];
    if (!/^\s|^\/\//.test(token) && !token.startsWith('/*')) result.push(token);
    offset = pattern.lastIndex;
  }
  return result.join('\n');
}

export function prepareRules(source) {
  if (tokens(source) !== tokens(knownBaseline)) {
    throw new Error('Live Firestore rules differ from the reviewed baseline. Refusing to overwrite existing access controls.');
  }
  const quoted = values => values.map(value => `'${value}'`).join(', ');
  return `// #137: generated only from an exact match of the reviewed live baseline.
// This protects platform administration, not the entire legacy test database.
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isInternal(collection) {
      return collection in [${quoted(['marketingOrderOutbox', ...internalCollections])}];
    }
    function isLegacyCatalogue(collection) {
      return collection in [${quoted(legacyCollections)}];
    }
    match /{collection}/{document=**} {
      allow read: if !isInternal(collection);
      allow write: if !isInternal(collection) && !isLegacyCatalogue(collection);
    }
  }
}
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [project, input, output, ...extra] = process.argv.slice(2);
    if (project !== 'orderfly-39325' || !input || !output || extra.length) {
      throw new Error('Usage: node scripts/prepare-platform-firestore-rules.mjs orderfly-39325 LIVE_RULES_FILE NEW_OUTPUT_FILE');
    }
    const source = readFileSync(input, 'utf8');
    const result = prepareRules(source);
    // Never overwrite the saved live rules or an earlier candidate.
    writeFileSync(output, result, { flag: 'wx', mode: 0o600 });
    const hash = value => createHash('sha256').update(value).digest('hex');
    console.log(JSON.stringify({ project, inputSha256: hash(source), outputSha256: hash(result), deployed: false }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
