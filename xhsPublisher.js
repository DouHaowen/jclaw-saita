import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const XHS_TITLE = process.env.XHS_DEFAULT_TITLE || '日本后继无人的优良企业';
const XHS_VIDEO_DIR = path.resolve(__dirname, process.env.XHS_VIDEO_DIR || '.');
const XHS_PROFILE_DIR = path.resolve(__dirname, process.env.XHS_PROFILE_DIR || './browser-profiles/xiaohongshu');
const XHS_ARTIFACTS_DIR = path.resolve(__dirname, process.env.XHS_ARTIFACTS_DIR || './artifacts/xiaohongshu');
const XHS_HEADLESS = process.env.XHS_HEADLESS === 'true';
const XHS_PUBLISH_URL = process.env.XHS_PUBLISH_URL || 'https://creator.xiaohongshu.com/publish/publish';
const XHS_WINDOW_WIDTH = Number(process.env.XHS_WINDOW_WIDTH || 1000);
const XHS_WINDOW_HEIGHT = Number(process.env.XHS_WINDOW_HEIGHT || 760);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function listVideoFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(name => path.join(dir, name))
    .filter(file => fs.statSync(file).isFile() && VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function getLatestVideoFile() {
  const videos = listVideoFiles(XHS_VIDEO_DIR);
  return videos[0] || null;
}

export function buildStatus() {
  const latestVideo = getLatestVideoFile();
  return {
    publishUrl: XHS_PUBLISH_URL,
    videoDir: XHS_VIDEO_DIR,
    profileDir: XHS_PROFILE_DIR,
    artifactsDir: XHS_ARTIFACTS_DIR,
    defaultTitle: XHS_TITLE,
    latestVideo,
    hasProfile: fs.existsSync(XHS_PROFILE_DIR),
  };
}

async function importPlaywright() {
  const mod = await import('playwright');
  return mod.chromium;
}

async function openPersistentContext(headless = XHS_HEADLESS) {
  ensureDir(XHS_PROFILE_DIR);
  const chromium = await importPlaywright();
  return chromium.launchPersistentContext(XHS_PROFILE_DIR, {
    headless,
    channel: 'chrome',
    viewport: { width: XHS_WINDOW_WIDTH, height: XHS_WINDOW_HEIGHT },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-size=' + XHS_WINDOW_WIDTH + ',' + XHS_WINDOW_HEIGHT,
    ],
  });
}

async function firstPage(context) {
  const existing = context.pages();
  if (existing.length) return existing[0];
  return context.newPage();
}

async function waitForOne(page, selectors, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.count()) {
          await locator.waitFor({ state: 'visible', timeout: 1000 });
          return locator;
        }
      } catch {}
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Timed out waiting for selectors: ' + selectors.join(' | '));
}

async function waitForOneAttached(page, selectors, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.count()) {
          await locator.waitFor({ state: 'attached', timeout: 1000 });
          return locator;
        }
      } catch {}
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Timed out waiting for selectors: ' + selectors.join(' | '));
}

async function waitForPublishReady(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 120000 });
  await page.waitForTimeout(3000);
  await waitForOne(page, [
    'text=上传视频',
    'text=拖拽视频到此或点击上传',
    'input.upload-input[type="file"]',
    'input[type="file"][accept*=".mp4"]',
  ], 120000);
}

async function tryFill(page, selectors, value) {
  const locator = await waitForOne(page, selectors, 30000);
  await locator.click({ force: true });
  await locator.fill(value);
}

async function detectLoginNeeded(page) {
  const html = await page.content();
  return /登录|扫码|手机号登录|验证码登录|login/i.test(html) && !page.url().includes('/publish/');
}

export async function loginXiaohongshu() {
  const context = await openPersistentContext(false);
  const page = await firstPage(context);
  await page.goto(XHS_PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('已打开小红书发布页，请在浏览器中完成登录。');
  console.log('登录完成后，回车结束并保存登录态。');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('', () => resolve()));
  rl.close();

  await context.close();
}

export async function publishLatestVideoTask() {
  const latestVideo = getLatestVideoFile();
  if (!latestVideo) {
    throw new Error('未找到可发布视频。请把 .mp4/.mov/.m4v/.webm 文件放到 ' + XHS_VIDEO_DIR);
  }

  ensureDir(XHS_ARTIFACTS_DIR);
  const base = timestamp();
  const beforeShot = path.join(XHS_ARTIFACTS_DIR, 'before-' + base + '.png');
  const afterShot = path.join(XHS_ARTIFACTS_DIR, 'after-' + base + '.png');

  const context = await openPersistentContext(XHS_HEADLESS);
  try {
    const page = await firstPage(context);
    await page.goto(XHS_PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
    await waitForPublishReady(page);

    if (await detectLoginNeeded(page)) {
      throw new Error('检测到小红书尚未登录，请先在 Mac mini 上执行 `npm run xhs:login` 完成一次登录。');
    }

    const uploadInput = await waitForOneAttached(page, [
      'input.upload-input[type="file"]',
      'input[type="file"][accept*=".mp4"]',
      'input[type="file"]',
      'input[accept*="video"]',
    ], 120000);
    await uploadInput.setInputFiles(latestVideo);

    await page.waitForTimeout(8000);

    await tryFill(page, [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      '[contenteditable="true"][data-placeholder*="标题"]',
      'input',
    ], XHS_TITLE);

    const bodyCandidates = [
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="正文"]',
      '[contenteditable="true"][data-placeholder*="描述"]',
      '[contenteditable="true"][data-placeholder*="正文"]',
    ];
    try {
      await tryFill(page, bodyCandidates, XHS_TITLE);
    } catch {}

    await page.screenshot({ path: beforeShot, fullPage: true });

    const publishButton = await waitForOne(page, [
      'button:has-text("发布")',
      'button:has-text("立即发布")',
      '[role="button"]:has-text("发布")',
      '[role="button"]:has-text("立即发布")',
    ], 120000);
    await publishButton.click({ force: true });

    await page.waitForTimeout(8000);
    await page.screenshot({ path: afterShot, fullPage: true }).catch(() => {});

    return {
      success: true,
      title: XHS_TITLE,
      videoPath: latestVideo,
      beforeShot,
      afterShot,
      message: '小红书视频发布流程已执行。',
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'login') {
    await loginXiaohongshu();
    return;
  }
  if (command === 'status') {
    console.log(JSON.stringify(buildStatus(), null, 2));
    return;
  }
  console.log('Usage: node xhsPublisher.js <login|status>');
}

if (process.argv[1] === __filename) {
  main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
