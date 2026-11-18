import { getTop, getStat, resetDay, json, CORS } from '../_lib/scores.js';

export async function onRequestGet(ctx) {
  try {
    const url = new URL(ctx.request.url);
    if (url.pathname.endsWith('/stat')) return await getStat(url, ctx.env);
    return await getTop(url, ctx.env);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestPost(ctx) {
  try {
    return await resetDay(ctx.request, ctx.env);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
