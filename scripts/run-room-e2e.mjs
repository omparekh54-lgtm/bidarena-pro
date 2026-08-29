import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const origin = "http://127.0.0.1:3100";
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const logs = [];
const server = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", "3100"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => logs.push(String(chunk)));
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before the test started.\n${logs.join("")}`);
    try {
      const response = await fetch(`${origin}/api/status`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Next.js did not become ready.\n${logs.join("")}`);
}

try {
  await waitForServer();
  process.env.BIDARENA_E2E_ORIGIN = origin;
  await import("./room-e2e.mjs");
} catch (error) {
  console.error(error);
  console.error(logs.join(""));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
