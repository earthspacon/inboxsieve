import { SECURITY_HEADERS } from "@inboxsieve/contract";
import { describe, expect, it } from "vitest";

import TEMPLATE from "../../index.html?raw";
import LLMS from "../../public/llms.txt?raw";
import { HERO } from "../site/config";
import { SEO_PAGES } from "../site/seo";
import { buildPrerenderedFiles } from "./entry";

const files = new Map(
  buildPrerenderedFiles(TEMPLATE).map(({ file, content }) => {
    return [file, content];
  }),
);

function readFile(name: string) {
  const content = files.get(name);
  if (content === undefined) {
    throw new Error(`${name} was not prerendered`);
  }
  return content;
}

function readJsonLd(html: string) {
  const match = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html);
  return JSON.parse(match?.[1] ?? "null");
}

describe("prerender", () => {
  it("no prerendered page shows a placeholder seller name, and the legal pages name Spaceson Labs", () => {
    for (const [file, content] of files) {
      expect(content, file).not.toMatch(/SELLER_LEGAL_NAME|REPLACE_WITH/);
    }
    const legalFiles = [...files.keys()].filter((file) => /^(terms|privacy|dpa)/.test(file));
    expect(legalFiles.length).toBeGreaterThan(0);
    for (const file of legalFiles) {
      expect(readFile(file), file).toContain("Spaceson Labs");
    }
  });

  it("the landing page HTML carries the hero text before any JavaScript runs", () => {
    const html = readFile("index.html");

    expect(html).toContain('<div id="root" data-prerendered="/">');
    expect(html).toContain(HERO.title.replaceAll("'", "&#x27;"));
    expect(html).toContain("87 Hot");
  });

  it("the landing page has SoftwareApplication with Free $0, the $4 plan and an FAQPage", () => {
    const graph: Array<Record<string, unknown>> = readJsonLd(readFile("index.html"))["@graph"];
    const app = graph.find((node) => node["@type"] === "SoftwareApplication");
    const faq = graph.find((node) => node["@type"] === "FAQPage");

    expect(app?.offers).toEqual([
      expect.objectContaining({ name: "Free", price: "0", priceCurrency: "USD" }),
      expect.objectContaining({ name: "InboxSieve", price: "4", priceCurrency: "USD" }),
    ]);
    expect(faq?.mainEntity).toEqual(expect.arrayContaining([expect.objectContaining({ "@type": "Question" })]));
  });

  it("every public page header has a Sign in link that phones see too, with room kept for Open dashboard", () => {
    for (const page of SEO_PAGES) {
      const html = readFile(page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`);
      const header = /<header.*?<\/header>/s.exec(html)?.[0] ?? "";
      const signIn = /<a [^>]*href="\/sign-in"[^>]*>(?:(?!<\/a>).)*Sign in(?:(?!<\/a>).)*<\/a>/s.exec(header)?.[0] ?? "";

      expect(signIn, page.path).toContain("Open dashboard");
      expect(signIn, page.path).not.toMatch(/max-(sm|md):hidden|class="hidden/);
    }
  });

  it("every public page gets its own title, description, canonical, OG/Twitter tags and image", () => {
    const titles = new Set<string>();

    for (const page of SEO_PAGES) {
      const html = readFile(page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`);
      const title = /<title>(.*?)<\/title>/.exec(html)?.[1] ?? "";
      titles.add(title);

      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(html.match(/<meta name="description"/g)).toHaveLength(1);
      expect(html).toMatch(/<link rel="canonical" href="https:\/\/inboxsieve\.com[^"]*" \/>/);
      expect(html).toContain('<meta property="og:image" content="https://inboxsieve.com/og.png" />');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
      expect(html).toContain(`data-prerendered="${page.path}"`);
    }
    expect(titles.size).toBe(SEO_PAGES.length);
  });

  it("the two SEO pages render their real content", () => {
    expect(readFile("contact-form-spam-filter.html")).toContain("Contact form spam filter for agencies");
    expect(readFile("chili-piper-alternative.html")).toContain("$15k/yr minimum");
  });

  it("the free spam checker is prerendered, listed in the sitemap, linked from the footer and promises nothing is saved", () => {
    const html = readFile("tools/contact-form-spam-checker.html");

    expect(html).toContain("Paste a contact form message. See if it&#x27;s spam, a pitch or a client.");
    expect(html).toContain("10 free checks a day per connection");
    expect(html).toContain("Nothing you paste is written to our database");
    expect(html).toContain('href="/pricing"');
    expect(readFile("sitemap.xml")).toContain("<loc>https://inboxsieve.com/tools/contact-form-spam-checker</loc>");
    expect(readFile("index.html")).toContain('href="/tools/contact-form-spam-checker"');
  });

  it("the app shell stays empty and noindex, so /app never shows the landing page", () => {
    const shell = readFile("app-shell.html");

    expect(shell).toContain('<div id="root"></div>');
    expect(shell).toContain('<meta name="robots" content="noindex" />');
  });

  it("the pricing page and its meta show one $4/month plan with the recomputed fee lines", () => {
    const html = readFile("pricing.html");

    expect(html).toContain("<title>Pricing: free, or $4 a month | InboxSieve</title>");
    expect(html).toContain("$4 / month");
    expect(html).toContain("cancel anytime");
    expect(html).toContain("$0.70");
    expect(html).toContain("$2.80");
    expect(html).not.toMatch(/\$5\b|\$15\b|\$50\b|\$150\b|\$3\.75|\$11\.55/);
    expect(html).not.toMatch(/\b(Solo|Agency|Starter|Growth|Yearly|yearly)\b/);
  });

  it("no public page names a tier, a yearly price or a pack", () => {
    const pages = [...files].map(([file, content]) => [file, content]).concat([["llms.txt", LLMS]]);
    for (const [file, content] of pages) {
      expect(content, file).not.toMatch(/\b(Solo|Agency|Starter|Growth|Pro plan|yearly|per year|pack)\b/);
    }
  });

  it("the 404 page is noindex, has no canonical and links back home", () => {
    const html = readFile("404.html");

    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
  });

  it("robots.txt blocks /app/ and points at the sitemap, which lists every public page", () => {
    const sitemap = readFile("sitemap.xml");

    expect(readFile("robots.txt")).toContain("Disallow: /app/");
    expect(readFile("robots.txt")).toContain("Sitemap: https://inboxsieve.com/sitemap.xml");
    expect(sitemap.match(/<loc>/g)).toHaveLength(SEO_PAGES.length);
  });

  it("_headers applies every security header to static assets", () => {
    const headers = readFile("_headers");

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers).toContain(`  ${name}: ${value}`);
    }
  });
});

describe("web analytics beacon", () => {
  const TOKEN = "0123456789abcdef0123456789abcdef";
  const htmlFiles = (token?: string) => {
    return buildPrerenderedFiles(TEMPLATE, token ? { beaconToken: token } : undefined).filter(({ file }) => {
      return file.endsWith(".html");
    });
  };

  it("a production build puts the Cloudflare beacon on every public page and the app shell", () => {
    const withBeacon = htmlFiles(TOKEN);
    expect(withBeacon.length).toBeGreaterThan(3);
    for (const { file, content } of withBeacon) {
      expect(content, file).toContain("https://static.cloudflareinsights.com/beacon.min.js");
      expect(content, file).toContain(`data-cf-beacon='{"token":"${TOKEN}","spa":true}'`);
    }
  });

  it("a build without the token (dev, e2e, sandbox) loads no analytics", () => {
    for (const { file, content } of htmlFiles()) {
      expect(content, file).not.toContain("cloudflareinsights");
    }
  });
});
