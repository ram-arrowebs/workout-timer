// Renders the store screenshots and Play graphics into store/ with Playwright (WebKit).
// Usage: node scripts/screenshots.mjs
//
// The app runs from the repo root as the native apps see it: a stub window.Capacitor makes
// app.js take its native code paths (no install button, plugins "available"), and a fake
// clock jumps the timer to each state. Each raw capture is then framed with a caption.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webkit } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store');
const meta = JSON.parse(readFileSync(join(out, 'metadata.json'), 'utf8'));
const appUrl = pathToFileURL(join(root, 'index.html')).href;

// CSS viewport x scale = pixel size each store asks for.
const TARGETS = [
  { dir: 'ios-iphone', platform: 'ios', width: 440, height: 956, scale: 3 },      // 1320x2868 (6.9")
  { dir: 'ios-ipad', platform: 'ios', width: 1032, height: 1376, scale: 2 },      // 2064x2752 (13")
  { dir: 'android-phone', platform: 'android', width: 360, height: 640, scale: 3 }, // 1080x1920
  { dir: 'android-tablet', platform: 'android', width: 810, height: 1440, scale: 16 / 9 } // 1440x2560 (10")
];

const SETTINGS = { sets: 4, reps: 12, repSec: 3, restSec: 60, countdownSec: 5 };
const S = 1000;
const setMs = SETTINGS.reps * SETTINGS.repSec * S;
// Milliseconds after pressing Start at which each state is captured.
const AT = {
  countdown: 2.1 * S,                                                     // "Get ready" 3
  rep: SETTINGS.countdownSec * S + setMs + SETTINGS.restSec * S + 7 * SETTINGS.repSec * S + 1 * S, // set 2, rep 8
  rest: SETTINGS.countdownSec * S + 2 * setMs + SETTINGS.restSec * S + 18 * S,  // after set 2, 42 s of rest left
  summary: SETTINGS.countdownSec * S + SETTINGS.sets * setMs + (SETTINGS.sets - 1) * SETTINGS.restSec * S + 0.5 * S
};

function stub(platform) {
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
    PluginHeaders: [{ name: 'TextToSpeech', methods: [] }, { name: 'KeepAwake', methods: [] }],
    nativePromise: () => Promise.resolve({})
  };
}

const INPUTS = { '#in-sets': 'sets', '#in-reps': 'reps', '#in-rep-sec': 'repSec', '#in-rest-sec': 'restSec', '#in-countdown': 'countdownSec' };
// Desktop WebKit draws spin buttons on number inputs; phones and tablets do not.
const DEVICE_CSS = 'input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }';

async function capture(browser, t, state) {
  const context = await browser.newContext({
    viewport: { width: t.width, height: t.height }, deviceScaleFactor: t.scale, isMobile: true, hasTouch: true
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-11T07:00:00Z') });
  await page.addInitScript(stub, t.platform);
  await page.goto(appUrl);
  await page.addStyleTag({ content: DEVICE_CSS });
  for (const [sel, key] of Object.entries(INPUTS)) await page.fill(sel, String(SETTINGS[key]));
  if (state !== 'setup') {
    await page.click('#btn-start');
    await page.clock.runFor(AT[state]);
  }
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const png = await page.screenshot();
  await context.close();
  return png;
}

const FRAME_CSS = `
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    background: radial-gradient(120% 70% at 50% 0%, #1d3b2a 0%, #0f1115 60%);
    color: #f2f4f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center; overflow: hidden;
  }
  h1 { margin-top: 5.5vh; padding: 0 6vw; font-size: min(6.8vw, 5.2vh); font-weight: 800;
       letter-spacing: -0.02em; line-height: 1.1; text-align: center; }
  h1 em { color: #3ddc84; font-style: normal; }
  .shot { margin-top: 4vh; width: 80vw; border-radius: 4.5vw; overflow: hidden;
          box-shadow: 0 0 0 0.6vw #2a2f3a, 0 3vh 8vh rgba(0, 0, 0, 0.6); }
  .shot img { display: block; width: 100%; }
`;

async function frame(browser, t, png, caption) {
  const context = await browser.newContext({ viewport: { width: t.width, height: t.height }, deviceScaleFactor: t.scale });
  const page = await context.newPage();
  const words = caption.split(' ');
  const head = words.slice(0, -2).join(' ');
  const tail = words.slice(-2).join(' ');
  await page.setContent(`<!doctype html><style>${FRAME_CSS}</style>
    <h1>${head} <em>${tail}</em></h1>
    <div class="shot"><img src="data:image/png;base64,${png.toString('base64')}"></div>`);
  await page.waitForFunction(() => document.images[0].complete);
  const framed = await page.screenshot({ type: 'jpeg', quality: 92 }); // stores reject alpha channels
  await context.close();
  return framed;
}

async function featureGraphic(browser) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const icon = readFileSync(join(root, 'assets', 'icon-only.png')).toString('base64');
  await page.setContent(`<!doctype html><style>
    * { margin: 0; }
    body { width: 1024px; height: 500px; display: flex; align-items: center; gap: 56px; padding: 0 72px;
           box-sizing: border-box; color: #f2f4f8; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
           background: radial-gradient(90% 120% at 15% 50%, #1d3b2a 0%, #0f1115 65%); }
    img { width: 300px; height: 300px; border-radius: 66px; box-shadow: 0 20px 60px rgba(0,0,0,.55); }
    h1 { font-size: 64px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.02; }
    p { margin-top: 20px; font-size: 32px; color: #9aa3b2; }
    p em { color: #3ddc84; font-style: normal; font-weight: 700; }
  </style>
  <img src="data:image/png;base64,${icon}">
  <div><h1>Big Workout<br>Counter</h1><p>Every rep, <em>counted out loud.</em></p></div>`);
  await page.waitForFunction(() => document.images[0].complete);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
  await context.close();
  return jpg;
}

const browser = await webkit.launch();
const shotsDir = join(out, 'screenshots');
rmSync(shotsDir, { recursive: true, force: true });
for (const t of TARGETS) {
  mkdirSync(join(shotsDir, t.dir), { recursive: true });
  for (const [i, s] of meta.screenshots.entries()) {
    const raw = await capture(browser, t, s.state);
    const file = join(shotsDir, t.dir, `${i + 1}-${s.state}.jpg`);
    writeFileSync(file, await frame(browser, t, raw, s.caption));
    console.log(file.slice(root.length + 1));
  }
}
mkdirSync(join(out, 'play'), { recursive: true });
writeFileSync(join(out, 'play', 'feature-graphic.jpg'), await featureGraphic(browser));
console.log('store/play/feature-graphic.jpg');
await browser.close();
