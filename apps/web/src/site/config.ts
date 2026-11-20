import { formatPrice, PLAN_PRICES } from "@inboxsieve/contract";

// The owner fills these two before the Paddle domain review. Every public page reads them from here.
export const SELLER_LEGAL_NAME = "SELLER_LEGAL_NAME";
export const CONTACT_EMAIL = "CONTACT_EMAIL";

export const LEGAL_UPDATED = "November 20, 2026";
export const REFUND_DAYS = 14;
export const RAW_BODY_RETENTION_DAYS = 90;

export const FOOTER_LINKS = [
  {
    to: "/pricing",
    label: "Pricing",
  },
  {
    to: "/terms",
    label: "Terms",
  },
  {
    to: "/privacy",
    label: "Privacy",
  },
  {
    to: "/refunds",
    label: "Refunds",
  },
  {
    to: "/dpa",
    label: "DPA",
  },
  {
    to: "/ai",
    label: "For AI assistants",
  },
  {
    to: "/contact-form-spam-filter",
    label: "Contact form spam filter",
  },
  {
    to: "/chili-piper-alternative",
    label: "Chili Piper alternative",
  },
];

export const SUB_PROCESSORS = [
  {
    name: "Cloudflare, Inc.",
    purpose: "Hosting, database, inbound email",
  },
  {
    name: "Anthropic, PBC",
    purpose: "AI scoring and reply drafts (no training, no default retention)",
  },
  {
    name: "Resend",
    purpose: "Sign-in links and hot-lead alert emails",
  },
  {
    name: "Paddle.com",
    purpose: "Merchant of record: checkout, invoices, tax, refunds",
  },
];

export const HERO = {
  audience: "For small agencies and service businesses",
  title: "Spam out, real clients first: an AI filter for the messages from your website's contact form.",
  subtitle:
    "InboxSieve reads every form message, removes spam and sales pitches, scores the real client requests 0–100 and drafts a reply, so you answer the best ones first.",
};

export const HOW_IT_WORKS = [
  {
    title: "Forward your form email",
    text: "Send your contact-form emails to your private InboxSieve address, or paste our webhook URL into Webflow, Tally, Typeform, WPForms, Zapier or Make. Your website doesn't change.",
  },
  {
    title: "AI scores and filters",
    text: "Spam rules run first, for free. Then the AI scores each real message 0–100 against the clients you want, explains why, and writes a reply in your tone.",
  },
  {
    title: "You reply to the hot ones first",
    text: "A score of 80+ pings you by email or Slack. Open the draft in Gmail or Outlook, edit it if you like, and send it from your own mailbox.",
  },
];

// The before → after example on the landing page. Made-up messages, `.example` domains.
export const EXAMPLE_INBOX = [
  {
    from: "growth@rankfast.example",
    subject: "Rank #1 on Google in 30 days, guaranteed!!",
    verdict: "spam",
  },
  {
    from: "billing@invoice-alerts.example",
    subject: "Your invoice #8812 is overdue, click to view",
    verdict: "spam",
  },
  {
    from: "sam@offshoredevs.example",
    subject: "Partnership: we build white-label dev teams for agencies",
    verdict: "pitch",
  },
  {
    from: "maya@brightsmile.example",
    subject: "New website for our 3 dental clinics, budget $15k, start in March",
    verdict: "lead",
  },
] as const;

export const EXAMPLE_HOT_LEAD = {
  score: 87,
  reasons: ["Budget $15k fits your minimum", "Clear start date", "Owner of the business is writing"],
  draft:
    "Hi Maya, thanks for reaching out about the clinic websites. A three-location rebuild with a March start fits us well. Could we do a 20-minute call on Tuesday or Wednesday to go over the pages you need?",
};

export const NEVER_DO = ["Send email as you", "Train on your data", "Lock you in: export CSV any time"];

export const COMPARE_ROWS = [
  {
    name: "InboxSieve",
    price: `${formatPrice(PLAN_PRICES.solo.monthlyCents)}/mo, no sales call`,
  },
  {
    name: "Chili Piper",
    price: "$15k/yr minimum",
  },
  {
    name: "Lindy",
    price: "$29.99+ per seat",
  },
  {
    name: "Zapier + DIY prompt",
    price: "Your Zapier plan + API costs, and you build the scoring",
  },
];

export const START_CTA = "Start free";

export const FAQ = [
  {
    question: "Is there a free plan? Do I need a card?",
    answer:
      "Yes. Free is 1 brand, 1 source and 50 analyzed leads a month, forever, with no card. You can also try Solo free for 14 days without a card; after that you're back on Free unless you upgrade.",
  },
  {
    question: "Is it GDPR-ready? Do you sign a DPA?",
    answer:
      "You are the controller and InboxSieve is the processor. Our DPA and sub-processor list are public, and raw message bodies are purged after 90 days.",
  },
  {
    question: "Which forms work?",
    answer:
      "Anything that emails you (Gmail and Outlook forwarding, WPForms, contact plugins) or can post a webhook (Webflow, Tally, Typeform, Zapier, Make).",
  },
  {
    question: "What is a lead, and what counts toward my limit?",
    answer:
      "A lead (or inquiry) is any message that comes in through your form, like “We need a new website for our 3 clinics, budget $15k”. Messages our spam rules catch are stored but not analyzed and don't count. Every analyzed message counts toward your monthly limit.",
  },
  {
    question: "Can I cancel any time?",
    answer:
      "Yes, in the billing portal. You keep full access until the end of the paid period, then the workspace moves to the Free plan. Nothing is deleted.",
  },
  {
    question: "What's the refund policy?",
    answer:
      "Full refund within 14 days of a payment, no questions asked. Paddle, our merchant of record, processes it.",
  },
];
