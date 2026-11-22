import { SECURITY_HEADERS } from "@inboxsieve/contract";
import { describe, expect, it } from "vitest";

import TEMPLATE from "../../index.html?raw";
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

  it("the landing page has SoftwareApplication with Free $0, Solo $9, Agency $29 and an FAQPage", () => {
    const graph: Array<Record<string, unknown>> = readJsonLd(readFile("index.html"))["@graph"];
    const app = graph.find((node) => node["@type"] === "SoftwareApplication");
    const faq = graph.find((node) => node["@type"] === "FAQPage");

    expect(app?.offers).toEqual([
      expect.objectContaining({ name: "Free", price: "0", priceCurrency: "USD" }),
      expect.objectContaining({ name: "Solo", price: "9", priceCurrency: "USD" }),
      expect.objectContaining({ name: "Agency", price: "29", priceCurrency: "USD" }),
    ]);
    expect(faq?.mainEntity).toEqual(expect.arrayContaining([expect.objectContaining({ "@type": "Question" })]));
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

  it("the app shell stays empty and noindex, so /app never shows the landing page", () => {
    const shell = readFile("app-shell.html");

    expect(shell).toContain('<div id="root"></div>');
    expect(shell).toContain('<meta name="robots" content="noindex" />');
  });

  it("the pricing page and its meta show Solo $9/mo and Agency $29/mo with the recomputed fee lines", () => {
    const html = readFile("pricing.html");

    expect(html).toContain("<title>Pricing: Free, Solo $9/mo, Agency $29/mo | InboxSieve</title>");
    expect(html).toContain("$9/mo");
    expect(html).toContain("$29/mo");
    expect(html).toContain("$0.95");
    expect(html).toContain("$7.55");
    expect(html).toContain("$24.85");
    expect(html).not.toMatch(/\$79|\$790|\$26\.55|\$72\.35/);
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
