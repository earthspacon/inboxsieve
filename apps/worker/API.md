# InboxSieve worker API

JSON over HTTPS. Types live in `packages/contract/src/domain.ts` (`Me`, `BrandDto`, `ProfileDto`, `SourceDto`, `LeadSummaryDto`, `LeadDetailDto`, `UsageDto`, `ApiError`).

## Conventions

- **Auth:** an HttpOnly session cookie set by the magic-link flow. Every `/api/*` route except `/api/auth/*` needs it.
- **Errors:** every error body is `ApiError`, `{ "error": "<code>", "message": "<text for humans>" }`.

| Status | `error`                         | When                                                                                     |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------- |
| 400    | `invalid_json`, `invalid_field` | The body isn't a JSON object, or a field is missing, the wrong type or too long          |
| 401    | `unauthorized`                  | No session or an expired one                                                             |
| 402    | `subscription_required`         | The account is `no_subscription`. Only `GET /api/me` still works; show "Finish checkout" |
| 403    | `no_account`                    | The user has no active seat                                                              |
| 403    | `read_only`                     | The account is `paused` or `expired` and the request isn't a GET                         |
| 403    | `plan_limit`                    | Creating one more brand or source than the plan allows                                   |
| 404    | `not_found`                     | Unknown route, or a brand, source or lead outside your account                           |
| 409    | `invalid_transition`            | The stage or status move isn't allowed (see the stage rules below)                       |
| 409    | `conflict`                      | The lead changed between the read and the write. Reload it                               |
| 500    | `internal`                      | Unexpected error. Nothing is logged except the error class                               |

- **Access by subscription** (`SUBSCRIPTION_ACCESS`):
  - `trialing`, `active`, `past_due`, `canceled`: full access.
  - `paused`, `expired`: read-only.
  - `no_subscription`: locked.
- **Timestamps:** ISO 8601 strings in UTC.
- **IDs:** opaque strings.

## Auth (Better Auth, base path `/api/auth`)

| Route                                                                      | Request                                                                                                   | Response                                                                                                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in/magic-link`                                        | `{ "email", "callbackURL": "/app", "errorCallbackURL": "/sign-in" }`. Send the `Origin` header of the app | `200 { "status": true }`. The link is emailed (dev: `dev_outbox`)                                                                                                                      |
| `GET /api/auth/magic-link/verify?token=…&callbackURL=…&errorCallbackURL=…` | The link from the email                                                                                   | `302` to `callbackURL` with a session cookie. If the link is used, expired (15 min) or unknown: `302` to `errorCallbackURL?error=…` and no cookie. That is the "Send a new link" state |
| `GET /api/auth/get-session`                                                | cookie                                                                                                    | `{ session, user }` or `null`                                                                                                                                                          |
| `POST /api/auth/sign-out`                                                  | cookie + `Origin`                                                                                         | `200 { "success": true }`; the session is deleted                                                                                                                                      |

The first sign-in of an unknown email creates a user and an account in `no_subscription` with one default brand ("My brand") and an owner seat.

## Account and brands

| Route                                 | Request                  | Response                                                                                                                                                                      |
| ------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/me`                         | –                        | `200 Me & { brands: BrandDto[] }`. `account.access` is `full`, `read_only` or `locked`                                                                                        |
| `GET /api/brands`                     | –                        | `200 BrandDto[]`                                                                                                                                                              |
| `POST /api/brands`                    | `{ "name": string ≤80 }` | `201 BrandDto`; `403 plan_limit` (Solo 1, Agency 10)                                                                                                                          |
| `PATCH /api/brands/:brandId`          | `{ "name": string ≤80 }` | `200 BrandDto` (onboarding step 1)                                                                                                                                            |
| `POST /api/brands/:brandId/test-lead` | –                        | `201 { id, status }`. Injects one sample lead through the first source of the brand and analyzes it ("Send a test lead"). `409 no_source` if the brand has no source          |
| `GET /api/brands/:brandId/usage`      | –                        | `200 UsageDto` `{ month: "2026-11", used, limit }`. `used` counts the account's leads this UTC month that went to analysis. Rule-filtered spam and parse failures don't count |

## Business profile (F3)

| Route                               | Request                                                                                 | Response                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/brands/:brandId/profile`  | –                                                                                       | `200 ProfileDto`. `state: "defaults"` comes with generic values; show the "Improve accuracy" nudge |
| `PUT /api/brands/:brandId/profile`  | `{ services, idealClient, minBudget, tone, signature, bookingLink }`, all strings ≤2000 | `200 ProfileDto & { rescoreOffered: true }`. Offer "Re-score last 50 leads"                        |
| `POST /api/brands/:brandId/rescore` | –                                                                                       | `202 { queued: n }`, with n ≤ 50. It queues the newest `analyzed`/`analysis_failed` leads          |

## Sources (F2)

| Route                                                      | Request                                                                               | Response                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/brands/:brandId/sources`                         | –                                                                                     | `200 SourceDto[]`. An empty list is the `not_connected` state; show the "Connect a source" CTA                                                                                                                              |
| `POST /api/brands/:brandId/sources`                        | `{ "kind": "email" \| "webhook", "name": string ≤80 }` (an empty name gets a default) | `201 SourceDto` in `awaiting_first_message`. Email sources get `address` (`<brand>-<10 hex>@<INBOUND_DOMAIN>`); webhook sources get `webhookUrl` (`<APP_URL>/h/<32 hex>`). `403 plan_limit` (Solo 2, Agency 20 per account) |
| `PATCH /api/brands/:brandId/sources/:sourceId`             | `{ "name"?: string, "enabled"?: boolean }`                                            | `200 SourceDto`. `enabled: false` sets `disabled`. `enabled: true` sets `connected` if the source has leads, else `awaiting_first_message`                                                                                  |
| `POST /api/brands/:brandId/sources/:sourceId/rotate-token` | –                                                                                     | `200 SourceDto` with a new `webhookUrl`. The old URL answers 404 at once                                                                                                                                                    |
| `DELETE /api/brands/:brandId/sources/:sourceId`            | –                                                                                     | `204`; its leads are deleted too                                                                                                                                                                                            |

`SourceDto.state` values and what the UI shows:

| State                    | Meaning                                                                               | UI                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `awaiting_first_message` | Created, nothing received yet                                                         | Show the address or URL and the setup steps for Gmail, Outlook and WPForms |
| `verification_pending`   | A Gmail/Outlook forwarding confirmation arrived                                       | Show `verification.link` and `verification.code`. We never open the link   |
| `connected`              | The first real message or payload arrived                                             | –                                                                          |
| `error`                  | Mail over 25 MiB, or a webhook payload that was invalid or had no email/message field | Show `lastError`                                                           |
| `disabled`               | Turned off by the user                                                                | Mail is rejected and the webhook answers 410                               |

## Leads (F4, F5)

| Route                                              | Request                                                                                                                                                                                                                                       | Response                                                                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/brands/:brandId/leads`                   | Query: `scoreMin`, `scoreMax` (0–100), `category` (`hot\|warm\|cold\|spam`), `stage`, `status`, `q` (name/email/company/subject contains), `before` (ISO `receivedAt` cursor), `limit` (default 50, max 100). Unknown enum values are ignored | `200 LeadSummaryDto[]`, newest first. Next page: `before=<last.receivedAt>`                                                                                                                |
| `GET /api/brands/:brandId/leads/:leadId`           | –                                                                                                                                                                                                                                             | `200 LeadDetailDto` with `analysis`, `draft`, `repliedAt`, `lastError`, `hasOriginal` and `events` (status, stage, draft, replied and feedback history)                                    |
| `GET /api/brands/:brandId/leads/:leadId/original`  | –                                                                                                                                                                                                                                             | `200 text/plain` with the raw email or webhook body ("View original"), capped at 1,000,000 chars. `404` once it's purged                                                                   |
| `PATCH /api/brands/:brandId/leads/:leadId/stage`   | `{ "stage": LeadStage }`                                                                                                                                                                                                                      | `200 LeadDetailDto`; `409 invalid_transition` (rules below); `400` for an unknown stage                                                                                                    |
| `PUT /api/brands/:brandId/leads/:leadId/draft`     | `{ "draft": string ≤20000 }`                                                                                                                                                                                                                  | `200 LeadDetailDto`                                                                                                                                                                        |
| `POST /api/brands/:brandId/leads/:leadId/replied`  | –                                                                                                                                                                                                                                             | `200 LeadDetailDto`. Sets `repliedAt`, and `new` becomes `contacted`. `409` for `spam`/`lost`                                                                                              |
| `POST /api/brands/:brandId/leads/:leadId/not-spam` | –                                                                                                                                                                                                                                             | `200 LeadDetailDto`. Moves `spam` → `new` and stores a `not_spam` feedback row. A rule-filtered lead is also queued for analysis, or goes to `over_quota`. `409` if the stage isn't `spam` |
| `POST /api/brands/:brandId/leads/:leadId/feedback` | `{ "expectedScore": 0–100 integer, "note"?: string ≤1000 }`                                                                                                                                                                                   | `201 { id }`. A "wrong score" example for this brand's prompt; the latest 5 are used                                                                                                       |
| `POST /api/brands/:brandId/leads/:leadId/retry`    | –                                                                                                                                                                                                                                             | `202 LeadDetailDto` (`queued`). `409` unless the status is `analysis_failed`                                                                                                               |

**Stage rules** (`STAGE_TRANSITIONS`):

- `new` → `contacted`, `meeting`, `lost`, `spam`
- `contacted` → `meeting`, `won`, `lost`
- `meeting` → `won`, `lost`
- `lost` → `new`
- `spam` → `new`
- `won` is final.

**Processing status** (`LeadStatus`, F4):

- Happy path: `received` → `parsed` → `queued` → `analyzing` → `analyzed`.
- `spam_filtered`: a rule matched. Stage is `spam` and there was no LLM call.
- `over_quota`: the plan's monthly limit was reached. The lead is stored but not analyzed; show the upgrade banner.
- `parse_failed`: nothing usable was found. Use "View original".
- `analysis_failed`: the LLM failed or its answer broke the contract 3 times (retries after 30 s and 2 min). Show "Retry".

## Ingest (public)

| Route            | Request                                                                                                                                                                                                                                      | Response                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /h/:token` | JSON (Tally, Typeform, Webflow or a flat object) or `application/x-www-form-urlencoded` (WPForms, Zapier, Make). Optional `Idempotency-Key` header; Tally `eventId`, Typeform `event_id` and Webflow `payload.id` are used when it's missing | `202 { id, status, duplicate }`. `404` unknown token, `410` disabled source, `400` invalid JSON (source → `error`), `413` over 1 MiB                 |
| Email Worker     | Mail to a source address                                                                                                                                                                                                                     | Stored as a lead. A forwarding confirmation sets `verification_pending`. Mail over 25 MiB, to a disabled source or to an unknown address is rejected |

## Dev only (`DEV_ROUTES=1`, otherwise 404)

| Route                        | Request                                    | Response                                                                                                        |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `POST /dev/accounts`         | `{ "email", "plan"?: "solo" \| "agency" }` | `201 { userId, accountId, brandId }`. Creates or updates a `trialing` account, standing in for billing until S5 |
| `GET /dev/outbox?to=<email>` | –                                          | `200 [{ to, subject, body, createdAt }]`, newest first. Magic links land here                                   |
| `POST /dev/usage`            | `{ "brandId", "count" }`                   | `201 { inserted }`. Inserts `count` analyzed leads that count to quota, for the usage-banner screenshot         |
| `POST /dev/run-jobs`         | –                                          | `200 { processed }`. Runs the analysis sweep now instead of waiting for the cron                                |

## Billing (F1, F7)

| Route                      | Request                                     | Response                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/billing`         | –                                           | `200 BillingDto`: plan, status, `currentPeriodEnd`, `pendingPlan` (a downgrade waiting for the period end), `scheduledChange`, `pastDueSince`, `isAnalysisPaused`, `hasCustomer` and the Paddle.js `checkout` config (environment, client token, price ids). Works while the account is `no_subscription` |
| `POST /api/billing/portal` | –                                           | `200 { url }`, a fresh Paddle customer-portal link (owner only). `409 no_customer` before the first subscription, `503 billing_unavailable` without `PADDLE_API_KEY`, `403 owner_only` for members                                                                                                        |
| `POST /paddle/webhook`     | Paddle event, `Paddle-Signature: ts=…;h1=…` | `200 { received, outcome }` with `outcome` = `applied`, `duplicate`, `recorded` (non-subscription events), `illegal_transition`, `stale`, `unknown_account` or `other_subscription`. `401` for a missing, wrong or >5 s old signature; nothing is stored then                                             |

- The account is found by `custom_data.account_id` (set by the SPA in `Paddle.Checkout.open`) or by the stored subscription id.
- Status moves only through `nextSubscriptionStatus` (`src/billing/state.ts`).
- Upgrades apply at once. A downgrade sets `pendingPlan` and applies at `current_period_end` (hourly job); brands over the new limit get `readOnly: true`, and any write to them answers `403 read_only`.
- `past_due`: full access; queued analysis stops after 7 days and resumes when the status leaves `past_due`.
- `canceled` keeps access until `current_period_end`, then the hourly job sets `expired` (read-only).

## Alerts (F6)

| Route                               | Request                                                                                                                                                                                       | Response                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `PATCH /api/brands/:brandId/alerts` | `{ "enabled": boolean, "threshold": 0–100, "slackWebhookUrl"?: string \| null }`. `null`/missing keeps the saved Slack URL, `""` removes it; a URL must start with `https://hooks.slack.com/` | `200 BrandDto`. Saving clears `delivery_failed` |

`BrandDto.alertState` is `enabled`, `disabled` or `delivery_failed` (`alertLastError` has the reason). A lead that reaches `analyzed` with `score ≥ alertThreshold` (default 80) queues one email per active seat and one Slack post; each is tried at once, then after 10 s and 30 s, and after the 3rd failure the brand shows `delivery_failed`.

| Dev route                   | Request                | Response                                                                         |
| --------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `POST /dev/run-maintenance` | `{ "now"?: ISO time }` | `200 { planChanges, expired, reminders }`. Runs the hourly job at the given time |
