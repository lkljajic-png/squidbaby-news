const CONFIG = {
  refreshInterval: 12 * 60 * 60 * 1000,
  count: 30,
  queries: {
    squid:       '"Squid Game" Netflix',
    babymonster: 'BABYMONSTER kpop'
  }
};

const KEYS = {
  squid: 'sb_squid',
  babymonster: 'sb_babymonster',
  ts: 'sb_timestamp'
};

// --- CACHE ---
function readCache(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.warn('Cache write:', e); }
}

function cacheValid() {
  const ts = localStorage.getItem(KEYS.ts);
  return ts && (Date.now() - Number(ts)) < CONFIG.refreshInterval;
}

// --- API ---
async function fetchFeed(query) {
  const res = await fetch(`/feed?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');

  return [...xml.querySelectorAll('item')]
    .map(item => ({
      title:       cleanTitle(item.querySelector('title')?.textContent || ''),
      url:         item.querySelector('link')?.textContent || '',
      source:      item.querySelector('source')?.textContent || extractSource(item.querySelector('title')?.textContent || ''),
      publishedAt: item.querySelector('pubDate')?.textContent || '',
      description: stripHtml(item.querySelector('description')?.textContent || ''),
      image:       extractImage(item.querySelector('description')?.textContent || '')
    }))
    .filter(i => i.title && i.url)
    .slice(0, CONFIG.count);
}

// Google News dodaje " - Source Name" na kraj naslova — ukloniti
function cleanTitle(title) {
  return title.replace(/\s+-\s+[^-]+$/, '').trim();
}

// Pokušaj izvući ime izvora iz Google News formata naslova
function extractSource(title) {
  const m = title.match(/\s+-\s+([^-]+)$/);
  return m ? m[1].trim() : 'Google News';
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').trim();
}

function extractImage(html) {
  const m = html.match(/src="([^"]+)"/);
  return m ? m[1] : null;
}

// --- ARTICLE STORE ---
const articleStore = new Map(); // url → article object

// --- DETAIL VIEW ---
let activeTheme = 'squid';

function showDetail(url) {
  const a = articleStore.get(url);
  if (!a) return;

  const view = document.getElementById('detail-view');

  // image
  const img = document.getElementById('detailImage');
  if (a.image) { img.src = a.image; img.style.display = 'block'; }
  else { img.src = ''; img.style.display = 'none'; }

  document.getElementById('detailTitle').textContent        = a.title;
  document.getElementById('detailDesc').textContent         = a.description || 'Klikni "Pročitaj cijeli članak" za detalje.';
  document.getElementById('detailSource').textContent       = a.source;
  document.getElementById('detailSourceHeader').textContent = a.source;
  document.getElementById('detailTime').textContent         = timeAgo(a.publishedAt);
  document.getElementById('detailReadBtn').href             = a.url;
  document.getElementById('detailExternal').href            = a.url;

  view.className = `detail ${activeTheme}-theme`;
  view.removeAttribute('aria-hidden');
  // trigger transition
  requestAnimationFrame(() => view.classList.add('open'));

  history.pushState({ detail: true, url }, '', '#detail');
  document.body.style.overflow = 'hidden';
}

function hideDetail() {
  const view = document.getElementById('detail-view');
  view.classList.remove('open');
  view.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// --- RENDERING ---
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return 'upravo';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderArticles(articles, containerId) {
  const el = document.getElementById(containerId);

  if (!articles?.length) {
    el.innerHTML = '<p class="empty">Nema dostupnih vijesti.</p>';
    return;
  }

  // Spremi sve u store da ih showDetail može naći
  articles.forEach(a => articleStore.set(a.url, a));

  const [hero, ...rest] = articles;
  const key = u => `showDetail(${JSON.stringify(u)})`;

  const heroHtml = `
    <article class="card-hero" onclick="${key(hero.url)}">
      ${hero.image ? `<img class="hero-img" src="${escHtml(hero.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div class="hero-body">
        <div class="card-meta">
          <span class="source">${escHtml(hero.source)}</span>
          <span class="dot">•</span>
          <span class="time">${timeAgo(hero.publishedAt)}</span>
        </div>
        <h2 class="card-title">${escHtml(hero.title)}</h2>
        ${hero.description ? `<p class="card-desc">${escHtml(hero.description)}</p>` : ''}
      </div>
    </article>`;

  const listHtml = rest.map(a => `
    <article class="card-item" onclick="${key(a.url)}">
      <div class="item-body">
        <div class="card-meta">
          <span class="source">${escHtml(a.source)}</span>
          <span class="dot">•</span>
          <span class="time">${timeAgo(a.publishedAt)}</span>
        </div>
        <h2 class="card-title">${escHtml(a.title)}</h2>
      </div>
      ${a.image
        ? `<img class="item-thumb" src="${escHtml(a.image)}" alt="" loading="lazy" onerror="this.className='item-thumb-placeholder'">`
        : `<div class="item-thumb-placeholder"></div>`}
    </article>`).join('');

  el.innerHTML = heroHtml + listHtml;
}

// --- STATUS ---
function setStatus(text, spinning = false) {
  document.getElementById('lastUpdated').textContent = text;
  const btn = document.getElementById('refreshBtn');
  btn.disabled = spinning;
  btn.classList.toggle('spinning', spinning);
}

function formatTs(ts) {
  return new Date(Number(ts)).toLocaleString('bs-BA', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

// --- GLAVNI LOAD ---
async function loadData(force = false) {
  if (!force && cacheValid()) {
    const squid = readCache(KEYS.squid);
    const baby  = readCache(KEYS.babymonster);
    if (squid && baby) {
      renderArticles(squid, 'squidArticles');
      renderArticles(baby,  'babymonsterArticles');
      setStatus(`Osvježeno: ${formatTs(localStorage.getItem(KEYS.ts))}`);
      return;
    }
  }

  if (!navigator.onLine) {
    document.getElementById('offline-banner').classList.remove('hidden');
    const squid = readCache(KEYS.squid);
    const baby  = readCache(KEYS.babymonster);
    if (squid) renderArticles(squid, 'squidArticles');
    if (baby)  renderArticles(baby,  'babymonsterArticles');
    setStatus('Offline — keširani podaci');
    return;
  }

  setStatus('Učitavanje...', true);

  try {
    const [squid, baby] = await Promise.all([
      fetchFeed(CONFIG.queries.squid),
      fetchFeed(CONFIG.queries.babymonster)
    ]);

    writeCache(KEYS.squid,       squid);
    writeCache(KEYS.babymonster, baby);
    localStorage.setItem(KEYS.ts, Date.now().toString());

    renderArticles(squid, 'squidArticles');
    renderArticles(baby,  'babymonsterArticles');
    setStatus(`Osvježeno: ${formatTs(Date.now())}`);
  } catch (err) {
    console.error('Fetch failed:', err);
    const squid = readCache(KEYS.squid);
    const baby  = readCache(KEYS.babymonster);
    if (squid && baby) {
      renderArticles(squid, 'squidArticles');
      renderArticles(baby,  'babymonsterArticles');
      setStatus('Greška — stari podaci');
    } else {
      const msg = `<p class="error">Greška: ${escHtml(err.message)}</p>`;
      document.getElementById('squidArticles').innerHTML = msg;
      document.getElementById('babymonsterArticles').innerHTML = msg;
      setStatus('Greška');
    }
  } finally {
    document.getElementById('refreshBtn').disabled = false;
    document.getElementById('refreshBtn').classList.remove('spinning');
  }
}

// --- TABOVI ---
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(btn.dataset.tab).classList.add('active');
      activeTheme = btn.dataset.tab === 'squid' ? 'squid' : 'baby';
    });
  });

  document.getElementById('detailBack').addEventListener('click', () => {
    history.back();
  });

  window.addEventListener('popstate', e => {
    if (!e.state?.detail) hideDetail();
  });
}

// --- SERVICE WORKER ---
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    if ('periodicSync' in reg) {
      const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (perm.state === 'granted') {
        await reg.periodicSync.register('news-refresh', { minInterval: CONFIG.refreshInterval });
      }
    }
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'BACKGROUND_REFRESH') loadData(true);
    });
  } catch (e) {
    console.warn('SW registration failed:', e);
  }
}

// --- INIT ---
document.getElementById('refreshBtn').addEventListener('click', () => loadData(true));

window.addEventListener('online',  () => { document.getElementById('offline-banner').classList.add('hidden'); loadData(true); });
window.addEventListener('offline', () => { document.getElementById('offline-banner').classList.remove('hidden'); });

window.addEventListener('load', async () => {
  await registerSW();
  initTabs();
  await loadData();
  setInterval(() => loadData(true), CONFIG.refreshInterval);
});
