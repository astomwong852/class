/**
 * 鳳溪第一小學｜課堂遊戲計分板（Cloudflare Pages Functions + D1）
 * 同一「班別＋學號」只保留最佳成績；只計香港時間當日（每日自動歸零，唔使老師清）
 * 用 D1 而非 KV：D1 寫入即時一致，學生交完成績排行榜即刻見。
 */

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-reset-key',
  'Access-Control-Max-Age': '86400',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });
}

const dayKey = (now = Date.now()) => new Date(now + HK_OFFSET_MS).toISOString().slice(0, 10);
const cleanCls = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
const int = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));

export async function saveScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  const cls = cleanCls(body.cls);
  const no = parseInt(body.no, 10);
  const ok = int(body.ok, 0, 999);
  const total = int(body.total, 0, 999);
  const best = int(body.best, 0, 999);
  if (!cls || !(no >= 1 && no <= 99)) return json({ ok: false, error: '班別／學號無效' }, 400);

  const day = dayKey();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO scores (day, cls, no, ok, total, best, plays, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(day, cls, no) DO UPDATE SET
       plays      = scores.plays + 1,
       updated_at = excluded.updated_at,
       best       = CASE WHEN excluded.ok > scores.ok
                           OR (excluded.ok = scores.ok AND excluded.best > scores.best)
                         THEN excluded.best ELSE scores.best END,
       total      = CASE WHEN excluded.ok > scores.ok
                           OR (excluded.ok = scores.ok AND excluded.best > scores.best)
                         THEN excluded.total ELSE scores.total END,
       ok         = MAX(scores.ok, excluded.ok)`
  )
    .bind(day, cls, no, ok, total, best, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT ok, total, best, plays FROM scores WHERE day = ? AND cls = ? AND no = ?`
  )
    .bind(day, cls, no)
    .first();

  const rank = await rankOf(env, day, cls, row.ok, row.best, no);
  return json({ ok: true, cls, no, day, ...row, rank });
}

async function rankOf(env, day, cls, ok, best, no) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores
      WHERE day = ? AND cls = ?
        AND (ok > ? OR (ok = ? AND best > ?) OR (ok = ? AND best = ? AND no < ?))`
  )
    .bind(day, cls, ok, ok, best, ok, best, no)
    .first();
  return (r ? r.n : 0) + 1;
}

export async function getTop(url, env) {
  const cls = cleanCls(url.searchParams.get('cls'));
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit'), 10) || 10));
  const day = dayKey();

  const rows = cls
    ? (await env.DB.prepare(
        `SELECT cls, no, ok, total, best, plays FROM scores
          WHERE day = ? AND cls = ? ORDER BY ok DESC, best DESC, no ASC LIMIT ?`
      ).bind(day, cls, limit).all()).results
    : (await env.DB.prepare(
        `SELECT cls, no, ok, total, best, plays FROM scores
          WHERE day = ? ORDER BY ok DESC, best DESC, cls ASC, no ASC LIMIT ?`
      ).bind(day, limit).all()).results;

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(plays),0) AS p FROM scores WHERE day = ?${cls ? ' AND cls = ?' : ''}`
  )
    .bind(...(cls ? [day, cls] : [day]))
    .first();

  return json({
    ok: true,
    cls: cls || null,
    day,
    students: count ? count.n : 0,
    plays: count ? count.p : 0,
    top: rows.map((r, i) => ({ rank: i + 1, ...r })),
  });
}

export async function getStat(url, env) {
  const d = await (await getTop(url, env)).json();
  return json({ ok: true, cls: d.cls, day: d.day, students: d.students, plays: d.plays });
}

// 老師用：清空當日（或某一班）紀錄。需要 header x-reset-key 對得上環境變數 RESET_KEY
export async function resetDay(request, env) {
  const key = request.headers.get('x-reset-key') || '';
  if (!env.RESET_KEY || key !== env.RESET_KEY) return json({ ok: false, error: 'unauthorized' }, 401);
  const cls = cleanCls(new URL(request.url).searchParams.get('cls'));
  const day = dayKey();
  const stmt = cls
    ? env.DB.prepare(`DELETE FROM scores WHERE day = ? AND cls = ?`).bind(day, cls)
    : env.DB.prepare(`DELETE FROM scores WHERE day = ?`).bind(day);
  const r = await stmt.run();
  return json({ ok: true, deleted: r.meta ? r.meta.changes : null, day, cls: cls || null });
}
