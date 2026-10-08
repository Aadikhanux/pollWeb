const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
const services = [
  ['backend', 'server', ['--watch', 'server.js'], {}],
  ['frontend', 'client', ['node_modules/next/dist/bin/next', 'dev', '-p', '3000'], { NEXT_PUBLIC_SOCKET_URL: '' }]
];
for (const [name, directory, args, environment] of services) {
  const child = spawn(process.execPath, args, { cwd: path.join(root, directory), stdio: 'inherit', env: { ...process.env, ...environment } });
  children.push(child);
  child.on('error', error => { console.error(`${name}: ${error.message}`); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log('KeySentry: http://localhost:3000 (dashboard, API, and live updates)');
