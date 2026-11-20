import { Link } from "react-router-dom";

import { BUTTON_PRIMARY, BUTTON_SECONDARY, Card } from "../shared/ui";
import { COMPARE_ROWS, FAQ, HOW_IT_WORKS } from "./config";
import { PricingSection } from "./PricingSection";
import { SiteLayout } from "./SiteLayout";

const BEFORE_SUBJECTS = [
  "Rank #1 on Google in 30 days",
  "AI agent for support triage",
  "Guest post opportunity",
  "Question",
  "Partnership?? Crypto",
  "Website redesign for a 3-clinic group",
];

const AFTER_LEADS = [
  {
    score: 92,
    subject: "AI agent for support triage",
  },
  {
    score: 84,
    subject: "Website redesign for a 3-clinic group",
  },
];

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
      <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Stop digging through form spam. Every inquiry scored, the good ones answered first.
      </h1>
      <p className="text-lg text-slate-600">$29/mo. Every dollar shown below.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/sign-in" className={BUTTON_PRIMARY}>
          Start 7-day trial
        </Link>
        <Link to="/pricing" className={BUTTON_SECONDARY}>
          See pricing
        </Link>
      </div>
    </section>
  );
};

const BeforeAfter = () => {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-slate-500">Before: every message looks the same</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {BEFORE_SUBJECTS.map((subject) => {
            return (
              <li key={subject} className="py-2 text-slate-700">
                {subject}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-slate-500">After: the hot ones on top, a reply drafted</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {AFTER_LEADS.map((lead) => {
            return (
              <li key={lead.subject} className="flex items-center justify-between gap-2 py-2">
                <span className="font-medium">{lead.subject}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  {lead.score} Hot · draft ready
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">Spam is filtered by rules before any AI call.</p>
      </Card>
    </section>
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
                <span className="text-sm font-semibold text-brand-700">Step {index + 1}</span>
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
