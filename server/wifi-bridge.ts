import { networkInterfaces } from 'node:os';
import { createServer, type Server as TcpServer, type Socket } from 'node:net';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';

export const WIFI_BRIDGE_PATH = '/__theia_wifi';

export function localIpv4Addresses(): string[] {
  const interfaces = Object.entries(networkInterfaces())
    .sort(([a], [b]) => Number(/wi-?fi|wlan|wireless/i.test(b)) - Number(/wi-?fi|wlan|wireless/i.test(a)));
  return [...new Set(interfaces.flatMap(([, addresses]) =>
    (addresses ?? []).filter(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
      .map(a => a.address)))];
}

/** One browser owns one listener. Closing its WebSocket releases the TCP port. */
export function attachWifiBridge(http: HttpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  let owner: WebSocket | null = null;
  let tcp: TcpServer | null = null;
  let peer: Socket | null = null;
  let shutdown = false;
  let releasing = Promise.resolve();

  function send(ws: WebSocket, message: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  function release(ws: WebSocket): Promise<void> {
    if (owner !== ws) return releasing;
    owner = null;
    const oldPeer = peer;
    peer = null;
    oldPeer?.destroy();
    const listener = tcp;
    tcp = null;
    releasing = new Promise<void>(resolve => {
      if (listener) listener.close(() => resolve());
      else resolve();
    });
    return releasing;
  }

  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url?.split('?')[0] !== WIFI_BRIDGE_PATH) return;
    // Only the page served by this Vite instance may control the listener.
    let sameOrigin = false;
    try {
      const origin = new URL(request.headers.origin ?? '');
      sameOrigin = ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.host;
    } catch { /* Missing or malformed Origin. */ }
    if (shutdown || !sameOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
  };
  http.on('upgrade', upgrade);

  wss.on('connection', ws => {
    ws.on('error', () => release(ws));
    ws.on('close', () => release(ws));
    ws.on('message', async (data, binary) => {
      if (binary) {
        if (owner !== ws || !peer || peer.destroyed) {
          send(ws, { type: 'error', message: 'No WiFi device is connected.' });
          return;
        }
        // Apply backpressure rather than growing an unbounded write queue.
        if (peer.writableLength > 1024 * 1024) {
          send(ws, { type: 'error', message: 'WiFi device is not accepting data.' });
          return;
        }
        peer.write(data as Buffer);
        return;
      }

      let command: { type?: string; port?: number };
      try { command = JSON.parse(data.toString()); }
      catch { send(ws, { type: 'error', message: 'Invalid WiFi bridge command.' }); return; }
      if (command?.type === 'stop') {
        await release(ws);
        send(ws, { type: 'stopped' });
        return;
      }
      if (!command || command.type !== 'listen') {
        send(ws, { type: 'error', message: 'Unknown WiFi bridge command.' });
        return;
      }
      const port = command.port;
      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) {
        send(ws, { type: 'error', message: 'TCP port must be an integer from 1024 to 65535.' });
        return;
      }
      await releasing;
      if (owner && owner.readyState !== WebSocket.OPEN) await release(owner);
      if (shutdown || ws.readyState !== WebSocket.OPEN) return;
      if (owner) {
        send(ws, { type: 'error', message: 'A WiFi listener is already active. Disconnect the other session first.' });
        return;
      }

      owner = ws;
      const listener = createServer(socket => {
        if (owner !== ws || peer) { socket.destroy(); return; }
        peer = socket;
        socket.setNoDelay(true);
        send(ws, { type: 'client-connected' });
        socket.on('data', bytes => {
          if (owner !== ws || ws.readyState !== WebSocket.OPEN) { socket.destroy(); return; }
          socket.pause();
          ws.send(bytes, { binary: true }, error => {
            if (error) { socket.destroy(); ws.close(); }
            else if (!socket.destroyed) socket.resume();
          });
        });
        socket.on('error', () => { /* close below resets the parser for the next device. */ });
        socket.on('close', () => {
          if (peer !== socket) return;
          peer = null;
          send(ws, { type: 'client-disconnected' });
        });
      });
      tcp = listener;
      listener.on('error', error => {
        if (owner !== ws) return;
        send(ws, { type: 'error', message: `Cannot listen on TCP ${port}: ${error.message}` });
        release(ws);
      });
      listener.listen(port, '0.0.0.0', () => {
        if (owner !== ws) { listener.close(); return; }
        send(ws, { type: 'listening', port });
      });
    });
  });

  return {
    close() {
      if (shutdown) return;
      shutdown = true;
      if (owner) release(owner);
      http.off('upgrade', upgrade);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}

export function wifiBridgePlugin(): Plugin {
  const bridges: ReturnType<typeof attachWifiBridge>[] = [];
  function install(server: ViteDevServer | PreviewServer) {
    if (!server.httpServer) return;
    const bridge = attachWifiBridge(server.httpServer);
    bridges.push(bridge);
    server.httpServer.once('close', () => bridge.close());
    server.middlewares.use(`${WIFI_BRIDGE_PATH}/network`, (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      const addresses = localIpv4Addresses();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ip: addresses[0] ?? null, addresses }));
    });
  }
  return {
    name: 'theia-wifi-bridge',
    configureServer: install,
    configurePreviewServer: install,
    closeBundle() { for (const bridge of bridges) bridge.close(); },
  };
}
