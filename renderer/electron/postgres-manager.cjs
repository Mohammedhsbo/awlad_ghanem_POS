const { existsSync, mkdirSync, writeFileSync, statSync, readFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const PORT_RANGE_START = 45432;
const PORT_RANGE_END = 45532;

function binary(root, name) { return path.join(root, 'bin', process.platform === 'win32' ? `${name}.exe` : name); }
function waitForPostgresReady(pgIsReadyPath, port, env, timeoutMs = 45000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const child = spawn(pgIsReadyPath, ['-h', '127.0.0.1', '-p', String(port), '-U', 'pos_app'], { env });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code === 0) resolve();
        else if (Date.now() - started > timeoutMs) reject(new Error(`PostgreSQL did not become ready on port ${port} within ${timeoutMs}ms`));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}
function findAvailablePort() {
  const tryPort = (port) => {
    if (port > PORT_RANGE_END) return Promise.reject(new Error(`No available PostgreSQL port in range ${PORT_RANGE_START}-${PORT_RANGE_END}`));
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') resolve(tryPort(port + 1));
        else reject(error);
      });
      server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(port)));
    });
  };
  return tryPort(PORT_RANGE_START);
}
function describeSpawnTarget(command) {
  if (!existsSync(command)) return { path: command, exists: false, type: 'missing' };
  try {
    const stats = statSync(command);
    if (stats.isDirectory()) return { path: command, exists: true, type: 'directory' };
    if (stats.isFile()) return { path: command, exists: true, type: 'file' };
    return { path: command, exists: true, type: 'other' };
  } catch {
    return { path: command, exists: false, type: 'unreadable' };
  }
}
function spawnFailureMessage(command, args, error) {
  const target = describeSpawnTarget(command);
  return `Failed to spawn ${JSON.stringify(command)} ${JSON.stringify(args)}: ${error.code || error.message}. Resolved path=${JSON.stringify(target.path)} exists=${target.exists} type=${target.type}`;
}
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => reject(new Error(spawnFailureMessage(command, args, error))));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || spawnFailureMessage(command, args, { code: `exit ${code}` }))));
  });
}

class PostgresManager {
  constructor({ userDataPath, resourcesPath, isPackaged }) {
    this.dataDir = path.join(userDataPath, 'pgdata');
    this.passwordPath = path.join(userDataPath, 'postgres-password');
    this.isPackaged = isPackaged;
    const binaryRoot = isPackaged ? path.join(resourcesPath, 'postgres-binaries') : path.resolve(__dirname, '../../resources/postgres-binaries');
    this.root = isPackaged
      ? binaryRoot
      : process.platform === 'win32' ? path.join(binaryRoot, 'win', 'x64') : path.join(binaryRoot, 'darwin', 'x64');
    this.process = null;
    this.port = null;
  }
  async start() {
    const initdb = binary(this.root, 'initdb');
    const pgCtl = binary(this.root, 'pg_ctl');
    const createdb = binary(this.root, 'createdb');
    const pgIsReady = binary(this.root, 'pg_isready');
    if (!existsSync(initdb) || !existsSync(pgCtl) || !existsSync(createdb) || !existsSync(pgIsReady)) {
      const setupCommand = process.platform === 'win32' ? 'pnpm setup:postgres' : 'bash scripts/setup-postgres-mac.sh';
      const remedy = this.isPackaged ? 'Reinstall the application.' : `Run ${setupCommand} and restart the app.`;
      throw new Error(`Missing PostgreSQL 16 x64 binaries at ${this.root}. ${remedy}`);
    }
    mkdirSync(path.dirname(this.dataDir), { recursive: true });
    const password = this.password();
    const env = { ...process.env, PGUSER: 'pos_app', PGPASSWORD: password };
    const initialized = !existsSync(path.join(this.dataDir, 'PG_VERSION'));
    if (initialized) await run(initdb, ['-D', this.dataDir, '--username=pos_app', `--pwfile=${this.passwordPath}`, '--auth=scram-sha-256', '--no-locale', '--encoding=UTF8'], env);
    this.port = await findAvailablePort();
    const logFile = path.join(this.dataDir, 'postgres.log');
    const pgCtlArgs = ['-D', this.dataDir, '-l', logFile, '-o', `-p ${this.port}`, '-w', 'start'];
    this.process = spawn(pgCtl, pgCtlArgs, { env, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      this.process.once('error', (error) => reject(new Error(spawnFailureMessage(pgCtl, pgCtlArgs, error))));
      void waitForPostgresReady(pgIsReady, this.port, env).then(resolve, reject);
    });
    await run(createdb, ['-h', '127.0.0.1', '-p', String(this.port), '-U', 'pos_app', 'motorcycle_pos'], env).catch((error) => {
      if (!/already exists/i.test(error.message)) throw error;
    });
    return { port: this.port, password, initialized, databaseUrl: `postgresql://pos_app:${encodeURIComponent(password)}@127.0.0.1:${this.port}/motorcycle_pos?schema=public` };
  }
  password() {
    if (!existsSync(this.passwordPath)) writeFileSync(this.passwordPath, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    return readFileSync(this.passwordPath, 'utf8').trim();
  }
  async stop() {
    if (!this.process) return;
    await run(binary(this.root, 'pg_ctl'), ['-D', this.dataDir, '-m', 'fast', '-w', 'stop'], process.env).catch(() => undefined);
    this.process = null;
    this.port = null;
  }
}

module.exports = { PostgresManager };