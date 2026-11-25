/**
 * WebSocket-based query evaluation for eXide.
 *
 * Uses the /ws/eval endpoint introduced in eXist-db's feature/websocket-eval.
 * Provides streaming results, progress updates, and cancellation.
 *
 * Protocol:
 *   Client → { action: "eval", id, query, "module-load-path", serialization, streaming }
 *   Server → { type: "progress", id, phase, items, elapsed }
 *   Server → { type: "result", id, chunk, data, more, items, timing }
 *   Server → { type: "error", id, code, message, line, column }
 *   Client → { action: "cancel", id }
 *   Server → { type: "cancelled", id }
 *
 * When the WebSocket endpoint is unavailable, execute() returns null and the
 * caller falls back to the existdb-openapi /api/query cursor.
 */

import { eXide } from "./namespace.js";

export const wsEval = (function () {
    let socket = null;
    let connected = false;
    let url = null;
    let activeQueryId = null;
    let handlers = {};  // keyed by query id
    let reconnectTimer = null;
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    // Whether we've received a real application message on the current
    // connection. Used to gate the backoff reset in onopen so a server that
    // accepts the WS upgrade and immediately drops the connection can't
    // sustain a fast open→close→reset→open loop.
    let sessionEstablished = false;

    /**
     * Connect to the /ws/eval endpoint.
     */
    function connect(wsUrl) {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        url = wsUrl;
        console.log("[ws-eval] Connecting to", wsUrl);

        try {
            socket = new WebSocket(wsUrl);
        } catch (e) {
            console.warn("[ws-eval] WebSocket not available:", e.message);
            return;
        }

        socket.onopen = function () {
            connected = true;
            sessionEstablished = false;
            // NB: do NOT reset reconnectDelay or reconnectAttempts here.
            // Reset only when we've actually exchanged an application message
            // (see onmessage). Otherwise a server that accepts the WebSocket
            // upgrade and then immediately closes will reset our backoff every
            // reconnect, producing an infinite fast loop.
            console.log("[ws-eval] Connected");
        };

        socket.onmessage = function (event) {
            if (event.data === "ping") return;

            // First real message confirms the server is alive on this endpoint:
            // safe to reset the backoff counters now.
            if (!sessionEstablished) {
                sessionEstablished = true;
                reconnectDelay = 1000;
                reconnectAttempts = 0;
            }

            try {
                const msg = JSON.parse(event.data);
                const id = msg.id;
                if (id && handlers[id]) {
                    const h = handlers[id];
                    switch (msg.type) {
                        case "progress":
                            if (h.onProgress) h.onProgress(msg);
                            break;
                        case "result":
                            if (h.onResult) h.onResult(msg);
                            if (!msg.more) {
                                delete handlers[id];
                                if (activeQueryId === id) activeQueryId = null;
                            }
                            break;
                        case "error":
                            if (h.onError) h.onError(msg);
                            delete handlers[id];
                            if (activeQueryId === id) activeQueryId = null;
                            break;
                        case "cancelled":
                            if (h.onCancelled) h.onCancelled(msg);
                            delete handlers[id];
                            if (activeQueryId === id) activeQueryId = null;
                            break;
                    }
                }
            } catch (e) {
                console.warn("[ws-eval] Failed to parse message:", e);
            }
        };

        socket.onclose = function (event) {
            connected = false;
            console.log("[ws-eval] Disconnected (code:", event.code, ")");
            // Notify any pending queries that the connection dropped
            Object.keys(handlers).forEach((id) => {
                if (handlers[id].onError) {
                    handlers[id].onError({ type: "error", id, message: "WebSocket disconnected" });
                }
            });
            handlers = {};
            activeQueryId = null;
            scheduleReconnect();
        };

        socket.onerror = function () {
            console.warn("[ws-eval] Connection error");
        };
    }

    /**
     * Auto-connect: derive the eval WebSocket URL from the current page URL.
     */
    function autoConnect() {
        const loc = window.location;
        const rootContext = loc.pathname.replace(/^(.*?)\/apps\/.*$/, "$1");
        const wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${loc.host}${rootContext}/ws/eval`;
        connect(wsUrl);
    }

    /**
     * Execute a query via WebSocket.
     *
     * @param {Object} opts
     * @param {string} opts.query - XQuery source code
     * @param {string} opts.moduleLoadPath - module load path (e.g. "xmldb:exist:///db")
     * @param {string} opts.serialization - serialization method (e.g. "adaptive")
     * @param {function} opts.onProgress - called with progress messages
     * @param {function} opts.onResult - called with result chunks
     * @param {function} opts.onError - called with error messages
     * @param {function} opts.onCancelled - called when query is cancelled
     * @returns {string|null} query ID, or null if not connected
     */
    function execute(opts) {
        if (!connected || !socket) return null;

        const id = `q-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        activeQueryId = id;

        handlers[id] = {
            onProgress: opts.onProgress,
            onResult: opts.onResult,
            onError: opts.onError,
            onCancelled: opts.onCancelled
        };

        const msg = {
            action: "eval",
            id,
            query: opts.query,
            "module-load-path": opts.moduleLoadPath,
            serialization: { method: opts.serialization || "adaptive" },
            streaming: true
        };

        socket.send(JSON.stringify(msg));
        return id;
    }

    /**
     * Cancel the currently running query.
     */
    function cancel(id) {
        if (!connected || !socket) return;
        const cancelId = id || activeQueryId;
        if (!cancelId) return;

        socket.send(JSON.stringify({
            action: "cancel",
            id: cancelId
        }));
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        if (!url) return;
        if (reconnectAttempts >= maxReconnectAttempts) {
            console.warn(`[ws-eval] Giving up after ${reconnectAttempts} reconnect attempts — server endpoint appears unavailable. ` +
                `Call wsEval.connect(url) explicitly to retry.`);
            url = null;  // prevent further reconnects until someone re-arms
            return;
        }

        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            console.log(`[ws-eval] Reconnecting (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
            connect(url);
        }, reconnectDelay);

        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    }

    /**
     * Disconnect from the eval WebSocket and stop reconnecting.
     */
    function disconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        url = null;
        if (socket) {
            socket.close();
            socket = null;
        }
        connected = false;
        handlers = {};
        activeQueryId = null;
    }

    return {
        autoConnect,
        connect,
        disconnect,
        execute,
        cancel,
        isConnected () { return connected; },
        getActiveQueryId () { return activeQueryId; }
    };
}());


// Register on the global `eXide` object (see namespace.js)
eXide.wsEval = Object.assign(wsEval, eXide.wsEval);
