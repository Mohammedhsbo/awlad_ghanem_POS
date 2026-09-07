import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageRoot = path.join(repoRoot, '.build', 'prisma-cli');

function packageRoot(packageName, fromRoot) {
  let current = fromRoot;
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'node_modules', packageName);
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
    current = path.dirname(current);
  }
  throw new Error(`Could not locate package root for ${packageName} from ${fromRoot}`);
}

function manifest(packageRootPath) {
  return JSON.parse(readFileSync(path.join(packageRootPath, 'package.json'), 'utf8'));
}

function dependenciesOf(packageManifest) {
  return [...new Set([
    ...Object.keys(packageManifest.dependencies ?? {}),
    ...Object.keys(packageManifest.optionalDependencies ?? {}),
  ])];
}

function copyPackage(packageName, sourceRoot, destinationRoot, dependenciesRoot) {
  if (existsSync(path.join(destinationRoot, 'package.json'))) return;

  mkdirSync(destinationRoot, { recursive: true });
  cpSync(sourceRoot, destinationRoot, {
    recursive: true,
    dereference: true,
    filter: (source) => path.basename(source) !== 'node_modules' && path.basename(source) !== '_nm',
  });

  const packageManifest = manifest(sourceRoot);
  for (const dependencyName of dependenciesOf(packageManifest)) {
    let dependencyRoot;
    try {
      dependencyRoot = packageRoot(dependencyName, sourceRoot);
    } catch (error) {
      if (packageManifest.optionalDependencies?.[dependencyName]) continue;
      throw new Error(`Unable to resolve Prisma runtime dependency ${dependencyName} for ${packageName}`, { cause: error });
    }
    copyPackage(
      dependencyName,
      dependencyRoot,
      path.join(dependenciesRoot, dependencyName),
      dependenciesRoot,
    );
  }
}

function findFiles(root, predicate, result = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) findFiles(entryPath, predicate, result);
    else if (predicate(entry.name, entryPath)) result.push(entryPath);
  }
  return result;
}

function assertNoSymlinks(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (lstatSync(entryPath).isSymbolicLink()) throw new Error(`Prisma runtime contains a symlink: ${entryPath}`);
      if (entry.isDirectory()) pending.push(entryPath);
    }
  }
}

rmSync(stageRoot, { recursive: true, force: true });
const prismaRoot = packageRoot('prisma', repoRoot);
const dependenciesRoot = path.join(stageRoot, 'prisma-cli-deps');
copyPackage('prisma', prismaRoot, stageRoot, dependenciesRoot);
assertNoSymlinks(stageRoot);

const engineFiles = findFiles(stageRoot, (name) => /(?:query_engine|schema-engine)-/.test(name));
if (engineFiles.length === 0) throw new Error('Prisma runtime staging produced no engine binaries');

if (process.platform === 'darwin' && process.arch === 'x64') {
  const darwinEngineFiles = engineFiles.filter((file) => path.basename(file).includes('darwin'));
  if (darwinEngineFiles.length === 0) throw new Error('Prisma runtime staging produced no darwin x64 engine binaries');
  console.log(`Prepared Prisma ${manifest(prismaRoot).version} runtime for darwin x64 with ${darwinEngineFiles.length} darwin engine files`);
} else {
  console.log(`Prepared Prisma ${manifest(prismaRoot).version} runtime with ${engineFiles.length} engine files (target validation runs on darwin x64)`);
}
