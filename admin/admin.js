// The owner's dashboard. What keeps the numbers private is admin_metrics()
// in the database, which refuses anyone not in app_admins; this file holds
// nothing secret (the key below is the same public key the app ships).
//
// Defence in depth around it, in index.html: a CSP that allows only this
// file and one hash-pinned copy of supabase-js, no referrer, and no framing.

// Shown only when this is the top window, so another site cannot frame the
// page and steer clicks (Pages cannot send frame-ancestors).
if (self === top) document.documentElement.style.display = 'block';
else top.location = self.location.href;

const db = supabase.createClient(
  'https://fpldqluwkcwygkbabmys.supabase.co',
  'sb_publishable_XylYwpIdMd0E4SNWuC07hg_ktUiBR4Y',
  // The session lives for this tab only, not in synkitab.com's localStorage,
  // so closing the tab signs out and nothing else on the origin can find it.
  { auth: { storage: window.sessionStorage, flowType: 'pkce' } });

const $ = id => document.getElementById(id);
// Everything below is set with textContent: version strings come from
// clients, and anyone holding the public key can write one.
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const pct = (kept, cohort) => cohort ? Math.round(100 * kept / cohort) + '%' : '—';
const short = d => new Date(String(d).slice(0, 10) + 'T00:00:00Z')
  .toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

function kpi(k, v, s) {
  const c = el('div', 'card');
  c.append(el('div', 'k', k), el('div', 'v', String(v)), el('div', 's', s));
  $('kpis').append(c);
}

function bars(id, rows, key) {
  const max = Math.max(1, ...rows.map(r => r.n));
  const box = $('c-' + id);
  box.replaceChildren();
  for (const r of rows) {
    const b = el('div', 'bar' + (r.n ? '' : ' zero'));
    b.style.height = (100 * r.n / max) + '%';
    b.title = short(r[key]) + ': ' + r.n;
    box.append(b);
  }
  $('a-' + id).replaceChildren(
    el('span', null, short(rows[0][key])),
    el('span', null, 'max ' + max),
    el('span', null, short(rows.at(-1)[key])));
}

function table(id, obj) {
  const t = $('t-' + id);
  t.replaceChildren();
  const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (!rows.length) {
    t.append(el('tr')).append(el('td', 's', 'No pings yet.'));
    return;
  }
  for (const [k, n] of rows) {
    const tr = el('tr');
    tr.append(el('td', null, k), el('td', null, String(n)));
    t.append(tr);
  }
}

const size = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB'
  : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB'
  : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';

// A number against its limit, with a bar that turns amber at 70% and red at 90%.
function gauge(k, used, limit, s) {
  const share = limit ? used / limit : 0;
  const c = el('div', 'card');
  const m = el('div', 'meter' + (share >= .9 ? ' full' : share >= .7 ? ' warn' : ''));
  const fill = el('i');
  fill.style.width = Math.min(100, 100 * share).toFixed(1) + '%';
  m.append(fill);
  c.append(el('div', 'k', k), el('div', 'v', size(used)), el('div', 's', s), m);
  $('db-kpis').append(c);
}

function rows(id, list) {
  const t = $('t-' + id);
  t.replaceChildren();
  for (const cells of list) {
    const tr = el('tr');
    cells.forEach((v, i) => tr.append(el('td', i ? 'n' : null, String(v))));
    t.append(tr);
  }
}

const LABELS = {
  accounts: 'Accounts', books: 'Books', versions: 'Book versions', annotations: 'Highlights and notes',
  clubs: 'Clubs', club_messages: 'Club messages', direct_messages: 'Chat messages', devices: 'Devices',
  storage_gc: 'Files to delete', drive_gc: 'Drive files to delete',
  bugs: 'Bug reports', chats: 'Chat reports', alerts: 'Ops alerts',
};

async function loadDb() {
  const { data: d, error } = await db.rpc('admin_db_stats');
  $('db-kpis').replaceChildren();
  if (error) {
    $('db-kpis').append(el('div', 'err', 'Database stats: ' + error.message));
    return;
  }
  const files = d.storage.reduce((sum, b) => sum + b.bytes, 0);
  const count = d.storage.reduce((sum, b) => sum + b.files, 0);
  gauge('Database', d.db_bytes, d.db_limit_bytes,
        Math.round(100 * d.db_bytes / d.db_limit_bytes) + '% of ' + size(d.db_limit_bytes) + ' on the plan');
  gauge('File storage', files, d.storage_limit_bytes,
        count + ' files · ' + Math.round(100 * files / d.storage_limit_bytes) + '% of ' + size(d.storage_limit_bytes));
  kpi2('Connections', d.connections + ' / ' + d.max_connections, 'open now, of the most allowed');
  kpi2('Cache hit', (d.cache_hit ?? '—') + '%', 'reads from memory; under 99% wants a bigger plan');
  kpi2('Dead rows', d.dead_rows, 'awaiting vacuum · Postgres ' + String(d.postgres).split(' ')[0]);
  rows('tables', d.tables.map(t => [t.name, size(t.bytes), t.rows + ' rows']));
  rows('counts', Object.entries(d.counts).map(([k, n]) => [LABELS[k] || k, n]));
  rows('queues', [
    ...Object.entries(d.queues).map(([k, n]) => [LABELS[k] || k, n]),
    ...Object.entries(d.reports).map(([k, n]) => [LABELS[k] || (k[0].toUpperCase() + k.slice(1) + ' reports'), n]),
  ]);
}

function kpi2(k, v, s) {
  const c = el('div', 'card');
  c.append(el('div', 'k', k), el('div', 'v', String(v)), el('div', 's', s));
  $('db-kpis').append(c);
}

function signedOut(message) {
  $('signin').hidden = false;
  $('dash').hidden = true;
  $('err').textContent = message || '';
}

async function load() {
  const { data: m, error } = await db.rpc('admin_metrics');
  if (error) {
    // Not an admin: sign straight back out rather than keep a session that
    // can do nothing here.
    if (error.code === '42501') await db.auth.signOut();
    return signedOut(error.code === '42501' ? 'This account is not an admin.' : error.message);
  }
  $('signin').hidden = true;
  $('dash').hidden = false;
  $('kpis').replaceChildren();
  const r = m.retention, c = m.clubs, a = m.accounts;
  kpi('Installs', m.installs, 'all time, since pings began');
  kpi('Active today', m.dau, 'installs opened today (UTC)');
  kpi('Active, 7 days', m.wau,
      'MAU ' + m.mau + (m.mau ? ' · stickiness ' + Math.round(100 * m.dau / m.mau) + '%' : ''));
  kpi('Day-7 retention', pct(r.d7_kept, r.d7_cohort), r.d7_cohort
      ? r.d7_kept + ' of ' + r.d7_cohort + ' came back in days 7–13' : 'needs installs 13+ days old');
  kpi('Day-30 retention', pct(r.d30_kept, r.d30_cohort), r.d30_cohort
      ? r.d30_kept + ' of ' + r.d30_cohort + ' came back in days 30–36' : 'needs installs 36+ days old');
  kpi('Club members active', m.club_active_weekly.at(-1).n, 'this week, of ' + c.members + ' memberships');
  kpi('Clubs', c.total, c.public + ' public');
  kpi('Accounts', a.total, a.signed_in_7d + ' signed in this week');
  bars('installs', m.new_installs_daily, 'day');
  bars('clubs', m.club_active_weekly, 'week');
  bars('signups', m.signups_weekly, 'week');
  table('platforms', m.platforms);
  table('versions', m.versions);
  await loadDb();
  $('foot').textContent = 'Counts only: a random install id, platform and version, once a day. ' +
    (m.first_ping ? 'Installs counted since ' + short(m.first_ping) + '. ' : 'No installs counted yet. ') +
    'Club activity and accounts reach back further. Updated ' + new Date(m.generated_at).toLocaleString() + '.';
}

function show(session) {
  $('who').textContent = session ? session.user.email : '';
  $('out').hidden = !session;
  return session ? load() : signedOut();
}

$('signin').addEventListener('submit', async e => {
  e.preventDefault();
  $('err').textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('pw').value });
  $('pw').value = '';
  if (error) $('err').textContent = error.message;
});
$('google').addEventListener('click', () => db.auth.signInWithOAuth({
  provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
$('out').addEventListener('click', () => db.auth.signOut());
$('refresh').addEventListener('click', load);
db.auth.onAuthStateChange((event, session) => {
  if (event !== 'TOKEN_REFRESHED') show(session);
});
