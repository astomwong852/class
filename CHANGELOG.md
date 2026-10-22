# 變更記錄（課堂網頁 hub）

> ⚠️ **多個 Hermes session 會同時改呢個資料夾。**
> 每次動手前：`git pull --rebase` → 睇下面最新一條 → 只改自己負責嘅檔。
> **`index.html` 用 patch 加一行，唔好整份覆寫**（會蓋走另一個 session 加嘅卡片）。

---

## 2026-10-23 06:03 — 雙托管同步（Cloudflare Pages）

用戶嘅 QR 已改指短網址 `https://fk1ps-class.pages.dev/`，但 Cloudflare Pages 當時仍係**舊 AI 味版本**（home 3833B、課件 449059B）。已重新部署同步：

```
wrangler pages deploy . --project-name fk1ps-class --branch main
```

**實測一致（兩邊同版本）：**

| 托管 | 入口 | 課件 | 版本特徵 |
|:--|:--|:--|:--|
| GitHub Pages | 4567B | 452905B | `clip-path` ✓ `topbar` ✓ `ol.acts` ✓ |
| Cloudflare 短網址 | 4567B | 453332B | 同上 ✓ |

⚠️ **教訓：改完要兩邊一齊部署。** 只 push GitHub 而唔 redeploy Cloudflare，學生掃 QR（指短網址）會見到舊版。部署後必用 `curl` grep 新舊特徵字驗證。

---

## 2026-10-23 06:00 — 視覺改版：去 AI 味 + Apple 工藝（用戶指定 C 版）

**檔案：** `renwen-p4-l5-desertification.html`（課件）、`index.html`（入口頁）

用戶回饋：「網頁好重 AI 味」。逐項拆掉：

| AI 味元素 | 改成 |
|:--|:--|
| 三段式漸變背景 | 純白紙底（`#fff`） |
| 卡片 + `box-shadow` + 16px 圓角 | 只用 1px 細線分節（教科書做法） |
| pill 標籤（999px 圓角綠底白字） | 節號 `1 2 3` + 粗體標題 |
| emoji 當圖標（📊 🔎 ✅） | 全部移除 |
| 四條色線（米／綠／沙／深綠） | 只 2 色：墨黑 + 赭紅 `#8a3324` |
| 每張卡同 padding 同節奏 | 圖片加「圖 1／圖 2」編號、來源 11.5px 灰細字 |
| 硬 px 間距 | 全部改 `rem`（尊重 Dynamic Type） |

Apple 工藝（`apple-design-web` skill 逐條落地）：

| 條目 | 做法 | 實測 |
|:--|:--|:--|
| §1 Response | `.opt:active{scale(.985)}`、110ms 具名 transition | ✅ |
| §2 1:1 跟手 | Pointer Events + `setPointerCapture` | ✅ 拖到 80% → clip 20% |
| §3 可中斷 | 由當前值開始，唔用 transition 鎖手勢 | ✅ 中途反拖正常 |
| §4 Spring | `cubic-bezier(.34,1.42,.64,1)`（damping ~0.8） | ✅ 放手停 80%、knob 回 scale(1) |
| §9 Rubber-band | `1-e^(-x/0.35)` 漸進阻力 | ✅ 超界只 1.58%，回彈到 0 |
| §10 Hysteresis | 6px 門檻 + 方向判斷 | ✅ 縱向拖唔搶頁面滾動 |
| §11 Compositor | 由 `width`/`left` 改 `clip-path` + `transform` | ✅ 唔再 layout thrash |
| §12 材質層級 | sticky `blur(18px) saturate(180%)` + scroll edge 陰影 | ✅ scroll 1200 後 `top:0` |
| §14 無障礙 | `prefers-reduced-motion` / `-transparency` / `-contrast` | ✅ |
| §15 字體數學 | `clamp()` fluid type、大標 `-0.018em`、正文 tracking 0 | ✅ |
| §16 Craft | 系統字、`:focus-visible` | ✅ |

**順手修 bug：** 原 `setTimeout(apply(.5), 60)` 在背景 tab 會被 throttle，用戶拖完放手會被蓋回 50% → 改同步初始化。

**入口頁**：綠色 header + 圓角卡 + emoji → 改為編號清單（`01`、`02`）+ 科目細標籤，同課件同一套視覺。

**另存對照版**（未部署）：`第五課_荒漠化治理_A_講義風.html`、`_B_編輯風.html`

---

## 2026-10-23 05:49 — 第五課課件 v2（修正事實錯誤）

**檔案：** `renwen-p4-l5-desertification.html`

修正（由獨立驗證 agent 揪出）：

| 問題 | 修正 |
|:--|:--|
| ❌ 第二部分「麥草方格」配錯圖 —— 原用圖實為**新疆和田民豐縣後河壩**叠加治理區（2025-04-08，丁磊攝），並非寧夏中衛麥草方格 | 換成**唐希明指導工人鋪設刷狀網繩式草方格**（新華社王鵬攝，2026-04-10，騰格里沙漠東南緣） |
| ❌ 文案「同一片土地」失實 —— 兩圖非同一位置同一角度 | 改「這片沙地」＋加註「上下兩張照片拼接、非同一位置、原圖未標年份」 |
| ⚠️ 「機械鋪設草方格」用詞錯 | 改「**機械編織**」刷狀網繩式草方格（官方用語），並補耐用年期 2–3 年 → 5–6 年 |
| ⚠️ 「第一個大型**林業**生態工程」自行收窄 | 改「第一個大型**生態建設**工程」，加「1978 年 11 月」 |
| ⚠️ 三北定義不夠精確 | 改「西北、華北北部、東北西部」（國家林草局原文） |
| ⚠️ 愛國主義落點薄弱 | 加官方數據：工程區森林覆蓋率 5.05%（1977）→ 13.84%；加草方格 1950 年代包蘭鐵路起源 |
| 🐞 按「上一題」後成績卡仍掛住 | `prev` 加 `final.classList.remove('on')` |
| 🐞 第 5 題答錯不標正確圖 | 改 `querySelectorAll('[data-ok="1"]')`，圖片亦可標綠 |
| 🐞 `touch-action:none` 令 iPad 無法向下滾動 | 改 `pan-y` ＋ 方向判斷（橫向才拉滑桿） |
| 🐞 進度條用 `idx` 不準 | 改按已答題數計 |

**圖片來源（全部真實新聞照片，非 AI 生成）：**
- 毛烏素前／後 — 中國日報 2026-08-28，Uxin Banner Integrated Media Center（上下拼接）
- 工人鋪草方格 — 新華社 王鵬 攝，2026-04-10，寧夏中衛騰格里沙漠東南緣
- 機械編織 — 新華社 王鵬 攝，2026-04-10，中衛沙坡頭區迎水橋鎮黑林村
- 新疆民豐叠加治理區 — 新華社 丁磊 攝，2025-04-08（無人機）

---

## 2026-10-23 05:41 — 第五課課件 v1（初版）

- 首次加入 `renwen-p4-l5-desertification.html`（人文科四年級 單元二 上冊第 5 課 荒漠化治理）
- `index.html` 加入口卡
