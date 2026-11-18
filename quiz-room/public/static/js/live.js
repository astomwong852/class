/**
 * live.js — 原生 WebSocket 客戶端（模擬 socket.io 介面）
 *
 * 原本個 Flask 版用 socket.io；搬上 Cloudflare Workers 之後只用原生 WebSocket。
 * 呢個 shim 令 host.js / play.js 唔需要大改。
 *
 *   const sock = LIVE.create();
 *   sock.on("connect", ...); sock.emit("host_create"); sock.connect(PIN, "host");
 *
 * connect() 之前嘅 on() / emit() 會先 buffer，連線後自動補發。
 */
(function () {
  "use strict";

  function raw(pin, role) {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var url = proto + "//" + location.host + "/ws?pin=" + encodeURIComponent(pin) + "&role=" + role;
    var listeners = {};
    var ws = null;
    var open = false;
    var closed = false;
    var retry = 0;

    function fire(t, d) {
      var arr = listeners[t];
      if (!arr) return;
      arr.slice().forEach(function (fn) {
        try {
          fn(d);
        } catch (e) {
          console.error("[live]", t, e);
        }
      });
    }

    function dial() {
      try {
        ws = new WebSocket(url);
      } catch (e) {
        setTimeout(dial, 1500);
        return;
      }
      ws.onopen = function () {
        open = true;
        retry = 0;
        fire("connect", {});
      };
      ws.onmessage = function (ev) {
        var m;
        try {
          m = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (m && m.t) fire(m.t, m.d);
      };
      ws.onclose = function () {
        open = false;
        fire("disconnect", {});
        if (!closed) {
          var wait = Math.min(10000, 500 * Math.pow(1.7, retry++));
          setTimeout(dial, wait);
        }
      };
      ws.onerror = function () {};
    }

    dial();

    var api = {
      on: function (t, fn) {
        (listeners[t] || (listeners[t] = [])).push(fn);
        return api;
      },
      off: function (t, fn) {
        if (listeners[t]) listeners[t] = listeners[t].filter(function (x) { return x !== fn; });
        return api;
      },
      emit: function (t, d) {
        if (!open) return false;
        try {
          ws.send(JSON.stringify({ t: t, d: d || {} }));
          return true;
        } catch (e) {
          return false;
        }
      },
      close: function () {
        closed = true;
        try { ws.close(); } catch (e) {}
      },
    };
    Object.defineProperty(api, "connected", { get: function () { return open; } });
    return api;
  }

  function create() {
    var handlers = [];
    var pending = [];
    var real = null;
    var curPin = null;
    var curRole = null;

    function flush() {
      var q = pending.splice(0);
      q.forEach(function (item) { real.emit(item.t, item.d); });
    }

    var api = {
      on: function (t, fn) {
        handlers.push([t, fn]);
        if (real) real.on(t, fn);
        return api;
      },
      emit: function (t, d) {
        if (real && real.connected) real.emit(t, d);
        else pending.push({ t: t, d: d });
        return api;
      },
      connect: function (pin, role) {
        if (real && curPin === pin && curRole === role) return api;
        if (real) {
          try { real.close(); } catch (e) {}
          real = null;
        }
        curPin = pin;
        curRole = role;
        real = raw(pin, role);
        handlers.forEach(function (h) { real.on(h[0], h[1]); });
        real.on("connect", flush);
        return api;
      },
      close: function () {
        if (real) real.close();
      },
    };
    Object.defineProperty(api, "connected", {
      get: function () { return !!(real && real.connected); },
    });
    return api;
  }

  window.LIVE = { create: create, raw: raw };
  // 舊 code 若仍然寫 io()，都接得住
  window.io = function () { return create(); };
})();
