const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const backendDir = path.join(rootDir, "backend");
const isProd = process.argv.includes("--prod");

let shuttingDown = false;
const frontendBinary =
  process.platform === "win32"
    ? path.join(rootDir, "node_modules", ".bin", "react-scripts.cmd")
    : path.join(rootDir, "node_modules", ".bin", "react-scripts");

function run(command, cwd, name, extraEnv = {}) {
  const child = spawn(command, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  child.on("exit", (code) => {
    if (code !== 0 && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(`${name.toUpperCase()}_EXIT`);
    }
  });

  child.on("error", (error) => {
    console.error(`[${name}] failed to start:`, error.message);
  });

  return child;
}

function stopProcessTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;

  if (process.platform === "win32") {
    spawn(`taskkill /PID ${child.pid} /T /F`, {
      stdio: "ignore",
      shell: true,
    });
    return;
  }

  child.kill("SIGINT");
}

if (!fs.existsSync(frontendBinary)) {
  console.error("Missing frontend dependency: react-scripts");
  console.error("Please run `npm install` in project root first.");
  process.exit(1);
}

console.log("Starting frontend: local react-scripts start");
const frontend = run(`"${frontendBinary}" start`, rootDir, "frontend", {
  GENERATE_SOURCEMAP: "false",
});

const backendCommand = isProd ? "npm run start" : "npm run dev";
console.log(`Starting backend: ${backendCommand}`);
const backend = run(backendCommand, backendDir, "backend");

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}, shutting down processes...`);
  stopProcessTree(frontend);
  stopProcessTree(backend);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
