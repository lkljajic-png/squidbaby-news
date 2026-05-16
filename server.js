const http = require('http');
const fs   = require('fs');
const path = require('path');

const DIR  = __dirname;
const PORT = process.env.PORT || 3000;
const MIME = {
  html: 'text/html',
  css:  'text/css',
  js:   'application/javascript',
  json: 'application/json',
  svg:  'image/svg+xml'
};

async function proxyGoogleNews(query, res) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;
  try {
    const upstream = await fetch(rssUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0' }
    });
    const text = await upstream.text();
    res.writeHead(200, {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    res.end(text);
  } catch (err) {
    res.writeHead(502);
    res.end(`Proxy error: ${err.message}`);
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/feed') {
    const q = url.searchParams.get('q') || '';
    proxyGoogleNews(q, res);
    return;
  }

  const filePath = path.join(DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = filePath.split('.').pop();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
