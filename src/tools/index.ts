import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as scraper } from "./scraper.js";
import { register as documentGen } from "./document-gen.js";
import { register as dataViz } from "./data-viz.js";
import { register as docx } from "./docx.js";

// Hidden for now — uncomment to re-enable:
// import { register as ping } from "./ping.js";
// import { register as whoami } from "./whoami.js";
// import { register as weather } from "./weather.js";
// import { register as news } from "./news.js";
// import { register as imageProcessing } from "./image-processing.js";

export function registerTools(server: McpServer) {
  scraper(server);
  documentGen(server);
  dataViz(server);
  docx(server);
}
