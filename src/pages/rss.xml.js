import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";

export async function GET(context) {
  const collection = await getCollection("posts");
  const posts = collection
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const siteUrl = context.site?.toString() || 'https://localhost:4321/';

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
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
    items: posts.map((post) => {
      const url = `${siteUrl}posts/${post.slug}/`;

      return {
        title: post.data.title,
        description: post.data.description || extractExcerpt(post.body),
        link: url,
        guid: url,
        pubDate: post.data.date,
        author: "hello@riyonaryono.me (Riyon Aryono)",
        categories: post.data.tags || [],
        enclosure: post.data.image ? {
          url: post.data.image.startsWith('http')
            ? post.data.image
            : `${siteUrl.replace(/\/$/, '')}${post.data.image}`,
          type: "image/jpeg",
          length: 0,
        } : undefined,
        content: post.body ? sanitizeContent(post.body) : post.data.description,
      };
    }),
    customData: `
      <atom:link href="${siteUrl}rss.xml" rel="self" type="application/rss+xml" />
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      <docs>https://www.rssboard.org/rss-specification</docs>
    `,
    xmlns: {
      atom: "http://www.w3.org/2005/Atom",
      content: "http://purl.org/rss/1.0/modules/content/",
      media: "http://search.yahoo.com/mrss/",
    },
  });
}

function extractExcerpt(body, maxLength = 160) {
  if (!body) return "";

  const plainText = body
    .replace(/^---[\s\S]*?---/, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*`]/g, "")
    .replace(/\n+/g, " ")
    .trim();

  return plainText.length > maxLength
    ? plainText.substring(0, maxLength).replace(/\s+\S*$/, "") + "..."
    : plainText;
}

function sanitizeContent(content) {
  if (!content) return "";

  return content
    .replace(/^---[\s\S]*?---/, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(.+)$/gm, (match) => match.trim() ? `<p>${match}</p>` : '')
    .replace(/<p><\/p>/g, '');
}
