import { FAQ } from "./config";

export const SITE_URL = "https://inboxsieve.com";
export const OG_IMAGE_PATH = "/og.png";

export type SeoPage = {
  path: string;
  title: string;
  description: string;
};

// Every public page that is prerendered to static HTML at build time. The app (/app, /sign-in) stays client-side.
export const SEO_PAGES: SeoPage[] = [
  {
    path: "/",
    title: "InboxSieve: AI spam filter and lead scoring for your contact form",
    description:
      "For small agencies and service businesses: InboxSieve removes spam and sales pitches from your contact-form messages, scores real client requests 0–100 and drafts a reply. Free plan, no card.",
  },
  {
    path: "/pricing",
    title: "Pricing: Free, Solo $29/mo, Agency $79/mo | InboxSieve",
    description:
      "Free forever for 50 leads a month. Solo $29/mo, Agency $79/mo. Every dollar inside the price is listed: payment fees, AI cost, hosting and our margin.",
  },
  {
    path: "/contact-form-spam-filter",
    title: "Contact form spam filter for agencies | InboxSieve",
    description:
      "Why captchas don't stop human-sent form spam and vendor pitches, and how InboxSieve filters them out and puts real client requests first. Works with any form.",
  },
  {
    path: "/chili-piper-alternative",
    title: "Chili Piper alternative for small agencies | InboxSieve",
    description:
      "An honest comparison: Chili Piper starts at $15k a year and books meetings for sales teams. InboxSieve costs $0–$79 a month and filters and scores form inquiries for small teams.",
  },
  {
    path: "/terms",
    title: "Terms of service | InboxSieve",
    description: "The terms for using InboxSieve, the AI filter for contact-form messages.",
  },
  {
    path: "/privacy",
    title: "Privacy policy | InboxSieve",
    description: "What InboxSieve stores, why, for how long, and which sub-processors see it.",
  },
  {
    path: "/refunds",
    title: "Refund policy: 14 days, no questions | InboxSieve",
    description: "Full refund within 14 days of a payment, processed by Paddle, our merchant of record.",
  },
  {
    path: "/dpa",
    title: "Data processing agreement (DPA) | InboxSieve",
    description: "InboxSieve's GDPR data processing agreement and sub-processor list.",
  },
  {
    path: "/ai",
    title: "InboxSieve for AI assistants",
    description: "A plain-text summary of InboxSieve for AI assistants and crawlers, also at /llms.txt.",
  },
];

export function findSeoPage(path: string) {
  return SEO_PAGES.find((page) => page.path === path);
}

// JSON-LD for the head of a prerendered page: the product with its 3 offers everywhere, the FAQ on the landing page.
export function buildJsonLd(page: SeoPage) {
  const graph: object[] = [
    {
      "@type": "SoftwareApplication",
      name: "InboxSieve",
      url: SITE_URL,
      description: SEO_PAGES[0].description,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: [
        buildOffer({ name: "Free", price: "0" }),
        buildOffer({ name: "Solo", price: "29" }),
        buildOffer({ name: "Agency", price: "79" }),
      ],
    },
  ];

  if (page.path === "/") {
    graph.push({
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => {
        return {
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        };
      }),
    });
  }
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

function buildOffer({ name, price }: { name: string; price: string }) {
  return {
    "@type": "Offer",
    name,
    price,
    priceCurrency: "USD",
    url: `${SITE_URL}/pricing`,
  };
}
