import { getCollection } from "astro:content";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";

export async function GET(context) {
  const collection = await getCollection("posts");
  const posts = collection
    .filter((post) => !post.data.draft)
    .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  const siteUrl = ensureTrailingSlash(
    (context.site && context.site.toString()) ||
      (import.meta.env.SITE && String(import.meta.env.SITE)) ||
      "https://localhost:4321/"
  );

  const items = posts.map((post) => {
    const url = new URL(`posts/${post.slug}/`, siteUrl).toString();
    const rawBody = post.body || "";
    const html = absolutifyUrls(renderMarkdown(rawBody), siteUrl);
    const pub = toValidDate(post.data.date);
    return {
      title: post.data.title,
      description: post.data.description || extractExcerpt(rawBody),
      link: url,
      guid: url,
      pubDate: pub,
      author: "hello@riyonaryono.me (Riyon Aryono)",
      categories: Array.isArray(post.data.tags) ? post.data.tags : [],
      enclosure: toEnclosure(post.data.image, siteUrl),
      content: html,
    };
  });

  const itemsXml = items
    .map((it) => {
      const cats = it.categories.map((c) => `<category>${escapeXml(c)}</category>`).join("");
      const enc = it.enclosure ? `<enclosure url="${it.enclosure.url}" type="${it.enclosure.type}" length="${it.enclosure.length || 0}"/>` : "";
      return [
        "<item>",
        `<title>${escapeXml(it.title)}</title>`,
        `<link>${it.link}</link>`,
        `<guid isPermaLink="true">${it.guid}</guid>`,
        `<description><![CDATA[${cdata(it.description || "")}]]></description>`,
        `<pubDate>${formatIso8601(it.pubDate, "Asia/Jakarta")}</pubDate>`,
        cats,
        enc,
        `<content:encoded><![CDATA[${cdata(it.content || "")}]]></content:encoded>`,
        "</item>",
      ].join("");
    })
    .join("\n");

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
    `<channel>`,
    `<title>${escapeXml(SITE_TITLE)}</title>`,
    `<link>${siteUrl}</link>`,
    `<description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    `<language>id-ID</language>`,
    `<managingEditor>hello@riyonaryono.me (Riyon Aryono)</managingEditor>`,
    `<webMaster>hello@riyonaryono.me (Riyon Aryono)</webMaster>`,
    `<generator>Astro RSS</generator>`,
    `<ttl>60</ttl>`,
    `<atom:link href="${siteUrl}rss.xml" rel="self" type="application/rss+xml"/>`,
    `<lastBuildDate>${formatIso8601(new Date(), "Asia/Jakarta")}</lastBuildDate>`,
    `<image><url>${siteUrl}favicon.ico</url><title>${escapeXml(SITE_TITLE)}</title><link>${siteUrl}</link></image>`,
    itemsXml,
    `</channel>`,
    `</rss>`,
  ].join("");

  return new Response(xml, { headers: { "Content-Type": "text/xml; charset=UTF-8" } });
}

function ensureTrailingSlash(u) {
  return u.endsWith("/") ? u : `${u}/`;
}

function toValidDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? new Date() : dt;
}

function formatIso8601(date, timeZone = "UTC") {
  const d = toValidDate(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const offset = getTzOffsetISO(d, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function getTzOffsetISO(date, timeZone) {
  try {
    const tzPart = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((x) => x.type === "timeZoneName")?.value;
    const m = tzPart && tzPart.match(/GMT([+-]\d{2}):?(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  } catch {}
  return "+00:00";
}

function extractExcerpt(body, maxLength = 200) {
  if (!body) return "";
  const text = body
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/`{3}[\s\S]*?`{3}/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~`-]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return text.length > maxLength ? text.substring(0, maxLength).replace(/\s+\S*$/, "") + "..." : text;
}

function renderMarkdown(md) {
  if (!md) return "";
  let s = md.replace(/^---[\s\S]*?---\s*/, "").replace(/\r\n/g, "\n");

  const fences = [];
  s = s.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, lang = "", code) => {
    const i = fences.length;
    fences.push({ lang: lang || "", code });
    return `\uE000CODEBLOCK${i}\uE000`;
  });

  const inlines = [];
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    const i = inlines.length;
    inlines.push(code);
    return `\uE000INLINE${i}\uE000`;
  });

  s = s.replace(/\\\n/g, "\n");

  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => `<img alt="${escapeHtml(alt)}" src="${src}" />`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => `<a href="${href}">${text}</a>`);

  s = s.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  s = s.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  s = s.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  s = s.replace(/(^|\s)\*\*([^*]+)\*\*(?=\s|$)/g, "$1<strong>$2</strong>");
  s = s.replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, "$1<em>$2</em>");

  s = s.replace(/\uE000CODEBLOCK(\d+)\uE000/g, (_m, n) => {
    const { lang, code } = fences[Number(n)];
    return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(code)}</code></pre>`;
  });

  const blocks = s.trim().split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    if (/^(\s*[-*]\s+.+)(\n\s*[-*]\s+.+)*$/.test(block)) {
      const items = block
        .split("\n")
        .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
        .map((li) => `<li>${li}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    if (/^(\s*\d+\.\s+.+)(\n\s*\d+\.\s+.+)*$/.test(block)) {
      const items = block
        .split("\n")
        .map((l) => l.replace(/^\s*\d+\.\s+/, "").trim())
        .map((li) => `<li>${li}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    }
    if (/^\s*>/.test(block)) {
      const inner = block
        .split("\n")
        .map((l) => l.replace(/^\s*>\s?/, ""))
        .join(" ")
        .trim();
      return `<blockquote>${inner}</blockquote>`;
    }
    if (/^\s*<(h\d|pre|ul|ol|blockquote|img)/i.test(block)) {
      return block;
    }
    return `<p>${block.replace(/\n+/g, "<br />")}</p>`;
  });

  let html = htmlBlocks.join("\n");
  html = html.replace(/\uE000INLINE(\d+)\uE000/g, (_m, n) => `<code>${escapeHtml(inlines[Number(n)])}</code>`);
  return html;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cdata(s) {
  return String(s).replace(/]]>/g, "]]]]><![CDATA[>");
}

function absolutifyUrls(html, siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  return html
    .replace(/(src|href)="(\/[^"]*)"/g, (_m, attr, path) => `${attr}="${base}${path}"`)
    .replace(/(src|href)="\/\/([^"]+)"/g, (_m, attr, host) => `${attr}="https://${host}"`);
}

function toEnclosure(image, siteUrl) {
  if (!image) return undefined;
  const abs = image.startsWith("http")
    ? image
    : `${siteUrl.replace(/\/$/, "")}${image.startsWith("/") ? "" : "/"}${image}`;
  const ext = (abs.split(".").pop() || "").toLowerCase();
  const type =
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      avif: "image/avif",
    }[ext] || "image/jpeg";
  return { url: abs, type, length: 0 };
}
