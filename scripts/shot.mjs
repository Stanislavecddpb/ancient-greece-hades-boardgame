import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'shot.png';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
try {
  await page.waitForSelector('.map', { timeout: 10000 });
} catch {
  console.log('NO .map found');
}
await new Promise((r) => setTimeout(r, 1200));
const sel = process.argv[4];
if (sel) {
  const el = await page.$(sel);
  if (el) await el.screenshot({ path: out });
  else { console.log('selector not found', sel); await page.screenshot({ path: out }); }
} else {
  await page.screenshot({ path: out, fullPage: true });
}
console.log('SAVED', out);
if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.slice(0, 20).join('\n'));
await browser.close();
