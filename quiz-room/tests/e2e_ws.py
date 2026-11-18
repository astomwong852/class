"""
Workers 版端到端測試（原生 WebSocket）
用法：
    python tests/e2e_ws.py [base_ws] [base_http]
預設： ws://127.0.0.1:8787 / http://127.0.0.1:8787
"""
import json
import sys
import threading
import time
import urllib.request

import websocket

WS_BASE = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8787"
HTTP_BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8787"

FAIL = []
EVENTS = {}


def check(cond, msg):
    print(("  ✅ " if cond else "  ❌ ") + msg)
    if not cond:
        FAIL.append(msg)


class Client:
    """一條 WebSocket 連線 + 事件收集"""

    def __init__(self, pin, role="player"):
        self.events = {}
        self.lock = threading.Lock()
        self.url = f"{WS_BASE}/ws?pin={pin}&role={role}"
        self.ws = websocket.create_connection(self.url, timeout=60)
        self.alive = True
        self.t = threading.Thread(target=self._reader, daemon=True)
        self.t.start()

    def _reader(self):
        while self.alive:
            try:
                raw = self.ws.recv()
                if not raw:
                    break
                m = json.loads(raw)
                with self.lock:
                    self.events.setdefault(m["t"], []).append(m.get("d"))
            except Exception:
                break

    def send(self, t, d=None):
        try:
            self.ws.send(json.dumps({"t": t, "d": d or {}}))
            return True
        except Exception:
            return False

    def last(self, t):
        with self.lock:
            lst = self.events.get(t)
            return lst[-1] if lst else None

    def count(self, t):
        with self.lock:
            return len(self.events.get(t, []))

    def wait(self, t, n=1, timeout=12):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.count(t) >= n:
                return self.last(t)
            time.sleep(0.04)
        return None

    def close(self):
        self.alive = False
        try:
            self.ws.close(timeout=2)
        except Exception:
            try:
                self.ws.shutdown()
            except Exception:
                pass


def new_room():
    with urllib.request.urlopen(HTTP_BASE + "/api/new") as r:
        return json.load(r)["pin"]


def room_info(pin):
    with urllib.request.urlopen(f"{HTTP_BASE}/api/room?pin={pin}") as r:
        return json.load(r)


def main():
    print("=" * 60)
    print("Workers 版端到端測試")
    print("=" * 60)

    pin = new_room()
    print(f"      PIN = {pin}")
    check(len(pin) == 6 and pin.isdigit(), "開房成功，PIN 係 6 位數字")

    host = Client(pin, "host")
    host.send("host_create")
    ready = host.wait("host_ready")
    check(ready is not None, "主持人收到 host_ready")
    if ready:
        check(ready["pin"] == pin, "PIN 一致")
        check(len(ready.get("quizzes", [])) >= 3, f"題庫 {len(ready.get('quizzes', []))} 個")

    # 換去數學題庫（6 題）
    host.send("host_switch_quiz", {"quiz_id": "math"})
    time.sleep(0.6)

    # 三個玩家
    players = []
    for nm in ["阿明", "小美", "大舊"]:
        c = Client(pin)
        c.send("player_join", {"pin": pin, "name": nm})
        j = c.wait("joined")
        check(j is not None, f"玩家「{nm}」加入")
        players.append(c)
        time.sleep(0.2)

    # 重複名
    dup = Client(pin)
    dup.send("player_join", {"pin": pin, "name": "阿明"})
    dj = dup.wait("joined")
    check(dj is not None and dj["name"] == "阿明2", f"重複名自動改成「{dj['name'] if dj else '?'}」")
    dup.send("player_leave")
    time.sleep(0.6)
    dup.close()

    info = room_info(pin)
    check(info["players"] == 3, f"離場玩家已剔除（剩 {info['players']} 人）")

    # 錯 PIN
    bad_ws = websocket.create_connection(f"{WS_BASE}/ws?pin=000000&role=player", timeout=8)

    # 開波
    host.send("host_next")
    q0 = host.wait("question")
    check(q0 is not None, "第一題已派發")
    check(q0 and "correct" not in json.dumps(q0), "題目冇泄漏正解")

    # 正解表（同 src/quizzes.js 一致）
    MATH = [1, 1, 1, 2, 1, 2]

    for qi in range(3):
        if qi > 0:
            host.send("host_next")
        q = host.wait("question", n=qi + 1)
        check(q is not None and q["index"] == qi, f"第 {qi+1} 題派到")

        picks = [MATH[qi], (MATH[qi] + 1) % 4, MATH[qi]]
        for p, pick in zip(players, picks):
            p.send("player_answer", {"choice": pick})
            time.sleep(0.15)

        rv = host.wait("reveal", n=qi + 1)
        check(rv is not None, f"第 {qi+1} 題揭曉")
        if rv:
            check(rv["correct"] == MATH[qi], f"第 {qi+1} 題正解索引 {rv['correct']}")
            check(sum(rv["distribution"]) == 3, f"分佈總數 = 3")
            check(rv["distribution"][MATH[qi]] == 2, f"答對人數 = 2")

        for p, pick in zip(players, picks):
            yr = p.wait("your_result", n=qi + 1)
            if yr:
                ok = pick == MATH[qi]
                check(yr["correct"] == ok, f"{p is players[0] and '阿明' or ''} 結果正確")

        time.sleep(0.4)

    # 快速推進到 final（每步查真實 state，唔靠猜次數）
    for _ in range(20):
        info = room_info(pin)
        if info.get("state") == "final":
            break
        host.send("host_next")
        time.sleep(1.6)

    over = host.wait("game_over", timeout=15)
    check(over is not None, "收到 game_over")
    if over:
        pod = over["podium"]
        check(len(pod) >= 2, f"頒獎台 {len(pod)} 人")
        scores = [p["score"] for p in pod]
        check(scores == sorted(scores, reverse=True), f"排行榜有序 {scores}")
        check(pod[0]["score"] > 0, f"冠軍有分（{pod[0]['name']} {pod[0]['score']}）")

    for c in players + [host]:
        c.close()
    try:
        bad_ws.close()
    except Exception:
        pass

    print("=" * 60)
    if FAIL:
        print(f"❌ {len(FAIL)} 項失敗")
        for f in FAIL:
            print("   -", f)
        sys.exit(1)
    print("✅ 全部通過")
    print("=" * 60)


if __name__ == "__main__":
    main()
