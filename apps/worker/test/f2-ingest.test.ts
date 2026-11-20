import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import contactForm from '../fixtures/contact-form.eml?raw';
import emptyBody from '../fixtures/empty-body.eml?raw';
import gmailConfirm from '../fixtures/gmail-forward-confirm.eml?raw';
import gmailForwardedLead from '../fixtures/gmail-forwarded-lead.eml?raw';
import invalidJson from '../fixtures/invalid.json?raw';
import outlookConfirm from '../fixtures/outlook-forward-confirm.eml?raw';
import seoSpam from '../fixtures/seo-spam.eml?raw';
import tally from '../fixtures/tally.json?raw';
import typeform from '../fixtures/typeform.json?raw';
import webflow from '../fixtures/webflow.json?raw';
import wpforms from '../fixtures/wpforms.txt?raw';
import { handleInboundEmail, MAX_INBOUND_BYTES } from '../src/ingest/email';
import worker from '../src/index';
import { getSource, updateSourceState } from '../src/repo';
import { buildInboundEmail, countRows, db, seedAccount, seedSource } from './helpers';

const BASE = 'http://localhost:8787';

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedEmailSource() {
  const { brandId } = await seedAccount();
  const source = await seedSource({ brandId, kind: 'email' });
  return {
    brandId,
    source,
    address: source.address ?? '',
  };
}

async function seedWebhookSource() {
  const { brandId } = await seedAccount();
  const source = await seedSource({ brandId, kind: 'webhook' });
  return {
    brandId,
    source,
    token: source.token ?? '',
  };
}

async function receive({ raw, to }: { raw: string; to: string }) {
  const message = buildInboundEmail({ raw, to });
  const outcome = await handleInboundEmail({ db, message, now: new Date() });
  return {
    message,
    outcome,
  };
}

async function countLeads(brandId: string) {
  return countRows({ sql: 'SELECT COUNT(*) AS n FROM leads WHERE brand_id = ?', binds: [brandId] });
}

async function postWebhook({ token, body, contentType = 'application/json', headers = {} }: {
  token: string;
  body: string;
  contentType?: string;
  headers?: Record<string, string>;
}) {
  return SELF.fetch(`${BASE}/h/${token}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      ...headers,
    },
    body,
  });
}

async function readLeadByEmail({ brandId, email }: { brandId: string; email: string }) {
  return db.prepare('SELECT * FROM leads WHERE brand_id = ? AND email = ?').bind(brandId, email).first<Record<string, string>>();
}

describe('F2 forwarded email', () => {
  it('F2: a Gmail forwarding confirmation sets verification_pending with the link and code, creates no lead and is never clicked', async () => {
    const { brandId, source, address } = await seedEmailSource();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { outcome } = await receive({ raw: gmailConfirm, to: address });

    const updated = await getSource({ db, brandId, sourceId: source.id });
    expect(outcome.kind).toBe('verification');
    expect(updated?.state).toBe('verification_pending');
    expect(updated?.verification_link).toBe('https://mail-settings.google.example/mail/vf-%5BANGjdJ8-sample-token%5D-Zm9yd2FyZA');
    expect(updated?.verification_code).toBe('482915037');
    expect(await countLeads(brandId)).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('F2: an Outlook forwarding confirmation in HTML shows the confirm link, not another link', async () => {
    const { brandId, source, address } = await seedEmailSource();

    await receive({ raw: outlookConfirm, to: address });

    const updated = await getSource({ db, brandId, sourceId: source.id });
    expect(updated?.state).toBe('verification_pending');
    expect(updated?.verification_link).toBe('https://account.outlook.example/forwarding/confirm?code=7F3K-92QX');
    expect(updated?.verification_code).toBe('7F3K-92QX');
  });

  it('F2: a contact-form email connects the source and creates 1 lead with the form fields', async () => {
    const { brandId, source, address } = await seedEmailSource();

    const { outcome } = await receive({ raw: contactForm, to: address });

    const lead = await readLeadByEmail({ brandId, email: 'dana@northwind.example' });
    expect(outcome.kind).toBe('lead');
    expect((await getSource({ db, brandId, sourceId: source.id }))?.state).toBe('connected');
    expect(await countLeads(brandId)).toBe(1);
    expect(lead?.name).toBe('Dana Reyes');
    expect(lead?.company).toBe('Northwind Logistics');
    expect(lead?.subject).toBe('New contact form submission');
    expect(lead?.message).toMatch(/^Hi! I am the COO[\s\S]*within 6 weeks\.$/);
    expect(lead?.auth_results).toMatch(/dmarc=pass/);
  });

  it('F2: the same email delivered twice creates 1 lead', async () => {
    const { brandId, address } = await seedEmailSource();

    await receive({ raw: contactForm, to: address });
    const { outcome } = await receive({ raw: contactForm, to: address });

    expect(outcome.kind === 'lead' && outcome.duplicate).toBe(true);
    expect(await countLeads(brandId)).toBe(1);
  });

  it('F2: a manually forwarded Gmail message takes the sender from the forwarded block', async () => {
    const { brandId, address } = await seedEmailSource();

    await receive({ raw: gmailForwardedLead, to: address });

    const lead = await readLeadByEmail({ brandId, email: 'priya@copperline.example' });
    expect(lead?.name).toBe('Priya Natarajan');
    expect(lead?.subject).toBe('Partnership for overflow work');
    expect(lead?.message).toMatch(/^Hello, I am the founder of Copperline/);
  });

  it('F2: an email larger than 25 MiB puts the source in error and is rejected', async () => {
    const { brandId, source, address } = await seedEmailSource();
    const message = buildInboundEmail({ raw: contactForm, to: address });
    message.rawSize = MAX_INBOUND_BYTES + 1024 * 1024;

    await handleInboundEmail({ db, message, now: new Date() });

    const updated = await getSource({ db, brandId, sourceId: source.id });
    expect(updated?.state).toBe('error');
    expect(updated?.last_error).toBe('Message is larger than 25 MiB');
    expect(message.rejectedWith).toBe('Message is larger than 25 MiB');
    expect(await countLeads(brandId)).toBe(0);
  });

  it('F2: a disabled source rejects mail', async () => {
    const { brandId, source, address } = await seedEmailSource();
    await updateSourceState({ db, brandId, sourceId: source.id, state: 'disabled', now: new Date() });

    const { message } = await receive({ raw: contactForm, to: address });

    expect(message.rejectedWith).toBe('This address is disabled');
    expect(await countLeads(brandId)).toBe(0);
  });

  it('F2: mail to an unknown address is rejected', async () => {
    const { message } = await receive({ raw: contactForm, to: 'nobody-0000000000@in.inboxsieve.example' });

    expect(message.rejectedWith).toBe('Unknown address');
  });

  it('F2: rule spam by email is stored as spam_filtered', async () => {
    const { address } = await seedEmailSource();

    const { outcome } = await receive({ raw: seoSpam, to: address });

    expect(outcome.kind === 'lead' && outcome.status).toBe('spam_filtered');
  });

  it('F4: an email with no readable body is parse_failed and keeps the original', async () => {
    const { brandId, address } = await seedEmailSource();

    const { outcome } = await receive({ raw: emptyBody, to: address });

    const row = await db.prepare('SELECT status, raw FROM leads WHERE brand_id = ?').bind(brandId).first<{ status: string; raw: string }>();
    expect(outcome.kind === 'lead' && outcome.status).toBe('parse_failed');
    expect(row?.raw).toBe(emptyBody);
  });

  it('F2: the worker email entry point stores the lead', async () => {
    const { brandId, address } = await seedEmailSource();
    const message = buildInboundEmail({ raw: contactForm, to: address });
    const ctx = createExecutionContext();

    await worker.email(
      {
        ...message,
        headers: new Headers(),
        canBeForwarded: true,
        forward: async () => ({ messageId: '' }),
        reply: async () => ({ messageId: '' }),
      },
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(await countLeads(brandId)).toBe(1);
  });
});

describe('F2 webhook', () => {
  it('F2: a Tally webhook returns 202, creates 1 lead and connects the source', async () => {
    const { brandId, source, token } = await seedWebhookSource();

    const response = await postWebhook({ token, body: tally });

    const lead = await readLeadByEmail({ brandId, email: 'maya@brightloop.example' });
    expect(response.status).toBe(202);
    expect(await countLeads(brandId)).toBe(1);
    expect(lead?.name).toBe('Maya Okafor');
    expect(lead?.company).toBe('Brightloop');
    expect(lead?.subject).toBe('Project inquiry');
    expect(lead?.message).toMatch(/^We want an AI agent[\s\S]*Budget: \$25k-\$40k$/);
    expect((await getSource({ db, brandId, sourceId: source.id }))?.state).toBe('connected');
  });

  it('F2: a Typeform webhook maps answers through the field titles', async () => {
    const { brandId, token } = await seedWebhookSource();

    const response = await postWebhook({ token, body: typeform });

    const lead = await readLeadByEmail({ brandId, email: 'h.lindqvist@fjordvale-insurance.example' });
    expect(response.status).toBe(202);
    expect(lead?.name).toBe('Hannah Lindqvist');
    expect(lead?.company).toBe('Fjordvale Insurance');
    expect(lead?.message).toMatch(/^RFP for claims intake/);
  });

  it('F2: a Webflow webhook joins first and last name', async () => {
    const { brandId, token } = await seedWebhookSource();

    const response = await postWebhook({ token, body: webflow });

    const lead = await readLeadByEmail({ brandId, email: 'sofia@mapleborne-realty.example' });
    expect(response.status).toBe(202);
    expect(lead?.name).toBe('Sofia Marin');
    expect(lead?.subject).toBe('Contact Form');
  });

  it('F2: a form-encoded WPForms webhook creates 1 lead', async () => {
    const { brandId, token } = await seedWebhookSource();

    const response = await postWebhook({ token, body: wpforms, contentType: 'application/x-www-form-urlencoded' });

    const lead = await readLeadByEmail({ brandId, email: 'tom@becker-bikes.example' });
    expect(response.status).toBe(202);
    expect(lead?.name).toBe('Tom Becker');
    expect(lead?.message).toMatch(/plugin is broken/);
  });

  it('F2: a bad token returns 404', async () => {
    const response = await postWebhook({ token: '0'.repeat(32), body: tally });

    expect(response.status).toBe(404);
  });

  it('F2: a disabled webhook returns 410 and stores nothing', async () => {
    const { brandId, source, token } = await seedWebhookSource();
    await updateSourceState({ db, brandId, sourceId: source.id, state: 'disabled', now: new Date() });

    const response = await postWebhook({ token, body: tally });

    expect(response.status).toBe(410);
    expect(await countLeads(brandId)).toBe(0);
  });

  it('F2: the same Tally event twice creates 1 lead', async () => {
    const { brandId, token } = await seedWebhookSource();

    await postWebhook({ token, body: tally });
    const second = await postWebhook({ token, body: tally });

    expect(second.status).toBe(202);
    expect((await second.json<{ duplicate: boolean }>()).duplicate).toBe(true);
    expect(await countLeads(brandId)).toBe(1);
  });

  it('F2: an Idempotency-Key header dedupes payloads without an event id', async () => {
    const { brandId, token } = await seedWebhookSource();
    const headers = { 'idempotency-key': 'submission-42' };

    await postWebhook({ token, body: wpforms, contentType: 'application/x-www-form-urlencoded', headers });
    await postWebhook({ token, body: wpforms, contentType: 'application/x-www-form-urlencoded', headers });

    expect(await countLeads(brandId)).toBe(1);
  });

  it('F2: an unparseable payload returns 400 and puts the source in error', async () => {
    const { brandId, source, token } = await seedWebhookSource();

    const response = await postWebhook({ token, body: invalidJson });

    const updated = await getSource({ db, brandId, sourceId: source.id });
    expect(response.status).toBe(400);
    expect(updated?.state).toBe('error');
    expect(updated?.last_error).toBe('Last webhook payload could not be parsed');
  });

  it('F4: a webhook payload without email or message is parse_failed and keeps the raw body', async () => {
    const { brandId, token } = await seedWebhookSource();
    const body = JSON.stringify({ rating: 5 });

    const response = await postWebhook({ token, body });

    const row = await db.prepare('SELECT status, raw FROM leads WHERE brand_id = ?').bind(brandId).first<{ status: string; raw: string }>();
    expect(response.status).toBe(202);
    expect(row?.status).toBe('parse_failed');
    expect(row?.raw).toBe(body);
  });
});
