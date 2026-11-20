# Deploying InboxSieve

Run these in order once the Cloudflare, Paddle, Resend and Anthropic accounts exist. Every command runs from `apps/worker` unless it says otherwise. Production config is the `[env.production]` block in `apps/worker/wrangler.toml`; the domain there is `inboxsieve.com`, so change every `inboxsieve.com` in that block first if you bought another one.

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
3. `pnpm exec wrangler d1 migrations apply inboxsieve --remote --env production` (applies `0001`–`0003`).

## 3. Resend (outbound mail)

1. Resend → Domains → Add `mail.inboxsieve.com`.
2. Add the DNS records Resend shows (DKIM `TXT`, the SPF `MX` + `TXT` on the `send` subdomain, optional DMARC `TXT`) in Cloudflare DNS. Set them to **DNS only** (grey cloud). Wait for "Verified".
3. Resend → API Keys → create a key with "Sending access" for that domain. Keep it for step 6.

## 4. Paddle (live account, after the domain review passes)

1. Checkout → Website approval: submit `https://inboxsieve.com`. The landing, pricing, terms, privacy and refund pages must be live (do steps 6–7 first with the sandbox values if the review needs a live site).
2. Catalog → Products: create **InboxSieve Solo** and **InboxSieve Agency**, each with a monthly and a yearly price: $29/mo, $290/yr, $79/mo, $790/yr, 7-day trial with payment method required. Copy the 4 `pri_…` ids into `PADDLE_PRICE_SOLO_MONTHLY`, `PADDLE_PRICE_SOLO_YEARLY`, `PADDLE_PRICE_AGENCY_MONTHLY`, `PADDLE_PRICE_AGENCY_YEARLY` in `[env.production.vars]`.
3. Developer tools → Authentication → client-side token: copy it into `PADDLE_CLIENT_TOKEN`.
4. Developer tools → Authentication → API key with write access to customer portal sessions and subscriptions. Keep it for step 6.
5. Developer tools → Notifications → New destination:
   - URL: `https://inboxsieve.com/paddle/webhook`
   - Events: `subscription.created`, `subscription.activated`, `subscription.trialing`, `subscription.updated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `transaction.completed`
   - Copy the destination's secret key for step 6.
6. Checkout → Checkout settings: set the default payment link to `https://inboxsieve.com/app/checkout`.

For a sandbox dry run first, use sandbox values and set `PADDLE_ENV = "sandbox"`.

## 5. Anthropic

Console → API keys → create a key for the workspace that bills InboxSieve. Optionally set a monthly spend limit (the plan math in the spec assumes ≈ $0.0004 per lead).

## 6. Secrets

Each command prompts for the value; never put them in `wrangler.toml`.

```sh
openssl rand -base64 48 | pnpm exec wrangler secret put BETTER_AUTH_SECRET --env production
pnpm exec wrangler secret put ANTHROPIC_API_KEY --env production
pnpm exec wrangler secret put RESEND_API_KEY --env production
pnpm exec wrangler secret put PADDLE_API_KEY --env production
pnpm exec wrangler secret put PADDLE_WEBHOOK_SECRET --env production
```

## 7. Build and deploy

```sh
pnpm --filter @inboxsieve/web build      # from the repo root: builds apps/web/dist
cd apps/worker
pnpm exec wrangler deploy --dry-run --env production   # check the bindings list
pnpm exec wrangler deploy --env production
```

The custom-domain route in `wrangler.toml` attaches `inboxsieve.com` to the Worker and creates its DNS record. The two crons (every minute, hourly) come from `[env.production.triggers]`.

## 8. Inbound mail (Email Routing)

1. Cloudflare → the zone → Email → Email Routing → enable it and add the MX/TXT records it offers.
2. Email Routing → Settings → add the subdomain `in.inboxsieve.com` (it gets its own MX records).
3. Email Routing → Routing rules → Catch-all address for `in.inboxsieve.com` → action **Send to a Worker** → `inboxsieve`. Every `<brand>-<random>@in.inboxsieve.com` then reaches the Worker's `email()` handler.

## 9. Smoke test (about 10 minutes)

1. Open `https://inboxsieve.com`, then `/pricing`, `/terms`, `/privacy`, `/refunds`, `/dpa`, `/llms.txt`.
2. Sign in with your own email: the magic link arrives from `login@mail.inboxsieve.com`.
3. Finish checkout with a real card (refund it afterwards in Paddle). The app should unlock within seconds; Paddle → Notifications → the destination's log should show `200` responses.
4. Onboarding → Forward email: send a message to the shown address from another mailbox. A lead appears and gets a score.
5. Billing → Manage billing opens the Paddle portal.
6. Make sure `DEV_ROUTES` is `"0"`: `curl -i https://inboxsieve.com/dev/outbox` must answer `404`.
