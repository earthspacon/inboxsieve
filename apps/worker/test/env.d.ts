declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APP_URL: string;
    INBOUND_DOMAIN: string;
    MAIL_FROM: string;
    DEV_ROUTES: string;
    BETTER_AUTH_SECRET: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

declare module "*?raw" {
  const content: string;
  export default content;
}
