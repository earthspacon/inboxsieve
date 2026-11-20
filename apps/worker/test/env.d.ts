declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APP_URL: string;
    INBOUND_DOMAIN: string;
    MAIL_FROM: string;
    DEV_ROUTES: string;
    BETTER_AUTH_SECRET: string;
    PADDLE_ENV: string;
    PADDLE_CLIENT_TOKEN: string;
    PADDLE_PRICE_SOLO_MONTHLY: string;
    PADDLE_PRICE_SOLO_YEARLY: string;
    PADDLE_PRICE_AGENCY_MONTHLY: string;
    PADDLE_PRICE_AGENCY_YEARLY: string;
    PADDLE_WEBHOOK_SECRET: string;
    TURNSTILE_SECRET_KEY: string;
    AUTH_LIMITER: RateLimit;
    WEBHOOK_LIMITER: RateLimit;
    LLM_DAILY_USD_CAP: string;
    LLM_ACCOUNT_DAILY_USD_CAP: string;
    OWNER_ALERT_EMAIL: string;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

declare module "*?raw" {
  const content: string;
  export default content;
}
