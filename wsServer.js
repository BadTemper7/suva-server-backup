import { WebSocketServer } from "ws";

let wss = null;

/**
 * Map<deviceKey, Set<WebSocket>>
 * deviceKey can be:
 * - deviceCode (e.g. OUTLET-A)
 * - MongoDB ObjectId (string)
 */
const clientsByDeviceKey = new Map();

/* ----------------------------- helpers ----------------------------- */

function getSetForKey(key) {
  const k = String(key);
  if (!clientsByDeviceKey.has(k)) {
    clientsByDeviceKey.set(k, new Set());
  }
  return clientsByDeviceKey.get(k);
}

function registerClient(deviceKey, ws) {
  if (!deviceKey) return;

  const key = String(deviceKey);
  const set = getSetForKey(key);

  const wasEmpty = set.size === 0;
  set.add(ws);

  // Notify only when first connection for this device
  if (wasEmpty) {
    broadcast({
      type: "DEVICE_WS",
      action: "connected",
      deviceKey: key,
    });
  }

  ws.on("close", () => {
    const currentSet = clientsByDeviceKey.get(key);
    if (!currentSet) return;

    currentSet.delete(ws);

    if (currentSet.size === 0) {
      clientsByDeviceKey.delete(key);

      broadcast({
        type: "DEVICE_WS",
        action: "disconnected",
        deviceKey: key,
      });
    }
  });
}

/* --------------------------- main server ---------------------------- */

export function createWebSocketServer(server) {
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");

    const deviceCode = url.searchParams.get("deviceCode");
    const deviceMongoId = url.searchParams.get("deviceMongoId");
    const token = url.searchParams.get("token"); // optional (JWT etc)

    const deviceKey = deviceCode || deviceMongoId || null;

    console.log("[WS] Connected", {
      deviceCode,
      deviceMongoId,
      tokenPresent: !!token,
    });

    if (deviceKey) {
      registerClient(deviceKey, ws);
    }

    ws.send(
      JSON.stringify({
        type: "WS_CONNECTED",
        deviceKey,
        message: "Connected to WebSocket server",
      })
    );
  });
}

/* --------------------------- messaging ------------------------------ */

/** Send to ALL connected sockets */
export function broadcast(payload) {
  if (!wss) return;

  const message = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

/** Send to ONE device (deviceCode OR mongoId) */
export function sendToDevice(deviceKey, payload) {
  const set = clientsByDeviceKey.get(String(deviceKey));
  if (!set) return;

  const message = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }
}

/** Send to both identifiers if available */
export function sendToDeviceBoth({ deviceCode, deviceMongoId }, payload) {
  if (deviceCode) sendToDevice(deviceCode, payload);
  if (deviceMongoId) sendToDevice(String(deviceMongoId), payload);
}

/** Check connection state */
export function isDeviceConnected(deviceKey) {
  const set = clientsByDeviceKey.get(String(deviceKey));
  return !!set && set.size > 0;
}
