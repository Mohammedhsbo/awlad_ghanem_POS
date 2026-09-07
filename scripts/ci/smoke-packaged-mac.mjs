import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';

const appPath = process.argv[2];
const statusPath = process.env.POS_SMOKE_STATUS_PATH;
const apiUrl = 'http://127.0.0.1:3000';
if (!appPath || !statusPath) throw new Error('Usage: smoke-packaged-mac.mjs <app executable> with POS_SMOKE_STATUS_PATH');
if (existsSync(statusPath)) unlinkSync(statusPath);

const child = spawn(appPath, [], { env: { ...process.env, POS_SMOKE_TEST: '1', POS_SMOKE_STATUS_PATH: statusPath }, stdio: 'inherit' });
try {
  const deadline = Date.now() + 120000;
  let status;
  while (Date.now() < deadline) {
    if (existsSync(statusPath)) {
      status = JSON.parse(readFileSync(statusPath, 'utf8'));
      if (status.state === 'ready' || status.state === 'error') break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!status || status.state !== 'ready') throw new Error(`Packaged app smoke test failed: ${JSON.stringify(status)}`);
  if (status.database?.migrate !== 'passed' || status.database?.seed !== 'passed') {
    throw new Error(`Packaged Prisma smoke test did not report successful migrate and seed: ${JSON.stringify(status)}`);
  }

  const health = await fetch(`${apiUrl}/health/ready`);
  if (!health.ok) throw new Error(`API health check failed with HTTP ${health.status}`);
  const login = await fetch(`${apiUrl}/api/v1/auth/admin-login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.POS_ADMIN_EMAIL ?? 'admin@manage.com', password: process.env.POS_ADMIN_PASSWORD ?? 'admin123' }),
  });
  if (!login.ok) throw new Error(`Seeded admin login failed with HTTP ${login.status}`);
  console.log('SMOKE TEST PASSED: PostgreSQL ready-check, migrations, seed, API health, and admin login');
} finally {
  child.kill('SIGTERM');
}