export type Env = {
  DB: D1Database;
  APP_URL: string;
  INBOUND_DOMAIN: string;
  MAIL_FROM: string;
  DEV_ROUTES: string;
  BETTER_AUTH_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  RESEND_API_KEY?: string;
};

export function isDev(env: Env) {
  return env.DEV_ROUTES === '1';
}
