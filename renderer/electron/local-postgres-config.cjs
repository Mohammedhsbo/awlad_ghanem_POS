const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '..', '..', '.env');

function readEnvFileValue(name) {
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, 'utf8').split(/\r?\n/).find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
}

function getLocalPostgresPort(environment = process.env) {
  const value = environment.LOCAL_POSTGRES_PORT || readEnvFileValue('LOCAL_POSTGRES_PORT') || '55432';
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`LOCAL_POSTGRES_PORT must be a valid TCP port, received ${JSON.stringify(value)}`);
  }
  return port;
}

module.exports = { getLocalPostgresPort };