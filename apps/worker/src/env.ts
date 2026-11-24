export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  APP_URL: string;
  INBOUND_DOMAIN: string;
  MAIL_FROM: string;
  DEV_ROUTES: string;
  PADDLE_ENV: string;
  PADDLE_CLIENT_TOKEN?: string;
  PADDLE_PRICE_MONTHLY?: string;
  PADDLE_PRICE_YEARLY?: string;
  BETTER_AUTH_SECRET: string;
  GROQ_API_KEY?: string;
  BREVO_API_KEY?: string;
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_LIMITER: RateLimit;
  WEBHOOK_LIMITER: RateLimit;
  LLM_MODEL?: string;
  LLM_DAILY_USD_CAP?: string;
  LLM_ACCOUNT_DAILY_USD_CAP?: string;
  OWNER_ALERT_EMAIL?: string;
};

export function isDev(env: Env) {
  return env.DEV_ROUTES === "1";
}
