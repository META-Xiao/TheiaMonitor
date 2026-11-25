const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const { createConnection, createServer } = require('node:net');
const { test } = require('node:test');
const { createTcpListener, localIpv4 } = require('./tcp.cjs');

async function bind(port = 0) {
  const server = createServer().listen(port, '0.0.0.0');
  await once(server, 'listening');
  return server;
}

const close = server => new Promise(resolve => server.close(resolve));

test('desktop listener exchanges bytes and accepts a second MCU after the first disconnects', { timeout: 5000 }, async t => {
  const probe = await bind();
  const { port } = probe.address();
  await close(probe);
  const events = new EventEmitter();
  const tcp = createTcpListener((...args) => events.emit(...args));
  t.after(() => tcp.stop());

  await tcp.listen(port);
  await assert.rejects(tcp.listen(port), /already active/);
  await assert.rejects(tcp.send(Uint8Array.of(1)), /No WiFi device/);

  async function connect() {
    const accepted = once(events, 'client-connected');
    const peer = createConnection({ host: '127.0.0.1', port });
    await Promise.all([accepted, once(peer, 'connect')]);
    return peer;
  }

  const first = await connect();
  const received = once(events, 'data');
  first.write(Uint8Array.of(0xcc, 0x00, 0xff));
  assert.deepEqual((await received)[0], Buffer.from([0xcc, 0x00, 0xff]));

  const response = once(first, 'data');
  await tcp.send(Uint8Array.of(0x80, 0x00));
  assert.deepEqual((await response)[0], Buffer.from([0x80, 0x00]));
  const firstClosed = once(first, 'close');
  first.end();
  await firstClosed;

  const second = await connect();
  const secondClosed = once(second, 'close');
  await tcp.stop();
  await secondClosed;
  await close(await bind(port));
});

test('desktop listener rejects invalid or occupied ports and can retry', { timeout: 5000 }, async t => {
  const tcp = createTcpListener(() => {});
  t.after(() => tcp.stop());
  await assert.rejects(tcp.listen(65536), /1024 to 65535/);
  const occupied = await bind();
  const { port } = occupied.address();
  try { await assert.rejects(tcp.listen(port), /EADDRINUSE/); }
  finally { await close(occupied); }
  await tcp.listen(port);
});

test('local IPv4 lookup prefers Wi-Fi and excludes loopback and link-local addresses', () => {
  assert.equal(localIpv4({
    Ethernet: [{ family: 'IPv4', address: '10.0.0.2', internal: false }],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.5', internal: false }],
  }), '192.168.1.5');
  assert.throws(() => localIpv4({
    Ethernet: [{ family: 'IPv4', address: '169.254.1.1', internal: false }],
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  }), /No LAN IPv4/);
});
