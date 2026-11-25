import { spawn } from 'node:child_process';
import electron from 'electron';
import { createServer } from 'vite';

const vite = await createServer({ server: { host: '127.0.0.1', open: false } });
try {
  await vite.listen();
  const url = vite.resolvedUrls.local[0];
  console.log(`Theia Monitor renderer: ${url}`);
  const child = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, THEIA_DESKTOP_DEV_URL: url },
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill());
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 0));
  });
} finally {
  await vite.close();
}
