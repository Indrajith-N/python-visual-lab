// Talks to the Pyodide worker. Restarts it if a program runs longer than TIMEOUT_MS.
const TIMEOUT_MS = 15000;
let worker = null, ready = null, listeners = new Set();
const emit = m => listeners.forEach(f => f(m));
export const onPyStatus = f => { listeners.add(f); return () => listeners.delete(f); };

function spawn() {
  worker = new Worker(`${import.meta.env.BASE_URL}pyodide-worker.js`);
  ready = new Promise((res, rej) => {
    worker.addEventListener('message', e => {
      const m = e.data;
      if (m.type === 'status') emit({state: 'loading', msg: m.msg});
      if (m.type === 'ready') { emit({state: 'ready', msg: 'Python ' + m.version + ' ready'}); res(); }
      if (m.type === 'fatal' && !worker.busy) { emit({state: 'error', msg: m.msg}); rej(new Error(m.msg)); }
    });
    worker.addEventListener('error', e => { emit({state: 'error', msg: 'Worker failed: ' + e.message}); rej(e); });
  });
  ready.catch(() => {});
}
export function initPython() { if (!worker) spawn(); return ready; }

const fail = msg => ({steps: [], error: {msg, line: 0}, stdout: '', stderr: msg});

export async function runPython(code, stdin = '') {
  try { await initPython(); } catch (e) { worker = null; return fail('Python runtime could not start. Check your connection and reload. ' + e.message); }
  return new Promise(resolve => {
    const w = worker; w.busy = true;
    const done = r => { clearTimeout(t); w.removeEventListener('message', on); w.busy = false; resolve(r); };
    const t = setTimeout(() => {
      w.terminate(); worker = null; ready = null; emit({state: 'loading', msg: 'Restarting Python…'}); initPython();
      done(fail(`Execution stopped: the program ran longer than ${TIMEOUT_MS / 1000} seconds (possible infinite loop or heavy computation).`));
    }, TIMEOUT_MS);
    const on = e => {
      const m = e.data;
      if (m.type === 'fatal') done(fail(m.msg));
      if (m.type === 'result') {
        const r = JSON.parse(m.json);
        r.steps = r.steps.map(s => ({...s, tr: s.tr || {reads: [], ops: []}, out: [r.chunks.slice(0, s.o).join('').replace(/\n$/, '')]}));
        done(r);
      }
    };
    w.addEventListener('message', on); w.postMessage({type: 'run', code, stdin});
  });
}
