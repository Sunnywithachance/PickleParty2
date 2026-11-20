import { spawn, spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';

const sqliteFlags = ['--experimental-sqlite', '--disable-warning=ExperimentalWarning'];
const executable = process.platform === 'win32' ? 'node.exe' : 'node';
const candidates = new Set([
  process.execPath,
  ...(process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, executable))
]);

const node = Array.from(candidates).find(candidate => {
  const probe = spawnSync(candidate, [...sqliteFlags, '-e', 'require("node:sqlite")'], { stdio: 'ignore' });
  return probe.status === 0;
});

if (!node) {
  console.error('Pickle Party needs Node.js 22.5 or newer to run its local SQLite database.');
  process.exit(1);
}

const build = spawnSync(node, ['scripts/build.mjs'], { stdio: 'inherit' });
if (build.status !== 0) {
  if (build.error) console.error(build.error.message);
  process.exit(build.status ?? 1);
}

const server = spawn(node, [...sqliteFlags, 'scripts/serve.mjs'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
