import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const WEATHER_DESC: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
}

async function geocode(city: string): Promise<GeoResult> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
  );
  const data = (await res.json()) as { results?: GeoResult[] };
  if (!data.results?.length) throw new Error(`City "${city}" not found.`);
  return data.results[0];
}

export function register(server: McpServer) {
  server.tool(
    "get-weather",
    "Get current weather for a city (temperature, humidity, wind, conditions).",
    { city: z.string().describe("City name, e.g. 'London' or 'New York'") },
    async ({ city }) => {
      try {
        const geo = await geocode(city);
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&timezone=auto`,
        );
        const data = (await res.json()) as {
          current: {
            temperature_2m: number;
            relative_humidity_2m: number;
            apparent_temperature: number;
            weather_code: number;
            wind_speed_10m: number;
          };
          current_units: Record<string, string>;
        };
        const c = data.current;
        const u = data.current_units;
        const text = [
          `Weather in ${geo.name}, ${geo.country}:`,
          `  Condition : ${WEATHER_DESC[c.weather_code] ?? "Unknown"}`,
          `  Temperature: ${c.temperature_2m}${u.temperature_2m}`,
          `  Feels like : ${c.apparent_temperature}${u.apparent_temperature}`,
          `  Humidity   : ${c.relative_humidity_2m}${u.relative_humidity_2m}`,
          `  Wind       : ${c.wind_speed_10m} ${u.wind_speed_10m}`,
        ].join("\n");
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get-forecast",
    "Get multi-day weather forecast for a city.",
    {
      city: z.string().describe("City name"),
      days: z.number().min(1).max(14).default(5).describe("Number of forecast days (1-14)"),
    },
    async ({ city, days }) => {
      try {
        const geo = await geocode(city);
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
            `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum` +
            `&timezone=auto&forecast_days=${days}`,
        );
        const data = (await res.json()) as {
          daily: {
            time: string[];
            temperature_2m_max: number[];
            temperature_2m_min: number[];
            weather_code: number[];
            precipitation_sum: number[];
          };
          daily_units: Record<string, string>;
        };
        const d = data.daily;
        const u = data.daily_units;
        const lines = [`Forecast for ${geo.name}, ${geo.country}:\n`];
        for (let i = 0; i < d.time.length; i++) {
          lines.push(
            `  ${d.time[i]}  ${WEATHER_DESC[d.weather_code[i]] ?? "Unknown"}  ` +
              `${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}${u.temperature_2m_max}  ` +
              `Rain: ${d.precipitation_sum[i]}${u.precipitation_sum}`,
          );
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
