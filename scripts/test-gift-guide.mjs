import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
let executable;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executable = candidate;
    break;
  } catch {}
}
if (!executable) throw new Error('Set CHROME_PATH to a Chrome or Edge executable to run browser checks.');

let complete;
const result = new Promise((resolve) => { complete = resolve; });
const files = new Map([
  ['/', ['tests/gift-guide.html', 'text/html']],
  ['/assets/gift-guide.js', ['assets/gift-guide.js', 'text/javascript']],
  ['/assets/gift-guide.css', ['assets/gift-guide.css', 'text/css']],
]);
const server = createServer(async (request, response) => {
  if (request.url === '/result' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    response.end('ok');
    complete(JSON.parse(body));
    return;
  }
  const file = files.get(request.url);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('Content-Type', file[1]);
  response.end(await readFile(path.join(root, file[0])));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profile = await mkdtemp(path.join(tmpdir(), 'gift-guide-browser-'));
const browser = spawn(executable, [
  '--headless', '--disable-gpu', '--no-first-run', '--disable-background-networking',
  `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`,
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserErrors = '';
browser.stderr.on('data', (chunk) => { browserErrors += chunk.toString(); });
browser.on('error', (error) => complete({ error: error.message }));
browser.on('exit', (code) => complete({ error: `Browser exited before reporting results (${code}). ${browserErrors}` }));
const timer = setTimeout(() => complete({ error: `Browser tests timed out. ${browserErrors}` }), 30000);
try {
  const report = await result;
  for (const test of report.passed || []) console.log(`PASS ${test}`);
  if (report.error) {
    console.error(report.error);
    process.exitCode = 1;
  } else {
    console.log(`${report.passed.length} browser checks passed.`);
  }
} finally {
  clearTimeout(timer);
  browser.kill();
  await new Promise((resolve) => server.close(resolve));
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('gift-guide-browser-')) {
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
}
