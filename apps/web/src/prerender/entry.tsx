import { SECURITY_HEADERS } from "@inboxsieve/contract";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

import { AppRoutes } from "../app/App";
import { buildJsonLd, OG_IMAGE_PATH, SEO_PAGES, SITE_URL, type SeoPage } from "../site/seo";

const ROOT_TAG = '<div id="root"></div>';
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export type PrerenderedFile = {
  file: string;
  content: string;
};

// Build-time only (scripts/prerender.mjs writes these into dist/): every public page as static HTML,
// the empty app shell for /app and /sign-in, robots.txt, sitemap.xml and Cloudflare's `_headers`.
export function buildPrerenderedFiles(template: string): PrerenderedFile[] {
  if (!template.includes(ROOT_TAG)) {
    throw new Error("index.html has no empty root; run `vite build` first");
  }
  return [
    ...SEO_PAGES.map((page) => {
      return {
        file: page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`,
        content: buildPageHtml({ template, page }),
      };
    }),
    {
      file: "app-shell.html",
      content: replaceHead({
        html: template,
        head: '<title>InboxSieve</title>\n    <meta name="robots" content="noindex" />',
      }),
    },
    {
      file: "robots.txt",
      content: buildRobots(),
    },
    {
      file: "sitemap.xml",
      content: buildSitemap(),
    },
    {
      file: "_headers",
      content: buildHeaders(),
    },
  ];
}

export function buildPageHtml({ template, page }: { template: string; page: SeoPage }) {
  const url = buildPageUrl(page.path);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const image = `${SITE_URL}${OG_IMAGE_PATH}`;
  const jsonLd = JSON.stringify(buildJsonLd(page)).replaceAll("<", "\\u003c");
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="InboxSieve" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
  const body = renderToString(
    <StrictMode>
      <StaticRouter location={page.path}>
        <AppRoutes />
      </StaticRouter>
    </StrictMode>,
  );

  return replaceHead({ html: template, head }).replace(
    ROOT_TAG,
    `<div id="root" data-prerendered="${page.path}">${body}</div>`,
  );
}

function replaceHead({ html, head }: { html: string; head: string }) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, "")
    .replace("</head>", `  ${head}\n  </head>`);
}

function buildPageUrl(path: string) {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

function buildRobots() {
  return ["User-agent: *", "Disallow: /app/", "Disallow: /api/", "", `Sitemap: ${SITE_URL}/sitemap.xml`, ""].join("\n");
}

function buildSitemap() {
  const urls = SEO_PAGES.map((page) => {
    return `  <url><loc>${buildPageUrl(page.path)}</loc></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

function buildHeaders() {
  const security = Object.entries(SECURITY_HEADERS).map(([name, value]) => {
    return `  ${name}: ${value}`;
  });
  return ["/*", ...security, "", "/assets/*", `  Cache-Control: ${IMMUTABLE_CACHE}`, ""].join("\n");
}

function escapeHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
