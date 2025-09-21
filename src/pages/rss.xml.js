import rss from "@astrojs/rss";
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
      author: "Riyon Aryono",
      categories: Array.isArray(post.data.tags) ? post.data.tags : [],
      enclosure: toEnclosure(post.data.image, siteUrl),
      content: html,
    };
  });

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: siteUrl,
    language: "id-ID",
    managingEditor: "hello@riyonaryono.me (Riyon Aryono)",
    webMaster: "hello@riyonaryono.me (Riyon Aryono)",
    copyright: `Copyright ${new Date().getFullYear()} Riyon Aryono`,
    generator: "Astro RSS",
    ttl: 60,
    image: {
      url: `${siteUrl}favicon.ico`,
      title: SITE_TITLE,
      link: siteUrl,
    },
    items,
    customData: `
      <atom:link href="${siteUrl}rss.xml" rel="self" type="application/rss+xml" />
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      <docs>https://www.rssboard.org/rss-specification</docs>
    `,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
    },
  });
}

function ensureTrailingSlash(u) {
  return u.endsWith("/") ? u : `${u}/`;
}

function toValidDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? new Date() : dt;
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
  return text.length > maxLength
    ? text.substring(0, maxLength).replace(/\s+\S*$/, "") + "..."
    : text;
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
