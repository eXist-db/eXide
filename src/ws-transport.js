/**
 * WebSocket transport layer for eXide.
 *
 * Provides a persistent, bidirectional connection to eXist-db for:
 * - Real-time monitoring (query events, metrics)
 * - LSP protocol messages (diagnostics, hover, completions)
 *
 * Falls back gracefully when WebSocket is unavailable.
 *
 * Usage:
 *   eXide.ws.connect("ws://localhost:8080/exist/ws")
 *   eXide.ws.on("exist/metrics", function(data) { ... })
 *   eXide.ws.send("textDocument/hover", { ... }, function(result) { ... })
 */
eXide.namespace("eXide.ws");

eXide.ws = (function () {
    "use strict";

    var socket = null;
    var connected = false;
    var reconnectTimer = null;
    var reconnectDelay = 1000;
    var maxReconnectDelay = 30000;
    var requestId = 0;
    var pendingRequests = {};
    var listeners = {};
    var url = null;

    /**
     * Connect to the WebSocket endpoint.
     */
    function connect(wsUrl) {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        url = wsUrl;
        console.log("[ws] Connecting to", wsUrl);

        try {
            socket = new WebSocket(wsUrl);
        } catch (e) {
            console.warn("[ws] WebSocket not available:", e.message);
            return;
        }

        socket.onopen = function () {
            connected = true;
            reconnectDelay = 1000;
            console.log("[ws] Connected");
            emit("connected", {});
        };

        socket.onmessage = function (event) {
            try {
                var msg = JSON.parse(event.data);

                // Response to a request
                if (msg.id !== undefined && pendingRequests[msg.id]) {
                    var callback = pendingRequests[msg.id];
                    delete pendingRequests[msg.id];
                    if (msg.error) {
                        callback(null, msg.error);
                    } else {
                        callback(msg.result, null);
                    }
                    return;
                }

                // Server-initiated notification
                if (msg.method) {
                    emit(msg.method, msg.params || {});
                }
            } catch (e) {
                console.warn("[ws] Failed to parse message:", e);
            }
        };

        socket.onclose = function (event) {
            connected = false;
            console.log("[ws] Disconnected (code:", event.code, ")");
            emit("disconnected", { code: event.code, reason: event.reason });
            scheduleReconnect();
        };

        socket.onerror = function () {
            console.warn("[ws] Connection error");
        };
    }

    /**
     * Send a JSON-RPC request and invoke callback with the result.
     */
    function send(method, params, callback) {
        if (!connected || !socket) {
            if (callback) callback(null, { message: "Not connected" });
            return;
        }

        var id = ++requestId;
        var msg = {
            jsonrpc: "2.0",
            id: id,
            method: method,
            params: params || {}
        };

        if (callback) {
            pendingRequests[id] = callback;
        }

        socket.send(JSON.stringify(msg));
    }

    /**
     * Send a JSON-RPC notification (no response expected).
     */
    function notify(method, params) {
        if (!connected || !socket) return;

        var msg = {
            jsonrpc: "2.0",
            method: method,
            params: params || {}
        };

        socket.send(JSON.stringify(msg));
    }

    /**
     * Register a listener for server-initiated notifications.
     */
    function on(method, callback) {
        if (!listeners[method]) {
            listeners[method] = [];
        }
        listeners[method].push(callback);
    }

    /**
     * Remove a listener.
     */
    function off(method, callback) {
        if (!listeners[method]) return;
        listeners[method] = listeners[method].filter(function (cb) {
            return cb !== callback;
        });
    }

    function emit(method, data) {
        var cbs = listeners[method];
        if (cbs) {
            for (var i = 0; i < cbs.length; i++) {
                try {
                    cbs[i](data);
                } catch (e) {
                    console.warn("[ws] Listener error for", method, ":", e);
                }
            }
        }
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        if (!url) return;

        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            console.log("[ws] Reconnecting...");
            connect(url);
        }, reconnectDelay);

        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    }

    /**
     * Disconnect and stop reconnecting.
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
    }

    /**
     * Auto-connect: derive WebSocket URL from the current page URL.
     */
    function autoConnect() {
        var loc = window.location;
        var wsProtocol = loc.protocol === "https:" ? "wss:" : "ws:";
        var wsUrl = wsProtocol + "//" + loc.host + "/exist/ws";
        connect(wsUrl);
    }

    return {
        connect: connect,
        disconnect: disconnect,
        autoConnect: autoConnect,
        send: send,
        notify: notify,
        on: on,
        off: off,
        isConnected: function () { return connected; }
    };
}());

// Browser global
globalThis.eXideWs = eXide.ws;
