(function () {
  function e(e) {
    return typeof e == `object` && !!e && !Array.isArray(e);
  }
  function t(t) {
    if (!e(t)) return !1;
    let n = Object.getPrototypeOf(t);
    return n === Object.prototype || n === null;
  }
  function n(e, r = new WeakSet()) {
    if (e === null || typeof e == `string` || typeof e == `boolean`) return !0;
    if (typeof e == `number`) return Number.isFinite(e);
    if (typeof e != `object` || r.has(e)) return !1;
    r.add(e);
    try {
      return (Array.isArray(e) ? e : t(e) ? Object.values(e) : null)?.every((e) => n(e, r)) ?? !1;
    } catch {
      return !1;
    } finally {
      r.delete(e);
    }
  }
  function r(e) {
    return n(e) ? e : void 0;
  }
  function i(t) {
    return e(t) && Array.isArray(t.content);
  }
  function a(e) {
    if (typeof e == `string`) return e;
    try {
      return JSON.stringify(e) ?? String(e);
    } catch {
      return String(e);
    }
  }
  function o(e) {
    if (i(e)) return e;
    let t = r(e);
    return {
      content: [{ type: `text`, text: a(e) }],
      ...(t === void 0 ? {} : { structuredContent: t }),
      isError: !1,
    };
  }
  function s(e) {
    return !!e && typeof e == `object` && !Array.isArray(e);
  }
  function c() {
    return typeof crypto < `u` && typeof crypto.randomUUID == `function`
      ? crypto.randomUUID()
      : `${String(Date.now())}_${String(Math.random()).slice(2, 10)}`;
  }
  let l = `[data-webmcp-relay]`,
    u = `__webmcp_relay_tab_id`,
    d = null,
    f;
  function p() {
    return document.currentScript instanceof HTMLScriptElement ? document.currentScript : null;
  }
  let m = p(),
    h = m ? m.hasAttribute(`data-debug`) : !1;
  function g(...e) {
    h && console.warn(`[webmcp-relay-embed]`, ...e);
  }
  function _() {
    try {
      let e = sessionStorage.getItem(u);
      if (e) return e;
    } catch (e) {
      g(`sessionStorage read failed, tab ID will not persist:`, e);
    }
    let e = c();
    try {
      sessionStorage.setItem(u, e);
    } catch (e) {
      g(`sessionStorage write failed:`, e);
    }
    return e;
  }
  function v(e) {
    if (e?.src)
      try {
        return new URL(`widget.html`, e.src).href;
      } catch (e) {
        g(`Failed to resolve widget URL from script src, falling back to CDN:`, e);
      }
    else g(`Script element has no src attribute, falling back to CDN widget URL.`);
    return `https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay/dist/browser/widget.html`;
  }
  function y(e) {
    let t = v(e),
      n = e?.getAttribute(`data-relay-id`) || void 0,
      r = e?.getAttribute(`data-relay-workspace`) || void 0,
      i = e?.getAttribute(`data-request-timeout`) || void 0;
    return {
      autoConnect: e?.getAttribute(`data-auto-connect`) !== `false`,
      relayHost: e?.getAttribute(`data-relay-host`) || `127.0.0.1`,
      relayPort: e?.getAttribute(`data-relay-port`) || `9333`,
      ...(n ? { relayId: n } : {}),
      ...(r ? { relayWorkspace: r } : {}),
      ...(i ? { requestTimeout: i } : {}),
      tabId: _(),
      widgetUrl: t,
      widgetOrigin: new URL(t).origin,
    };
  }
  function b(e) {
    if (typeof e != `string` || e.length === 0) return { type: `object`, properties: {} };
    try {
      let t = JSON.parse(e);
      return s(t) ? t : { type: `object`, properties: {} };
    } catch (t) {
      return (
        g(`Tool inputSchema is not valid JSON:`, typeof e == `string` ? e.slice(0, 200) : e, t),
        { type: `object`, properties: {} }
      );
    }
  }
  function x(e) {
    return s(e) ? e : (e != null && g(`Tool invocation args must be an object, got`, typeof e), {});
  }
  function S(e) {
    return { name: e.name, description: e.description, inputSchema: b(e.inputSchema) };
  }
  function C(e) {
    if (e === null)
      return {
        isError: !0,
        content: [{ type: `text`, text: `Tool execution interrupted by navigation` }],
      };
    let t;
    try {
      t = JSON.parse(e);
    } catch {
      t = e;
    }
    return o(t);
  }
  function w(e) {
    return !!(e && `executeTool` in e && typeof e.executeTool == `function`);
  }
  function T() {
    let e = document.modelContext;
    return w(e) ? e : void 0;
  }
  function E(e) {
    return `elicitInput` in e && typeof e.elicitInput == `function`;
  }
  async function D() {
    let e = T();
    return e ? (await e.getTools()).map(S) : [];
  }
  async function O(e, t) {
    let n = T();
    if (!n) throw Error(`No executable WebMCP runtime found on this page`);
    let r = (await n.getTools()).find((t) => t.name === e);
    if (!r) throw Error(`Tool not found: ${e}`);
    return C(await n.executeTool(r, JSON.stringify(t)));
  }
  let k = !1,
    A = 0,
    j = null,
    M = ``;
  function N(e) {
    if (typeof e != `object` || !e) return JSON.stringify(e) ?? `undefined`;
    if (Array.isArray(e)) return `[${e.map(N).join(`,`)}]`;
    let t = e;
    return `{${Object.keys(t)
      .sort()
      .map((e) => `${JSON.stringify(e)}:${N(t[e])}`)
      .join(`,`)}}`;
  }
  function P(e) {
    return e.map(N).sort().join(`
`);
  }
  function F() {
    k = !1;
    let e = A;
    D()
      .then((t) => {
        if (e !== A) return;
        let n = P(t);
        n === M ||
          !d ||
          ((M = n), d.postMessage({ type: `webmcp.tools.changed`, tools: t }, f.widgetOrigin));
      })
      .catch((e) => {
        g(`Failed to sync tool changes:`, e);
      });
  }
  function I() {
    (A++, !k && ((k = !0), setTimeout(F, 0)));
  }
  function L() {
    j || (j = setInterval(I, 2e3));
  }
  function R() {
    try {
      return (document.modelContext.addEventListener(`toolchange`, I), !0);
    } catch (e) {
      return (g(`addEventListener on modelContext threw:`, e), !1);
    }
  }
  function z() {
    if ((L(), I(), R())) return;
    let e = 0,
      t = 100,
      n = () => {
        setTimeout(() => {
          if ((e++, !R())) {
            if (e >= 40) {
              g(
                `Could not subscribe to tool changes after 40 retries. Dynamic tool updates will rely on polling.`
              );
              return;
            }
            ((t = Math.min(Math.round(t * 1.5), 1e3)), n());
          }
        }, t);
      };
    n();
  }
  function B(e, t, n) {
    !e || typeof e != `object` || !(`postMessage` in e) || e.postMessage(n, t);
  }
  function V(e) {
    return !s(e) || typeof e.requestId != `string` || typeof e.type != `string`
      ? null
      : { requestId: e.requestId, type: e.type, toolName: e.toolName, args: e.args };
  }
  function H(e, t) {
    D()
      .then((n) => {
        B(t.source, t.origin, {
          type: `webmcp.tools.list.response`,
          requestId: e.requestId,
          tools: n,
        });
      })
      .catch((n) => {
        (g(`Failed to list tools:`, n),
          B(t.source, t.origin, {
            type: `webmcp.tools.list.response`,
            requestId: e.requestId,
            tools: [],
            error: `Failed to list tools: ${n instanceof Error ? n.message : String(n)}`,
          }));
      });
  }
  let U = !1;
  function W(e, t) {
    if (U) return;
    let n = document.modelContext;
    if (!E(n)) {
      g(`Elicitation bridge not installed: elicitInput not available on modelContext`);
      return;
    }
    ((n.elicitInput = (n, r) => {
      let i = K();
      return new Promise((r) => {
        let a = () => {
            (window.removeEventListener(`message`, c), clearTimeout(o));
          },
          o = setTimeout(() => {
            (a(),
              g(`Elicitation request timed out after 60s`),
              r({ action: `decline`, content: null }));
          }, 6e4),
          c = (e) => {
            if (e.origin !== t) return;
            let n = e.data;
            !s(n) ||
              n.type !== `webmcp.elicitation.response` ||
              n.callId !== i ||
              (a(), r(s(n.result) ? n.result : { action: `decline`, content: null }));
          };
        (window.addEventListener(`message`, c),
          B(e, t, { type: `webmcp.elicitation.request`, callId: i, params: n }));
      });
    }),
      (U = !0),
      g(`Elicitation bridge installed`));
  }
  let G = 0;
  function K() {
    return ((G += 1), `elicit_${String(Date.now())}_${String(G)}`);
  }
  function q(e, t) {
    if (!T()) {
      B(t.source, t.origin, {
        type: `webmcp.tools.invoke.error`,
        requestId: e.requestId,
        error: `No executable WebMCP runtime found on this page`,
      });
      return;
    }
    (t.source && W(t.source, t.origin),
      O(String(e.toolName ?? ``), x(e.args))
        .then((n) => {
          B(t.source, t.origin, {
            type: `webmcp.tools.invoke.response`,
            requestId: e.requestId,
            result: s(n) ? n : {},
          });
        })
        .catch((n) => {
          B(t.source, t.origin, {
            type: `webmcp.tools.invoke.error`,
            requestId: e.requestId,
            error: String(n instanceof Error ? n.message : n),
          });
        }));
  }
  async function J(e) {
    if (document.querySelector(l)) return;
    let t = new URLSearchParams();
    (t.set(`tabId`, e.tabId), t.set(`hostOrigin`, window.location.origin));
    let n = new URL(window.location.href);
    ((n.search = ``),
      (n.hash = ``),
      t.set(`hostUrl`, n.href),
      t.set(`hostTitle`, document.title || ``),
      t.set(`relayHost`, e.relayHost),
      t.set(`relayPort`, e.relayPort),
      t.set(`autoConnect`, e.autoConnect ? `true` : `false`),
      e.relayId && t.set(`relayId`, e.relayId),
      e.relayWorkspace && t.set(`relayWorkspace`, e.relayWorkspace),
      e.requestTimeout && t.set(`requestTimeout`, e.requestTimeout));
    let r = null;
    try {
      let n = await fetch(e.widgetUrl);
      if (!n.ok)
        console.warn(
          `[webmcp-relay-embed] Widget HTML fetch returned ${String(n.status)}; falling back to direct iframe src.`
        );
      else {
        let i = await n.text(),
          a = `<script>window.__WEBMCP_RELAY_CONFIG=${JSON.stringify(Object.fromEntries(t))};</script>`,
          o = new Blob([i.replace(`</head>`, `${a}</head>`)], { type: `text/html` });
        ((r = URL.createObjectURL(o)), (e.widgetOrigin = window.location.origin));
      }
    } catch (e) {
      g(`Failed to fetch widget HTML for blob URL:`, e);
    }
    let i = document.createElement(`iframe`);
    ((i.src = r ?? `${e.widgetUrl}?${t.toString()}`),
      (i.style.display = `none`),
      i.setAttribute(`aria-hidden`, `true`),
      i.setAttribute(`data-webmcp-relay`, `1`),
      i.setAttribute(`allow`, `loopback-network; local-network; local-network-access`),
      document.body.appendChild(i),
      (d = i.contentWindow),
      i.addEventListener(`load`, () => {
        ((d = i.contentWindow), r && URL.revokeObjectURL(r));
      }),
      i.addEventListener(`error`, () => {
        (console.error(
          `[webmcp-relay-embed] Failed to load relay widget iframe from:`,
          i.src,
          `-- WebMCP tools will NOT be relayed. Check network connectivity and widget URL.`
        ),
          r && URL.revokeObjectURL(r));
      }));
  }
  if (!document.querySelector(l)) {
    try {
      f = y(m);
    } catch (e) {
      throw (console.error(`[webmcp-relay-embed] Failed to initialize relay configuration:`, e), e);
    }
    window.addEventListener(`message`, (e) => {
      if (e.origin !== f.widgetOrigin || !d || e.source !== d) return;
      let t = e.data;
      if (s(t) && t.type === `webmcp.reload`) {
        window.location.reload();
        return;
      }
      let n = V(e.data);
      if (n) {
        if (n.type === `webmcp.tools.list.request`) {
          H(n, e);
          return;
        }
        n.type === `webmcp.tools.invoke.request` && q(n, e);
      }
    });
    let e = () => {
      J(f).catch((e) => {
        console.error(`[webmcp-relay-embed] Failed to inject relay widget:`, e);
      });
    };
    (document.body ? e() : document.addEventListener(`DOMContentLoaded`, e, { once: !0 }),
      z(),
      document.addEventListener(`visibilitychange`, () => {
        document.visibilityState === `visible` &&
          d &&
          d.postMessage({ type: `webmcp.connect` }, f.widgetOrigin);
      }));
  }
})();
