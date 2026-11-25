const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createTcpListener, localIpv4 } = require('./tcp.cjs');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const devUrl = !app.isPackaged && process.env.THEIA_DESKTOP_DEV_URL;
const appUrl = devUrl || pathToFileURL(indexPath).href;
let window = null;

function isAppUrl(url) {
  if (!url) return false;
  try {
    const page = new URL(url);
    page.hash = '';
    return page.href === appUrl;
  } catch { return false; }
}

function isTrustedContents(contents) {
  return !!window && !window.isDestroyed() && contents === window.webContents && isAppUrl(contents.getURL());
}

const tcp = createTcpListener((type, data) => {
  if (window && isTrustedContents(window.webContents)) {
    window.webContents.send('theia:tcp-event', type, data);
  }
});

for (const [name, handle] of Object.entries({
  'local-ipv4': () => localIpv4(),
  'tcp-listen': tcp.listen,
  'tcp-stop': tcp.stop,
  'tcp-send': tcp.send,
})) {
  ipcMain.handle(`theia:${name}`, (event, ...args) => {
    if (!isTrustedContents(event.sender) || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('IPC is restricted to the Theia Monitor window.');
    }
    return handle(...args);
  });
}

async function createWindow() {
  const desktop = new BrowserWindow({
    title: 'Theia Monitor',
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window = desktop;

  const contents = desktop.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-frame-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('did-start-navigation', details => {
    if (details.isMainFrame && !details.isSameDocument) void tcp.stop();
  });
  contents.on('render-process-gone', () => { void tcp.stop(); });
  desktop.on('closed', () => {
    window = null;
    void tcp.stop();
  });

  const session = contents.session;
  session.setPermissionCheckHandler((requester, permission, _origin, details) =>
    permission === 'serial' && isTrustedContents(requester) && details.isMainFrame);
  session.setPermissionRequestHandler((requester, permission, callback, details) =>
    callback(permission === 'serial' && isTrustedContents(requester) && details.isMainFrame));
  session.on('select-serial-port', async (event, ports, requester, choose) => {
    event.preventDefault();
    if (!isTrustedContents(requester)) { choose(''); return; }
    const labels = ports.map(port => {
      const name = port.portName || port.portId;
      return port.displayName && port.displayName !== name ? `${name}: ${port.displayName}` : name;
    });
    let portId = '';
    try {
      const { response } = await dialog.showMessageBox(desktop, {
        type: 'question',
        title: 'Theia Monitor',
        message: labels.length ? 'Select a serial port' : 'No serial ports found',
        buttons: [...labels, 'Cancel'],
        cancelId: labels.length,
        noLink: true,
      });
      if (isTrustedContents(requester)) portId = ports[response]?.portId ?? '';
    } catch (error) {
      console.error('Serial port dialog failed:', error);
    } finally {
      choose(portId);
    }
  });

  if (devUrl) await desktop.loadURL(appUrl);
  else await desktop.loadFile(indexPath);
}

app.on('window-all-closed', () => app.quit());
app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('Theia Monitor', error.message);
  app.exit(1);
});
