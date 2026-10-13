import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const APP_URL = process.env.CAPTURE_URL || 'http://localhost:5173/';
const OUTPUT_DIR = resolve('.screenshots');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].filter(Boolean);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const isoDate = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const DEMO_PLAN = [
  [0, 'Review pull request for onboarding flow', '09:30', '10:00', true],
  [0, 'Design sync with Priya', '11:00', '11:45', false],
  [0, 'Write quarterly OKR draft', '14:00', '15:30', false],
  [0, 'Pick up groceries', '', '', false],
  [1, 'Gym — leg day', '07:00', '08:00', false],
  [1, 'Ship release notes v2.4', '16:00', '16:30', false],
  [2, 'Dentist appointment', '10:00', '10:30', false],
  [2, 'Call mom', '', '', false],
  [3, 'Plan weekend trip', '18:00', '19:00', false],
  [4, 'Prepare demo for design review', '15:00', '16:00', false],
  [5, 'Water the plants', '', '', false],
  [-1, 'Fix flaky login test', '13:00', '14:00', true],
  [-1, 'Reply to investor email', '', '', true],
  [-2, 'Book flights', '', '', false],
  [-3, 'Renew passport', '', '', true],
  [6, 'Quarterly planning offsite', '09:00', '12:00', false],
  [7, 'Pay electricity bill', '', '', false],
  [8, 'Coffee with Arjun', '08:30', '09:00', false],
  [9, 'Submit expense report', '', '', false],
  [-4, 'Sprint retro notes', '', '', true],
  [-5, 'Update portfolio site', '19:00', '20:30', true]
];

const demoTasksJson = JSON.stringify(
  DEMO_PLAN.map(([offset, text, startTime, endTime, completed], index) => ({
    id: `task_demo_${index}`,
    text,
    date: isoDate(offset),
    startTime,
    endTime,
    completed,
    createdAt: Date.now() + index
  }))
);

const layoutAudit = `(() => {
  const isPhone = innerWidth <= 680;
  const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && !(s.opacity === '0' && el.tagName !== 'INPUT'); };
  const hits = (el, x, y) => { const found = document.elementFromPoint(x, y); return Boolean(found && (found === el || el.contains(found) || (found.closest('label') && found.closest('label').contains(el)))); };
  const reach = (el, cx, cy, dx, dy) => { let distance = 0; while (distance < 40 && hits(el, cx + dx * (distance + 1), cy + dy * (distance + 1))) distance += 1; return distance; };
  const effectiveSize = (el) => { const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2; if (!hits(el, cx, cy)) return null; return { width: reach(el, cx, cy, -1, 0) + reach(el, cx, cy, 1, 0) + 1, height: reach(el, cx, cy, 0, -1) + reach(el, cx, cy, 0, 1) + 1 }; };
  const interactive = [...document.querySelectorAll('button, input, a, [role="button"], .inline-add-row')].filter(isVisible);
  const undersized = isPhone ? interactive.map((el) => ({ el, size: effectiveSize(el) })).filter(({ size }) => size && (size.width < 44 || size.height < 44)).map(({ el, size }) => (el.className || el.tagName).toString().split(' ')[0] + ':' + size.width + 'x' + size.height) : [];
  return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth, undersizedTouchTargets: [...new Set(undersized)].slice(0, 30) };
})()`;

async function launchBrowser(profileDir) {
  const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chromePath) throw new Error('No Chrome/Edge found. Set CHROME_PATH.');
  const port = 9300 + Math.floor(Math.random() * 600);
  const browser = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars'
  ], { stdio: 'ignore' });

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return { browser, page };
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((done) => socket.addEventListener('open', done));
  let messageId = 0;
  const pending = new Map();
  const consoleIssues = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      consoleIssues.push(`[${message.params.type}] ${message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      consoleIssues.push(`[exception] ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`);
    }
  });
  const send = (method, params = {}) => new Promise((done) => {
    const id = ++messageId;
    pending.set(id, done);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return response.result?.result?.value;
  };
  return { socket, send, evaluate, consoleIssues };
}

async function captureScenario({ name, width, height, mobile, steps }) {
  const profileDir = join(tmpdir(), `actionstodo-capture-${name}-${Date.now()}`);
  const { browser, page } = await launchBrowser(profileDir);
  const session = await connect(page.webSocketDebuggerUrl);
  const { send, evaluate } = session;
  const report = { scenario: name, shots: [], audits: {} };

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: APP_URL });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(`!!document.querySelector('.date-group, .empty-state')`)) break;
      await sleep(500);
    }

    const shoot = async (fileName, { fullPage = false } = {}) => {
      const params = { format: 'png' };
      if (fullPage) {
        const metrics = await send('Page.getLayoutMetrics');
        const contentHeight = Math.ceil(await evaluate(`Math.max(document.documentElement.scrollHeight, (document.querySelector('.main-pane') || document.body).scrollHeight)`)) || metrics.result.cssContentSize.height;
        params.captureBeyondViewport = true;
        params.clip = { x: 0, y: 0, width, height: contentHeight, scale: 1 };
      }
      const shot = await send('Page.captureScreenshot', params);
      const filePath = join(OUTPUT_DIR, `${name}-${fileName}.png`);
      writeFileSync(filePath, Buffer.from(shot.result.data, 'base64'));
      report.shots.push(filePath);
    };

    const actions = {
      shoot,
      evaluate,
      sleep,
      wheel: async (x, y, distance) => {
        for (let moved = 0; moved < distance; moved += 100) {
          await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 100 });
          await sleep(35);
        }
      },
      hover: async (points) => {
        for (const [x, y] of points) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      },
      audit: async (label) => {
        report.audits[label] = await evaluate(layoutAudit);
      }
    };
    await steps(actions);
  } finally {
    report.consoleIssues = session.consoleIssues;
    session.socket.close();
    const browserExited = new Promise((done) => browser.once('exit', done));
    browser.kill();
    await Promise.race([browserExited, sleep(3000)]);
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      report.profileCleanup = `left behind: ${profileDir}`;
    }
  }
  return report;
}

const resetWithDemoData = (theme, viewportMode = 'manual') => `localStorage.setItem('todo_do_tasks_v1', ${JSON.stringify(demoTasksJson)}); localStorage.setItem('notion_minimal_theme', '${theme}'); localStorage.setItem('actionstodo_viewport_mode', '${viewportMode}'); location.reload(); true`;
const resetEmpty = (theme) => `localStorage.removeItem('todo_do_tasks_v1'); localStorage.setItem('notion_minimal_theme', '${theme}'); location.reload(); true`;
const desktopScroller = `document.querySelector('.main-pane')`;

const scenarios = [
  {
    name: 'desktop',
    width: 1920,
    height: 1080,
    mobile: false,
    steps: async ({ evaluate, sleep, shoot, wheel, hover, audit }) => {
      await evaluate(resetEmpty('light'));
      await sleep(6500);
      await shoot('01-hero-empty-light');
      await hover([[1500, 560], [1520, 570], [1540, 580]]);
      await sleep(900);
      await shoot('02-hero-3d-hover-light');
      await evaluate(resetWithDemoData('light'));
      await sleep(6500);
      await shoot('03-fold-light');
      await audit('fold-light');
      await hover([[700, 300], [720, 320]]);
      await sleep(700);
      await shoot('04-card-tilt-light');
      await wheel(1100, 600, 500);
      await sleep(1800);
      await shoot('05-mid-scroll-3d-light');
      await wheel(1100, 600, 2000);
      await sleep(1800);
      await shoot('06-bottom-light');
      await evaluate(`${desktopScroller}.scrollTo(0, 0); document.querySelector('.icon-button').click(); true`);
      await sleep(2200);
      await shoot('07-fold-dark');
      await wheel(1100, 600, 600);
      await sleep(1800);
      await shoot('08-mid-scroll-3d-dark');
      await evaluate(`${desktopScroller}.scrollTo(0, 0); document.querySelectorAll('.task-time-pill')[1].click(); true`);
      await sleep(700);
      await shoot('09-time-popover-dark');
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); document.querySelector('#weekTableBtn').click(); true`);
      await sleep(1200);
      await shoot('10-week-table-dark');
      await evaluate(resetWithDemoData('dark', 'game'));
      await sleep(9000);
      await shoot('11-game-arena-dark');
      await audit('game-arena-dark');
      await evaluate(resetWithDemoData('light', 'game'));
      await sleep(9000);
      await shoot('12-game-arena-light');
    }
  },
  {
    name: 'mobile',
    width: 390,
    height: 844,
    mobile: true,
    steps: async ({ evaluate, sleep, shoot, audit }) => {
      await evaluate(resetWithDemoData('light'));
      await sleep(6500);
      await shoot('01-fold-light');
      await audit('fold-light');
      await evaluate(`window.scrollTo(0, 900); true`);
      await sleep(1800);
      await shoot('02-cards-light');
      await evaluate(`window.scrollTo(0, 0); document.querySelector('.icon-button').click(); true`);
      await sleep(2000);
      await shoot('03-fold-dark');
      await evaluate(`window.scrollTo(0, 900); true`);
      await sleep(1800);
      await shoot('04-cards-dark');
      await evaluate(resetWithDemoData('dark', 'game'));
      await sleep(9000);
      await shoot('05-game-arena-dark');
      await audit('game-arena-dark');
    }
  }
];

mkdirSync(OUTPUT_DIR, { recursive: true });
const requested = process.argv.slice(2);
const reports = [];
for (const scenario of scenarios) {
  if (requested.length && !requested.includes(scenario.name)) continue;
  reports.push(await captureScenario(scenario));
}
writeFileSync(join(OUTPUT_DIR, 'report.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
process.exit(0);
