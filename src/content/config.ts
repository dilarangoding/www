import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    image: z.string().default("/static/og.png"),
  tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    ongoing: z.boolean().default(false),
    summary: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const music = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    image: z.string().default("/static/og.png"),
    artist: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts, projects, music };
