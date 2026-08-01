/**
 * Account/profile tool and the raw API escape hatch.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CorosClient } from "../services/client.js";
import { enforceCharacterLimit, toErrorMessage } from "../services/format.js";

export function registerAccountTools(server: McpServer, client: CorosClient): void {
  server.registerTool(
    "coros_get_profile",
    {
      title: "Get COROS Profile",
      description: `Fetch the logged-in user's COROS account profile (nickname, physical stats such as height/weight, configured HR zones, etc.).

Takes no arguments. Returns the raw profile JSON from the COROS API. Useful for personalizing analysis (e.g. HR zones, max HR).`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await client.request("GET", "/account/query");
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text: enforceCharacterLimit(text) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: toErrorMessage(error) }], isError: true };
      }
    },
  );

  server.registerTool(
    "coros_api_request",
    {
      title: "Raw COROS API Request",
      description: `Perform an arbitrary authenticated GET/POST request against the COROS Training Hub API. Escape hatch for data not covered by the dedicated tools (e.g. daily wellness data such as sleep, resting HR, or training status endpoints).

The COROS API is unofficial and undocumented; endpoint paths may need exploration. Successful responses return the envelope's "data" payload; failures include the COROS result code and message.

Args:
  - method ('GET' | 'POST'): HTTP method
  - path (string): API path beginning with '/', e.g. '/activity/query'
  - query (object, optional): Query string parameters (string/number values)
  - body (object, optional): JSON request body for POST requests

Only use read-style endpoints; do not call endpoints that modify or delete account data.`,
      inputSchema: {
        method: z.enum(["GET", "POST"]).describe("HTTP method"),
        path: z
          .string()
          .regex(/^\//, "Path must start with '/'")
          .describe("API path, e.g. '/activity/query'"),
        query: z
          .record(z.union([z.string(), z.number()]))
          .optional()
          .describe("Query string parameters"),
        body: z.record(z.unknown()).optional().describe("JSON body for POST requests"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await client.request(params.method, params.path, {
          query: params.query,
          body: params.body,
        });
        const text = JSON.stringify(data, null, 2);
        return { content: [{ type: "text" as const, text: enforceCharacterLimit(text) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: toErrorMessage(error) }], isError: true };
      }
    },
  );
}
