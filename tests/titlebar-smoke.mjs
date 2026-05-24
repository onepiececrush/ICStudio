import { chromium } from '@playwright/test';

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  const message = String(error?.message ?? error);
  if (message.includes('Executable doesn\'t exist') || message.includes('playwright install')) {
    console.log('titlebar smoke skipped: Playwright browser binaries are not installed');
    process.exit(0);
  }
  throw error;
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto('http://127.0.0.1:1420/', { waitUntil: 'networkidle' });
const checks = {
  titlebar: await page.locator('.app-titlebar').count(),
  appBody: await page.locator('.app-body').count(),
  windowControls: await page.locator('.window-control').count(),
  dragSources: await page.locator('[data-tauri-drag-region]').count(),
  titlebarHeight: await page.locator('.app-titlebar').evaluate((el) => getComputedStyle(el).height),
  sidebarTop: await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().top),
  hasBrand: await page.locator('.titlebar-brand').innerText(),
  hasProject: await page.locator('.project-pill').innerText(),
  hasConnected: await page.locator('.connection-pill').innerText(),
};
await browser.close();
if (checks.titlebar !== 1) throw new Error(`expected one titlebar, got ${checks.titlebar}`);
if (checks.appBody !== 1) throw new Error(`expected one app body, got ${checks.appBody}`);
if (checks.windowControls !== 3) throw new Error(`expected 3 window controls, got ${checks.windowControls}`);
if (checks.dragSources < 6) throw new Error(`expected multiple draggable titlebar sources, got ${checks.dragSources}`);
if (checks.titlebarHeight !== '52px') throw new Error(`expected 52px titlebar, got ${checks.titlebarHeight}`);
const titlebarHeight = Number.parseFloat(checks.titlebarHeight);
if (checks.sidebarTop < titlebarHeight || checks.sidebarTop > titlebarHeight + 24) {
  throw new Error(`expected sidebar below titlebar with a small visual gap, top=${checks.sidebarTop}`);
}
if (!checks.hasBrand.includes('ICStudio')) throw new Error('brand missing');
if (!checks.hasProject.includes('当前工程')) throw new Error('project selector missing');
if (!checks.hasConnected.includes('已连接')) throw new Error('connected pill missing');
if (errors.length) throw new Error(`console errors: ${errors.join('\n')}`);
console.log(JSON.stringify(checks, null, 2));
