import { saveScore, json, CORS } from '../_lib/scores.js';

export async function onRequestPost(ctx) {
  try {
    return await saveScore(ctx.request, ctx.env);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
