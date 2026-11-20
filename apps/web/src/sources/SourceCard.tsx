import type { SourceDto } from "@inboxsieve/contract";
import { Copy, ExternalLink, Mail, Webhook } from "lucide-react";

import { SOURCE_STATE_CONFIG } from "../leads/config";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Card } from "../shared/ui";
import { addressCopied, sourceDeleteClicked, sourceToggled, tokenRotateClicked } from "./model";

const EMAIL_STEPS = [
  {
    title: "Gmail",
    text: "Settings → Forwarding and POP/IMAP → Add a forwarding address → paste the address. Gmail sends a confirmation mail here; open the link we show. Then add a filter that forwards your form notifications.",
  },
  {
    title: "Outlook",
    text: "Settings → Mail → Rules → Add new rule → Redirect to → paste the address. Outlook may send a confirmation mail; we show it here.",
  },
  {
    title: "WPForms",
    text: "Form → Settings → Notifications → Send To Email Address → add the address next to yours.",
  },
];

const WEBHOOK_STEPS = [
  {
    title: "Tally / Typeform / Webflow",
    text: "Integrations → Webhooks → paste the URL. JSON is fine.",
  },
  {
    title: "Zapier / Make / anything else",
    text: "POST JSON or form-encoded fields (name, email, company, message) to the URL. Send an Idempotency-Key header to avoid duplicates.",
  },
];

export const SourceCard = ({ source, isCompact = false }: { source: SourceDto; isCompact?: boolean }) => {
  const target = source.kind === "email" ? source.address : source.webhookUrl;
  const Icon = source.kind === "email" ? Mail : Webhook;
  const { label, tone } = SOURCE_STATE_CONFIG[source.state];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-slate-500" />
        <h3 className="text-sm font-semibold">{source.name}</h3>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
      </div>
      {target && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs text-slate-800">{target}</code>
          <button
            type="button"
            aria-label="Copy"
            onClick={() => addressCopied(target)}
            className="text-slate-500 hover:text-slate-900"
          >
            <Copy className="size-4" />
          </button>
        </div>
      )}
      <SourceStateDetails source={source} />
      {!isCompact && <SourceActions source={source} />}
    </Card>
  );
};

const SourceStateDetails = ({ source }: { source: SourceDto }) => {
  if (source.state === "verification_pending" && source.verification) {
    return (
      <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
        <p className="font-medium">Your mail provider wants to confirm forwarding.</p>
        <p>Open the link below and approve it. We never click it for you.</p>
        {source.verification.link && (
          <a href={source.verification.link} target="_blank" rel="noreferrer" className={BUTTON_PRIMARY}>
            Open the confirmation link
            <ExternalLink className="size-4" />
          </a>
        )}
        {source.verification.code && (
          <p>
            Confirmation code: <code className="font-semibold">{source.verification.code}</code>
          </p>
        )}
      </div>
    );
  }
  if (source.state === "error") {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{source.lastError ?? "Unknown error"}</p>
    );
  }
  if (source.state === "awaiting_first_message") {
    return <SetupSteps steps={source.kind === "email" ? EMAIL_STEPS : WEBHOOK_STEPS} />;
  }
  if (source.state === "disabled") {
    return <p className="text-sm text-slate-500">Turned off. Mail to it is rejected and the webhook answers 410.</p>;
  }
  return null;
};

const SetupSteps = ({ steps }: { steps: { title: string; text: string }[] }) => {
  return (
    <ul className="space-y-2 text-sm">
      {steps.map((step) => {
        return (
          <li key={step.title} className="rounded-lg border border-slate-200 px-3 py-2">
            <p className="font-medium text-slate-800">{step.title}</p>
            <p className="text-slate-600">{step.text}</p>
          </li>
        );
      })}
    </ul>
  );
};

const SourceActions = ({ source }: { source: SourceDto }) => {
  const isDisabled = source.state === "disabled";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => sourceToggled({ sourceId: source.id, enabled: isDisabled })}
        className={BUTTON_SECONDARY}
      >
        {isDisabled ? "Turn on" : "Turn off"}
      </button>
      {source.kind === "webhook" && (
        <button type="button" onClick={() => tokenRotateClicked(source.id)} className={BUTTON_SECONDARY}>
          New URL
        </button>
      )}
      <button
        type="button"
        onClick={() => sourceDeleteClicked(source.id)}
        className={`${BUTTON_SECONDARY} text-rose-700`}
      >
        Delete
      </button>
    </div>
  );
};
