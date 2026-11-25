const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('theiaDesktop', {
  localIpv4: () => ipcRenderer.invoke('theia:local-ipv4'),
  tcpListen: port => ipcRenderer.invoke('theia:tcp-listen', port),
  tcpStop: () => ipcRenderer.invoke('theia:tcp-stop'),
  tcpSend: bytes => ipcRenderer.invoke('theia:tcp-send', bytes),
  onTcpEvent: callback => {
    const handler = (_event, type, data) => callback(type, data);
    ipcRenderer.on('theia:tcp-event', handler);
    return () => ipcRenderer.removeListener('theia:tcp-event', handler);
  },
});
