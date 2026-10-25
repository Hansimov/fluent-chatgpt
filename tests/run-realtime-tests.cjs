// Blob I/O / filesystem mocks need real time; virtual time can expire while Blob.arrayBuffer is pending.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

async function main() {
  const fixture = process.argv[2] || 'markdown-assets.html';
  if (!['markdown-assets.html', 'conversation-export.html'].includes(fixture)) throw new Error('Unsupported fixture');
  const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(fs.existsSync);
  if (!chrome) throw new Error('Chrome not found');
  let response, watchdog;
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/release-stream') { clearTimeout(watchdog); response?.end('</html>'); res.end('ok'); }
    else if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html;charset=utf-8'); response = res;
      res.write(`<!doctype html><html><body><iframe id="test" src="/${fixture}"></iframe><pre id="result">pending</pre><script>
        const timer=setInterval(()=>{const doc=document.getElementById('test').contentDocument;if(!doc?.documentElement.hasAttribute('data-tests-passed'))return;
          clearInterval(timer);document.documentElement.dataset.testsPassed=doc.documentElement.dataset.testsPassed;
          document.documentElement.dataset.testCount=doc.documentElement.dataset.testCount;
          document.getElementById('result').textContent=doc.getElementById('result').textContent;fetch('/release-stream');},50);
        </script></body>`);
      watchdog = setTimeout(() => res.end('</html>'), 20000);
    } else if (req.url === `/${fixture}` || req.url === '/fluent-chatgpt.user.js') {
      const script = req.url.endsWith('.js');
      res.setHeader('Content-Type', script ? 'text/javascript;charset=utf-8' : 'text/html;charset=utf-8');
      res.end(fs.readFileSync(path.join(__dirname, script ? '../fluent-chatgpt.user.js' : fixture)));
    } else res.writeHead(404).end();
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fluent-export-test-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { stdout } = await promisify(execFile)(chrome, ['--headless=new', '--disable-gpu', '--disable-extensions',
      '--no-first-run', '--disable-background-networking', `--user-data-dir=${profile}`, '--dump-dom',
      `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    if (!stdout.includes('data-tests-passed="true"')) {
      const raw = stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || '';
      try { console.error(JSON.parse(raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).checks.filter(c => !c.pass)); }
      catch { console.error(raw || stdout.slice(-4000)); }
      process.exitCode = 1;
    } else console.log(`PASS: ${/data-test-count="(\d+)"/.exec(stdout)?.[1]} ${fixture} checks (real-time headless Chrome).`);
  } finally {
    clearTimeout(watchdog); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
