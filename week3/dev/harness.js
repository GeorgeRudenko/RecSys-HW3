// Loads data.js + script.js into a VM context with a fake DOM/fetch so the
// exact browser code can be tested in Node.
const fs = require('fs'), path = require('path'), vm = require('vm');
function load(dir, files = ['data.js', 'script.js']) {
  const els = {};
  const mkEl = id => (els[id] ||= { id, innerHTML: '', value: '', options: [], textContent: '',
    appendChild(o) { this.options.push(o); }, remove(i) { this.options.splice(i, 1); },
    addEventListener() {}, set disabled(v) { this._d = v; }, get disabled() { return this._d; } });
  const ctx = {
    console, Math, Number, Array, Float32Array, Float64Array, Uint8Array, Int32Array, Map, Set,
    parseInt, parseFloat, isNaN, Error, Promise, performance, JSON,
    document: { getElementById: mkEl, createElement: () => ({ value: '', textContent: '' }) },
    fetch: async f => { const p = path.join(dir, f); if (!fs.existsSync(p)) return { ok: false, status: 404 };
      const t = fs.readFileSync(p, 'utf8'); return { ok: true, status: 200, text: async () => t }; },
    window: {},
  };
  vm.createContext(ctx);
  // top-level let/const are not ctx properties; expose them via a getter shim
  let src = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  src += '\n;globalThis.__get = n => eval(n);';
  vm.runInContext(src, ctx, { filename: 'app.js' });
  ctx.els = els;
  return ctx;
}
module.exports = { load };
