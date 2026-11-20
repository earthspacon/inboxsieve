# InboxSieve

InboxSieve scores every inquiry, filters out spam, drafts a reply and pings you when a lead is hot. Forward your contact-form email to it or point a form webhook at it. It's the hosted version of the AI Lead Agent demo.

## Layout

| Path                | What                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/worker`       | Cloudflare Worker: JSON API, magic-link auth, Email Worker, webhook ingest and lead analysis on D1. The routes are in [`apps/worker/API.md`](apps/worker/API.md) |
| `apps/web`          | The React SPA from the demo. It isn't wired to the API yet                                                                                                       |
| `packages/contract` | Types and contracts shared by both apps: `AnalysisContract`, lead/source states, plan limits, DTOs                                                               |

## Run it locally

You need Node 24 and pnpm 10. No Cloudflare account is needed.

```sh
pnpm install
cd apps/worker
cp .dev.vars.example .dev.vars   # DEV_ROUTES=1 and a local auth secret
pnpm db:migrate                  # applies migrations/ to the local D1
pnpm dev                         # wrangler dev on http://localhost:8787
```

With `DEV_ROUTES=1`:

- Sign-in links go to the `dev_outbox` table. Read them with `GET /dev/outbox?to=<email>`.
- `POST /dev/accounts {"email": "..."}` creates an account in `trialing`. Billing comes later.
- Leads are scored by the rule analyzer when `ANTHROPIC_API_KEY` is not set, so local runs make no paid calls.

To test inbound mail, post a raw `.eml` to the local email handler:

```sh
curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=a@x.example&to=<source address>' \
  --data-binary @fixtures/contact-form.eml
```

To test a webhook:

```sh
curl -X POST http://localhost:8787/h/<token> -H 'content-type: application/json' -d @fixtures/tally.json
```

## Tests

```sh
pnpm -r test        # vitest; the worker suites run inside workerd with a real local D1
pnpm -r typecheck
```

Every test mocks the LLM. The Anthropic client is tested against a stubbed `fetch`.

## Async analysis: `waitUntil` + cron, not Queues

A new lead is stored as `queued` in D1. The request that stored it starts the analysis in `waitUntil`. A cron trigger (`* * * * *`) then sweeps whatever is still due:

- retries after 30 s and 2 min;
- leads stuck in `analyzing` for 5 minutes;
- re-score jobs.

The lead row is the job: its status, attempt count and next-attempt time live in D1. So there is one source of truth, the 3-attempt rule and the backoff are plain SQL that tests can drive with a fixed clock, and there is no second binding to run locally. At the expected volume (a few thousand leads a month per account) one sweep of 25 jobs a minute is enough. Queues become worth it if the sweep falls behind.

## Configuration

Plain variables live in `wrangler.jsonc`:

| Variable         | Purpose                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `APP_URL`        | Public base URL. Used in magic links, webhook URLs and the auth origin check                    |
| `INBOUND_DOMAIN` | Domain of the forwarding addresses (`<brand>-<random>@<domain>`)                                |
| `MAIL_FROM`      | Sender of the sign-in emails                                                                    |
| `DEV_ROUTES`     | `1` turns on `/dev/*`, the dev outbox and the rule analyzer fallback. Keep it `0` in production |

Secrets are set with `wrangler secret put`, or in `.dev.vars` locally:

| Secret               | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| `BETTER_AUTH_SECRET` | Signs session cookies (32+ characters)                       |
| `ANTHROPIC_API_KEY`  | Claude Haiku 5.5 for lead analysis                           |
| `RESEND_API_KEY`     | Sends sign-in emails. Without it, production refuses to send |

## Privacy

- Logs carry no message bodies or addresses: a failed request logs only the error class.
- Raw messages are kept for "View original", capped at 1 MB per lead. The 90-day purge comes with the data slice.
