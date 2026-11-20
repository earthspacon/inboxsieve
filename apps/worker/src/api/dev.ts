import type { Plan } from '@inboxsieve/contract';

import { HttpError, json, readJson, readString, route, type Route } from '../http';
import { newId } from '../ids';
import { runDueJobs } from '../leads/jobs';
import { createAccount, getAccountContext, setSubscription } from '../repo';
import type { PublicContext } from './context';

const EMAIL_MAX_LENGTH = 254;
const OUTBOX_LIMIT = 20;

// Dev-only: billing lands in S5, so local runs and tests start a trial here.
export const devRoutes: Route<PublicContext>[] = [
  route('POST', '/dev/accounts', async ({ deps, request }) => {
    const data = await readJson(request);
    const email = readString({ data, key: 'email', maxLength: EMAIL_MAX_LENGTH }).trim().toLowerCase();
    const plan: Plan = data.plan === 'agency' ? 'agency' : 'solo';
    const now = deps.now();

    if (!email.includes('@')) {
      throw new HttpError(400, 'invalid_field', '"email" must be an email address');
    }

    const userId = await ensureUser({ db: deps.db, email, now });
    const existing = await getAccountContext({ db: deps.db, userId });
    const accountId =
      existing?.accountId ??
      (await createAccount({
        db: deps.db,
        userId,
        email,
        plan,
        status: 'trialing',
        now,
      }));

    await setSubscription({
      db: deps.db,
      accountId,
      status: 'trialing',
      plan,
      now,
    });
    const brand = await deps.db
      .prepare('SELECT id FROM brands WHERE account_id = ? ORDER BY created_at, id LIMIT 1')
      .bind(accountId)
      .first<{ id: string }>();
    return json(
      {
        userId,
        accountId,
        brandId: brand?.id ?? null,
      },
      201,
    );
  }),

  route('GET', '/dev/outbox', async ({ deps, request }) => {
    const to = new URL(request.url).searchParams.get('to') ?? '';
    const { results } = await deps.db
      .prepare('SELECT to_address AS "to", subject, body, created_at AS createdAt FROM dev_outbox WHERE to_address = ? ORDER BY id DESC LIMIT ?')
      .bind(to.toLowerCase(), OUTBOX_LIMIT)
      .all();
    return json(results);
  }),

  route('POST', '/dev/run-jobs', async ({ deps }) => {
    const processed = await runDueJobs({ db: deps.db, analyzer: deps.analyzer, now: deps.now() });
    return json({ processed });
  }),
];

async function ensureUser({ db, email, now }: { db: D1Database; email: string; now: Date }) {
  const at = now.toISOString();
  const row = await db
    .prepare(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (?, '', ?, 1, ?, ?)
       ON CONFLICT (email) DO UPDATE SET updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(newId(), email, at, at)
    .first<{ id: string }>();

  if (!row) {
    throw new Error('Could not create the user');
  }
  return row.id;
}
