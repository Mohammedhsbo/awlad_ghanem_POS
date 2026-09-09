import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployRoot = path.join(repoRoot, '.build', 'server-deploy');
const nodeModulesRoot = path.join(deployRoot, 'node_modules');
const stagedNodeModulesRoot = `${nodeModulesRoot}.staging-${process.pid}`;

const requiredPackages = [
  'reflect-metadata',
  '@nestjs/core',
  '@prisma/client',
  'rxjs',
];

function packagePath(root, packageName) {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    return path.join(root, scope, name);
  }
  return path.join(root, packageName);
}

function copyEntry(sourcePath, destinationPath) {
  const stats = lstatSync(sourcePath);
  if (stats.isSymbolicLink()) {
    copyTree(realpathSync(sourcePath), destinationPath);
    return;
  }
  if (stats.isDirectory()) {
    copyTree(sourcePath, destinationPath);
    return;
  }
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath);
}

function copyTree(sourceRoot, destinationRoot) {
  mkdirSync(destinationRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    copyEntry(path.join(sourceRoot, entry.name), path.join(destinationRoot, entry.name));
  }
}

function assertNoSymlinks(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (lstatSync(entryPath).isSymbolicLink()) {
        throw new Error(`Server deploy runtime contains a symlink: ${entryPath}`);
      }
      if (entry.isDirectory()) pending.push(entryPath);
    }
  }
}

function assertRequiredPackages(root) {
  for (const packageName of requiredPackages) {
    const packageRoot = packagePath(root, packageName);
    const manifestPath = path.join(packageRoot, 'package.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Missing required runtime package ${packageName} at ${packageRoot}`);
    }
    JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
}

if (!existsSync(nodeModulesRoot)) {
  throw new Error(`Expected server deploy node_modules at ${nodeModulesRoot}. Run pnpm deploy first.`);
}

try {
  rmSync(stagedNodeModulesRoot, { recursive: true, force: true });
  copyTree(nodeModulesRoot, stagedNodeModulesRoot);
  assertNoSymlinks(stagedNodeModulesRoot);
  assertRequiredPackages(stagedNodeModulesRoot);
  rmSync(nodeModulesRoot, { recursive: true, force: true });
  cpSync(stagedNodeModulesRoot, nodeModulesRoot, { recursive: true, dereference: true });
  rmSync(stagedNodeModulesRoot, { recursive: true, force: true });
  console.log(`Prepared server-deploy node_modules for packaging (${requiredPackages.length} critical packages verified)`);
} catch (error) {
  rmSync(stagedNodeModulesRoot, { recursive: true, force: true });
  throw error;
}
