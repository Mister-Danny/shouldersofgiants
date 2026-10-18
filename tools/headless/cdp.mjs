// tools/headless/cdp.mjs — headless-Chrome (CDP) helper for local playtest harnesses.
//
// Not part of the game bundle. Scripts drive the game served on localhost:
//
//   import { launch, withBrowser } from './tools/headless/cdp.mjs';
//   await withBrowser({ port: 9401, width: 1366, height: 768 }, async (b) => {
//     await b.send('Page.navigate', { url: 'http://localhost:8750/?emulator=1' });
//     console.log(await b.ev('document.title'));
//     await b.shot('/tmp/home.png');
//   });
//
// Chrome is ALWAYS closed and its temporary profile removed:
//   · b.close() / withBrowser's finally (normal end),
//   · a process 'exit' handler (process.exit, end of script),
//   · SIGINT / SIGTERM / SIGHUP (Ctrl-C, a caller's timeout),
//   · uncaughtException / unhandledRejection (a crash),
//   · the watchdog: opts.maxMs (default 15 min) → close and exit(124).
// SIGKILL of the harness can't be caught, so every launch first SWEEPS
// leftovers: headless Chromes on a harness profile (tmpdir/sog-…) whose owning
// harness process is gone. Profiles are named sog-h<harnessPid>-…, so a
// browser that belongs to a still-running harness (a parallel run) is kept;
// an older sog-… profile with no pid in its name is always a leftover.
//   node tools/headless/cdp.mjs --sweep     # sweep by hand
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, writeSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_PREFIX = 'sog-';
const live = new Set();          // { chrome, profile } this process started
const profiles = new Set();      // every profile dir this process created (removed again on exit)
let handlersInstalled = false;
let swept = false;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/* Kill orphaned harness Chromes (see the header). Returns how many it killed. */
export function sweepLeftovers({ quiet = false } = {}) {
  let out = '';
  try { out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }); } catch (e) { return 0; }
  let killed = 0;
  const inUse = new Set();   // profiles of harness Chromes we leave running
  out.split('\n').forEach((line) => {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) return;
    const pid = +m[1], cmd = m[2];
    if (!cmd.startsWith(CHROME + ' ') || cmd.indexOf('--headless') === -1) return;   // main browser processes only
    const dm = /--user-data-dir=(\S+)/.exec(cmd);
    if (!dm) return;
    const dir = dm[1], name = basename(dir);
    if (!name.startsWith(PROFILE_PREFIX) || !dir.startsWith(tmpdir().replace(/\/$/, '')) && !dir.startsWith('/var/folders/') && !dir.startsWith('/tmp/')) return;
    const owner = /^sog-h(\d+)-/.exec(name);
    if (owner && alive(+owner[1])) { inUse.add(dir); return; }   // its harness is still running
    try { process.kill(pid, 'SIGKILL'); killed++; } catch (e) {}
    try { rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  });
  // writeSync: a console.error to a pipe can be lost if the script exits right after.
  // Stale profile FOLDERS (older harnesses never deleted them): sog-n- / sog-pt-
  // always, sog-h<pid>- once that harness is gone — never one a live Chrome uses.
  let dirs = 0;
  try {
    readdirSync(tmpdir()).forEach((name) => {
      const m = /^sog-(?:n|pt|h(\d+))-[A-Za-z0-9]{6}$/.exec(name);
      if (!m) return;
      const dir = join(tmpdir(), name);
      if (inUse.has(dir) || (m[1] && alive(+m[1]))) return;
      try { rmSync(dir, { recursive: true, force: true }); dirs++; } catch (e) {}
    });
  } catch (e) {}
  if (dirs && !quiet) writeSync(2, `[cdp] removed ${dirs} stale harness profile folder${dirs === 1 ? '' : 's'}\n`);
  if (killed && !quiet) writeSync(2, `[cdp] swept ${killed} leftover headless Chrome${killed === 1 ? '' : 's'}\n`);
  return killed;
}

function killAllSync() {
  live.forEach((r) => { try { r.chrome.kill('SIGKILL'); } catch (e) {} });
  live.clear();
  // Chrome's helpers can still write to a profile just after the browser exits:
  // remove every profile this run created, again, on the way out.
  profiles.forEach((dir) => { try { rmSync(dir, { recursive: true, force: true }); } catch (e) {} });
}

function installHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  process.on('exit', killAllSync);
  [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]].forEach(([sig, code]) => {
    process.on(sig, () => { killAllSync(); process.exit(code); });
  });
  process.on('uncaughtException', (err) => { console.error(err); killAllSync(); process.exit(1); });
  process.on('unhandledRejection', (err) => { console.error(err); killAllSync(); process.exit(1); });
}

export async function launch({ port = 9340, width = 1280, height = 800, mobile = false, touch = false, seed = {}, maxMs = 15 * 60 * 1000 } = {}) {
  installHandlers();
  if (!swept) { swept = true; sweepLeftovers(); }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // A port already answering belongs to another browser: fail clearly.
  try { await fetch(`http://127.0.0.1:${port}/json/version`); throw new Error(`[cdp] port ${port} is already in use`); }
  catch (e) { if (/already in use/.test(e.message)) throw e; }

  const profile = mkdtempSync(join(tmpdir(), `${PROFILE_PREFIX}h${process.pid}-`));
  const chrome = spawn(CHROME,
    ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
    { stdio: 'ignore' });
  const rec = { chrome, profile };
  live.add(rec);
  profiles.add(profile);

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { ws && ws.close(); } catch (e) {}
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const gone = new Promise((r) => chrome.once('exit', r));
      try { chrome.kill('SIGTERM'); } catch (e) {}
      await Promise.race([gone, sleep(1500)]);
      if (chrome.exitCode === null && chrome.signalCode === null) { try { chrome.kill('SIGKILL'); } catch (e) {} }
    }
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    await sleep(400);   // a helper may still be writing — delete once more
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    live.delete(rec);
  };

  // Watchdog: a hung run never outlives maxMs (or leaves its Chrome behind).
  const watchdog = maxMs > 0 ? setTimeout(() => {
    console.error(`[cdp] watchdog: run exceeded ${Math.round(maxMs / 1000)}s — closing Chrome`);
    killAllSync(); process.exit(124);
  }, maxMs) : null;
  if (watchdog) watchdog.unref();

  let tabs = null;
  for (let i = 0; i < 50 && !tabs; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); }
  }
  const page = tabs && tabs.find((t) => t.type === 'page');
  let ws = null;
  if (!page) { await close(); throw new Error(`[cdp] Chrome did not open a debuggable page on port ${port}`); }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });

  let id = 0; const pending = new Map(); const logs = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description).slice(0, 400));
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) logs.push(d.params.type + ' ' + d.params.args.map((a) => a.value || a.description).join(' ').slice(0, 300));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description);
    return r.result && r.result.result && r.result.result.value;
  };
  const shot = async (path) => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(s.result.data, 'base64')); };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // A returning player who has seen the first-visit popups; `seed` adds/overrides keys.
  const base = { sog_welcome_seen: 'true', sog_guest_notice_seen: 'true', sog_account_prompt_seen: 'true', sog_intro_seen: 'true',
    sog_focus: '100', sog_adventure_intro_complete: 'true', sog_selected_adventurer: 'female', ...seed };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{ if(!sessionStorage.getItem('__seeded')){ sessionStorage.setItem('__seeded','1'); Object.entries(${JSON.stringify(base)}).forEach(([k,v])=>localStorage.setItem(k,v)); } }catch(e){}` });
  const enter = () => ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  return { send, ev, shot, sleep, enter, close, logs, chrome, profile };
}

/* launch → fn(b) → ALWAYS close, even if fn throws. */
export async function withBrowser(opts, fn) {
  const b = await launch(opts);
  try { return await fn(b); }
  finally { await b.close(); }
}

// node tools/headless/cdp.mjs --sweep
if (process.argv[1] && process.argv[1].endsWith('cdp.mjs') && process.argv.includes('--sweep')) {
  const n = sweepLeftovers({ quiet: true });
  console.log(`swept ${n} leftover headless Chrome${n === 1 ? '' : 's'}`);
}
