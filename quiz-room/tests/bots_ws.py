"""
線上版機械人玩家（原生 WebSocket / wss）
用法： python tests/bots_ws.py <PIN> [數量] [host]
      host 預設 fk1ps-quiz.fk1ps.workers.dev
"""
import json
import random
import sys
import threading
import time

import websocket

PIN = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 5
HOST = sys.argv[3] if len(sys.argv) > 3 else "fk1ps-quiz.fk1ps.workers.dev"
NAMES = ["陳大文", "阿Grace", "Kelvin", "肥仔", "Miss Ho", "阿強", "Siri", "呀豪"]

threads = []


def run_bot(name):
    ws = websocket.create_connection(
        f"wss://{HOST}/ws?pin={PIN}&role=player", timeout=120
    )
    ws.send(json.dumps({"t": "player_join", "d": {"pin": PIN, "name": name}}))
    print(f"bot {name} 已連線", flush=True)

    while True:
        try:
            raw = ws.recv()
        except Exception:
            break
        if not raw:
            break
        try:
            m = json.loads(raw)
        except Exception:
            continue
        if m.get("t") == "question":
            d = m.get("d") or {}
            n = len(d.get("options") or [])
            if not n:
                continue

            def answer():
                time.sleep(random.uniform(1.0, 3.2))
                try:
                    ws.send(json.dumps({"t": "player_answer", "d": {"choice": random.randrange(n)}}))
                except Exception:
                    pass

            threading.Thread(target=answer, daemon=True).start()


for i in range(N):
    nm = NAMES[i % len(NAMES)]
    t = threading.Thread(target=run_bot, args=(nm,), daemon=True)
    t.start()
    threads.append(t)
    time.sleep(0.25)

print(f"{N} 個機械人就緒（PIN {PIN}）", flush=True)
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    pass
