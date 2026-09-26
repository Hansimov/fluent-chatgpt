// Real streaming-HTML startup test, with an isolated Chrome profile and no external network.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

async function main() {
  const chrome = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find(file => fs.existsSync(file));
  if (!chrome) throw new Error('Chrome not found; set CHROME_PATH.');
  const fixture = fs.readFileSync(path.join(__dirname, 'navigation-startup.html'), 'utf8');
  const [prefix, suffix] = fixture.split('<!-- STREAM_END -->');
  let pendingResponse;
  let watchdog;
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/fluent-chatgpt.user.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(fs.readFileSync(path.join(__dirname, '../fluent-chatgpt.user.js')));
    } else if (req.url === '/release-stream') {
      clearTimeout(watchdog);
      pendingResponse?.end(suffix);
      res.end('ok');
    } else if (req.url === '/c/11111111-1111-1111-1111-111111111111') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      pendingResponse = res;
      res.write(prefix);
      watchdog = setTimeout(() => res.end(suffix), 8000);
    } else {
      res.writeHead(404).end();
    }
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fluent-chatgpt-startup-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { stdout } = await promisify(execFile)(chrome, [
      '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
      '--disable-background-networking', `--user-data-dir=${profile}`,
      '--window-size=1280,900', '--virtual-time-budget=12000', '--dump-dom',
      `http://127.0.0.1:${server.address().port}/c/11111111-1111-1111-1111-111111111111`,
    ], { encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
    const resultText = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1];
    if (!stdout.includes('data-tests-passed="true"')) {
      try {
        const result = JSON.parse(resultText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
        console.error(JSON.stringify(result.checks.filter(check => !check.pass), null, 2));
      } catch {
        console.error(resultText || stdout.slice(-12000));
      }
      process.exitCode = 1;
    } else {
      console.log(`PASS: ${/data-test-count="(\d+)"/.exec(stdout)?.[1]} startup/lifecycle checks (streamed HTML, headless Chrome).`);
    }
  } finally {
    clearTimeout(watchdog);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    // Only the uniquely-created disposable profile is deleted, never a user's profile.
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
