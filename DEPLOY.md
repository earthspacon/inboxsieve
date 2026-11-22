# Deploying InboxSieve

Run these in order once the Cloudflare, Paddle, Resend and Groq accounts exist. Every command runs from `apps/worker` unless it says otherwise. Production config is the `[env.production]` block in `apps/worker/wrangler.toml`; the domain there is `inboxsieve.com`, so change every `inboxsieve.com` in that block first if you bought another one.

Names used below:

| Name                | Value                                               |
| ------------------- | --------------------------------------------------- |
| App and pages       | `https://inboxsieve.com`                            |
| Inbound mail domain | `in.inboxsieve.com` (forwarding addresses)          |
| Outbound mail       | `login@mail.inboxsieve.com` (sign-in links, alerts) |

## 0. Before you start

1. Fill `SELLER_LEGAL_NAME` and `CONTACT_EMAIL` in `apps/web/src/site/config.ts`. Every public page reads them; Paddle's domain review wants the legal name in the terms.
2. `pnpm install` at the repo root, then `pnpm -r test` and `pnpm -r typecheck` must be green.

## 1. Cloudflare: domain and Worker

1. Add the domain to Cloudflare (Websites → Add a site) and point the registrar's nameservers at Cloudflare. Wait until the zone is Active.
2. Workers & Pages → Plans: switch to **Workers Paid** ($5/mo). The Free plan's 10 ms CPU limit is too low for MIME parsing.
3. Log in the CLI: `pnpm exec wrangler login`.

## 2. D1

1. `pnpm exec wrangler d1 create inboxsieve`
2. Copy the printed `database_id` into `[[env.production.d1_databases]]` in `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`).
3. `pnpm exec wrangler d1 migrations apply inboxsieve --remote --env production` (applies `0001`–`0005`).

## 3. Resend (outbound mail)

1. Resend → Domains → Add `mail.inboxsieve.com`.
2. Add the DNS records Resend shows (DKIM `TXT`, the SPF `MX` + `TXT` on the `send` subdomain, optional DMARC `TXT`) in Cloudflare DNS. Set them to **DNS only** (grey cloud). Wait for "Verified".
3. Resend → API Keys → create a key with "Sending access" for that domain. Keep it for step 6.

## 4. Paddle (live account, after the domain review passes)

1. Checkout → Website approval: submit `https://inboxsieve.com`. The landing, pricing, terms, privacy and refund pages must be live (do steps 6–7 first with the sandbox values if the review needs a live site).
2. Catalog → Products: create **InboxSieve Solo** and **InboxSieve Agency**, each with a monthly and a yearly price (USD): Solo **$9/mo** and **$90/yr**, Agency **$29/mo** and **$290/yr**, with **no** Paddle trial period (the 14-day Solo trial is local and needs no card; a Paddle trial would add a second one). Copy the 4 `pri_…` ids into `PADDLE_PRICE_SOLO_MONTHLY`, `PADDLE_PRICE_SOLO_YEARLY`, `PADDLE_PRICE_AGENCY_MONTHLY`, `PADDLE_PRICE_AGENCY_YEARLY` in `[env.production.vars]`.
3. Developer tools → Authentication → client-side token: copy it into `PADDLE_CLIENT_TOKEN`.
4. Developer tools → Authentication → API key with write access to customer portal sessions and subscriptions. Keep it for step 6.
5. Developer tools → Notifications → New destination:
   - URL: `https://inboxsieve.com/paddle/webhook`
   - Events: `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `transaction.completed`
   - Copy the destination's secret key for step 6.
6. Checkout → Checkout settings: set the default payment link to `https://inboxsieve.com/app/billing`.

For a sandbox dry run first, use sandbox values and set `PADDLE_ENV = "sandbox"`.

## 5. Groq

1. console.groq.com → API Keys → create a key (the free tier is enough to start).
2. **Required:** Settings → Data Controls → turn on **Zero Data Retention**. The privacy page promises inputs are not retained.
3. **Required:** keep the Groq organization on the free tier, or set a spend limit in Settings → Billing → Limits before the key goes live. The Worker's own caps (item 5) are the first line; the provider limit is the backstop.
4. Optional: set `LLM_MODEL` in `[env.production.vars]` to use a model other than `openai/gpt-oss-120b`. On a Groq 429 the lead stays `queued` and is retried; it is never marked failed for that.
5. The Worker has its own daily caps in `[env.production.vars]`: `LLM_DAILY_USD_CAP` (all accounts, default `3`) and `LLM_ACCOUNT_DAILY_USD_CAP` (one account, default `0.25`). Over a cap, leads stay `queued` and are analyzed after 00:00 UTC. Set `OWNER_ALERT_EMAIL` to the address that gets the one "daily AI budget used up" email per day.

## 5a. Cloudflare Turnstile (bot check on sign-in)

1. Cloudflare → Turnstile → Add widget: name `InboxSieve sign-in`, hostname `inboxsieve.com`, mode **Managed**.
2. Copy the **site key**: it is baked into the SPA at build time as `VITE_TURNSTILE_SITE_KEY` (step 7). Without it the build falls back to Cloudflare's test key and every real sign-in fails, loudly.
3. Copy the **secret key** for step 6 (`TURNSTILE_SECRET_KEY`).
4. Rate limits need nothing in the dashboard: the `AUTH_LIMITER` (30 auth writes per IP per minute) and `WEBHOOK_LIMITER` (120 submissions per webhook per minute) bindings come from `wrangler.toml`. Their `namespace_id`s (`1001`, `1002`) must be unique in the Cloudflare account. Magic-link sends (3 per email per 15 min, 10 per IP per hour) are counted in D1.

## 5b. Google sign-in ("Continue with Google")

Optional, but recommended: most people sign in with Google now. Without these two secrets the button is hidden and email links work as before.

1. Google Cloud Console (console.cloud.google.com) → create a project `InboxSieve`.
2. APIs & Services → OAuth consent screen (Google Auth Platform → Branding/Audience):
   - User type **External**, app name `InboxSieve`, support email and developer contact = your address, app domain `https://inboxsieve.com`, privacy policy `https://inboxsieve.com/privacy`, terms `https://inboxsieve.com/terms`.
   - Data access / scopes: only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. These are non-sensitive, so no Google verification review is needed.
   - Publishing status: **In production** (in "Testing" only listed test users can sign in).
3. APIs & Services → Credentials → Create credentials → OAuth client ID:
   - Application type **Web application**, name `InboxSieve web`.
   - Authorized JavaScript origins: `https://inboxsieve.com`.
   - Authorized redirect URIs: `https://inboxsieve.com/api/auth/callback/google` (exactly this).
4. Copy the client ID and client secret into the two secrets in step 6 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Both must be set, or Google stays off.

Someone who signed in by email link and later uses Google with the same address gets the same account (Google is a trusted provider for account linking). Apple sign-in is not offered: it needs the $99/yr Apple Developer Program, and agency users sign in with Google or their work email.

## 6. Secrets

Each command prompts for the value; never put them in `wrangler.toml`.

```sh
openssl rand -base64 48 | pnpm exec wrangler secret put BETTER_AUTH_SECRET --env production
pnpm exec wrangler secret put GROQ_API_KEY --env production
pnpm exec wrangler secret put RESEND_API_KEY --env production
pnpm exec wrangler secret put PADDLE_API_KEY --env production
pnpm exec wrangler secret put PADDLE_WEBHOOK_SECRET --env production
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env production
pnpm exec wrangler secret put GOOGLE_CLIENT_ID --env production       # optional, step 5b
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --env production   # optional, step 5b
```

## 7. Build and deploy

```sh
VITE_TURNSTILE_SITE_KEY=<site key from 5a> pnpm --filter @inboxsieve/web build   # from the repo root: builds and prerenders apps/web/dist
.agents/launch-gate.sh --deploy           # from the repo root: must exit 0 (placeholders, test keys, stale build = miss)
cd apps/worker
pnpm exec wrangler deploy --dry-run --env production   # check the bindings list
pnpm exec wrangler deploy --env production
```

The custom-domain route in `wrangler.toml` attaches `inboxsieve.com` to the Worker and creates its DNS record. The one cron trigger (every minute; the hourly jobs run at :00) comes from `[env.production.triggers]`.

## 8. Inbound mail (Email Routing)

1. Cloudflare → the zone → Email → Email Routing → enable it and add the MX/TXT records it offers.
2. Email Routing → Settings → add the subdomain `in.inboxsieve.com` (it gets its own MX records).
3. Email Routing → Routing rules → Catch-all address for `in.inboxsieve.com` → action **Send to a Worker** → `inboxsieve`. Every `<brand>-<random>@in.inboxsieve.com` then reaches the Worker's `email()` handler.

## 9. Smoke test (about 10 minutes)

1. Open `https://inboxsieve.com`, then `/pricing`, `/terms`, `/privacy`, `/refunds`, `/dpa`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`. `curl -sI https://inboxsieve.com` shows `content-security-policy` and `strict-transport-security`. `curl -sI https://inboxsieve.com/foo` answers `404` with `x-robots-tag: noindex`. Submit the sitemap in Google Search Console.
2. Sign in with your own email: the Turnstile box turns green and the magic link arrives from `login@mail.inboxsieve.com`. If step 5b is done, sign out and use **Continue with Google** with the same address: you land in the same workspace.
3. The new account lands on Free with no card. Billing → Try Solo free for 14 days switches it to Solo. Then Upgrade to Solo with a real card (refund it afterwards in Paddle). Billing should show Active within seconds; Paddle → Notifications → the destination's log should show `200` responses.
4. Onboarding → Forward email: send a message to the shown address from another mailbox. A lead appears and gets a score.
5. Billing → Manage billing opens the Paddle portal.
6. Make sure `DEV_ROUTES` is `"0"`: `curl -i https://inboxsieve.com/dev/outbox` must answer `404`.
