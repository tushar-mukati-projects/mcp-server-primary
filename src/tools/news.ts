import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "../config/env.js";

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

function formatArticles(articles: Article[]): string {
  if (!articles.length) return "No articles found.";
  return articles
    .map(
      (a, i) =>
        `${i + 1}. ${a.title}\n   Source: ${a.source.name} | ${a.publishedAt.slice(0, 10)}\n   ${a.description ?? ""}\n   ${a.url}`,
    )
    .join("\n\n");
}

function requireKey(): string {
  if (!env.NEWS_API_KEY) throw new Error("NEWS_API_KEY is not configured in environment.");
  return env.NEWS_API_KEY;
}

export function register(server: McpServer) {
  server.tool(
    "get-top-headlines",
    "Get top news headlines by category and country.",
    {
      category: z
        .enum(["business", "entertainment", "general", "health", "science", "sports", "technology"])
        .default("general")
        .describe("News category"),
      country: z.string().default("us").describe("2-letter country code, e.g. 'us', 'in', 'gb'"),
    },
    async ({ category, country }) => {
      try {
        const key = requireKey();
        const res = await fetch(
          `https://newsapi.org/v2/top-headlines?country=${encodeURIComponent(country)}` +
            `&category=${category}&pageSize=10&apiKey=${key}`,
        );
        const data = (await res.json()) as NewsResponse;
        if (data.status !== "ok") throw new Error("NewsAPI returned an error.");
        return {
          content: [
            {
              type: "text" as const,
              text: `Top ${category} headlines (${country.toUpperCase()}):\n\n${formatArticles(data.articles)}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "search-news",
    "Search news articles by keyword.",
    {
      query: z.string().describe("Search keywords"),
      sort_by: z
        .enum(["relevancy", "popularity", "publishedAt"])
        .default("publishedAt")
        .describe("Sort order"),
    },
    async ({ query, sort_by }) => {
      try {
        const key = requireKey();
        const res = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}` +
            `&sortBy=${sort_by}&pageSize=10&apiKey=${key}`,
        );
        const data = (await res.json()) as NewsResponse;
        if (data.status !== "ok") throw new Error("NewsAPI returned an error.");
        return {
          content: [
            {
              type: "text" as const,
              text: `News for "${query}" (${data.totalResults} results):\n\n${formatArticles(data.articles)}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
