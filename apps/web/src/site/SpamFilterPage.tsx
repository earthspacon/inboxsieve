import { formatPrice, PLAN_PRICES } from "@inboxsieve/contract";
import { Link } from "react-router-dom";

import { BUTTON_PRIMARY, Card } from "../shared/ui";
import { START_CTA } from "./config";
import { SiteLayout } from "./SiteLayout";

const SPAM_KINDS = [
  {
    name: "Bot spam",
    example: "Random links, crypto offers, text in a language you don't work in.",
    stoppedBy: "Captcha or a honeypot field usually catches it.",
  },
  {
    name: "Human-sent sales pitches",
    example: "“We rank you #1 on Google”, link-building offers, guest-post requests, offshore dev teams.",
    stoppedBy: "Nothing on the form. A real person typed it, so a captcha lets it through.",
  },
  {
    name: "Phishing dressed as a client",
    example: "“Your invoice is overdue, click to view”, fake domain-renewal notices.",
    stoppedBy: "Nothing on the form. It looks like a normal message.",
  },
  {
    name: "Real but poor-fit requests",
    example: "A $300 budget for a full site, a job seeker, a student survey.",
    stoppedBy: "Not spam, so no filter should delete it. It just shouldn't be first in line.",
  },
];

const STEPS = [
  "Rules run first and cost nothing: known spam phrases, link-stuffed messages and empty submissions are filtered before any AI call.",
  "Every remaining message is scored 0–100 against your own profile: the services you sell, your ideal client and your minimum budget.",
  "Sales pitches and spam go to their own stage. They are kept, never deleted, and one click on “Not spam” brings a message back and teaches the filter.",
  "Real client requests sort to the top with a short reason for the score and a reply drafted in your tone. Scores of 80+ ping you by email or Slack.",
];

export const SpamFilterPage = () => {
  return (
    <SiteLayout>
      <article className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact form spam filter for agencies</h1>
          <p className="text-lg text-slate-600">
            A captcha stops bots. It doesn't stop the people who fill in your contact form by hand to sell you SEO,
            leads or developers. InboxSieve reads every form message and keeps those out of your way, so the real client
            requests are the first thing you see.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">The 4 kinds of form “spam” an agency gets</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Kind</th>
                  <th className="py-2 pr-4 font-semibold">Looks like</th>
                  <th className="py-2 font-semibold">What stops it today</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SPAM_KINDS.map((kind) => {
                  return (
                    <tr key={kind.name} className="align-top">
                      <td className="py-2 pr-4 font-medium">{kind.name}</td>
                      <td className="py-2 pr-4 text-slate-700">{kind.example}</td>
                      <td className="py-2 text-slate-700">{kind.stoppedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-700">
            Keep your captcha: it cuts the bot traffic. The last three rows are what still eats your mornings, and they
            need someone (or something) to read the message.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">How InboxSieve filters a message</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
            {STEPS.map((step) => {
              return <li key={step}>{step}</li>;
            })}
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">Setup: no change to your website</h2>
          <p className="text-sm leading-6 text-slate-700">
            If your form emails you (WordPress plugins, Squarespace, Wix, most site builders), forward those emails to
            your private InboxSieve address. If your form can send a webhook (Webflow, Tally, Typeform, Zapier, Make),
            paste our URL. Either way it takes about five minutes, and you can send a test message from the app.
          </p>
        </section>

        <Card className="space-y-3 p-6 text-center">
          <h2 className="text-xl font-semibold">Try it on your own form</h2>
          <p className="text-sm text-slate-600">
            Free for 50 messages a month, no card. The paid plan is {formatPrice(PLAN_PRICES.solo.monthlyCents)}/mo for 500.{" "}
            <Link to="/pricing" className="font-medium text-brand-ink underline">
              See every dollar
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
