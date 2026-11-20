import { CONTACT_EMAIL, RAW_BODY_RETENTION_DAYS, REFUND_DAYS, SELLER_LEGAL_NAME, SUB_PROCESSORS } from "./config";

export type LegalSlug = "terms" | "privacy" | "refunds" | "dpa";

type LegalDoc = {
  title: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

const SUB_PROCESSOR_LINES = SUB_PROCESSORS.map((item) => {
  return `${item.name}: ${item.purpose}.`;
});

const MOR_TEXT = `Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns.`;

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: "Terms of Service",
    sections: [
      {
        heading: "Who we are",
        paragraphs: [
          `InboxSieve is a service of ${SELLER_LEGAL_NAME} ("we"). Contact: ${CONTACT_EMAIL}. These terms apply when you or your team use InboxSieve.`,
        ],
      },
      {
        heading: "Payments",
        paragraphs: [
          MOR_TEXT,
          "Subscriptions renew each month or year until you cancel. Prices are on the pricing page; Paddle adds sales tax or VAT where due.",
          "The Free plan needs no card and has no time limit. The 14-day Solo trial needs no card either; when it ends the workspace returns to Free unless you subscribe. Nothing is charged without a checkout you complete.",
        ],
      },
      {
        heading: "What the service does",
        paragraphs: [
          "InboxSieve receives the inquiries you route to it, filters spam, scores each inquiry with AI and drafts a reply. You decide what to send. We never send email on your behalf.",
          "AI scores and drafts can be wrong. Check a draft before you send it.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "Only route messages you are allowed to process. Don't use InboxSieve for spam, unlawful content, or to process special-category data you have no basis for.",
          "Keep your sign-in email secure. You are responsible for the seats you invite.",
        ],
      },
      {
        heading: "Plans and limits",
        paragraphs: [
          "Each plan has limits on brands, sources, seats and analyzed leads per month. Over the limit, leads are stored but not analyzed until the next month or an upgrade.",
          "Upgrades apply at once with proration. Downgrades apply at the end of the paid period; brands over the new limit become read-only.",
        ],
      },
      {
        heading: "Cancellation and deletion",
        paragraphs: [
          "Cancel any time in the billing portal. You keep full access until the end of the paid period. After that the workspace is read-only for 30 days with CSV export, then deleted.",
          "You can delete a brand or the whole workspace at any time in the app. Deletion is permanent.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "The service is provided as is. To the extent the law allows, our total liability is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits rights you have as a consumer under the law of your country.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "We may update these terms. We will email account owners about material changes at least 14 days before they apply.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "Who is responsible",
        paragraphs: [
          `For your account data (your email, your team, your settings) the controller is ${SELLER_LEGAL_NAME}, ${CONTACT_EMAIL}.`,
          "For the leads you route to InboxSieve, you are the controller and we are your processor. Our Data Processing Addendum covers that part.",
          "Paddle.com is the merchant of record and the controller of your payment data. Their privacy notice applies to checkout.",
        ],
      },
      {
        heading: "What we collect",
        paragraphs: [
          "Account: email address, sign-in sessions, plan and subscription status.",
          "Leads: sender name, email, company, message, the parsed fields and our AI analysis.",
          "We don't use advertising trackers in the app.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          `Raw message bodies are deleted after ${RAW_BODY_RETENTION_DAYS} days. Parsed fields stay until you delete the brand or the workspace.`,
          "A deleted workspace is erased within 24 hours. An expired workspace is erased 30 days after it expires.",
        ],
      },
      {
        heading: "Who we share it with",
        paragraphs: [
          "Only the sub-processors that run the service:",
          ...SUB_PROCESSOR_LINES,
          "Nothing is sold, and nothing is used to train AI models.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          `You can access, export, correct or delete your data in the app, or by writing to ${CONTACT_EMAIL}. You can also complain to your local data protection authority.`,
        ],
      },
    ],
  },
  refunds: {
    title: "Refund Policy",
    sections: [
      {
        heading: `${REFUND_DAYS}-day refund`,
        paragraphs: [
          `If InboxSieve isn't right for you, ask for a full refund within ${REFUND_DAYS} days of any payment. No questions asked.`,
          MOR_TEXT,
        ],
      },
      {
        heading: "How to ask",
        paragraphs: [
          "Use the link in your Paddle receipt email, or contact Paddle at paddle.net. You can also write to us and we will pass it on.",
          `Contact: ${CONTACT_EMAIL}.`,
        ],
      },
      {
        heading: "After a refund",
        paragraphs: ["The subscription is canceled. Export your leads first if you want to keep them."],
      },
    ],
  },
  dpa: {
    title: "Data Processing Addendum",
    sections: [
      {
        heading: "Parties and scope",
        paragraphs: [
          `This addendum is between you (the controller) and ${SELLER_LEGAL_NAME} (the processor). It applies to personal data in the leads you route to InboxSieve, under the GDPR and UK GDPR.`,
        ],
      },
      {
        heading: "What we process and why",
        paragraphs: [
          "Data: names, email addresses, company names and message content of people who contact you.",
          "Purpose: filter spam, score inquiries, draft replies and alert your team. We process it only on your instructions, which are these terms and your settings.",
        ],
      },
      {
        heading: "Our commitments",
        paragraphs: [
          "Staff and sub-processors with access are bound by confidentiality.",
          "Security: TLS in transit, random rotatable webhook tokens, per-brand access checks, no personal data in logs.",
          "We tell you without undue delay after we learn of a personal data breach.",
          "We help you answer data subject requests; the app has export and deletion.",
          `Raw message bodies are deleted after ${RAW_BODY_RETENTION_DAYS} days; everything else on deletion of the brand or workspace.`,
        ],
      },
      {
        heading: "Sub-processors",
        paragraphs: [
          ...SUB_PROCESSOR_LINES,
          "We give at least 14 days' notice by email before adding a sub-processor. You may object and cancel.",
        ],
      },
      {
        heading: "Transfers",
        paragraphs: [
          "Where data leaves the EEA or UK, the transfer relies on the sub-processor's Standard Contractual Clauses or an adequacy decision.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [`${SELLER_LEGAL_NAME}, ${CONTACT_EMAIL}.`],
      },
    ],
  },
};
