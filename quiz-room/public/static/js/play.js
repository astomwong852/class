/* ══════════════════════════════════════════
   play.js — 玩家手機端邏輯
   ══════════════════════════════════════════ */
const socket = LIVE.create();

const SHAPES = [
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 22.4 20.4H1.6z"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8 22.2 12 12 22.2 1.8 12z"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><rect x="2.4" y="2.4" width="19.2" height="19.2" rx="4"/></svg>',
];
const AVA_COLORS = ["#FF453A", "#0A84FF", "#FFD60A", "#30D158", "#BF5AF2", "#FF9F0A", "#64D2FF", "#FF375F"];
const $ = (id) => document.getElementById(id);

const screens = {
  join: $("scr-join"),
  lobby: $("scr-lobby"),
  question: $("scr-question"),
  wait: $("scr-wait"),
  result: $("scr-result"),
  final: $("scr-final"),
};

let ME = { pid: null, name: "", score: 0, pin: null };
let locked = false;
let chosen = null;
let deadline = 0;
let rafId = null;

/* ══════════════════════════════════════════
   畫面切換
   ══════════════════════════════════════════ */
function show(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle("active", k === name));
  window.scrollTo(0, 0);
}

/* ══════════════════════════════════════════
   加入
   ══════════════════════════════════════════ */
const pinInput = $("input-pin");
const nameInput = $("input-name");
const joinBtn = $("btn-join");

// URL 帶 PIN 就自動填入（掃 QR Code）
const params = new URLSearchParams(location.search);
if (params.get("pin")) {
  pinInput.value = params.get("pin").replace(/\D/g, "").slice(0, 6);
}
const saved = loadSaved();
if (saved && saved.name) nameInput.value = saved.name;

function refreshJoinBtn() {
  joinBtn.disabled = pinInput.value.length !== 6 || !nameInput.value.trim();
}
pinInput.addEventListener("input", () => {
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
  refreshJoinBtn();
});
nameInput.addEventListener("input", refreshJoinBtn);
refreshJoinBtn();

joinBtn.addEventListener("click", doJoin);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !joinBtn.disabled) doJoin();
});

function doJoin() {
  $("join-err").textContent = "";
  joinBtn.disabled = true;
  ME.pin = pinInput.value;
  socket.connect(ME.pin, "player");
  socket.emit("player_join", {
    pin: pinInput.value,
    name: nameInput.value.trim(),
    pid: saved && saved.pin === pinInput.value ? saved.pid : null,
  });
}

socket.on("join_failed", (d) => {
  $("join-err").textContent = d.reason || "加入失敗";
  joinBtn.disabled = false;
});

socket.on("joined", (d) => {
  ME.pid = d.player_id;
  ME.name = d.name;
  ME.score = d.score;
  ME.pin = d.pin;
  save({ pin: d.pin, pid: d.player_id, name: d.name });

  const c = AVA_COLORS[hashName(d.name) % AVA_COLORS.length];
  const av = $("lobby-avatar");
  av.textContent = d.name.slice(0, 1).toUpperCase();
  av.style.background = c;
  $("lobby-name").textContent = d.name;
  $("lobby-meta").innerHTML =
    `<b>${esc(d.quiz_title || "")}</b><br>共 ${d.total_questions} 題` +
    (d.reconnected ? "<br>已重新連線" : "");

  $("p-score").textContent = d.score;

  if (d.state === "question" && d.current) {
    enterQuestion(d.current);
  } else if (d.state === "reveal") {
    show("lobby");
    hint("等下一題…");
  } else {
    show("lobby");
  }
});

/* ══════════════════════════════════════════
   題目
   ══════════════════════════════════════════ */
socket.on("question", (q) => enterQuestion(q));

function enterQuestion(q) {
  locked = false;
  chosen = null;
  $("p-num").textContent = q.index + 1;
  $("p-total").textContent = q.total;
  $("p-q").textContent = q.text;

  const wrap = $("p-opts");
  wrap.innerHTML = q.options
    .map(
      (o, i) => `<button class="p-opt c${i}" data-i="${i}" style="animation:popIn .28s ${i * 45}ms both">
        <span class="pic">${SHAPES[i] || SHAPES[0]}</span>
        <span>${esc(o)}</span>
      </button>`
    )
    .join("");

  wrap.querySelectorAll(".p-opt").forEach((btn) => {
    btn.addEventListener("click", () => pick(parseInt(btn.dataset.i, 10), q));
  });

  show("question");
  startCountdown(q.time_limit);
}

function pick(idx, q) {
  if (locked) return;
  locked = true;
  chosen = idx;
  socket.emit("player_answer", { choice: idx });
  startWait(idx, q);
}

socket.on("answer_ack", (d) => {
  if (!d.ok) {
    locked = false;
    hint(d.reason || "提交失敗");
    if (d.reason && d.reason.includes("太遲")) startCountdown(0.6);
  }
});

/* ── 倒數 ── */
function startCountdown(seconds) {
  stopCountdown();
  deadline = Date.now() + seconds * 1000;
  const fill = $("p-timefill");
  const bar = $("p-timebar");
  const total = Math.max(0.5, seconds);

  function tick() {
    const remain = Math.max(0, (deadline - Date.now()) / 1000);
    const frac = remain / total;
    fill.style.width = (frac * 100).toFixed(1) + "%";
    bar.classList.toggle("warn", frac <= 0.5 && frac > 0.22);
    bar.classList.toggle("danger", frac <= 0.22);
    const wc = $("wait-count");
    if (wc) wc.textContent = Math.ceil(remain);
    if (remain <= 0.05) {
      stopCountdown();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}
function stopCountdown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/* ══════════════════════════════════════════
   已提交畫面
   ══════════════════════════════════════════ */
function startWait(idx, q) {
  const block = $("wait-block");
  block.className = "wait-block c" + idx;
  block.style.background = ["var(--red)", "var(--blue)", "var(--yellow)", "var(--green)"][idx];
  block.style.color = idx === 2 ? "#1B1B1B" : idx === 3 ? "#0B2E14" : "#fff";
  block.innerHTML = SHAPES[idx] || SHAPES[0];
  block.querySelector("svg").style.width = "56px";
  block.querySelector("svg").style.height = "56px";
  show("wait");
  startCountdown(Math.max(1, q.remaining ?? q.time_limit ?? 20));
}

/* ══════════════════════════════════════════
   個人結果
   ══════════════════════════════════════════ */
socket.on("your_result", (r) => {
  stopCountdown();
  const ok = !!r.correct;

  const icon = $("res-icon");
  icon.className = "res-icon " + (ok ? "ok" : "no");
  icon.innerHTML = ok
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  $("res-title").textContent = ok ? "答啱喇！" : r.timeout ? "冇作答" : "答錯咗";
  $("res-points").textContent = ok ? "+" + r.points.toLocaleString() : "";
  $("res-score").textContent = r.score.toLocaleString();
  $("res-rank").textContent = r.rank ? "#" + r.rank : "—";

  const streak = $("res-streak");
  if (ok && r.streak >= 2) {
    streak.textContent = `連續答啱 ${r.streak} 題，有額外加分`;
  } else if (ok) {
    streak.textContent = "繼續保持";
  } else {
    streak.textContent = "";
  }

  $("p-score").textContent = r.score;
  ME.score = r.score;
  show("result");
});

/* ══════════════════════════════════════════
   最終結果
   ══════════════════════════════════════════ */
socket.on("game_over", (d) => {
  stopCountdown();
  const all = d.leaderboard || [];
  const idx = all.findIndex((p) => p.id === ME.pid);
  const rank = idx >= 0 ? idx + 1 : all.length;

  $("fin-rank").innerHTML = `${rank}<sup>${ordinal(rank)}</sup>`;
  $("fin-sub").textContent = rank === 1 ? "全場第一 🏆" : rank <= 3 ? "企上頒獎台" : "名次";
  $("fin-name").textContent = ME.name;
  $("fin-score").textContent = (ME.score || 0).toLocaleString() + " 分";
  show("final");
});

$("btn-again").addEventListener("click", () => {
  localStorage.removeItem("quizroom_me");
  location.reload();
});

socket.on("reset_to_lobby", () => {
  locked = false;
  chosen = null;
  ME.score = 0;
  $("p-score").textContent = "0";
  show("lobby");
  hint("主持人重新開局，準備好！");
});

socket.on("kicked", () => {
  localStorage.removeItem("quizroom_me");
  alert("主持人已將你移出房間");
  location.reload();
});

/* ══════════════════════════════════════════
   斷線重連
   ══════════════════════════════════════════ */
socket.on("disconnect", () => hint("連線中斷，嘗試重連…"));

// 主動離場（閂 tab / 切走）→ 通知 server 剔除，唔好阻住其他人
window.addEventListener("pagehide", () => {
  try { socket.emit("player_leave"); } catch (e) {}
});

socket.on("connect", () => {
  // 已有身份 → 自動重新加入
  if (ME.pid && ME.pin) {
    socket.emit("player_join", { pin: ME.pin, name: ME.name, pid: ME.pid });
  }
});

/* ══════════════════════════════════════════
   小工具
   ══════════════════════════════════════════ */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hashName(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function ordinal(n) {
  return { 1: "st", 2: "nd", 3: "rd" }[n] || "th";
}
let hintT = null;
function hint(msg) {
  const el = $("hint");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(hintT);
  hintT = setTimeout(() => el.classList.remove("show"), 2400);
}
function save(o) {
  try { localStorage.setItem("quizroom_me", JSON.stringify(o)); } catch (e) {}
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem("quizroom_me") || "null"); } catch (e) { return null; }
}
