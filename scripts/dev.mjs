import { appendFile, copyFile, access, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDirectory = path.join(rootDirectory, 'backend');
const frontendDirectory = path.join(rootDirectory, 'frontend');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

async function ensureEnvironmentFile(directory) {
  const environmentPath = path.join(directory, '.env');
  const examplePath = path.join(directory, '.env.example');
  try {
    await access(environmentPath);
  } catch {
    await copyFile(examplePath, environmentPath);
    console.log(`Created ${path.relative(rootDirectory, environmentPath)}`);
    return;
  }

  const [current, example] = await Promise.all([readFile(environmentPath, 'utf8'), readFile(examplePath, 'utf8')]);
  const currentKeys = new Set(current.split(/\r?\n/).map((line) => line.split('=', 1)[0].trim()));
  const missingLines = example
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !currentKeys.has(line.split('=', 1)[0].trim()));
  if (missingLines.length) {
    await appendFile(environmentPath, `\n${missingLines.join('\n')}\n`);
    console.log(`Added new defaults to ${path.relative(rootDirectory, environmentPath)}`);
  }
}

async function readEnvironment(directory) {
  const contents = await readFile(path.join(directory, '.env'), 'utf8');
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')];
      }),
  );
}

function canConnect(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function findFreePort(startPort) {
  let port = startPort;
  while (await canConnect('127.0.0.1', port, 200)) {
    port += 1;
  }
  return port;
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: rootDirectory,
    stdio: 'inherit',
    ...options,
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${child.spawnfile} exited with ${signal ?? `code ${code}`}`));
    });
  });
}

async function waitForDatabase(host, port) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await canConnect(host, port)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`PostgreSQL did not become reachable at ${host}:${port}`);
}

await Promise.all([
  ensureEnvironmentFile(backendDirectory),
  ensureEnvironmentFile(frontendDirectory),
]);

const backendEnvironment = await readEnvironment(backendDirectory);
const databaseUrl = new URL(backendEnvironment.DATABASE_URL);
const databaseHost = databaseUrl.hostname;
const databasePort = Number(databaseUrl.port || 5432);
const requestedPort = Number(backendEnvironment.PORT || 3000);
const backendPort = await findFreePort(requestedPort);

if (!(await canConnect(databaseHost, databasePort))) {
  console.log('PostgreSQL is not reachable; starting the local Docker Compose service...');
  await waitForExit(run('docker', ['compose', '-f', 'backend/docker-compose.yml', 'up', '-d', 'postgres']));
}

await waitForDatabase(databaseHost, databasePort);
console.log('Running pending database migrations...');
await waitForExit(
  run(pnpmCommand, ['--filter', '@elderflow/backend', 'db:migrate'], {
    env: { ...process.env, ...backendEnvironment, PORT: String(backendPort) },
  }),
);
console.log('Ensuring development users exist...');
await waitForExit(
  run(pnpmCommand, ['--filter', '@elderflow/backend', 'db:seed:dev'], {
    env: { ...process.env, ...backendEnvironment, PORT: String(backendPort) },
  }),
);

const apiBaseUrl = `http://localhost:${backendPort}`;
console.log(`Starting backend at ${apiBaseUrl}`);
console.log(`Starting frontend with VITE_API_BASE_URL=${apiBaseUrl}`);

const children = [
  run(pnpmCommand, ['--filter', '@elderflow/backend', 'start:dev'], {
    env: { ...process.env, ...backendEnvironment, PORT: String(backendPort) },
  }),
  run(pnpmCommand, ['--filter', '@elderflow/frontend', 'dev'], {
    env: { ...process.env, VITE_API_BASE_URL: apiBaseUrl },
  }),
];

let stopping = false;
function stopChildren(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => stopChildren('SIGINT'));
process.on('SIGTERM', () => stopChildren('SIGTERM'));

const result = await Promise.race(
  children.map(
    (child) =>
      new Promise((resolve) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
      }),
  ),
);
stopChildren();
process.exitCode = result.code ?? (result.signal ? 1 : 0);
