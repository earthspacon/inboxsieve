import {
  formatPrice,
  PLAN_LIMITS,
  PLAN_PRICES,
  SPAM_CHECKER_IDEAL_CLIENT_MAX_CHARS,
  SPAM_CHECKER_MESSAGE_MAX_CHARS,
  SPAM_CHECKER_RUNS_PER_DAY,
  type SpamCheckVerdict,
} from "@inboxsieve/contract";
import { useUnit } from "effector-react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

import { TurnstileWidget } from "../session/TurnstileWidget";
import { Banner, BUTTON_PRIMARY, BUTTON_SECONDARY, Card, INPUT } from "../shared/ui";
import {
  $checkError,
  $idealClient,
  $message,
  $result,
  $turnstileRound,
  $turnstileToken,
  checkFx,
  checkSubmitted,
  exampleClicked,
  idealClientChanged,
  messageChanged,
  turnstileExpired,
  turnstileSolved,
} from "../spam-checker/model";
import { START_CTA } from "./config";
import { SiteLayout } from "./SiteLayout";

const VERDICTS: Record<SpamCheckVerdict, { label: string; className: string; next: string }> = {
  spam: {
    label: "Spam",
    className: "bg-slate-100 text-slate-700",
    next: "InboxSieve would move it to the Spam stage. It is kept, never deleted, in case it's wrong.",
  },
  pitch: {
    label: "Sales pitch",
    className: "bg-amber-100 text-amber-900",
    next: "InboxSieve would set it aside with the other pitches, out of your way.",
  },
  request: {
    label: "Real request",
    className: "bg-emerald-100 text-emerald-900",
    next: "In the app this would come with a reply drafted in your tone, and a score of 80+ pings you by email or Slack.",
  },
};

const FREE_LEADS = PLAN_LIMITS.free.leadsPerMonth;

const FAQ = [
  {
    question: "Do you save the message I paste?",
    answer:
      "No. The message and the ideal-client text are scored and then dropped. Nothing you paste is written to our database. To count your free checks we keep a one-way fingerprint of your IP address (not the address itself) for 24 hours.",
  },
  {
    question: "Who else sees the text?",
    answer:
      "The text is sent once to the AI model that scores it, and we keep no copy. Messages caught by our spam rules never leave our server.",
  },
  {
    question: `Why only ${SPAM_CHECKER_RUNS_PER_DAY} checks a day?`,
    answer: `Each check costs us real money to score. ${SPAM_CHECKER_RUNS_PER_DAY} checks a day per connection keeps this page free. The count resets 24 hours after a check.`,
  },
  {
    question: "Is it the same filter as the paid product?",
    answer:
      "Yes, the same spam rules and the same scoring. In the app each message is scored against your full profile (services, ideal client, minimum budget) and learns from every “Not spam” click.",
  },
  {
    question: "Does it stop spam from reaching my form?",
    answer:
      "No. InboxSieve reads messages after they're sent and sorts them. Keep your captcha for bots; InboxSieve handles what people type by hand.",
  },
];

export const SpamCheckerPage = () => {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Paste a contact form message. See if it's spam, a pitch or a client.
          </h1>
          <p className="text-lg text-slate-600">
            Free, no sign-up. You get a label, a score from 0 to 100 and the reasons, from the same filter InboxSieve
            runs on every message that reaches your inbox.
          </p>
        </header>
        <CheckForm />
        <CheckResult />
        <EveryMessage />
        <Faq />
      </article>
    </SiteLayout>
  );
};

const CheckForm = () => {
  const { message, idealClient, round, token, isChecking, error } = useUnit({
    message: $message,
    idealClient: $idealClient,
    round: $turnstileRound,
    token: $turnstileToken,
    isChecking: checkFx.pending,
    error: $checkError,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    checkSubmitted();
  };

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="spam-check-message" className="font-medium text-slate-700">
              The message
            </label>
            <button type="button" onClick={() => exampleClicked()} className="font-medium text-brand-ink">
              Try an example
            </button>
          </div>
          <textarea
            id="spam-check-message"
            required
            rows={7}
            maxLength={SPAM_CHECKER_MESSAGE_MAX_CHARS}
            value={message}
            onChange={(event) => messageChanged(event.target.value)}
            placeholder="Paste the text of one contact form message"
            className={INPUT}
          />
        </div>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Who are your ideal clients?</span>{" "}
          <span className="text-slate-500">(optional)</span>
          <input
            type="text"
            maxLength={SPAM_CHECKER_IDEAL_CLIENT_MAX_CHARS}
            value={idealClient}
            onChange={(event) => idealClientChanged(event.target.value)}
            placeholder="For example: dental clinics and law firms with a $5k+ budget"
            className={INPUT}
          />
        </label>
        <TurnstileWidget key={round} onSolved={turnstileSolved} onExpired={turnstileExpired} />
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isChecking || !token || !message.trim()} className={BUTTON_PRIMARY}>
            {isChecking ? "Checking…" : "Check this message"}
          </button>
          <span className="text-xs text-slate-500">
            {`${SPAM_CHECKER_RUNS_PER_DAY} free checks a day per connection. Nothing you paste is saved.`}
          </span>
        </div>
      </form>
    </Card>
  );
};

const CheckResult = () => {
  const { result } = useUnit({
    result: $result,
  });

  if (!result) {
    return null;
  }
  const verdict = VERDICTS[result.verdict];

  return (
    <div aria-live="polite">
      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${verdict.className}`}>{verdict.label}</span>
          <span className="text-2xl font-semibold tabular-nums">
            {result.score}
            <span className="text-base font-normal text-slate-500">/100</span>
          </span>
        </div>
        <p className="text-sm text-slate-700">{result.summary}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {result.reasons.map((reason) => {
            return <li key={reason}>{reason}</li>;
          })}
        </ul>
        <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">{verdict.next}</p>
      </Card>
    </div>
  );
};

const EveryMessage = () => {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold tracking-tight">Get this for every message</h2>
      <p className="text-sm leading-6 text-slate-700">
        Pasting one message at a time is fine for a spot check. To sort all of them, forward your contact form emails to
        your private InboxSieve address, or paste our webhook URL into Webflow, Tally, Typeform, Zapier or Make. Your
        website doesn't change. Spam and pitches go to their own stage, and the real requests come in scored, with a
        reply drafted.
      </p>
      <p className="text-sm text-slate-700">
        Free for {FREE_LEADS} messages a month, no card. Solo is {formatPrice(PLAN_PRICES.solo.monthlyCents)}/mo for{" "}
        {PLAN_LIMITS.solo.leadsPerMonth}.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/sign-in" className={BUTTON_PRIMARY}>
          {START_CTA}
        </Link>
        <Link to="/pricing" className={BUTTON_SECONDARY}>
          See pricing
        </Link>
      </div>
    </section>
  );
};

const Faq = () => {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
      <div className="space-y-3">
        {FAQ.map((item) => {
          return (
            <Card key={item.question} className="p-5">
              <h3 className="font-semibold">{item.question}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.answer}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
