/**
 * fk1ps-quiz — Kahoot 風格即時問答（Cloudflare Workers + Durable Objects）
 *
 * 架構：
 *   Worker  → /api/new 開房、/ws WebSocket、其餘交畀靜態資源
 *   Room DO → 每個 PIN 一個 Durable Object，房間狀態全部喺入面
 *
 * 前端用一個 socket.io 風格嘅 shim（public/static/js/live.js），
 * 所以 host.js / play.js 可以沿用原本嘅事件名。
 */

import { QUIZZES, quizList } from "./quizzes.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function randomPin() {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => String(b % 10)).join("");
}

/* ══════════════════════════════════════════
   Worker 入口
   ══════════════════════════════════════════ */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    // 開新房間（主持人）
    if (url.pathname === "/api/new") {
      for (let i = 0; i < 12; i++) {
        const pin = randomPin();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(pin));
        const r = await stub.fetch(`https://room/init?pin=${pin}`, { method: "POST" });
        if (r.ok) return json({ pin });
      }
      return json({ error: "房間爆滿，請再試" }, 503);
    }

    // 房間狀態（開發／除錯用）
    if (url.pathname === "/api/room") {
      const pin = url.searchParams.get("pin") || "";
      if (!pin) return json({ error: "no pin" }, 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(pin));
      const r = await stub.fetch("https://room/inspect");
      return json(await r.json());
    }

    // WebSocket
    if (url.pathname === "/ws") {
      const pin = url.searchParams.get("pin") || "";
      const role = url.searchParams.get("role") === "host" ? "host" : "player";
      if (!/^\d{6}$/.test(pin)) return new Response("bad pin", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(pin));
      return stub.fetch(`https://room/ws?role=${role}`, {
        headers: { Upgrade: "websocket" },
      });
    }

    // /host → host.html（Workers Assets 唔會自動補 .html）
    if (url.pathname === "/host" || url.pathname === "/host/") {
      const u = new URL("/host.html", url);
      u.search = url.search;
      return env.ASSETS.fetch(new Request(u.toString(), req));
    }

    return env.ASSETS.fetch(req);
  },
};

/* ══════════════════════════════════════════
   Durable Object — 一個 PIN = 一個房間
   ══════════════════════════════════════════ */
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.g = null;
    // 序列化所有狀態變更，避免並發寫入打架
    this._lock = Promise.resolve();
  }

  run(fn) {
    const p = this._lock.then(fn, fn);
    this._lock = p.then(() => {}, () => {});
    return p;
  }

  /* ── 存取 ── */
  async load() {
    if (!this.g) this.g = await this.state.storage.get("g");
    return this.g;
  }

  async save() {
    if (this.g) await this.state.storage.put("g", this.g);
  }

  /* ── HTTP ── */
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/init") {
      const pin = url.searchParams.get("pin") || "";
      const g = await this.load();
      if (g && g.state !== "final") return new Response("busy", { status: 409 });
      this.g = {
        pin,
        state: "lobby",
        quizId: "general",
        qIndex: -1,
        qStart: 0,
        token: 0,
        players: {},
        answers: {},
        createdAt: Date.now(),
      };
      await this.save();
      return json({ ok: true, pin });
    }

    if (url.pathname === "/inspect") {
      const g = await this.load();
      if (!g) return json({ exists: false });
      return json({
        exists: true,
        pin: g.pin,
        state: g.state,
        qIndex: g.qIndex,
        players: Object.keys(g.players).length,
        online: this.onlinePids().size,
        answers: Object.keys(g.answers).length,
        names: Object.values(g.players).map((p) => p.name),
      });
    }

    if (url.pathname === "/ws") {
      const role = url.searchParams.get("role") === "host" ? "host" : "player";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ role, pid: null });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  /* ── WebSocket（Hibernation API）── */
  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const t = msg && msg.t;
    const d = (msg && msg.d) || {};
    if (!t) return;
    await this.run(() => this.dispatch(ws, t, d));
  }

  async webSocketClose(ws) {
    await this.run(() => this.onLeave(ws));
  }

  async webSocketError(ws) {
    await this.run(() => this.onLeave(ws));
  }

  /* ══════════════════════════════════════════
     工具
     ══════════════════════════════════════════ */
  onlinePids() {
    const s = new Set();
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.pid) s.add(a.pid);
    }
    return s;
  }

  bcast(t, d) {
    const payload = JSON.stringify({ t, d });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {}
    }
  }

  sendTo(pid, t, d) {
    const payload = JSON.stringify({ t, d });
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.pid === pid) {
        try {
          ws.send(payload);
        } catch {}
      }
    }
  }

  sendRaw(ws, t, d) {
    try {
      ws.send(JSON.stringify({ t, d }));
    } catch {}
  }

  quiz(g) {
    return QUIZZES[g.quizId] || QUIZZES.general;
  }

  limit(g) {
    return this.quiz(g).time_limit || 20;
  }

  currentQ(g) {
    const qs = this.quiz(g).questions;
    return g.qIndex >= 0 && g.qIndex < qs.length ? qs[g.qIndex] : null;
  }

  ranked(g) {
    return Object.values(g.players).sort(
      (a, b) => b.score - a.score || a.joined - b.joined
    );
  }

  playerList(g) {
    const online = this.onlinePids();
    return this.ranked(g).map((p) => ({
      id: p.pid,
      name: p.name,
      score: p.score,
      streak: p.streak,
      online: online.has(p.pid),
    }));
  }

  hostState(g) {
    return {
      pin: g.pin,
      state: g.state,
      q_index: g.qIndex,
      total: this.quiz(g).questions.length,
      players: this.playerList(g),
      answered: Object.keys(g.answers).length,
      quiz_title: this.quiz(g).title,
      time_limit: this.limit(g),
    };
  }

  scoreFor(ms, limitMs) {
    const ratio = Math.min(1, Math.max(0, ms / limitMs));
    return Math.round(1000 * (1 - ratio / 2));
  }

  rankOf(g, pid) {
    const r = this.ranked(g);
    const i = r.findIndex((p) => p.pid === pid);
    return i < 0 ? 0 : i + 1;
  }

  /* ══════════════════════════════════════════
     事件分派
     ══════════════════════════════════════════ */
  async dispatch(ws, t, d) {
    const g = await this.load();
    if (!g) {
      this.sendRaw(ws, "fatal", { message: "房間唔存在，請重新開房" });
      return;
    }
    const att = ws.deserializeAttachment() || {};

    switch (t) {
      case "host_create":
        return this.onHostCreate(ws, g);
      case "host_switch_quiz":
        return this.onSwitchQuiz(ws, g, d);
      case "host_next":
        return this.onHostNext(g);
      case "host_kick":
        return this.onKick(ws, g, d);
      case "player_join":
        return this.onJoin(ws, g, d, att);
      case "player_answer":
        return this.onAnswer(ws, g, d, att);
      case "player_leave":
        return this.onLeave(ws);
      case "player_ping":
        return this.sendRaw(ws, "pong", {});
      default:
        return;
    }
  }

  /* ── 主持人 ── */
  onHostCreate(ws, g) {
    ws.serializeAttachment({ role: "host", pid: null });
    this.sendRaw(ws, "host_ready", {
      pin: g.pin,
      quiz_title: this.quiz(g).title,
      total: this.quiz(g).questions.length,
      time_limit: this.limit(g),
      // join URL 由前端自己砌（同源）
      join_url: `/?pin=${g.pin}`,
      quizzes: quizList(),
    });
    this.sendRaw(ws, "host_state", this.hostState(g));
  }

  onSwitchQuiz(ws, g, d) {
    if (g.state !== "lobby") return;
    if (!QUIZZES[d.quiz_id]) return;
    g.quizId = d.quiz_id;
    this.save();
    this.bcast("host_state", this.hostState(g));
    this.bcast("lobby_meta", {
      quiz_title: this.quiz(g).title,
      total_questions: this.quiz(g).questions.length,
    });
  }

  async onHostNext(g) {
    if (g.state === "lobby") {
      if (!Object.keys(g.players).length) {
        const ws = this.hostWs();
        if (ws) this.sendRaw(ws, "host_toast", { message: "未有人入房，等多陣先" });
        return;
      }
      return this.startQuestion(g);
    }
    if (g.state === "reveal") {
      if (g.qIndex >= this.quiz(g).questions.length - 1) return this.finish(g);
      return this.startQuestion(g);
    }
    if (g.state === "question") return this.reveal(g);
    if (g.state === "final") {
      g.qIndex = -1;
      g.state = "lobby";
      g.answers = {};
      for (const p of Object.values(g.players)) {
        p.score = 0;
        p.streak = 0;
      }
      await this.save();
      this.bcast("reset_to_lobby", {});
      this.bcast("host_state", this.hostState(g));
    }
  }

  hostWs() {
    for (const ws of this.state.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (a.role === "host") return ws;
    }
    return null;
  }

  onKick(ws, g, d) {
    const pid = d.player_id;
    if (!pid || !g.players[pid]) return;
    delete g.players[pid];
    delete g.answers[pid];
    for (const w of this.state.getWebSockets()) {
      const a = w.deserializeAttachment() || {};
      if (a.pid === pid) this.sendRaw(w, "kicked", {});
    }
    this.save();
    this.bcast("host_state", this.hostState(g));
    this.bcast("lobby_update", { players: this.playerList(g) });
  }

  /* ── 玩家 ── */
  onJoin(ws, g, d, att) {
    if (g.state === "final") {
      return this.sendRaw(ws, "join_failed", { reason: "呢局已經完咗喇" });
    }
    const name0 = String(d.name || "").trim().slice(0, 16);
    if (!name0) return this.sendRaw(ws, "join_failed", { reason: "請輸入暱稱" });

    // 重連
    if (d.pid && g.players[d.pid]) {
      const p = g.players[d.pid];
      ws.serializeAttachment({ role: "player", pid: p.pid });
      this.sendRaw(ws, "joined", this.joinAck(g, p, true));
      this.bcast("lobby_update", { players: this.playerList(g) });
      this.bcast("host_state", this.hostState(g));
      return;
    }

    // 重複名
    let name = name0;
    const taken = new Set(Object.values(g.players).map((p) => p.name));
    let n = 2;
    while (taken.has(name)) name = `${name0}${n++}`;

    const pid = "p" + Math.random().toString(36).slice(2, 9);
    const p = { pid, name, score: 0, streak: 0, joined: Date.now() };
    g.players[pid] = p;
    ws.serializeAttachment({ role: "player", pid });

    this.sendRaw(ws, "joined", this.joinAck(g, p, false));
    this.bcast("lobby_update", { players: this.playerList(g) });
    this.bcast("host_state", this.hostState(g));

    // 中途加入 → 即刻派當前題
    if (g.state === "question") {
      const q = this.currentQ(g);
      if (q) {
        const remain = Math.max(1, this.limit(g) - (Date.now() - g.qStart) / 1000);
        this.sendRaw(ws, "question", {
          index: g.qIndex,
          total: this.quiz(g).questions.length,
          text: q.text,
          options: q.options,
          time_limit: remain,
          late_join: true,
        });
      }
    }
    return this.save();
  }

  joinAck(g, p, reconnected) {
    const q = this.currentQ(g);
    const out = {
      player_id: p.pid,
      name: p.name,
      pin: g.pin,
      state: g.state,
      quiz_title: this.quiz(g).title,
      total_questions: this.quiz(g).questions.length,
      score: p.score,
      reconnected,
    };
    if (g.state === "question" && q) {
      out.current = {
        index: g.qIndex,
        total: this.quiz(g).questions.length,
        text: q.text,
        options: q.options,
        time_limit: Math.max(1, this.limit(g) - (Date.now() - g.qStart) / 1000),
      };
    }
    return out;
  }

  async onAnswer(ws, g, d, att) {
    const pid = att.pid;
    if (!pid || !g.players[pid]) return;
    if (g.state !== "question") return;
    if (g.answers[pid]) {
      return this.sendRaw(ws, "answer_ack", { ok: false, reason: "已經答過喇" });
    }
    const q = this.currentQ(g);
    if (!q) return;

    let choice;
    try {
      choice = parseInt(d.choice, 10);
    } catch {
      return;
    }
    if (!(choice >= 0 && choice < q.options.length)) return;

    const elapsed = (Date.now() - g.qStart) / 1000;
    if (elapsed >= this.limit(g)) {
      return this.sendRaw(ws, "answer_ack", { ok: false, reason: "太遲喇" });
    }

    const ms = Math.min(elapsed, this.limit(g)) * 1000;
    const p = g.players[pid];
    const isCorrect = choice === q.correct;
    let points = 0;
    if (isCorrect) {
      points = this.scoreFor(ms, this.limit(g) * 1000);
      p.streak += 1;
      if (p.streak >= 2) points += Math.min(500, 100 * (p.streak - 1));
      p.score += points;
    } else {
      p.streak = 0;
    }

    g.answers[pid] = { choice, ms, correct: isCorrect, points };
    await this.save();

    this.sendRaw(ws, "answer_ack", { ok: true, choice });

    const answered = Object.keys(g.answers).length;
    const online = this.onlinePids().size;
    this.bcast("answer_count", { answered, total: online });
    this.bcast("host_state", this.hostState(g));

    if (online > 0 && answered >= online) {
      await this.reveal(g);
    }
  }

  async onLeave(ws) {
    const g = await this.load();
    if (!g) return;
    const att = ws.deserializeAttachment() || {};
    const pid = att.pid;
    if (!pid || !g.players[pid]) return;
    // 仲有其他連線用緊呢個 pid？（重連情況）
    const stillHere = this.state.getWebSockets().some((w) => {
      if (w === ws) return false;
      const a = w.deserializeAttachment() || {};
      return a.pid === pid;
    });
    if (stillHere) return;

    if (g.state === "lobby") {
      delete g.players[pid];
      delete g.answers[pid];
    }
    await this.save();
    this.bcast("lobby_update", { players: this.playerList(g) });
    this.bcast("host_state", this.hostState(g));

    if (g.state === "question") {
      const online = this.onlinePids().size;
      if (online > 0 && Object.keys(g.answers).length >= online) {
        await this.reveal(g);
      }
    }
  }

  /* ══════════════════════════════════════════
     遊戲流程
     ══════════════════════════════════════════ */
  async startQuestion(g) {
    g.qIndex += 1;
    const q = this.currentQ(g);
    if (!q) return this.finish(g);

    g.state = "question";
    g.answers = {};
    g.qStart = Date.now();
    g.token += 1;
    await this.save();

    this.bcast("question", {
      index: g.qIndex,
      total: this.quiz(g).questions.length,
      text: q.text,
      options: q.options,
      time_limit: this.limit(g),
    });
    this.bcast("host_state", this.hostState(g));

    await this.state.storage.setAlarm(Date.now() + this.limit(g) * 1000 + 400);
  }

  async alarm() {
    const g = await this.load();
    if (!g || g.state !== "question") return;
    await this.run(() => this.reveal(g));
  }

  async reveal(g) {
    if (g.state !== "question") return;
    const q = this.currentQ(g);
    if (!q) return;

    g.state = "reveal";
    await this.save();

    const n = q.options.length;
    const dist = new Array(n).fill(0);
    for (const a of Object.values(g.answers)) {
      if (a.choice >= 0 && a.choice < n) dist[a.choice] += 1;
    }

    const total = dist.reduce((a, b) => a + b, 0);
    const pct = dist.map((d) => Math.round((100 * d) / Math.max(1, total)));

    // 個人結果
    for (const p of Object.values(g.players)) {
      const a = g.answers[p.pid];
      this.sendTo(p.pid, "your_result", {
        correct: a ? a.choice === q.correct : false,
        choice: a ? a.choice : null,
        points: a ? a.points : 0,
        streak: p.streak,
        score: p.score,
        rank: this.rankOf(g, p.pid),
        timeout: !a,
      });
    }

    this.bcast("reveal", {
      correct: q.correct,
      distribution: dist,
      percent: pct,
      answered: Object.keys(g.answers).length,
      total_players: Object.keys(g.players).length,
      explanation: q.explanation || "",
      leaderboard: this.playerList(g).slice(0, 5),
      is_last: g.qIndex >= this.quiz(g).questions.length - 1,
    });
    this.bcast("host_state", this.hostState(g));
  }

  async finish(g) {
    g.state = "final";
    await this.save();
    this.bcast("game_over", {
      podium: this.playerList(g).slice(0, 3),
      leaderboard: this.playerList(g).slice(0, 10),
      quiz_title: this.quiz(g).title,
    });
    this.bcast("host_state", this.hostState(g));
  }
}
