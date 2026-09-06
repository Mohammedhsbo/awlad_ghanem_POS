const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { existsSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { PostgresManager, POSTGRES_PORT } = require('./postgres-manager.cjs');

const API_PORT = 3000;
const API_READY_TIMEOUT_MS = 45000;
const API_READY_POLL_INTERVAL_MS = 500;
let apiProcess;
let postgres;
let startup = { state: 'starting' };

function rootPath(...parts) { return app.isPackaged ? path.join(process.resourcesPath, ...parts) : path.resolve(__dirname, '../..', ...parts); }
function spawnNeedsShell(command) {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);
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
  return `Failed to spawn ${JSON.stringify(command)} ${JSON.stringify(args)}: ${error.code || error.message}. Resolved path=${JSON.stringify(target.path)} exists=${target.exists} type=${target.type} shell=${spawnNeedsShell(command)}`;
}
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootPath(), env, stdio: ['ignore', 'pipe', 'pipe'], shell: spawnNeedsShell(command) });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => reject(new Error(spawnFailureMessage(command, args, error))));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || spawnFailureMessage(command, args, { code: `exit ${code}` }))));
  });
}
function runtimeEnvironment(databasePassword) {
  return {
    ...process.env,
    NODE_ENV: 'development',
    APP_ENV: 'local',
    DESKTOP_RUNTIME: 'electron-pos',
    API_PORT: String(API_PORT),
    DATABASE_URL: `postgresql://pos_app:${encodeURIComponent(databasePassword)}@127.0.0.1:${POSTGRES_PORT}/motorcycle_pos?schema=public`,
    JWT_SECRET: randomBytes(32).toString('hex'),
    REDIS_URL: '',
    POS_CREDENTIALS_PATH: path.join(app.getPath('userData'), 'initial-credentials.json'),
  };
}
function writeSmokeStatus(status) {
  if (process.env.POS_SMOKE_STATUS_PATH) writeFileSync(process.env.POS_SMOKE_STATUS_PATH, JSON.stringify(status));
}
async function prepareDatabase(env) {
  const prismaCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  if (app.isPackaged) {
    await run(process.execPath, [rootPath('prisma-cli', 'build', 'index.js'), 'migrate', 'deploy'], { ...env, ELECTRON_RUN_AS_NODE: '1' });
    await run(process.execPath, [rootPath('prisma', 'seed.mjs')], env);
    return;
  }
  const prismaArgs = ['exec', 'prisma', 'migrate', 'deploy'];
  await run(prismaCommand, prismaArgs, env);
  await run(prismaCommand, ['exec', 'prisma', 'db', 'seed'], env);
}
async function startApi(env) {
  const apiEntry = rootPath('server', 'dist', 'main.js');
  const apiCommand = process.execPath;
  const apiArgs = [apiEntry];
  apiProcess = spawn(apiCommand, apiArgs, { cwd: rootPath('server'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  apiProcess.once('error', (error) => { console.error(`[api] ${spawnFailureMessage(apiCommand, apiArgs, error)}`); });
  apiProcess.stdout.on('data', (chunk) => console.log(`[api] ${chunk}`));
  apiProcess.stderr.on('data', (chunk) => console.error(`[api] ${chunk}`));
  const startedAt = Date.now();
  const deadline = startedAt + API_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${API_PORT}/health/ready`);
      if (response.ok) {
        console.log(`[startup] API ready on port ${API_PORT} after ${Date.now() - startedAt}ms`);
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, API_READY_POLL_INTERVAL_MS));
  }
  throw new Error(`API did not become ready on port ${API_PORT} within ${API_READY_TIMEOUT_MS}ms`);
}
async function startServices() {
  try {
    startup = { state: 'postgres' };
    writeSmokeStatus(startup);
    postgres = new PostgresManager({ userDataPath: app.getPath('userData'), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged });
    await postgres.start();
    const env = runtimeEnvironment(postgres.password());
    startup = { state: 'database' };
    writeSmokeStatus(startup);
    await prepareDatabase(env);
    startup = { state: 'api' };
    writeSmokeStatus(startup);
    await startApi(env);
    const credentialsPath = path.join(app.getPath('userData'), 'initial-credentials.json');
    const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8')) : undefined;
    startup = { state: 'ready', credentials };
    writeSmokeStatus(startup);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[startup]', message);
    startup = { state: 'error', error: message };
    writeSmokeStatus(startup);
  }
}
async function printHtml({ html, printerName, silent = true }) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => printWindow.webContents.print({ silent, deviceName: printerName }, (success, reason) => { resolve({ success, reason: reason || null }); printWindow.close(); }));
  } catch (error) {
    printWindow.close();
    return { success: false, reason: error instanceof Error ? error.message : 'Print failed' };
  }
}
function createWindow() {
  const window = new BrowserWindow({ width: 1280, height: 800, minWidth: 1024, minHeight: 640, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } });
  window.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('runtime:startup-status', () => startup);
ipcMain.handle('printer:list', async () => BrowserWindow.getAllWindows()[0]?.webContents.getPrintersAsync() ?? []);
ipcMain.handle('printer:test', async (_event, { printerName }) => printHtml({ printerName, html: '<html><body><h1>Motorcycle System</h1><p>Printer test successful.</p></body></html>' }));
ipcMain.handle('printer:print', async (_event, request) => request?.html ? printHtml(request) : { success: false, reason: 'Printable HTML is required' });

app.whenReady().then(() => { createWindow(); void startServices(); });
app.on('before-quit', async () => { apiProcess?.kill('SIGTERM'); await postgres?.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });