import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
export const SHOTS = process.env.SHOTS || '/tmp/padel-shots';
export async function open(url = 'http://localhost:5173', init) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (init) await page.addInitScript(init);
  await page.goto(url);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const swipe = async (x0, y0, x1, y1, steps = 8) => {
    await touch('touchStart', x0, y0);
    for (let i = 1; i <= steps; i++) await touch('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await touch('touchEnd');
  };
  const waitFor = async (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 30 });
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  return { browser, page, errors, touch, swipe, waitFor, shot };
}
