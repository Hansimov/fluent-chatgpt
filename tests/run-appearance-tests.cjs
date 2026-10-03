// Real-time iframe viewport/theme checks; keep the response open until the fixture finishes.
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
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean).find(file => fs.existsSync(file));
  if (!chrome) throw new Error('Chrome not found; set CHROME_PATH.');
  let pendingResponse, watchdog;
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/release-stream') {
      clearTimeout(watchdog);
      pendingResponse?.end('</html>');
      res.end('ok');
    } else if (pathname === '/navigation-appearance.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      pendingResponse = res;
      res.write(fs.readFileSync(path.join(__dirname, 'navigation-appearance.html'), 'utf8').replace(/<\/html>\s*$/, ''));
      watchdog = setTimeout(() => res.end('</html>'), 15000);
    } else if (pathname === '/navigation-fixture.html' || pathname === '/fluent-chatgpt.user.js') {
      res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
      res.end(fs.readFileSync(path.join(__dirname, pathname.endsWith('.js') ? '../fluent-chatgpt.user.js' : 'navigation-fixture.html')));
    } else res.writeHead(404).end();
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fluent-chatgpt-appearance-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const preview = ['dark', 'light'].includes(process.argv[2]) ? process.argv[2] : '';
    const { stdout } = await promisify(execFile)(chrome, [
      '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--disable-background-networking',
      `--user-data-dir=${profile}`, '--window-size=1280,960', '--dump-dom',
      ...(preview ? [`--screenshot=${path.resolve(`.codex-navigation-${preview}.png`)}`] : []),
      `http://127.0.0.1:${server.address().port}/navigation-appearance.html${preview ? `?preview=${preview}` : ''}`,
    ], { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    if (!stdout.includes('data-tests-passed="true"')) {
      const resultText = stdout.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
      try {
        const result = JSON.parse(resultText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
        console.error(JSON.stringify(result.checks.filter(check => !check.pass), null, 2));
      } catch { console.error(resultText || stdout.slice(-12000)); }
      process.exitCode = 1;
    } else console.log(`PASS: ${/data-test-count="(\d+)"/.exec(stdout)?.[1]} navigation theme/viewport checks (real-time headless Chrome).`);
  } finally {
    clearTimeout(watchdog);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
