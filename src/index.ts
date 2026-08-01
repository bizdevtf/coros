#!/usr/bin/env node
/**
 * COROS MCP Server
 *
 * Connects COROS Training Hub data (activities, heart rate, training load,
 * profile) to MCP clients such as Claude, enabling AI-driven training
 * analysis. Uses the unofficial Training Hub API — the same backend the
 * training.coros.com web app talks to.
 *
 * Required environment variables:
 *   COROS_EMAIL     - COROS account email
 *   COROS_PASSWORD  - COROS account password
 * Optional:
 *   COROS_REGION    - 'global' (default), 'eu', or 'cn'
 *   COROS_API_BASE  - full base URL override (takes precedence over region)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { REGION_BASE_URLS } from "./constants.js";
import { CorosClient } from "./services/client.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerAccountTools } from "./tools/account.js";
import { registerPrompts } from "./prompts.js";

function resolveBaseUrl(): string {
  if (process.env.COROS_API_BASE) return process.env.COROS_API_BASE;
  const region = (process.env.COROS_REGION ?? "global").toLowerCase();
  const base = REGION_BASE_URLS[region];
  if (!base) {
    console.error(
      `ERROR: Unknown COROS_REGION '${region}'. Valid values: ${Object.keys(REGION_BASE_URLS).join(", ")}`,
    );
    process.exit(1);
  }
  return base;
}

async function main(): Promise<void> {
  const email = process.env.COROS_EMAIL;
  const password = process.env.COROS_PASSWORD;
  if (!email || !password) {
    console.error(
      "ERROR: COROS_EMAIL and COROS_PASSWORD environment variables are required.\n" +
        "Optionally set COROS_REGION (global|eu|cn) or COROS_API_BASE.",
    );
    process.exit(1);
  }

  const client = new CorosClient(email, password, resolveBaseUrl());

  const server = new McpServer({
    name: "coros-mcp-server",
    version: "1.0.0",
  });

  registerActivityTools(server, client);
  registerAccountTools(server, client);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("COROS MCP server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
