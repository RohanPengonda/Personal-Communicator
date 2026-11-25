import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const command = isWindows ? 'cmd.exe' : 'npm';
const children = [];

for (const script of ['server', 'dev']) {
  const args = isWindows ? ['/c', `npm run ${script}`] : ['run', script];
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true
  });
  children.push(child);
}

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) {
      stopAll();
      process.exit(code ?? 0);
    }
  });
}
