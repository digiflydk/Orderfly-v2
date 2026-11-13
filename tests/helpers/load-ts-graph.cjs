const path = require('node:path');
const { compileFixture } = require('./load-ts.cjs');

// Cache before evaluation, as CommonJS does. This preserves production module
// identity/opaque WeakMaps when the outbox lazily imports its financial writer.
// loadTs still evaluates fresh exports; only its compilation output is shared.
exports.moduleGraph = (mocks = {}) => {
  const modules = new Map();
  const load = filename => {
    const absolute = path.resolve(filename);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const mod = { exports: {} }; modules.set(absolute, mod);
    const code = compileFixture(absolute);
    new Function('require', 'module', 'exports', code)(name => {
      if (name in mocks) return mocks[name];
      const local = name.startsWith('@/') ? path.resolve('src', name.slice(2))
        : name.startsWith('.') ? path.resolve(path.dirname(absolute), name) : null;
      return local ? load(local + '.ts') : require(name);
    }, mod, mod.exports);
    return mod.exports;
  };
  return load;
};
