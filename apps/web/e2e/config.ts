export const E2E_PORT = 8790;
export const E2E_URL = `http://localhost:${E2E_PORT}`;
export const PADDLE_TEST_SECRET = "pdl_ntfset_e2e_test_secret";
export const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/opt/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell";
export const SHOTS_DIR = "/tmp/shots/inboxsieve";
