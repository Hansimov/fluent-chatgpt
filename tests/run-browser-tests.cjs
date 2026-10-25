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
  for (const [fixture, description] of [
    ['conversation-parsing.html', 'conversation parsing'],
    ['conversation-export.html', 'conversation export'],
    ['markdown-assets.html', 'Markdown attachments and directory export'],
    ['navigation-jump.html', 'virtualized question navigation'],
    ['navigation-tabs.html', 'responsive navigation tabs'],
    ['selection-actions.html', 'selection action suppression'],
  ]) {
    if (process.argv[2] && process.argv[2] !== fixture) continue;
    if (fixture === 'markdown-assets.html') {
      execFileSync(process.execPath, [path.join(__dirname, 'run-realtime-tests.cjs'), fixture], { stdio: 'inherit', windowsHide: true, timeout: 45000 });
      continue;
    }
    const output = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
      '--disable-background-networking', '--allow-file-access-from-files',
      `--user-data-dir=${profile}`, '--window-size=1280,900', `--virtual-time-budget=${['navigation-jump.html', 'markdown-assets.html'].includes(fixture) ? 30000 : 10000}`,
      '--dump-dom', pathToFileURL(path.join(__dirname, fixture)).href,
    ], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (!output.includes('data-tests-passed="true"')) {
      const resultText = output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
      try {
        const result = JSON.parse(resultText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
        console.error(JSON.stringify(result.checks.filter(check => !check.pass), null, 2));
        if (!output.includes('data-tests-passed=')) console.error('Incomplete fixture; last check:', result.checks.at(-1));
      } catch {
        console.error(resultText === 'pending' ? output.slice(-6000) : resultText || output.slice(-12000));
      }
      process.exitCode = 1;
    } else {
      console.log(`PASS: ${/data-test-count="(\d+)"/.exec(output)?.[1]} ${description} checks (headless Chrome).`);
    }
  }
  // Real viewport events / animation frames are not advanced by Chrome's virtual-time budget.
  if (!process.argv[2]) execFileSync(process.execPath, [path.join(__dirname, 'run-appearance-tests.cjs')], { stdio: 'inherit', windowsHide: true, timeout: 45000 });
} finally {
  // Only remove the uniquely-created disposable profile, never the user's Chrome profile.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
