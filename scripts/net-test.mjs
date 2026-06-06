import puppeteer from 'puppeteer';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function clickText(page, sel, text) {
  const ok = await page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text));
    if (el) { el.click(); return true; }
    return false;
  }, sel, text);
  if (!ok) throw new Error(`button "${text}" not found`);
}

const log = (...a) => console.log(...a);

// --- Игрок A: создаёт игру ---
const a = await browser.newPage();
const errs = [];
a.on('pageerror', (e) => errs.push('A: ' + e.message));
await a.goto(base, { waitUntil: 'networkidle0' });
await a.waitForSelector('.home');
await a.screenshot({ path: 'lobby.png' });
log('home rendered');

await clickText(a, 'button', 'Создать игру');
await a.waitForFunction(() => location.hash.startsWith('#/m/'), { timeout: 10000 });
const matchID = await a.evaluate(() => location.hash.replace('#/m/', ''));
log('created match', matchID);
await a.waitForSelector('.map', { timeout: 10000 });
log('A sees board');

// --- Игрок B: отдельный контекст (свой localStorage) ---
const ctxB = await browser.createBrowserContext();
const b = await ctxB.newPage();
b.on('pageerror', (e) => errs.push('B: ' + e.message));
await b.goto(`${base}#/m/${matchID}`, { waitUntil: 'networkidle0' });
await b.waitForSelector('.seat-list', { timeout: 10000 });
log('B sees seat picker');
await clickText(b, 'button', 'Занять');
await b.waitForSelector('.map', { timeout: 10000 });
log('B joined and sees board');

await new Promise((r) => setTimeout(r, 2000));
const joinedA = await a.evaluate(() => document.querySelector('.joined')?.textContent ?? '');
log('A joined indicator:', joinedA);
await a.screenshot({ path: 'roomA.png' });
await b.screenshot({ path: 'roomB.png' });

if (errs.length) log('PAGE ERRORS:\n' + errs.join('\n'));
else log('no page errors');
await browser.close();
