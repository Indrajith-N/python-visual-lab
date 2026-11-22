# Python Visual Lab (real Python edition)
Runs **real CPython (Pyodide, WebAssembly)** in a Web Worker and animates the events captured by `sys.settrace`.

## Run locally (Node 18+)
    npm install
    npm run dev        # open the printed http://localhost:5173
The first load downloads the Python runtime (~10 MB) from the Pyodide CDN, then the browser caches it. Internet is needed for that.

## Deploy
`npm run build`, then upload `dist/` to Netlify, or import the repo in Vercel (framework: Vite). No backend, database or login.

## How it works
- `public/pyodide-worker.js` loads Pyodide and runs the program off the main thread.
- `public/tracer.py` compiles and executes the student's code with CPython and records one step per real trace event
  (line completed, call, return, exception) with a snapshot of globals and the call stack.
- `src/pyRunner.js` talks to the worker and kills/restarts it after 15 s (infinite loops). Recording stops at 3000 steps.
- `src/App.jsx` plays the recorded steps. Previous Step simply shows an earlier stored snapshot; nothing is re-run.

## Honest limits
- Run executes the whole program first, then you play back or step through the recording (a running program cannot be paused mid-statement).
- Operation animations (reads, `10 + 20 = 30`, condition checks) are shown only for side-effect-free expressions of names, constants,
  built-in values and a few built-ins. For anything else the step shows the real result with a note.
- `input()` is not available. Packages must exist in Pyodide (numpy, pandas... load on demand from the CDN); others raise a real ModuleNotFoundError.
- The sandbox has no OS, hardware or raw network access. The file system is a temporary in-browser virtual one.
- The code editor is the original lightweight editor (highlighting, line numbers, current-line and error markers), not Monaco.
