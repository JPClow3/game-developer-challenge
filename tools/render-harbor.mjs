import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

// Rebuild the menu artwork without shipping a 3D renderer to players.
const root = new URL('../', import.meta.url);
const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><script type="module" src="/tools/harbor-scene.mjs"></script></body></html>`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
  // Only serve the source artwork and renderer modules on loopback.
  if (!/^\/(assets\/pirate-kit\/|node_modules\/three\/|tools\/harbor-scene\.mjs$)/.test(pathname) || pathname.includes('..')) {
    response.writeHead(404).end(); return;
  }
  try {
    const file = new URL(`.${pathname}`, root);
    response.setHeader('Content-Type', pathname.endsWith('.glb') ? 'model/gltf-binary' : pathname.endsWith('.png') ? 'image/png' : 'text/javascript');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (!response.ok()) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => errors.push(`Failed to load ${request.url()}`));
  page.on('console', (message) => { if (message.type() === 'log') console.log(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.harborReady, null, { timeout: 30000 });
  if (errors.length) throw new Error(errors.join('\n'));
  const frame = await page.locator('canvas').screenshot({ omitBackground: true });
  const output = new URL('public/assets/harbor/', root);
  await mkdir(output, { recursive: true });
  const artwork = await sharp(frame).trim({ background: '#00000000', threshold: 5 }).png().toBuffer();
  await sharp(artwork).resize(1200, 600, { fit: 'contain', background: '#00000000' }).webp({ quality: 88, alphaQuality: 100 }).toFile(fileURLToPath(new URL('departure.webp', output)));
  await sharp(artwork).resize(600, 300, { fit: 'contain', background: '#00000000' }).webp({ quality: 85, alphaQuality: 100 }).toFile(fileURLToPath(new URL('departure-small.webp', output)));
  console.log('Rendered desktop and mobile harbor artwork.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
