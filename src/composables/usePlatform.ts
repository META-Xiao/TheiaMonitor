import { ref, onMounted } from 'vue';
import { getDesktopBridge } from '../desktop';

const platform = ref<'web' | 'electron' | 'android'>('web');

export function usePlatform() {
  onMounted(() => {
    if (getDesktopBridge()) { platform.value = 'electron'; return; }
    if ((window as any).Capacitor?.isNativePlatform?.()) { platform.value = 'android'; }
  });
  return { platform };
}
