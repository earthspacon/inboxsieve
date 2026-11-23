import { Link } from "react-router-dom";

import { FREE_TAGLINE } from "../pricing/config";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Card } from "../shared/ui";
import { COMPARE_ROWS, EXAMPLE_HOT_LEAD, EXAMPLE_INBOX, FAQ, HERO, HOW_IT_WORKS, START_CTA } from "./config";
import { PricingSection } from "./PricingSection";
import { SessionLink } from "./SessionLink";
import { SiteLayout } from "./SiteLayout";

type Verdict = (typeof EXAMPLE_INBOX)[number]["verdict"];

const VERDICTS: Record<Verdict, { label: string; className: string }> = {
  spam: {
    label: "Spam: removed",
    className: "bg-slate-100 text-slate-700",
  },
  pitch: {
    label: "Sales pitch: set aside",
    className: "bg-amber-100 text-amber-900",
  },
  lead: {
    label: `Real client: ${EXAMPLE_HOT_LEAD.score} Hot`,
    className: "bg-emerald-100 text-emerald-900",
  },
};

export const LandingPage = () => {
  return (
    <SiteLayout>
      <div className="space-y-16">
        <Hero />
        <BeforeAfter />
        <HowItWorks />
        <PricingSection />
        <Compare />
        <Faq />
      </div>
    </SiteLayout>
  );
};

const Hero = () => {
  return (
    <section className="space-y-4 text-center">
      <p className="text-sm font-semibold text-brand-ink">{HERO.audience}</p>
      <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{HERO.title}</h1>
      <p className="mx-auto max-w-2xl text-lg text-slate-600">{HERO.subtitle}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <SessionLink signedOutLabel={START_CTA} className={BUTTON_PRIMARY} />
        <Link to="/pricing" className={BUTTON_SECONDARY}>
          See pricing
        </Link>
      </div>
      <p className="text-sm text-slate-600">{FREE_TAGLINE}</p>
    </section>
  );
};

const BeforeAfter = () => {
  return (
    <section className="space-y-4" aria-labelledby="before-after">
      <h2 id="before-after" className="text-2xl font-semibold tracking-tight">
        What it does to your inbox
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-2 p-5">
          <h3 className="text-sm font-semibold text-slate-600">Before: 4 form messages, all look the same</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {EXAMPLE_INBOX.map((message) => {
              return (
                <li key={message.subject} className="py-2">
                  <span className="block text-xs text-slate-600">{message.from}</span>
                  <span className="text-slate-900">{message.subject}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-semibold text-slate-600">After InboxSieve: one real client, reply ready</h3>
          <ul className="space-y-2 text-sm">
            {EXAMPLE_INBOX.map((message) => {
              return <SortedMessage key={message.subject} subject={message.subject} verdict={message.verdict} />;
            })}
          </ul>
          <HotLeadCard />
        </Card>
      </div>
    </section>
  );
};

const SortedMessage = ({ subject, verdict }: { subject: string; verdict: Verdict }) => {
  const isLead = verdict === "lead";

  return (
    <li className="flex items-center justify-between gap-2">
      <span className={isLead ? "font-medium text-slate-900" : "text-slate-600 line-through"}>{subject}</span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICTS[verdict].className}`}>
        {VERDICTS[verdict].label}
      </span>
    </li>
  );
};

const HotLeadCard = () => {
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <p className="font-medium text-emerald-900">
        Why {EXAMPLE_HOT_LEAD.score}: {EXAMPLE_HOT_LEAD.reasons.join(" · ")}
      </p>
      <p className="text-slate-800">
        <span className="font-medium">Drafted reply: </span>
        {EXAMPLE_HOT_LEAD.draft}
      </p>
    </div>
  );
};

const HowItWorks = () => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {HOW_IT_WORKS.map((step, index) => {
          return (
            <li key={step.title}>
              <Card className="h-full space-y-2 p-5">
                <span className="text-sm font-semibold text-brand-ink">Step {index + 1}</span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-slate-600">{step.text}</p>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const Compare = () => {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Compare</h2>
      <Card className="divide-y divide-slate-100">
        {COMPARE_ROWS.map((row) => {
          return (
            <div key={row.name} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{row.name}</span>
              <span className="text-slate-600">{row.price}</span>
            </div>
          );
        })}
      </Card>
    </section>
  );
};

const Faq = () => {
  return (
    <section className="space-y-4">
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
