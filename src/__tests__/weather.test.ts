import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../tools/weather/index.js";

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

class MockServer {
  private handlers = new Map<string, Handler>();
  tool(n: string, _d: string, _schema: unknown, h: Handler) {
    this.handlers.set(n, h);
  }
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return this.handlers.get(name)!(args);
  }
}

const GEO_RESPONSE = {
  results: [{ name: "London", latitude: 51.5, longitude: -0.12, country: "GB" }],
};
const WEATHER_RESPONSE = {
  current: {
    temperature_2m: 18.5,
    relative_humidity_2m: 65,
    apparent_temperature: 17.0,
    weather_code: 1,
    wind_speed_10m: 12.3,
  },
};
const FORECAST_RESPONSE = {
  daily: {
    time: ["2026-03-15", "2026-03-16"],
    temperature_2m_max: [20.1, 18.3],
    temperature_2m_min: [12.0, 10.5],
    weather_code: [1, 61],
    precipitation_sum: [0, 3.2],
  },
};

const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = mock(async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("geocoding")) return new Response(JSON.stringify(GEO_RESPONSE));
    if (urlStr.includes("forecast?") && urlStr.includes("daily="))
      return new Response(JSON.stringify({ ...FORECAST_RESPONSE, daily: FORECAST_RESPONSE.daily }));
    if (urlStr.includes("forecast?")) return new Response(JSON.stringify(WEATHER_RESPONSE));
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("weather tools", () => {
  const server = new MockServer();
  register(server as unknown as McpServer);

  test("get-weather returns current conditions", async () => {
    const result = await server.call("get-weather", { city: "London" });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.city).toBe("London");
    expect(data.country).toBe("GB");
    expect(data.temperature_c).toBe(18.5);
    expect(data.condition).toBe("Mainly clear");
  });

  test("get-weather returns error for unknown city", async () => {
    global.fetch = mock(async () => new Response(JSON.stringify({ results: [] }))) as typeof fetch;

    const result = await server.call("get-weather", { city: "UnknownXYZ" });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toContain("not found");
  });

  test("get-forecast returns multi-day forecast", async () => {
    global.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("geocoding")) return new Response(JSON.stringify(GEO_RESPONSE));
      return new Response(JSON.stringify(FORECAST_RESPONSE));
    }) as typeof fetch;

    const result = await server.call("get-forecast", { city: "London", days: 2 });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.city).toBe("London");
    expect(data.forecast).toHaveLength(2);
    expect(data.forecast[0].date).toBe("2026-03-15");
    expect(data.forecast[0].max_c).toBe(20.1);
  });
});
