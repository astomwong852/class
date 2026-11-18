# QuizRoom — Kahoot 風格即時問答（Cloudflare Workers 版）

課堂用嘅即時搶答遊戲：主持人大屏出題，學生手機入 PIN 答題，即時計分排名。
部署喺 Cloudflare Workers，**唔需要自己開電腦做 server**。

## 網址

| 用途 | 網址 |
|---|---|
| 主持人大屏 | https://fk1ps-quiz.fk1ps.workers.dev/host |
| 學生入口 | https://fk1ps-quiz.fk1ps.workers.dev/ |
| 課堂網頁捷徑 | https://fk1ps-class.pages.dev/quiz |

主持人開 `/host` 會自動生成 6 位 PIN + QR Code，學生掃 QR 或入 PIN 就得。

## 架構

```
Cloudflare Workers
├── /api/new        開新房間，生成 PIN
├── /ws             WebSocket（原生，唔用 socket.io）
├── /host           → host.html
├── /                → index.html（學生）
└── Durable Object  每個 PIN 一個實例，房間狀態 + 計時器
```

**每個房間一個 Durable Object**：
- 房間狀態存在 DO storage，凍結／喚醒都唔會唔見
- 倒數用 `storage.setAlarm()`（唔靠 setTimeout，hibernation 都準）
- WebSocket 用 Hibernation API，冇人講嘢時 DO 會休眠，唔計費

前端 `public/static/js/live.js` 係一個 socket.io 風格嘅 shim（原生 WebSocket + 自動重連 + 離線 buffer），所以 `host.js` / `play.js` 同 Flask 版幾乎一樣。

## 部署

```bash
cd quiz-room
wrangler deploy
```

首次部署會建立 Durable Object class（`migrations` 已配置 v1 / SQLite-backed）。

本機測試：
```bash
wrangler dev --port 8787
```

## 加題庫

改 `src/quizzes.js`，加一個 key：

```js
export const QUIZZES = {
  myquiz: {
    title: "我嘅測驗",
    time_limit: 20,
    questions: [
      { text: "題目？", options: ["A","B","C","D"], correct: 1, explanation: "解釋" }
    ],
  },
};
```

`correct` 係 0-based。改完 `wrangler deploy` 生效。

## 計分

- 答對 500–1000 分（越快越高）
- 連對獎金：第 2 題起每題 +100，上限 +500
- 答錯唔扣分，連對歸零

## 測試

```bash
# 本機（要先 wrangler dev）
python tests/e2e_ws.py

# 線上
python tests/e2e_ws.py wss://fk1ps-quiz.fk1ps.workers.dev https://fk1ps-quiz.fk1ps.workers.dev
```

涵蓋：開房、加入、重複名、離場剔除、出題、計分、揭曉、分佈、排行榜、最終排名。

壓力測試／demo（加 N 個機械人）：
```bash
python tests/bots_ws.py <PIN> 20
```

## 限制

- 房間資料會一直留喺 DO storage（每個房間幾 KB）。要清就喺 DO 加 TTL alarm，或者喺 dashboard 刪。
- 免費 plan：Workers 100k req/日、DO 有 CPU 同儲存額度 — 一節課（40 人 × 10 題）遠遠用唔到。
- 冇帳號系統，任何人知 PIN 都可以入（課堂用足夠）。
