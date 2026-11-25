type TcpEvent = 'client-connected' | 'data' | 'listener-closed';

interface DesktopBridge {
  localIpv4(): Promise<string>;
  tcpListen(port: number): Promise<void>;
  tcpStop(): Promise<void>;
  tcpSend(data: Uint8Array): Promise<void>;
  onTcpEvent(callback: (type: TcpEvent, data?: Uint8Array) => void): () => void;
}

declare global {
  interface Window {
    theiaDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.theiaDesktop;
}
