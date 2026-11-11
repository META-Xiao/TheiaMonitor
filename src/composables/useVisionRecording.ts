import { ref, type InjectionKey } from 'vue';

type Sources = { source?: HTMLCanvasElement; ipm?: HTMLCanvasElement };
export const visionRecordingKey: InjectionKey<ReturnType<typeof useVisionRecording>> = Symbol('visionRecording');

/** Overview 与 Vision 共用一次录制，输出尺寸在开始时固定。 */
export function useVisionRecording() {
  const recording = ref(false);
  const paused = ref(false);
  const stopping = ref(false);
  const error = ref('');
  let getSources: () => Sources = () => ({});
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  function start() {
    if (recording.value) return;
    error.value = '';
    let stream: MediaStream | undefined;
    try {
      const mime = ['video/mp4;codecs=avc1.42001E', 'video/mp4'].find(type =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('This browser does not support MP4 recording. Please use a current Edge or Chrome.');
      const { source, ipm } = getSources();
      if (!source) throw new Error('No video source.');
      const height = Math.ceil(Math.max(source.height, ipm?.height ?? 0) / 2) * 2;
      const leftWidth = Math.ceil(source.width * height / source.height / 2) * 2;
      const rightWidth = ipm ? Math.ceil(ipm.width * height / ipm.height / 2) * 2 : 0;
      const canvas = document.createElement('canvas');
      canvas.width = leftWidth + rightWidth;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create recording canvas.');
      const drawImage = (image: HTMLCanvasElement | undefined, x: number, width: number) => {
        if (!image || !width) return;
        const scale = Math.min(width / image.width, height / image.height);
        const w = image.width * scale, h = image.height * scale;
        context.drawImage(image, x + (width - w) / 2, (height - h) / 2, w, h);
      };
      const draw = () => {
        const current = getSources();
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, height);
        drawImage(current.source, 0, leftWidth);
        drawImage(current.ipm, leftWidth, rightWidth);
      };
      draw();
      stream = canvas.captureStream(25);
      const tracks = stream.getTracks();
      const session = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      session.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      session.onerror = () => { error.value = 'Video recording failed.'; stop(); };
      session.onstop = () => {
        clearInterval(timer);
        tracks.forEach(track => track.stop());
        recorder = null;
        recording.value = paused.value = stopping.value = false;
        if (disposed || error.value || !chunks.length) return;
        const url = URL.createObjectURL(new Blob(chunks, { type: session.mimeType }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `vision-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      session.start(100);
      recorder = session;
      timer = setInterval(draw, 40);
      recording.value = true;
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop());
      error.value = cause instanceof Error ? cause.message : 'Could not start recording.';
    }
  }

  function togglePause() {
    if (!recorder || stopping.value) return;
    if (paused.value) recorder.resume();
    else recorder.pause();
    paused.value = !paused.value;
  }

  function stop() {
    if (!recorder || stopping.value) return;
    stopping.value = true;
    if (recorder.state !== 'inactive') recorder.stop();
  }

  function dispose() {
    disposed = true;
    clearInterval(timer);
    stop();
  }

  return { recording, paused, stopping, error, start, togglePause, stop, dispose,
    setSources: (getter: () => Sources) => { getSources = getter; } };
}
