/**
 * 鳳溪第一小學｜課堂遊戲計分板 API（Cloudflare Worker + KV）
 *
 * POST /api/score   {cls:"4A", no:12, ok:18, total:22, best:7}   → 寫入／更新自己嘅最佳成績
 * GET  /api/top?cls=4A&limit=10                                  → 當日排行榜（同日去重、按答對數排）
 * GET  /api/stat?cls=4A                                          → 當日參與人數／總局數
 *
 * 規則：同一「班別＋學號」每次只保留最高答對數；只計香港時間當日（每日自動歸零，唔使老師清）。
 */

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });
}

// 香港時間當日 00:00 嘅毫秒時間戳
function hkDayStart(now = Date.now()) {
  const shifted = now + HK_OFFSET_MS;
  return Math.floor(shifted / 86400000) * 86400000 - HK_OFFSET_MS;
}

const pad = (n, w) => String(n).padStart(w, '0');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    try {
      if (url.pathname === '/api/score' && request.method === 'POST') return await saveScore(request, env);
      if (url.pathname === '/api/top') return await getTop(url, env);
      if (url.pathname === '/api/stat') return await getStat(url, env);
      if (url.pathname === '/' || url.pathname === '/api') {
        return json({ ok: true, service: 'fk1ps-score-api', endpoints: ['POST /api/score', 'GET /api/top', 'GET /api/stat'] });
      }
      return json({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }
  },
};

async function saveScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  const cls = String(body.cls || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
  const no = parseInt(body.no, 10);
  const ok = Math.max(0, Math.min(999, parseInt(body.ok, 10) || 0));
  const total = Math.max(0, Math.min(999, parseInt(body.total, 10) || 0));
  const best = Math.max(0, Math.min(999, parseInt(body.best, 10) || 0));
  if (!cls || !(no >= 1 && no <= 99)) return json({ ok: false, error: 'cls/no 無效' }, 400);

  const day = hkDayStart();
  const key = `s:${day}:${cls}:${pad(no, 2)}`;
  const prevRaw = await env.CLASS_SCORES.get(key);
  const prev = prevRaw ? JSON.parse(prevRaw) : null;
  // 只保留最佳成績（答對數高者為準；同分計最高連對）
  const better = !prev || ok > prev.ok || (ok === prev.ok && best > (prev.best || 0));
  const record = better
    ? { cls, no, ok, total, best, plays: (prev ? prev.plays : 0) + 1, at: Date.now() }
    : { ...prev, plays: (prev.plays || 0) + 1, lastAt: Date.now() };

  await env.CLASS_SCORES.put(key, JSON.stringify(record), { expirationTtl: 3 * 86400 });
  return json({ ok: true, record, improved: better, rank: await rankOf(env, day, cls, no) });
}

async function listDay(env, day, cls) {
  const prefix = `s:${day}:${cls}:`;
  const list = await env.CLASS_SCORES.list({ prefix, limit: 200 });
  if (!list.keys.length) return [];
  const vals = await Promise.all(list.keys.map((k) => env.CLASS_SCORES.get(k.name)));
  return vals.filter(Boolean).map((v) => JSON.parse(v));
}

function sortRows(rows) {
  return rows.sort((a, b) => (b.ok - a.ok) || ((b.best || 0) - (a.best || 0)) || (a.no - b.no));
}

async function rankOf(env, day, cls, no) {
  const rows = sortRows(await listDay(env, day, cls));
  const i = rows.findIndex((r) => r.no === no);
  return i < 0 ? null : i + 1;
}

async function getTop(url, env) {
  const cls = String(url.searchParams.get('cls') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 10));
  const day = hkDayStart();
  const clsList = cls ? [cls] : await classesOf(env, day);
  const all = [];
  for (const c of clsList) all.push(...(await listDay(env, day, c)));
  const rows = sortRows(all).slice(0, limit);
  return json({
    ok: true,
    cls: cls || null,
    day,
    count: all.length,
    top: rows.map((r, i) => ({ rank: i + 1, cls: r.cls, no: r.no, ok: r.ok, total: r.total, best: r.best || 0 })),
  });
}

async function classesOf(env, day) {
  const list = await env.CLASS_SCORES.list({ prefix: `s:${day}:`, limit: 1000 });
  const set = new Set(list.keys.map((k) => k.name.split(':')[2]));
  return [...set].filter(Boolean).sort();
}

async function getStat(url, env) {
  const cls = String(url.searchParams.get('cls') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
  const day = hkDayStart();
  const rows = await listDay(env, day, cls);
  const plays = rows.reduce((s, r) => s + (r.plays || 1), 0);
  return json({ ok: true, cls: cls || null, day, students: rows.length, plays });
}
