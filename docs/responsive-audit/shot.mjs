#!/usr/bin/env node
// Headless-Chrome screenshot + layout lint over CDP (no npm deps; Node >= 22 global WebSocket).
//
//   node shot.mjs --url URL --w 390 --h 844 [--dpr 2] [--mobile] [--wait 4000] --out file.png
//                 [--steps '[{"click":"css selector"},{"clickText":"Button text"},{"wait":800},
//                            {"eval":"js expr"},{"shot":"extra.png"},{"key":"Escape"}]']
//                 [--lint] [--dark]
//
// Prints JSON: { url, viewport, shots: [...], lint: {...}, console: [errors] }.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const url = opt('url');
const W = Number(opt('w', 1440));
const H = Number(opt('h', 900));
const mobile = !!opt('mobile', false);
const DPR = Number(opt('dpr', mobile ? 2 : 1));
const waitMs = Number(opt('wait', 4000));
const out = opt('out', 'shot.png');
const steps = JSON.parse(opt('steps', '[]'));
const doLint = !!opt('lint', false);
const dark = !!opt('dark', false);
if (!url) {
  console.error('missing --url');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'cdpshot-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--ignore-gpu-blocklist',
    `--window-size=${W},${H}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let chromeErr = '';
chrome.stderr.on('data', (d) => (chromeErr += d));

const cleanup = () => {
  try {
    chrome.kill('SIGKILL');
  } catch {}
  setTimeout(() => {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  }, 300);
};
const hardTimeout = setTimeout(() => {
  console.log(JSON.stringify({ error: 'timeout', chromeErr: chromeErr.slice(-500) }));
  cleanup();
  process.exit(1);
}, 90000);

async function main() {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) listeners.forEach((f) => f(msg));
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetInfos } = await send('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  const consoleErrors = [];
  listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description?.slice(0, 300) || msg.params.exceptionDetails?.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  });
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: DPR,
    mobile,
    screenWidth: W,
    screenHeight: H,
    screenOrientation: { type: W > H ? 'landscapePrimary' : 'portraitPrimary', angle: W > H ? 90 : 0 },
  });
  if (mobile) {
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await s('Network.enable');
    await s('Network.setUserAgentOverride', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    try {
      await s('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    } catch {}
  }
  const features = [];
  if (mobile) features.push({ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, { name: 'any-hover', value: 'none' }, { name: 'any-pointer', value: 'coarse' });
  features.push({ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' });
  try {
    await s('Emulation.setEmulatedMedia', { features });
  } catch {
    try {
      await s('Emulation.setEmulatedMedia', { features: features.filter((f) => f.name === 'prefers-color-scheme') });
    } catch {}
  }

  const loaded = new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId && r()));
  await s('Page.navigate', { url });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(waitMs);

  const evalJs = async (expr) => {
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shots = [];
  const shot = async (file) => {
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(data, 'base64'));
    shots.push(file);
  };
  const clickAt = async (x, y) => {
    if (mobile) {
      await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  const stepLog = [];
  for (const st of steps) {
    try {
      if (st.wait) await sleep(st.wait);
      else if (st.shot) await shot(st.shot);
      else if (st.eval) stepLog.push({ eval: st.eval.slice(0, 60), value: await evalJs(st.eval) });
      else if (st.key) {
        await s('Input.dispatchKeyEvent', { type: 'keyDown', key: st.key, code: st.key });
        await s('Input.dispatchKeyEvent', { type: 'keyUp', key: st.key, code: st.key });
      } else if (st.click || st.clickText) {
        const pos = await evalJs(`(() => {
          let el;
          ${st.click ? `el = document.querySelector(${JSON.stringify(st.click)});` : ''}
          ${
            st.clickText
              ? `el = [...document.querySelectorAll('button,a,[role=button],label,li,[tabindex]')].filter(e => e.offsetParent || e.getClientRects().length).find(e => (e.innerText||e.getAttribute('aria-label')||'').trim().toLowerCase().includes(${JSON.stringify(
                  String(st.clickText).toLowerCase(),
                )}));`
              : ''
          }
          if (!el) return null;
          el.scrollIntoView({block:'center', inline:'center'});
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width/2, y: r.top + r.height/2, tag: el.tagName, text: (el.innerText||'').slice(0,40) };
        })()`);
        if (!pos) stepLog.push({ step: st, error: 'not found' });
        else {
          await clickAt(pos.x, pos.y);
          stepLog.push({ step: st, clicked: pos });
        }
        await sleep(st.after ?? 700);
      } else if (st.tap) {
        await clickAt(st.tap[0], st.tap[1]);
        await sleep(st.after ?? 700);
      }
    } catch (e) {
      stepLog.push({ step: st, error: String(e).slice(0, 300) });
    }
  }
  if (!steps.some((st) => st.shot === out)) await shot(out);

  let lint = null;
  if (doLint) {
    lint = await evalJs(`(() => {
      const vw = innerWidth, vh = innerHeight;
      const vis = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const desc = (el) => {
        let d = el.tagName.toLowerCase();
        if (el.id) d += '#' + el.id;
        if (typeof el.className === 'string' && el.className.trim()) d += '.' + el.className.trim().split(/\\s+/).slice(0,3).join('.');
        const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' ').slice(0,40);
        return t ? d + ' "' + t + '"' : d;
      };
      const all = [...document.querySelectorAll('body *')].filter(e => !(e.closest('canvas')) && e.tagName !== 'CANVAS' && vis(e));
      const offscreen = [], tinyText = [], smallTargets = [], clippedText = [];
      for (const el of all) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        // Skip descendants of scroll containers when they are merely scrolled out of view.
        let scroller = el.parentElement, inScroller = false;
        while (scroller && scroller !== document.body) {
          const o = getComputedStyle(scroller);
          if (/(auto|scroll)/.test(o.overflowY + o.overflowX)) { inScroller = true; break; }
          scroller = scroller.parentElement;
        }
        if (!inScroller && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) && (r.width < vw * 2)) {
          if (el.children.length === 0 || /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) offscreen.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] });
        }
        const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (hasText && parseFloat(cs.fontSize) < 11) tinyText.push({ el: desc(el), fontSize: cs.fontSize });
        if (hasText && (el.scrollWidth > el.clientWidth + 2) && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis') clippedText.push({ el: desc(el), scrollW: el.scrollWidth, clientW: el.clientWidth });
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.getAttribute('role') === 'button') {
          if ((r.width < 32 || r.height < 32) && ${mobile}) smallTargets.push({ el: desc(el), size: [Math.round(r.width), Math.round(r.height)] });
        }
      }
      // Overlapping interactive elements (top-most hit test at centre != self).
      const covered = [];
      for (const el of all.filter(e => /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName))) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue;
        const hit = document.elementFromPoint(cx, cy);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && hit.tagName !== 'CANVAS') covered.push({ el: desc(el), coveredBy: desc(hit) });
      }
      return {
        vw, vh,
        docScroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, bodyW: document.body.scrollWidth },
        htmlData: { ...document.documentElement.dataset },
        hudScale: getComputedStyle(document.documentElement).getPropertyValue('--hud-scale'),
        offscreen: offscreen.slice(0, 25), tinyText: tinyText.slice(0, 25), smallTargets: smallTargets.slice(0, 30),
        clippedText: clippedText.slice(0, 20), covered: covered.slice(0, 20),
      };
    })()`);
  }
  console.log(JSON.stringify({ url, viewport: { W, H, DPR, mobile }, shots, steps: stepLog, lint, console: consoleErrors.slice(0, 10) }, null, 1));
}

main()
  .catch((e) => console.log(JSON.stringify({ error: String(e), chromeErr: chromeErr.slice(-500) })))
  .finally(() => {
    clearTimeout(hardTimeout);
    cleanup();
    setTimeout(() => process.exit(0), 400);
  });
