const { createServer } = require('node:net');
const { networkInterfaces } = require('node:os');

const MAX_WRITE_BYTES = 1024 * 1024;

function localIpv4(interfaces = networkInterfaces()) {
  const wifi = /wi-?fi|wlan|wireless/i;
  const sorted = Object.entries(interfaces).sort(([a], [b]) => Number(wifi.test(b)) - Number(wifi.test(a)));
  for (const [, addresses] of sorted) {
    const address = addresses?.find(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    if (address) return address.address;
  }
  throw new Error('No LAN IPv4 address available.');
}

function createTcpListener(emit) {
  let active = null;
  let releasing = Promise.resolve();
  let generation = 0;

  async function listen(port) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error('TCP port must be an integer from 1024 to 65535.');
    }
    const requestedGeneration = generation;
    await releasing;
    if (requestedGeneration !== generation) throw new Error('WiFi listener was stopped during startup.');
    if (active) throw new Error('A WiFi listener is already active.');

    const state = { server: null, peer: null, started: false };
    const server = createServer(socket => {
      if (active !== state || state.peer) { socket.destroy(); return; }
      state.peer = socket;
      socket.setNoDelay(true);
      emit('client-connected');
      socket.on('data', bytes => {
        if (active === state) emit('data', bytes);
      });
      socket.on('error', () => { /* The close handler releases the peer. */ });
      socket.on('close', () => {
        if (state.peer === socket) state.peer = null;
      });
    });
    state.server = server;
    active = state;

    return new Promise((resolve, reject) => {
      server.on('error', error => {
        if (active === state) {
          void stop();
          if (state.started) emit('listener-closed');
        }
        if (!state.started) reject(error);
      });
      server.once('close', () => {
        if (!state.started) reject(new Error('WiFi listener was closed before it started.'));
      });
      server.listen(port, '0.0.0.0', () => {
        state.started = true;
        resolve();
      });
    });
  }

  function stop() {
    generation++;
    const state = active;
    if (!state) return releasing;
    active = null;
    state.peer?.destroy();
    releasing = new Promise(resolve => state.server.close(() => resolve()));
    return releasing;
  }

  async function send(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_WRITE_BYTES) {
      throw new Error('Invalid WiFi data (maximum 1 MiB).');
    }
    const peer = active?.peer;
    if (!peer || peer.destroyed || !peer.writable) throw new Error('No WiFi device is connected.');
    if (peer.writableLength + bytes.length > MAX_WRITE_BYTES) {
      throw new Error('WiFi device is not accepting data.');
    }
    await new Promise((resolve, reject) => peer.write(bytes, error => error ? reject(error) : resolve()));
  }

  return { listen, stop, send };
}

module.exports = { createTcpListener, localIpv4 };
