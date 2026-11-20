import { isRecord, json } from '../http';
import { admitLead } from '../leads/pipeline';
import { findSourceByToken, updateSourceState } from '../repo';
import { pickLeadFields, type FieldPair } from './fields';

export const MAX_WEBHOOK_BYTES = 1024 * 1024;

const WEBHOOK_SUBJECT = 'Website form submission';
const INVALID_PAYLOAD_ERROR = 'Last webhook payload could not be parsed';
const NO_FIELDS_ERROR = 'Last webhook payload had no email or message field';

type Payload = {
  pairs: FieldPair[];
  eventId: string | null;
  formName: string | null;
};

export async function handleWebhook({ db, request, token, now }: { db: D1Database; request: Request; token: string; now: Date }) {
  const source = await findSourceByToken({ db, token });

  if (!source) {
    return json({ error: 'not_found', message: 'Unknown webhook' }, 404);
  }
  if (source.state === 'disabled') {
    return json({ error: 'gone', message: 'This webhook is disabled' }, 410);
  }

  const raw = new TextDecoder().decode(await request.arrayBuffer());
  if (raw.length > MAX_WEBHOOK_BYTES) {
    return json({ error: 'too_large', message: 'Payload is larger than 1 MiB' }, 413);
  }

  const sourceRef = {
    db,
    brandId: source.brand_id,
    sourceId: source.id,
    now,
  };
  const payload = parsePayload({ raw, contentType: request.headers.get('content-type') ?? '' });

  if (!payload) {
    await updateSourceState({
      ...sourceRef,
      state: 'error',
      lastError: INVALID_PAYLOAD_ERROR,
    });
    return json({ error: 'invalid_payload', message: INVALID_PAYLOAD_ERROR }, 400);
  }

  const idempotencyKey = request.headers.get('idempotency-key') ?? payload.eventId;
  const parsed = pickLeadFields({ pairs: payload.pairs, fallbackSubject: payload.formName ?? WEBHOOK_SUBJECT });
  const result = await admitLead({
    ...sourceRef,
    dedupeKey: idempotencyKey ? `hook:${source.id}:${idempotencyKey}` : null,
    parsed,
    raw,
    authResults: null,
  });

  if (!parsed.ok) {
    await updateSourceState({
      ...sourceRef,
      state: 'error',
      lastError: NO_FIELDS_ERROR,
    });
  }
  if (parsed.ok && !result.duplicate && source.state !== 'connected') {
    await updateSourceState({
      ...sourceRef,
      state: 'connected',
    });
  }

  return json(
    {
      id: result.leadId,
      status: result.status,
      duplicate: result.duplicate,
    },
    202,
  );
}

export function parsePayload({ raw, contentType }: { raw: string; contentType: string }): Payload | null {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return {
      pairs: Array.from(new URLSearchParams(raw), ([label, value]) => ({ label, value })),
      eventId: null,
      formName: null,
    };
  }

  const data = parseJsonObject(raw);
  if (!data) {
    return null;
  }
  return readTally(data) ?? readTypeform(data) ?? readWebflow(data) ?? readFlat(data);
}

function parseJsonObject(raw: string) {
  try {
    const data: unknown = JSON.parse(raw);
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

function readTally(data: Record<string, unknown>): Payload | null {
  const body = data.data;

  if (!isRecord(body) || !Array.isArray(body.fields)) {
    return null;
  }
  const pairs = body.fields.filter(isRecord).map((field) => {
    return {
      label: String(field.label ?? field.key ?? ''),
      value: stringifyValue(field.value),
    };
  });
  return {
    pairs,
    eventId: typeof data.eventId === 'string' ? data.eventId : null,
    formName: typeof body.formName === 'string' ? body.formName : null,
  };
}

function readTypeform(data: Record<string, unknown>): Payload | null {
  const response = data.form_response;

  if (!isRecord(response) || !Array.isArray(response.answers)) {
    return null;
  }

  const definition = isRecord(response.definition) ? response.definition : {};
  const titles = new Map<string, string>();
  for (const field of Array.isArray(definition.fields) ? definition.fields.filter(isRecord) : []) {
    titles.set(String(field.id), String(field.title ?? ''));
  }

  const pairs = response.answers.filter(isRecord).map((answer) => {
    const field = isRecord(answer.field) ? answer.field : {};
    const type = String(answer.type ?? '');
    return {
      label: titles.get(String(field.id)) ?? String(field.ref ?? type),
      value: stringifyValue(answer[type]),
    };
  });
  return {
    pairs,
    eventId: typeof data.event_id === 'string' ? data.event_id : null,
    formName: typeof definition.title === 'string' ? definition.title : null,
  };
}

function readWebflow(data: Record<string, unknown>): Payload | null {
  const payload = data.payload;

  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }
  return {
    pairs: readObjectPairs(payload.data),
    eventId: typeof payload.id === 'string' ? payload.id : null,
    formName: typeof payload.name === 'string' ? payload.name : null,
  };
}

function readFlat(data: Record<string, unknown>): Payload {
  return {
    pairs: readObjectPairs(data),
    eventId: null,
    formName: null,
  };
}

function readObjectPairs(data: Record<string, unknown>) {
  return Object.entries(data).map(([label, value]) => {
    return {
      label,
      value: stringifyValue(value),
    };
  });
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(stringifyValue).join(', ');
  }
  if (isRecord(value)) {
    return stringifyValue(value.label ?? value.labels ?? value.text ?? Object.values(value));
  }
  return String(value);
}
