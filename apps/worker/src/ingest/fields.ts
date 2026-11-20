import type { LeadInput } from "@inboxsieve/contract";

import type { ParsedLead } from "../leads/pipeline";

export type FieldPair = {
  label: string;
  value: string;
};

type FieldKey = keyof LeadInput | "firstName" | "lastName";

const FIELD_PATTERNS: Array<{ key: FieldKey; pattern: RegExp }> = [
  {
    key: "email",
    pattern: /e-?mail/i,
  },
  {
    key: "company",
    pattern: /company|organi[sz]ation|business|agency/i,
  },
  {
    key: "firstName",
    pattern: /^first[\s_-]?name$/i,
  },
  {
    key: "lastName",
    pattern: /^(last|sur)[\s_-]?name$/i,
  },
  {
    key: "name",
    pattern: /name/i,
  },
  {
    key: "subject",
    pattern: /subject|topic/i,
  },
  {
    key: "message",
    pattern: /message|details|project|comment|notes?\b|inquiry|enquiry|description|question|how can we help|tell us/i,
  },
];

const EMAIL_PATTERN = /[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/;
const MAX_FIELD_CHARS = 20_000;

export function pickLeadFields({
  pairs,
  fallbackSubject,
}: {
  pairs: FieldPair[];
  fallbackSubject: string;
}): ParsedLead {
  const picked: Partial<Record<FieldKey, string>> = {};
  const extras: string[] = [];

  for (const { label, value } of pairs) {
    const trimmed = value.trim().slice(0, MAX_FIELD_CHARS);
    const key = FIELD_PATTERNS.find(({ pattern }) => pattern.test(label))?.key;

    if (!trimmed) {
      continue;
    }
    if (key && !picked[key]) {
      picked[key] = trimmed;
      continue;
    }
    extras.push(`${label}: ${trimmed}`);
  }

  const email = picked.email?.match(EMAIL_PATTERN)?.[0] ?? "";
  const name = picked.name ?? [picked.firstName, picked.lastName].filter(Boolean).join(" ");
  const message = [picked.message, ...extras].filter(Boolean).join("\n\n");

  if (!email && !picked.message) {
    return {
      ok: false,
      error: "No email or message field found",
    };
  }

  return {
    ok: true,
    lead: {
      name,
      email,
      company: picked.company ?? "",
      subject: picked.subject ?? fallbackSubject,
      message,
    },
  };
}
