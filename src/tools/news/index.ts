import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "../../config/env.js";

interface Article {
  title: string;
  description: string | null;
  url: string;
  source: { name: string };
  publishedAt: string;
}
interface NewsResponse {
  status: string;
  totalResults: number;
  articles: Article[];
}

function formatArticles(articles: Article[]) {
  return articles.map((a) => ({
    title: a.title,
    source: a.source.name,
    date: a.publishedAt.slice(0, 10),
    description: a.description ?? "",
    url: a.url,
  }));
}

function requireKey(): string {
  if (!env.NEWS_API_KEY) throw new Error("NEWS_API_KEY is not configured.");
  return env.NEWS_API_KEY;
}

function err(e: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
    isError: true,
  };
}

export function register(server: McpServer) {
  server.tool(
    "get-top-headlines",
    "Fetch the latest breaking news headlines by category (business, technology, sports, health, science, entertainment) for any country.",
    {
      category: z
        .enum(["business", "entertainment", "general", "health", "science", "sports", "technology"])
        .default("general")
        .describe("News category"),
      country: z.string().default("us").describe("2-letter country code, e.g. 'us', 'in', 'gb'"),
      page_size: z.number().min(1).max(50).default(10).describe("Number of articles to return"),
    },
    async ({ category, country, page_size }) => {
      try {
        const key = requireKey();
        const res = await fetch(
          `https://newsapi.org/v2/top-headlines?country=${encodeURIComponent(country)}` +
            `&category=${category}&pageSize=${page_size}&apiKey=${key}`,
        );
        const data = (await res.json()) as NewsResponse;
        if (data.status !== "ok") throw new Error("NewsAPI returned an error.");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  category,
                  country: country.toUpperCase(),
                  total: data.totalResults,
                  articles: formatArticles(data.articles),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "search-news",
    "Search millions of global news articles by keyword. Sort by relevance, popularity, or publication date.",
    {
      query: z.string().describe("Search keywords or phrase"),
      sort_by: z
        .enum(["relevancy", "popularity", "publishedAt"])
        .default("publishedAt")
        .describe("Sort order: relevancy, popularity, or publishedAt"),
      page_size: z.number().min(1).max(50).default(10).describe("Number of articles to return"),
    },
    async ({ query, sort_by, page_size }) => {
      try {
        const key = requireKey();
        const res = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
            `&sortBy=${sort_by}&pageSize=${page_size}&apiKey=${key}`,
        );
        const data = (await res.json()) as NewsResponse;
        if (data.status !== "ok") throw new Error("NewsAPI returned an error.");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  sort_by,
                  total: data.totalResults,
                  articles: formatArticles(data.articles),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        return err(e);
      }
    },
  );
}
