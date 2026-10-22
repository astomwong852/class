# 課堂網頁

俾學生掃 QR Code 上堂用嘅靜態網頁，托管喺 GitHub Pages。

## 網址

```
https://<你的帳號>.github.io/<repo名>/
```

## 加一個新活動（3 步）

1. 將 HTML 檔放入呢個資料夾，例如 `microbit-quiz.html`
2. 開 `index.html`，喺 `ACTIVITIES` 陣列加一行：

   ```js
   { title: "micro:bit 小測", desc: "五年級 · 10 題", file: "microbit-quiz.html", icon: "🧪" },
   ```

3. 部署：

   ```bash
   ./deploy.sh "加 micro:bit 小測"
   ```

之後開 `index.html` 嗰頁就見到新卡，或者直接用 `https://.../microbit-quiz.html` 都得。

## 生成 QR Code

```bash
# 只做入口頁一個 QR
python qr.py https://xxx.github.io/class-hub/ 課堂入口

# 入口頁 + 每個活動各一個 QR
python qr.py --all https://xxx.github.io/class-hub/
```

PNG 會放喺 `qr/`，可以直接投影或者列印。

## 注意

- **更新後學生可能睇到舊版**：Pages 部署約 30–60 秒，之後叫學生強制刷新。iPad Safari 可以「設定 → Safari → 清除瀏覽記錄」或者長按 reload。
- **檔名用英文**：避免中文檔名喺 URL 上出現 %E4%B8%AD 之類，QR 會變密、難掃。
- **純靜態**：冇後端。要收答案／計分就用 `localStorage` + 匯出 JSON，或者配 Google Form。
- **檔案大小**：整個 repo 建議 < 1GB（GitHub Pages 硬上限）。相片放上網前先壓。
- 所有頁面自動 HTTPS，唔使另外設定。
