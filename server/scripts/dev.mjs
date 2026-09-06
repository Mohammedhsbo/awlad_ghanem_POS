import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");

let apiProcess;
let compilationId = 0;
let startedCompilationId = -1;

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: appRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: options.stdio ?? "pipe",
  });
}

function stopApi() {
  if (!apiProcess || apiProcess.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(apiProcess.pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } else {
    apiProcess.kill("SIGTERM");
  }

  apiProcess = undefined;
}

function startApi() {
  if (startedCompilationId === compilationId) {
    return;
  }

  startedCompilationId = compilationId;
  stopApi();

  apiProcess = spawnProcess("node", ["--enable-source-maps", "dist/main.js"], {
    stdio: "inherit",
  });

  apiProcess.on("exit", (code, signal) => {
    if (signal || code === 0) {
      return;
    }

    console.error(`API process exited with code ${code}`);
  });
}

const tsc = spawnProcess("pnpm", ["exec", "tsc", "-p", "tsconfig.json", "--watch", "--pretty", "false"]);

tsc.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  if (text.includes("Starting compilation") || text.includes("File change detected")) {
    compilationId += 1;
  }

  if (/Found 0 errors?\./.test(text)) {
    startApi();
  }
});

tsc.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

tsc.on("exit", (code, signal) => {
  stopApi();
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 1);
});

function shutdown() {
  stopApi();
  tsc.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
