import PostalMime, { type Address, type Email, type Mailbox } from "postal-mime";

import { admitLead, type AdmitResult, type ParsedLead } from "../leads/pipeline";
import { findSourceByAddress, updateSourceState, type SourceRow } from "../repo";
import { pickLeadFields, type FieldPair } from "./fields";

export type InboundEmail = {
  from: string;
  to: string;
  rawSize: number;
  raw: ReadableStream<Uint8Array>;
  setReject: (reason: string) => void;
};

export type EmailOutcome =
  | { kind: "rejected"; reason: string }
  | { kind: "verification"; sourceId: string }
  | ({ kind: "lead"; sourceId: string } & AdmitResult);

export const MAX_INBOUND_BYTES = 25 * 1024 * 1024;

const TOO_LARGE_ERROR = "Message is larger than 25 MiB";
const CONFIRMATION_SUBJECT =
  /forwarding confirmation|confirm (your )?forwarding|verify (your )?forwarding|forwarding.{0,40}verif/i;
const SUBJECT_CODE = /\(#(\d{5,12})\)/;
const BODY_CODE = /(confirmation|verification) code:?\s*([A-Z0-9-]{4,16})/i;
const URL_PATTERN = /https:\/\/[^\s<>"')\]]+/g;
const CONFIRMATION_URL_HINT = /vf-|confirm|verif/i;
const FORWARD_PREFIX = /^\s*((fwd?|fw):\s*)+/i;
const FORWARDED_MARKER = /-{5,}\s*Forwarded message\s*-{5,}/i;
const FORWARDED_FROM = /^From:\s*(?:"?([^"<\n]*)"?\s*)?<?([^\s<>@]+@[^\s<>@]+)>?\s*$/im;
const KEY_VALUE_LINE = /^\s*([A-Za-z][A-Za-z0-9 _\-/?]{0,40}):\s*(.*)$/;
const MIN_FORM_PAIRS = 2;

export async function handleInboundEmail({
  db,
  message,
  now,
}: {
  db: D1Database;
  message: InboundEmail;
  now: Date;
}): Promise<EmailOutcome> {
  const source = await findSourceByAddress({ db, address: message.to });

  if (!source) {
    return reject({ message, reason: "Unknown address" });
  }
  if (source.state === "disabled") {
    return reject({ message, reason: "This address is disabled" });
  }
  if (message.rawSize > MAX_INBOUND_BYTES) {
    await updateSourceState({
      db,
      brandId: source.brand_id,
      sourceId: source.id,
      state: "error",
      lastError: TOO_LARGE_ERROR,
      now,
    });
    return reject({ message, reason: TOO_LARGE_ERROR });
  }

  const bytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  const email = await PostalMime.parse(bytes).catch(() => {
    return null;
  });

  const confirmation = email ? detectForwardingConfirmation(email) : null;
  if (confirmation) {
    await updateSourceState({
      db,
      brandId: source.brand_id,
      sourceId: source.id,
      state: "verification_pending",
      verification: confirmation,
      now,
    });
    return {
      kind: "verification",
      sourceId: source.id,
    };
  }

  const result = await admitLead({
    db,
    brandId: source.brand_id,
    sourceId: source.id,
    dedupeKey: email?.messageId ? `msg:${email.messageId.trim()}` : null,
    parsed: email ? extractLeadFromEmail(email) : { ok: false, error: "Message could not be parsed as MIME" },
    raw,
    authResults: email?.headers.find((header) => header.key === "authentication-results")?.value ?? null,
    now,
  });

  if (!result.duplicate) {
    await markConnected({ db, source, now });
  }
  return {
    kind: "lead",
    sourceId: source.id,
    ...result,
  };
}

export function detectForwardingConfirmation(email: Email) {
  const subject = email.subject ?? "";

  if (!CONFIRMATION_SUBJECT.test(subject)) {
    return null;
  }

  const text = getBodyText(email);
  const links = `${text}\n${email.html ?? ""}`.match(URL_PATTERN) ?? [];
  const link = links.find((candidate) => CONFIRMATION_URL_HINT.test(candidate)) ?? links[0] ?? null;
  const code = SUBJECT_CODE.exec(subject)?.[1] ?? BODY_CODE.exec(text)?.[2] ?? null;

  return {
    link: link?.replaceAll("&amp;", "&") ?? null,
    code,
  };
}

export function extractLeadFromEmail(email: Email): ParsedLead {
  const body = getBodyText(email).trim();

  if (!body) {
    return {
      ok: false,
      error: "Message has no readable body",
    };
  }

  const subject = (email.subject ?? "").replace(FORWARD_PREFIX, "").trim();
  const forwarded = parseForwardedBlock(body);
  const content = forwarded?.body ?? body;
  const sender = getMailbox(email.replyTo?.[0]) ?? forwarded?.sender ?? getMailbox(email.from);
  const pairs = parseKeyValueLines(content);

  if (pairs.length >= MIN_FORM_PAIRS) {
    const parsed = pickLeadFields({ pairs, fallbackSubject: subject });
    if (parsed.ok) {
      return {
        ok: true,
        lead: {
          ...parsed.lead,
          name: parsed.lead.name || sender?.name || "",
          email: parsed.lead.email || sender?.address || "",
        },
      };
    }
  }

  return {
    ok: true,
    lead: {
      name: sender?.name ?? "",
      email: sender?.address ?? "",
      company: "",
      subject,
      message: content,
    },
  };
}

function reject({ message, reason }: { message: InboundEmail; reason: string }): EmailOutcome {
  message.setReject(reason);
  return {
    kind: "rejected",
    reason,
  };
}

async function markConnected({ db, source, now }: { db: D1Database; source: SourceRow; now: Date }) {
  if (source.state === "connected") {
    return;
  }
  await updateSourceState({
    db,
    brandId: source.brand_id,
    sourceId: source.id,
    state: "connected",
    now,
  });
}

function getBodyText(email: Email) {
  if (email.text) {
    return email.text;
  }
  return htmlToText(email.html ?? "");
}

function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getMailbox(address: Address | undefined): Mailbox | null {
  if (!address?.address) {
    return null;
  }
  return {
    name: address.name,
    address: address.address,
  };
}

function parseForwardedBlock(body: string) {
  const marker = FORWARDED_MARKER.exec(body);

  if (!marker) {
    return null;
  }

  const block = body.slice(marker.index + marker[0].length).replace(/^\s+/, "");
  const headerEnd = block.search(/\n\s*\n/);
  const headers = headerEnd === -1 ? block : block.slice(0, headerEnd);
  const from = FORWARDED_FROM.exec(headers);

  return {
    sender: from ? { name: from[1]?.trim() ?? "", address: from[2] } : null,
    body: headerEnd === -1 ? "" : block.slice(headerEnd).trim(),
  };
}

function parseKeyValueLines(text: string) {
  const pairs: FieldPair[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = KEY_VALUE_LINE.exec(line);
    const last = pairs.at(-1);

    if (match) {
      pairs.push({
        label: match[1].trim(),
        value: match[2],
      });
      continue;
    }
    if (last) {
      last.value = `${last.value}\n${line}`;
    }
  }
  return pairs;
}
