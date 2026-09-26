// Run with: node tests/run-browser-tests.cjs
// CHROME_PATH may point to a Chrome/Chromium executable. No packages or live account required.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const chrome = [process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find(file => fs.existsSync(file));
if (!chrome) throw new Error('Chrome not found; set CHROME_PATH.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fluent-chatgpt-test-'));
try {
  const output = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
    '--disable-background-networking', '--allow-file-access-from-files',
    `--user-data-dir=${profile}`, '--window-size=1280,900', '--virtual-time-budget=6000',
    '--dump-dom', pathToFileURL(path.join(__dirname, 'conversation-parsing.html')).href,
  ], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!output.includes('data-tests-passed="true"')) {
    const resultText = output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    try {
      const result = JSON.parse(resultText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      console.error(JSON.stringify(result.checks.filter(check => !check.pass), null, 2));
    } catch {
      console.error(resultText || output.slice(-12000));
    }
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${/data-test-count="(\d+)"/.exec(output)?.[1]} conversation parsing checks (headless Chrome).`);
  }
} finally {
  // Only remove the uniquely-created disposable profile, never the user's Chrome profile.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
