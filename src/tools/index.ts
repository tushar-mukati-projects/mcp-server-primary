import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as ping } from "./ping/index.js";
import { register as whoami } from "./whoami/index.js";
import { register as charts } from "./charts/index.js";
import { register as weather } from "./weather/index.js";
import { register as news } from "./news/index.js";
import { register as image } from "./image/index.js";
import { register as scraper } from "./scraper/index.js";
import { register as pdf } from "./pdf/index.js";
import { register as pptx } from "./pptx/index.js";
import { register as docx } from "./docx/index.js";

export function registerTools(server: McpServer) {
  ping(server);
  whoami(server);
  charts(server);
  weather(server);
  news(server);
  image(server);
  scraper(server);
  pdf(server);
  pptx(server);
  docx(server);
}
