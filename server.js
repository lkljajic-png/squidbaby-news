const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DIR  = __dirname;
const PORT = process.env.PORT || 3000;
const MIME = {
  html: 'text/html',
  css:  'text/css',
  js:   'application/javascript',
  json: 'application/json',
  svg:  'image/svg+xml',
  png:  'image/png',
  jpg:  'image/jpeg',
  ico:  'image/x-icon'
};

// --- USERS ---
const USERS_FILE = path.join(DIR, 'users.json');

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return [{ username: 'admin', password: 'admin', role: 'admin' }]; }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// --- SESSIONS ---
const sessions = new Map(); // token → { username, role }

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: user.username, role: user.role });
  return token;
}

function getSession(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return sessions.get(token) || null;
}

// --- HELPERS ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// --- SERVER ---
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Google News proxy
  if (url.pathname === '/feed') {
    const q = url.searchParams.get('q') || '';
    const session = getSession(req);
    if (!session) { res.writeHead(401); res.end('Unauthorized'); return; }
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`;
    try {
      const upstream = await fetch(rssUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0' }
      });
      const text = await upstream.text();
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(text);
    } catch (err) {
      res.writeHead(502); res.end(`Proxy error: ${err.message}`);
    }
    return;
  }

  // --- API ---
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const { username, password } = await readBody(req);
    const users = loadUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return json(res, 401, { error: 'Pogrešno korisničko ime ili lozinka' });
    const token = createSession(user);
    return json(res, 200, { token, role: user.role, username: user.username, name: user.name || user.username });
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const auth = (req.headers['authorization'] || '').slice(7);
    sessions.delete(auth);
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/api/users') {
    const session = getSession(req);
    if (!session || session.role !== 'admin') return json(res, 403, { error: 'Pristup odbijen' });

    if (req.method === 'GET') {
      const users = loadUsers();
      return json(res, 200, users.map(u => ({ username: u.username, role: u.role })));
    }

    if (req.method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username?.trim() || !password?.trim()) return json(res, 400, { error: 'Ime i lozinka su obavezni' });
      const users = loadUsers();
      if (users.find(u => u.username === username)) return json(res, 409, { error: 'Korisnik već postoji' });
      users.push({ username: username.trim(), password, role: 'user' });
      saveUsers(users);
      return json(res, 201, { ok: true });
    }
  }

  if (url.pathname.startsWith('/api/users/') && req.method === 'DELETE') {
    const session = getSession(req);
    if (!session || session.role !== 'admin') return json(res, 403, { error: 'Pristup odbijen' });
    const target = decodeURIComponent(url.pathname.split('/').pop());
    if (target === 'admin') return json(res, 400, { error: 'Ne možeš obrisati admin nalog' });
    let users = loadUsers();
    users = users.filter(u => u.username !== target);
    saveUsers(users);
    return json(res, 200, { ok: true });
  }

  // Static files
  const filePath = path.join(DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = filePath.split('.').pop();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
