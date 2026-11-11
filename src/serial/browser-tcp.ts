export async function getBrowserLocalIpv4(): Promise<string> {
  const response = await fetch('/__theia_wifi/network', { cache: 'no-store' });
  if (!response.ok) throw new Error('WiFi bridge is unavailable. Start Theia with npm run vite.');
  const info = await response.json();
  if (typeof info.ip !== 'string' || !info.ip) throw new Error('No LAN IPv4 address was found.');
  return info.ip;
}

/** Browser transport for the TCP listener hosted by the Vite WiFi bridge. */
export class BrowserTcpPort {
  private socket: WebSocket | null = null;
  private isOpen = false;
  private dataCallbacks: Array<(bytes: Uint8Array) => void> = [];
  private disconnectedCallback: (() => void) | null = null;
  private streamResetCallback: (() => void) | null = null;

  static isSupported(): boolean {
    return typeof WebSocket !== 'undefined' && typeof location !== 'undefined';
  }

  async connect(_ip: string, port: number): Promise<void> {
    if (this.socket) throw new Error('A WiFi connection is already active.');
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('TCP port must be an integer from 1024 to 65535.');
    const url = new URL('/__theia_wifi', location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (!settled) { settled = true; clearTimeout(timeout); reject(new Error(message)); }
        socket.close();
      };
      const timeout = setTimeout(() => fail('WiFi bridge did not respond. Start Theia with npm run vite.'), 8000);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'listen', port }));
      socket.onerror = () => fail('Cannot reach the WiFi bridge. Start Theia with npm run vite.');
      socket.onmessage = event => {
        if (this.socket !== socket) return;
        if (typeof event.data !== 'string') {
          if (!this.isOpen || !(event.data instanceof ArrayBuffer)) return;
          for (const callback of this.dataCallbacks) {
            try { callback(new Uint8Array(event.data)); } catch (error) { console.error(error); }
          }
          return;
        }
        let message: { type: string; message?: string };
        try { message = JSON.parse(event.data); }
        catch { fail('Invalid response from the WiFi bridge.'); return; }
        if (message.type === 'listening' && !settled) {
          settled = true;
          clearTimeout(timeout);
          this.isOpen = true;
          resolve();
        } else if (message.type === 'client-connected' || message.type === 'client-disconnected') {
          this.streamResetCallback?.();
        } else if (message.type === 'error') {
          fail(message.message || 'WiFi bridge error.');
        }
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (!settled) { settled = true; reject(new Error('WiFi bridge closed before the listener started.')); }
        if (this.socket !== socket) return;
        this.socket = null;
        const notify = this.isOpen;
        this.isOpen = false;
        if (notify) this.disconnectedCallback?.();
      };
    });
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.isOpen = false;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    if (socket.readyState === WebSocket.OPEN) {
      await new Promise<void>(resolve => {
        const done = () => {
          clearTimeout(timeout);
          socket.removeEventListener('message', stopped);
          socket.removeEventListener('close', done);
          resolve();
        };
        const stopped = (event: MessageEvent) => {
          if (typeof event.data !== 'string') return;
          try { if (JSON.parse(event.data).type === 'stopped') done(); } catch { /* Ignore in-flight data. */ }
        };
        const timeout = setTimeout(done, 2000);
        socket.addEventListener('message', stopped);
        socket.addEventListener('close', done, { once: true });
        socket.send(JSON.stringify({ type: 'stop' }));
      });
    }
    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 2000);
      socket.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.close();
    });
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.isOpen || this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('WiFi listener is not open.');
    this.socket.send(bytes);
  }

  onData(callback: (bytes: Uint8Array) => void): void { this.dataCallbacks.push(callback); }
  onDisconnect(callback: () => void): void { this.disconnectedCallback = callback; }
  onStreamReset(callback: () => void): void { this.streamResetCallback = callback; }
  getIsOpen(): boolean { return this.isOpen; }
}
