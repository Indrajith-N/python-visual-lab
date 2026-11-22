// Runs real CPython (Pyodide) off the main thread. The page stays responsive; a stuck program is killed by the page.
const BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
importScripts(BASE + 'pyodide.js');
let py = null;
const say = msg => postMessage({type: 'status', msg});
(async () => {
  say('Downloading the Python runtime (first load only)…');
  py = await loadPyodide({indexURL: BASE});
  say('Preparing the tracer…');
  py.runPython(await (await fetch(new URL('tracer.py', self.location.href))).text());
  postMessage({type: 'ready', version: py.version});
})().catch(e => postMessage({type: 'fatal', msg: 'Could not start Python: ' + e}));
onmessage = async e => {
  if (e.data.type !== 'run') return;
  try {
    try { await py.loadPackagesFromImports(e.data.code); } catch (_) { /* missing packages surface as a real ImportError */ }
    py.globals.set('_src', e.data.code); py.globals.set('_stdin', e.data.stdin || '');
    postMessage({type: 'result', json: py.runPython('run_traced(_src, _stdin)')});
  } catch (err) { postMessage({type: 'fatal', msg: String(err)}); }
};
