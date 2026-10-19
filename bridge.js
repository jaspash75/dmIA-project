/* WildGuard — GitHub Pages bridge.
   GitHub Pages cannot run a Python server, so this file loads Python itself in the browser
   (Pyodide), runs the project's unchanged app.py + maths.py, and answers the page's /api/...
   requests locally. Data is kept in this browser's localStorage. */
(function () {
  const PY_FILES = ['py/flask.py', 'py/database.py', 'py/seed_data.py', 'py/maths.py', 'py/app.py',
                    'py/data/simulation_events.csv', 'py/data/scenario_storm.csv', 'py/data/public_corridor_baseline.csv'];
  const KEY = 'wg.static.db';
  const PURE = /^\/api\/(calc\/|number-theory|hamming)/;   // pure calculations: nothing to save

  const overlay = document.createElement('div');
  overlay.id = 'pyLoading';
  overlay.innerHTML = '<div><b>Loading the maths engine…</b><span>Python is starting inside your browser (first visit takes ~10 seconds).</span></div>';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(8,25,15,.92);color:#fff;font:600 18px/1.5 system-ui,sans-serif;text-align:center';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  let app = null, store = null;
  const ready = (async () => {
    const pyodide = await loadPyodide();
    const dir = '/home/pyodide/wg';
    pyodide.FS.mkdirTree(dir + '/data');
    for (const f of PY_FILES) {
      const r = await fetch(f, {cache: 'no-cache'});
      if (!r.ok) throw new Error('Missing file ' + f);
      pyodide.FS.writeFile(dir + '/' + f.replace(/^py\//, ''), await r.text());
    }
    await pyodide.runPythonAsync(`import sys, os\nsys.path.insert(0, '${dir}')\nos.chdir('${dir}')\nimport app as wg_app`);
    app = pyodide.globals.get('wg_app').app;
    store = pyodide.globals.get('wg_app').store;
    let saved = null; try { saved = localStorage.getItem(KEY); } catch {}
    if (saved && !/[?&]fresh/.test(location.search)) { try { store.load(saved); } catch {} }
    overlay.remove();
  })().catch(err => {
    overlay.innerHTML = `<div><b>Could not start the maths engine</b><span>${String(err.message || err)}<br>Check your internet connection and reload.</span></div>`;
    throw err;
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = input instanceof Request ? input.url : String(input);
    if (!(url.startsWith('/api/') || url === '/health')) return realFetch(input, init);
    await ready;
    const u = new URL(url, 'http://local');
    const method = (init.method || 'GET').toUpperCase();
    const result = app.dispatch(method, u.pathname, JSON.stringify(Object.fromEntries(u.searchParams)), init.body == null ? null : String(init.body));
    const [status, text] = result.toJs ? result.toJs() : result;
    if (result.destroy) result.destroy();
    if (method !== 'GET' && !PURE.test(u.pathname) && status < 400) { try { localStorage.setItem(KEY, store.dump()); } catch {} }
    return new Response(text, {status, headers: {'Content-Type': 'application/json'}});
  };
})();
