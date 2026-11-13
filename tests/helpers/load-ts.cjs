const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compiledSources = new Map();

// Reuse compilation, never module state. Every load below still evaluates with
// its own mocks and exports, including independent opaque payment capabilities.
function compile(filename) {
  const absolute = path.resolve(filename);
  const source = fs.readFileSync(absolute, 'utf8');
  const cached = compiledSources.get(absolute);
  if (cached?.source === source) return cached.code;
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  compiledSources.set(absolute, { source, code });
  return code;
}

// Execute production TypeScript with only external I/O replaced by a fixture.
function loadTs(filename, mocks = {}) {
  const mod = { exports: {} };
  const code = compile(filename);
  new Function('require', 'module', 'exports', code)(name => {
    if (name === '@/lib/server/firestore-compat' && mocks['firebase/firestore']) return {...mocks['firebase/firestore'],db:mocks['@/lib/firebase']?.db}; if (name in mocks) return mocks[name];
    // Next App Router uses its compiled React, including render-scoped cache.
    if (name === 'react') return require('next/dist/compiled/react');
    const local = name.startsWith('@/') ? path.resolve('src', name.slice(2))
      : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    if (local?.endsWith('.json')) return {default: JSON.parse(fs.readFileSync(local, 'utf8'))};
    if (local) return loadTs(`${local}.ts`, mocks);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
module.exports = { loadTs };
