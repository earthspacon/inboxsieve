import { formatPrice, PLAN_PRICES } from "@inboxsieve/contract";
import { Link } from "react-router-dom";

import { BUTTON_PRIMARY, Card } from "../shared/ui";
import { START_CTA } from "./config";
import { SiteLayout } from "./SiteLayout";

const PRICES_CHECKED = "November 20, 2026";

// Prices from spec product-01 §1A; each row names the page it was read from.
const PRICE_ROWS = [
  {
    tool: "InboxSieve",
    price: `Free; Solo ${formatPrice(PLAN_PRICES.solo.monthlyCents)}/mo; Agency ${formatPrice(PLAN_PRICES.agency.monthlyCents)}/mo`,
    bestFor: "Filtering and scoring form inquiries for a 1–30 person team",
    source: "inboxsieve.com/pricing",
  },
  {
    tool: "Chili Piper",
    price: "From $1,250/mo, $15k/yr minimum",
    bestFor: "Routing inbound leads to sales reps and booking meetings on the spot",
    source: "chilipiper.com/pricing",
  },
  {
    tool: "Default",
    price: "Quote only",
    bestFor: "Enterprise inbound routing",
    source: "default.com/pricing",
  },
  {
    tool: "Lindy",
    price: "$29.99–$199.99 per user/mo",
    bestFor: "A general AI assistant you configure yourself",
    source: "lindy.ai/pricing",
  },
  {
    tool: "Zapier Agents Pro",
    price: "$50/mo for 1,500 activities",
    bestFor: "Do-it-yourself automations, including your own scoring prompt",
    source: "help.zapier.com",
  },
];

const FEATURE_ROWS = [
  {
    feature: "Filters spam and sales pitches out of form messages",
    inboxSieve: "Yes",
    chiliPiper: "Not its focus",
  },
  {
    feature: "Scores each inquiry 0–100 against your ideal client",
    inboxSieve: "Yes, with the reason",
    chiliPiper: "Qualifies with form rules and CRM data",
  },
  {
    feature: "Drafts a reply for you to send",
    inboxSieve: "Yes",
    chiliPiper: "No",
  },
  {
    feature: "Books a meeting right after the form",
    inboxSieve: "No: paste your booking link into the draft",
    chiliPiper: "Yes, its core feature",
  },
  {
    feature: "Routes leads between many sales reps",
    inboxSieve: "No: up to 3 seats see the same inbox",
    chiliPiper: "Yes",
  },
  {
    feature: "Needs a CRM (Salesforce, HubSpot)",
    inboxSieve: "No",
    chiliPiper: "Built around one",
  },
  {
    feature: "Sales call to start",
    inboxSieve: "No: sign up and connect a form in 5 minutes",
    chiliPiper: "Demo first",
  },
];

export const ChiliPiperAlternativePage = () => {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Chili Piper alternative for small agencies
          </h1>
          <p className="text-lg text-slate-600">
            Chili Piper is built for sales teams with many reps, a CRM and a budget of $15k a year or more. If you are a
            small agency that mostly needs to find the real clients among the messages from your contact form, you
            probably need something smaller. Here is an honest comparison.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">Prices</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Tool</th>
                  <th className="py-2 pr-4 font-semibold">Price</th>
                  <th className="py-2 pr-4 font-semibold">Best for</th>
                  <th className="py-2 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PRICE_ROWS.map((row) => {
                  return (
                    <tr key={row.tool} className="align-top">
                      <td className="py-2 pr-4 font-medium">{row.tool}</td>
                      <td className="py-2 pr-4 text-slate-700">{row.price}</td>
                      <td className="py-2 pr-4 text-slate-700">{row.bestFor}</td>
                      <td className="py-2 text-slate-600">{row.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600">
            Public prices as listed on each vendor's pricing page on {PRICES_CHECKED}. They change; check before you
            buy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">What each one does</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Feature</th>
                  <th className="py-2 pr-4 font-semibold">InboxSieve</th>
                  <th className="py-2 font-semibold">Chili Piper</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FEATURE_ROWS.map((row) => {
                  return (
                    <tr key={row.feature} className="align-top">
                      <td className="py-2 pr-4 font-medium">{row.feature}</td>
                      <td className="py-2 pr-4 text-slate-700">{row.inboxSieve}</td>
                      <td className="py-2 text-slate-700">{row.chiliPiper}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">When Chili Piper is the better choice</h2>
          <p className="text-sm leading-6 text-slate-700">
            If you have several sales reps, live in Salesforce or HubSpot, and the main goal is to book a meeting
            seconds after someone submits a demo form, Chili Piper does that well and InboxSieve doesn't try to.
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">When InboxSieve fits better</h2>
          <p className="text-sm leading-6 text-slate-700">
            If one to three people answer the contact form, half the messages are pitches and spam, and the job is “find
            the good ones and reply fast”, InboxSieve does exactly that for $0–
            {formatPrice(PLAN_PRICES.agency.monthlyCents)} a month, without a CRM or a sales call.
          </p>
        </section>

        <Card className="space-y-3 p-6 text-center">
          <h2 className="text-xl font-semibold">Start on the Free plan</h2>
          <p className="text-sm text-slate-600">
            50 messages a month, no card, no call.{" "}
            <Link to="/pricing" className="font-medium text-brand-700 underline">
              See pricing
            </Link>
            .
          </p>
          <Link to="/sign-in" className={BUTTON_PRIMARY}>
            {START_CTA}
          </Link>
        </Card>
      </article>
    </SiteLayout>
  );
};
