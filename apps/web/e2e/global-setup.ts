import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { E2E_PORT, E2E_URL, PADDLE_TEST_SECRET } from "./config";

const WORKER_DIR = path.resolve(import.meta.dirname, "../../worker");
const READY_TIMEOUT_MS = 90_000;
const POLL_MS = 500;

let server: ChildProcess | null = null;
let persistDir = "";

export async function setup() {
  persistDir = mkdtempSync(path.join(tmpdir(), "inboxsieve-e2e-"));
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "inboxsieve", "--local", "--persist-to", persistDir],
    {
      cwd: WORKER_DIR,
      stdio: "ignore",
    },
  );
  server = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--port",
      String(E2E_PORT),
      "--persist-to",
      persistDir,
      "--var",
      "DEV_ROUTES:1",
      "--var",
      `APP_URL:${E2E_URL}`,
      "--var",
      "BETTER_AUTH_SECRET:e2e-only-secret-that-is-at-least-32-chars",
      "--var",
      `PADDLE_WEBHOOK_SECRET:${PADDLE_TEST_SECRET}`,
    ],
    {
      cwd: WORKER_DIR,
      stdio: "ignore",
      detached: true,
    },
  );
  await waitForServer();
}

export async function teardown() {
  if (server?.pid) {
    process.kill(-server.pid, "SIGTERM");
  }
  rmSync(persistDir, { recursive: true, force: true });
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const ready = await fetch(`${E2E_URL}/api/auth/get-session`)
      .then((response) => response.ok)
      .catch(() => false);
    if (ready) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
  throw new Error(`wrangler dev did not start on ${E2E_URL}`);
}
