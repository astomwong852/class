/* ══════════════════════════════════════════
   host.js — 主持人大屏邏輯
   ══════════════════════════════════════════ */
const socket = LIVE.create();

/* ── 形狀 SVG（Kahoot 四色記憶點）── */
const SHAPES = [
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2 22.4 20.4H1.6z"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.8 22.2 12 12 22.2 1.8 12z"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>',
  '<svg class="shape" viewBox="0 0 24 24" fill="currentColor"><rect x="2.4" y="2.4" width="19.2" height="19.2" rx="4"/></svg>',
];
const AVA_COLORS = ["#FF453A", "#0A84FF", "#FFD60A", "#30D158", "#BF5AF2", "#FF9F0A", "#64D2FF", "#FF375F"];

/* ── 全域狀態 ── */
let S = {
  pin: null,
  state: "lobby",
  quizTitle: "",
  total: 0,
  players: [],
  answered: 0,
  answeredTotal: 0,
  qIndex: 0,
  limit: 20,
};
let curQ = null;
let timerRAF = null;
let deadline = 0;
let quizList = [];
const CIRC = 2 * Math.PI * 45;

/* ── DOM ── */
const $ = (id) => document.getElementById(id);
const views = {
  lobby: $("view-lobby"),
  question: $("view-question"),
  reveal: $("view-reveal"),
  final: $("view-final"),
};

/* ══════════════════════════════════════════
   連線
   ══════════════════════════════════════════ */
socket.on("connect", () => {
  $("conn-state").textContent = "已連線";
  socket.emit("host_create");
});
socket.on("disconnect", () => {
  $("conn-state").textContent = "斷線";
  stopTimer();
});

socket.on("fatal", (d) => alert(d.message));

socket.on("host_ready", (d) => {
  S.pin = d.pin;
  S.quizTitle = d.quiz_title;
  S.total = d.total;
  S.limit = d.time_limit || 20;

  $("pin-display").textContent = d.pin;
  $("join-url").textContent = location.host;
  // QR 由前端生成（Workers 冇 server 端 QR）
  const qrBox = document.querySelector(".qr-box");
  if (qrBox) {
    try {
      const qr = qrcode(0, "M");
      qr.addData(location.origin + "/?pin=" + d.pin);
      qr.make();
      qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
      const svg = qrBox.querySelector("svg");
      if (svg) { svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); }
    } catch (e) {
      console.warn("QR 生成失敗", e);
    }
  }

  quizList = d.quizzes || [];
  const picker = $("quiz-picker");
  picker.innerHTML = quizList
    .map((q) => `<option value="${q.id}">${q.title}（${q.count} 題）</option>`)
    .join("");
  const cur = quizList.find((q) => q.title === d.quiz_title);
  if (cur) picker.value = cur.id;

  render();
});

socket.on("host_state", (s) => {
  S.state = s.state;
  S.players = s.players || [];
  S.answered = s.answered || 0;
  S.answeredTotal = S.players.filter((p) => p.online).length;
  S.qIndex = s.q_index;
  S.total = s.total;
  if (s.quiz_title) S.quizTitle = s.quiz_title;
  render();
});

socket.on("lobby_update", (d) => {
  S.players = d.players || [];
  if (S.state === "lobby") renderLobby();
});

socket.on("question", (q) => {
  curQ = q;
  S.qIndex = q.index;
  S.total = q.total;
  S.answered = 0;
  S.answeredTotal = S.players.length;
  deadline = Date.now() + q.time_limit * 1000;
  show("question");
  renderQuestion(q);
  startTimer(q.time_limit);
});

socket.on("answer_count", (d) => {
  S.answered = d.answered;
  S.answeredTotal = d.total;
  $("ans-count").textContent = d.answered;
  $("ans-total").textContent = d.total;
  // 即時分佈（人數粗略回推）
  updateLiveBars(d.answered, d.total);
});

socket.on("reveal", (r) => {
  stopTimer();
  show("reveal");
  renderReveal(r);
  $("next-btn").textContent = r.is_last ? "睇總成績" : "下一題";
  $("bar-hint").textContent = r.is_last ? "結束呢局" : "下一題";
});

socket.on("game_over", (d) => {
  stopTimer();
  show("final");
  renderFinal(d);
  $("next-btn").textContent = "再玩一局";
  $("bar-hint").textContent = "重新開始";
});

socket.on("reset_to_lobby", () => {
  S.state = "lobby";
  show("lobby");
  renderLobby();
});

socket.on("host_toast", (d) => toast(d.message));

/* ══════════════════════════════════════════
   視圖切換
   ══════════════════════════════════════════ */
function show(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === name));
}

function render() {
  show(S.state);
  if (S.state === "lobby") renderLobby();
  updateNextButton();
}

function updateNextButton() {
  const b = $("next-btn");
  switch (S.state) {
    case "lobby":
      b.textContent = "開始遊戲";
      b.disabled = S.players.length === 0;
      $("bar-hint").textContent = S.players.length ? "開始第一題" : "等玩家入場";
      break;
    case "question":
      b.textContent = "提早收卷";
      b.disabled = false;
      $("bar-hint").textContent = "即刻揭曉答案";
      break;
    case "reveal":
      b.disabled = false;
      break;
    case "final":
      b.textContent = "再玩一局";
      break;
  }
}

/* ══════════════════════════════════════════
   LOBBY
   ══════════════════════════════════════════ */
function renderLobby() {
  $("player-count").textContent = S.players.length;
  const grid = $("players-grid");
  const empty = $("players-empty");

  if (!S.players.length) {
    grid.innerHTML = "";
    empty.style.display = "flex";
    $("lobby-hint").textContent = "等緊你按「開始」";
  } else {
    empty.style.display = "none";
  }

  grid.innerHTML = S.players
    .map((p, i) => {
      const c = AVA_COLORS[hashName(p.name) % AVA_COLORS.length];
      const off = p.online ? "" : "display:none";
      return `<div class="pchip" style="animation-delay:${Math.min(i * 30, 400)}ms;${off}">
        <span class="av" style="background:${c}">${esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span>${esc(p.name)}</span>
      </div>`;
    })
    .join("");

  if (S.state === "lobby") updateNextButton();
}

/* ══════════════════════════════════════════
   QUESTION
   ══════════════════════════════════════════ */
function renderQuestion(q) {
  $("q-num").textContent = q.index + 1;
  $("q-total").textContent = q.total;
  $("q-text").textContent = q.text;
  $("ans-count").textContent = 0;
  $("ans-total").textContent = S.players.filter((p) => p.online).length;

  const opts = $("options");
  opts.className = "options";
  opts.innerHTML = q.options
    .map(
      (o, i) => `<div class="opt c${i}" style="animation:popIn .3s ${i * 55}ms both">
        <span class="ic">${SHAPES[i] || SHAPES[0]}</span>
        <span>${esc(o)}</span>
      </div>`
    )
    .join("");

  document.querySelectorAll("#live-bars i").forEach((i) => (i.style.width = "0%"));
}

function updateLiveBars(answered, total) {
  // 冇逐題逐人資料 → 用整體答題進度做視覺填充（各色等分）
  const pct = total ? Math.min(100, (answered / total) * 100) : 0;
  document.querySelectorAll("#live-bars i").forEach((el) => {
    el.style.width = pct + "%";
    el.style.opacity = answered ? 1 : 0;
  });
}

/* ── 倒數環 ── */
function startTimer(limit) {
  stopTimer();
  const bar = $("timer-bar");
  const num = $("timer-num");
  const box = $("timer");
  bar.style.strokeDasharray = CIRC;
  deadline = Date.now() + limit * 1000;

  function tick() {
    const remain = Math.max(0, (deadline - Date.now()) / 1000);
    const frac = remain / limit;
    bar.style.strokeDashoffset = CIRC * (1 - frac);
    num.textContent = Math.ceil(remain);
    box.classList.toggle("warn", frac <= 0.5 && frac > 0.25);
    box.classList.toggle("danger", frac <= 0.25);
    if (remain <= 0) return;
    timerRAF = requestAnimationFrame(tick);
  }
  timerRAF = requestAnimationFrame(tick);
}
function stopTimer() {
  if (timerRAF) cancelAnimationFrame(timerRAF);
  timerRAF = null;
}

/* ══════════════════════════════════════════
   REVEAL
   ══════════════════════════════════════════ */
function renderReveal(r) {
  const q = curQ;
  $("reveal-q").textContent = q ? q.text : "";
  const correctCount = r.distribution[r.correct] || 0;
  $("reveal-count").textContent = `${correctCount} / ${r.total_players} 人答對`;

  // 選項：正確高亮
  const opts = $("options");
  if (q) {
    opts.className = "options opts-reveal";
    opts.innerHTML = q.options
      .map((o, i) => {
        const cls = i === r.correct ? "opt correct shown-correct" : "opt";
        return `<div class="${cls} c${i}">
          <span class="ic">${SHAPES[i] || SHAPES[0]}</span>
          <span>${esc(o)}</span>
        </div>`;
      })
      .join("");
  }

  // 選項 + 分佈（合一，正確答案高亮）
  const total = Math.max(1, r.distribution.reduce((a, b) => a + b, 0));
  $("reveal-opts").innerHTML = r.distribution
    .map((n, i) => {
      const pct = Math.round((n / total) * 100);
      const isCorrect = i === r.correct;
      const label = q ? esc(q.options[i]) : `選項 ${i + 1}`;
      return `<div class="ropt c${i}${isCorrect ? " correct" : ""}">
        <i class="fill" data-w="${pct}"></i>
        <span class="ic">${SHAPES[i] || SHAPES[0]}</span>
        <span class="txt">${label}</span>
        ${isCorrect ? '<span class="tick">✓</span>' : ""}
        <span class="pct">${pct}%</span>
      </div>`;
    })
    .join("");
  requestAnimationFrame(() => {
    document.querySelectorAll("#reveal-opts .fill").forEach((el) => {
      el.style.width = el.dataset.w + "%";
    });
  });

  $("explain").textContent = r.explanation || "";

  // 排行榜
  $("board").innerHTML = (r.leaderboard || [])
    .map(
      (p, i) => `<div class="brow" style="animation-delay:${i * 40}ms">
        <span class="rank">${i + 1}</span>
        <span class="nm">${esc(p.name)}</span>
        <span class="sc">${p.score.toLocaleString()}</span>
      </div>`
    )
    .join("");
}

/* ══════════════════════════════════════════
   FINAL
   ══════════════════════════════════════════ */
function renderFinal(d) {
  const pod = d.podium || [];
  $("winner").textContent = pod.length ? pod[0].name : "冇人參賽";
  $("podium").innerHTML = pod
    .map((p, i) => {
      const place = i + 1;
      const order = { 1: 2, 2: 1, 3: 3 }[place];
      return `<div class="pod p${place}" style="animation-delay:${i * 90}ms">
        <div class="who">${esc(p.name)}</div>
        <div class="pts">${p.score.toLocaleString()} 分</div>
        <div class="base">${place}</div>
      </div>`;
    })
    .join("");
}

/* ══════════════════════════════════════════
   控制
   ══════════════════════════════════════════ */
$("next-btn").addEventListener("click", () => socket.emit("host_next"));
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === "Enter") {
    e.preventDefault();
    if (!$("next-btn").disabled) socket.emit("host_next");
  }
});
$("quiz-picker").addEventListener("change", (e) => {
  socket.emit("host_switch_quiz", { quiz_id: e.target.value });
});

/* ── 小工具 ── */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hashName(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
let toastT = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ══════════════════════════════════════════
   開機：攞 PIN → 建立房間連線
   ══════════════════════════════════════════ */
(async function boot() {
  let pin = new URLSearchParams(location.search).get("pin");
  if (!pin || !/^\d{6}$/.test(pin)) {
    try {
      const r = await fetch("/api/new");
      const d = await r.json();
      if (!d.pin) throw new Error(d.error || "開房失敗");
      pin = d.pin;
    } catch (e) {
      alert("開房失敗：" + (e && e.message ? e.message : e));
      return;
    }
    history.replaceState(null, "", "/host?pin=" + pin);
  }
  socket.connect(pin, "host");
})();
