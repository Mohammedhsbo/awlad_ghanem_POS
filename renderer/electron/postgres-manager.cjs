const { existsSync, mkdirSync, writeFileSync, statSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { getLocalPostgresPort } = require('./local-postgres-config.cjs');

const POSTGRES_PORT = getLocalPostgresPort();

function binary(root, name) { return path.join(root, 'bin', process.platform === 'win32' ? `${name}.exe` : name); }
function waitForPort(port) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > 30000) reject(new Error(`PostgreSQL did not start on port ${port}`));
        else setTimeout(check, 250);
      });
    };
    check();
  });
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
    this.dataDir = path.join(userDataPath, 'postgres-data');
    this.passwordPath = path.join(userDataPath, 'postgres-password');
    const binaryRoot = isPackaged ? path.join(resourcesPath, 'postgres-binaries') : path.resolve(__dirname, '../../resources/postgres-binaries');
    const platformRoot = process.platform === 'win32' ? path.join(binaryRoot, 'win32', 'x64') : path.join(binaryRoot, 'darwin', 'x64');
    const legacyWindowsRoot = path.join(binaryRoot, 'x64');
    this.root = process.platform === 'win32' && !existsSync(path.join(platformRoot, 'bin', 'initdb.exe')) && existsSync(path.join(legacyWindowsRoot, 'bin', 'initdb.exe')) ? legacyWindowsRoot : platformRoot;
    this.process = null;
  }
  async start() {
    const initdb = binary(this.root, 'initdb');
    const pgCtl = binary(this.root, 'pg_ctl');
    const createdb = binary(this.root, 'createdb');
    if (!existsSync(initdb) || !existsSync(pgCtl) || !existsSync(createdb)) {
      const setupCommand = process.platform === 'win32' ? 'pnpm setup:postgres' : 'bash scripts/setup-postgres-mac.sh';
      throw new Error(`Missing PostgreSQL 16 x64 binaries at ${this.root}. Run ${setupCommand} and restart the app.`);
    }
    mkdirSync(path.dirname(this.dataDir), { recursive: true });
    const password = this.password();
    const env = { ...process.env, PGUSER: 'pos_app', PGPASSWORD: password };
    if (!existsSync(path.join(this.dataDir, 'PG_VERSION'))) await run(initdb, ['-D', this.dataDir, '--username=pos_app', `--pwfile=${this.passwordPath}`, '--auth=trust', '--no-locale', '--encoding=UTF8'], env);
    const pgCtlArgs = ['-D', this.dataDir, '-o', `-p ${POSTGRES_PORT}`, '-w', 'start'];
    this.process = spawn(pgCtl, pgCtlArgs, { env, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      this.process.once('error', (error) => reject(new Error(spawnFailureMessage(pgCtl, pgCtlArgs, error))));
      void waitForPort(POSTGRES_PORT).then(resolve, reject);
    });
    await run(createdb, ['-h', '127.0.0.1', '-p', String(POSTGRES_PORT), '-U', 'pos_app', 'motorcycle_pos'], env).catch((error) => {
      if (!/already exists/i.test(error.message)) throw error;
    });
  }
  password() {
    if (!existsSync(this.passwordPath)) writeFileSync(this.passwordPath, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    return require('node:fs').readFileSync(this.passwordPath, 'utf8').trim();
  }
  async stop() {
    if (!this.process) return;
    await run(binary(this.root, 'pg_ctl'), ['-D', this.dataDir, '-m', 'fast', '-w', 'stop'], process.env).catch(() => undefined);
    this.process = null;
  }
}

module.exports = { PostgresManager, POSTGRES_PORT };