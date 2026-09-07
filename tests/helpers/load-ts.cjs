const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute production TypeScript with only external I/O replaced by a fixture.
function loadTs(filename, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    const local = name.startsWith('@/') ? path.resolve('src', name.slice(2))
      : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    if (local) return loadTs(`${local}.ts`, mocks);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
module.exports = { loadTs };
