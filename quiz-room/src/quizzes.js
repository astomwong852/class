/**
 * 題庫 — 同 app.py 版一致
 * 加題庫：喺呢個 object 加一個 key 就得（key = id）
 */
export const QUIZZES = {
  tech: {
    title: "科技冷知識",
    time_limit: 20,
    questions: [
      { text: "第一代 iPhone 喺邊一年推出？", options: ["2005 年", "2007 年", "2009 年", "2010 年"], correct: 1, explanation: "2007 年 1 月 9 日 Steve Jobs 喺 Macworld 發表，6 月 29 日開賣。" },
      { text: "「HTTP」入面嘅 P 代表咩？", options: ["Port", "Protocol", "Page", "Process"], correct: 1, explanation: "HyperText Transfer Protocol — 超文本傳輸協定。" },
      { text: "1 GB 等於幾多 MB？", options: ["100 MB", "512 MB", "1000 MB", "1024 MB"], correct: 3, explanation: "電腦用二進制：1 GB = 1024 MB。" },
      { text: "Python 程式語言由邊個創造？", options: ["Guido van Rossum", "Linus Torvalds", "James Gosling", "Brendan Eich"], correct: 0, explanation: "Guido van Rossum，1991 年推出第一個版本。" },
      { text: "以下邊一樣「唔係」資料庫？", options: ["MySQL", "PostgreSQL", "React", "SQLite"], correct: 2, explanation: "React 係前端 UI 框架，唔係資料庫。" },
      { text: "CSS 嘅全寫係咩？", options: ["Computer Style Sheets", "Cascading Style Sheets", "Creative Style System", "Coded Style Sheets"], correct: 1, explanation: "Cascading Style Sheets — 層疊樣式表。" },
      { text: "IPv4 位址由幾多個 bit 組成？", options: ["16 bit", "32 bit", "64 bit", "128 bit"], correct: 1, explanation: "IPv4 = 32 bit；IPv6 = 128 bit。" },
      { text: "Linux 核心由邊個發起開發？", options: ["Bill Gates", "Steve Wozniak", "Linus Torvalds", "Richard Stallman"], correct: 2, explanation: "1991 年 Linus Torvalds 喺赫爾辛基大學開始寫。" },
      { text: "程式「bug」呢個詞，最出名嘅起源係咩？", options: ["一隻飛蛾卡喺電腦入面", "一個叫 Bug 嘅工程師", "鍵盤按鍵壞咗", "電線短路"], correct: 0, explanation: "1947 年 Harvard Mark II 入面真係搵到一隻飛蛾。" },
      { text: "以下邊個係「開源」作業系統核心？", options: ["Windows NT", "macOS XNU", "Linux", "iOS"], correct: 2, explanation: "Linux 核心以 GPLv2 授權開源。" },
    ],
  },
  general: {
    title: "生活常識王",
    time_limit: 20,
    questions: [
      { text: "香港最高嘅山係邊座？", options: ["鳳凰山", "大帽山", "太平山", "馬鞍山"], correct: 1, explanation: "大帽山 957 米，係全港最高。" },
      { text: "地球上面積最大嘅海洋係？", options: ["大西洋", "印度洋", "太平洋", "北冰洋"], correct: 2, explanation: "太平洋約佔地球表面 46%。" },
      { text: "咖啡因嘅半衰期大約幾長？", options: ["30 分鐘", "2 小時", "5 小時", "12 小時"], correct: 2, explanation: "約 5 小時，所以下午飲會影響睡眠。" },
      { text: "人體面積最大嘅器官係咩？", options: ["肝臟", "大腦", "皮膚", "肺"], correct: 2, explanation: "皮膚係人體面積同重量最大嘅器官。" },
      { text: "彩虹有幾多種傳統主要顏色？", options: ["5 種", "6 種", "7 種", "8 種"], correct: 2, explanation: "紅橙黃綠藍靛紫，牛頓定嘅七色。" },
      { text: "光喺真空入面嘅速度大約係？", options: ["每秒 3 萬公里", "每秒 30 萬公里", "每秒 300 萬公里", "每秒 3000 公里"], correct: 1, explanation: "約 299,792,458 米／秒。" },
      { text: "以下邊個國家唔係同中國接壤？", options: ["越南", "緬甸", "泰國", "尼泊爾"], correct: 2, explanation: "泰國同中國唔接壤。" },
      { text: "「Ctrl + Z」通常做咩？", options: ["儲存", "復原（Undo）", "重做（Redo）", "全選"], correct: 1, explanation: "Undo；Redo 通常係 Ctrl + Y。" },
      { text: "海水點解係鹹嘅？", options: ["大量鹽類礦物質", "魚嘅排泄物", "陽光蒸發", "海底火山"], correct: 0, explanation: "雨水沖刷岩石帶鹽入海，水分蒸發但鹽留低。" },
      { text: "地球同太陽最遠嘅時候大約喺幾月？", options: ["1 月", "4 月", "7 月", "10 月"], correct: 2, explanation: "遠日點約 7 月初；季節由地軸傾斜決定。" },
    ],
  },
  math: {
    title: "30 秒數學熱身",
    time_limit: 15,
    questions: [
      { text: "17 × 6 = ?", options: ["92", "102", "112", "96"], correct: 1, explanation: "17 × 6 = 102" },
      { text: "2 嘅 10 次方等於？", options: ["512", "1024", "2048", "256"], correct: 1, explanation: "2^10 = 1024" },
      { text: "三角形三個內角加起來係幾多度？", options: ["90°", "180°", "270°", "360°"], correct: 1, explanation: "任何三角形內角和都係 180°。" },
      { text: "0.25 等於幾分之幾？", options: ["1/2", "1/3", "1/4", "1/5"], correct: 2, explanation: "0.25 = 1/4" },
      { text: "圓周率 π 大約等於？", options: ["2.718", "3.142", "1.618", "1.414"], correct: 1, explanation: "π ≈ 3.14159" },
      { text: "144 嘅平方根係？", options: ["10", "11", "12", "14"], correct: 2, explanation: "12 × 12 = 144" },
    ],
  },
};

export function quizList() {
  return Object.entries(QUIZZES).map(([id, q]) => ({
    id,
    title: q.title,
    count: q.questions.length,
  }));
}
