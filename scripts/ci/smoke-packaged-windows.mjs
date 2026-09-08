import { existsSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const appPath = process.argv[2];
if (!appPath) throw new Error('Usage: smoke-packaged-windows.mjs <app executable>');

const smokeRoot = join(tmpdir(), `motorcycle-system-smoke-${process.pid}`);
const userDataPath = join(smokeRoot, 'user-data');
const statusPath = join(smokeRoot, 'status.json');
const apiUrl = 'http://127.0.0.1:3000';
rmSync(smokeRoot, { recursive: true, force: true });

async function launch(expectedInitialized) {
  if (existsSync(statusPath)) unlinkSync(statusPath);
  const child = spawn(appPath, [], {
    env: {
      ...process.env,
      POS_SMOKE_TEST: '1',
      POS_SMOKE_STATUS_PATH: statusPath,
      POS_SMOKE_USER_DATA_PATH: userDataPath,
      POS_SMOKE_EXIT_AFTER_READY: '1',
    },
    stdio: 'inherit',
  });

  let status;
  try {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (existsSync(statusPath)) {
        status = JSON.parse(readFileSync(statusPath, 'utf8'));
        if (status.state === 'ready' || status.state === 'error') break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!status || status.state !== 'ready') throw new Error(`Packaged app smoke test failed: ${JSON.stringify(status)}`);
    if (status.initialized !== expectedInitialized) {
      throw new Error(`Expected PostgreSQL initialized=${expectedInitialized}, received ${JSON.stringify(status)}`);
    }
    if (status.database?.migrate !== 'passed' || status.database?.seed !== 'passed') {
      throw new Error(`Packaged Prisma smoke test did not report successful migrate and seed: ${JSON.stringify(status)}`);
    }
    const health = await fetch(`${apiUrl}/health/ready`);
    if (!health.ok) throw new Error(`API health check failed with HTTP ${health.status}`);
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Packaged app exited with code ${code}`)));
    });
  } finally {
    if (!child.killed) child.kill();
  }
}

try {
  await launch(true);
  await launch(false);
  console.log('SMOKE TEST PASSED: clean embedded PostgreSQL init, reuse, migrations, API health, and graceful quit');
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
