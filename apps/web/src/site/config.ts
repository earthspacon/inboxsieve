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

export const HOW_IT_WORKS = [
  {
    title: "Connect your form",
    text: "Forward your form email to your InboxSieve address, or paste our webhook URL into Webflow, Tally, Typeform, WPForms, Zapier or Make.",
  },
  {
    title: "AI scores against your ideal client",
    text: "Spam rules run first. Then Claude Haiku scores each inquiry 0–100 against your services, budget and ideal client, and drafts a reply in your tone.",
  },
  {
    title: "You answer the hot ones first",
    text: "Hot leads ping you by email and Slack. You copy the draft or open it in Gmail or Outlook and send it from your own mail.",
  },
];

export const NEVER_DO = ["Send email as you", "Train on your data", "Lock you in: export CSV any time"];

export const COMPARE_ROWS = [
  {
    name: "InboxSieve",
    price: "$29/mo, no sales call",
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
    question: "What counts as a lead?",
    answer:
      "Every message that reaches a source. Messages our spam rules catch are stored but not analyzed. Analyzed leads count toward your monthly limit.",
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
