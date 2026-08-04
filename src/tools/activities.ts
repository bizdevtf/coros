/**
 * Activity-related tools: list, detail, and file export.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EXPORT_FILE_TYPES, SPORT_TYPE_NAMES } from "../constants.js";
import type { CorosClient } from "../services/client.js";
import {
  activityLine,
  enforceCharacterLimit,
  summarizeActivity,
  toErrorMessage,
} from "../services/format.js";

const sportTypeLegend = Object.entries(SPORT_TYPE_NAMES)
  .map(([code, name]) => `${code}=${name}`)
  .join(", ");

export function registerActivityTools(server: McpServer, client: CorosClient): void {
  server.registerTool(
    "coros_list_activities",
    {
      title: "List COROS Activities",
      description: `List workouts/activities recorded in the user's COROS account (Training Hub), newest first.

Args:
  - page (number): Page number starting at 1 (default: 1)
  - size (number): Results per page, 1-50 (default: 20)
  - sport_type (number, optional): Filter by COROS sportType code. Known codes: ${sportTypeLegend}
  - start_date / end_date (string, optional): Inclusive date filter in YYYYMMDD form (e.g. "20250701")
  - response_format ('markdown' | 'json'): markdown = compact one-line summaries; json = full raw API objects (default: markdown)

Returns a list of activities. Each activity has a "labelId" (use it with coros_get_activity / coros_download_activity) plus summary metrics (distance in meters, duration in seconds, average heart rate, calories, training load).

Use this first for any training analysis: fetch enough pages to cover the analysis period, then aggregate weekly volume, intensity, and trends.`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("Page number, starting at 1"),
        size: z.number().int().min(1).max(50).default(20).describe("Results per page (1-50)"),
        sport_type: z
          .number()
          .int()
          .optional()
          .describe(`COROS sportType code filter. Known codes: ${sportTypeLegend}`),
        start_date: z
          .string()
          .regex(/^\d{8}$/, "Use YYYYMMDD, e.g. 20250701")
          .optional()
          .describe("Start date filter, YYYYMMDD"),
        end_date: z
          .string()
          .regex(/^\d{8}$/, "Use YYYYMMDD, e.g. 20250731")
          .optional()
          .describe("End date filter, YYYYMMDD"),
        response_format: z
          .enum(["markdown", "json"])
          .default("markdown")
          .describe("markdown for compact summaries, json for full raw activity objects"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = (await client.request("GET", "/activity/query", {
          query: {
            size: params.size,
            pageNumber: params.page,
            modeList: params.sport_type,
            startDay: params.start_date,
            endDay: params.end_date,
          },
        })) as Record<string, unknown> | null;

        const rawList = (data?.dataList ?? []) as Record<string, unknown>[];
        const count = (data?.count as number) ?? rawList.length;
        const totalPage = data?.totalPage as number | undefined;

        if (rawList.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No activities found for the given filters. Try removing filters or checking another page.",
              },
            ],
          };
        }

        const summaries = rawList.map(summarizeActivity);
        let text: string;
        if (params.response_format === "json") {
          text = JSON.stringify({ count, totalPage, page: params.page, activities: rawList }, null, 2);
        } else {
          const lines = [
            `# COROS Activities (page ${params.page}${totalPage ? `/${totalPage}` : ""}, total ${count})`,
            "",
            ...summaries.map(activityLine),
          ];
          text = lines.join("\n");
        }

        return {
          content: [{ type: "text" as const, text: enforceCharacterLimit(text) }],
          structuredContent: { count, totalPage, page: params.page, activities: summaries },
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: toErrorMessage(error) }], isError: true };
      }
    },
  );

  server.registerTool(
    "coros_get_activity",
    {
      title: "Get COROS Activity Detail",
      description: `Fetch full detail for a single COROS activity: laps/splits, heart-rate data, pace, elevation, training effect, and device metrics.

Args:
  - label_id (string): Activity labelId from coros_list_activities
  - sport_type (number): The activity's sportType code (also from the list)

Returns the raw detail JSON from the COROS API (structure varies by sport). Large responses are truncated; the summary metrics near the top of the payload are usually sufficient for analysis.`,
      inputSchema: {
        label_id: z.string().min(1).describe("Activity labelId from coros_list_activities"),
        sport_type: z.number().int().describe("The activity's sportType code"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        // The API rejects these as a JSON body (result=1001); it expects query params.
        const data = await client.request("POST", "/activity/detail/query", {
          query: { labelId: params.label_id, sportType: params.sport_type },
        });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text" as const, text: enforceCharacterLimit(text) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: toErrorMessage(error) }], isError: true };
      }
    },
  );

  server.registerTool(
    "coros_download_activity",
    {
      title: "Export COROS Activity File",
      description: `Request an export file (FIT/TCX/GPX/KML/CSV) for one activity and return its download URL.

Args:
  - label_id (string): Activity labelId from coros_list_activities
  - sport_type (number): The activity's sportType code
  - file_type ('fit' | 'tcx' | 'gpx' | 'kml' | 'csv'): Export format (default: 'fit', the most reliable)

Returns a JSON object containing the temporary file URL provided by COROS. Download it promptly; URLs may expire.`,
      inputSchema: {
        label_id: z.string().min(1).describe("Activity labelId"),
        sport_type: z.number().int().describe("The activity's sportType code"),
        file_type: z
          .enum(["fit", "tcx", "gpx", "kml", "csv"])
          .default("fit")
          .describe("Export file format"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await client.request("POST", "/activity/detail/download", {
          query: {
            labelId: params.label_id,
            sportType: params.sport_type,
            fileType: EXPORT_FILE_TYPES[params.file_type],
          },
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: toErrorMessage(error) }], isError: true };
      }
    },
  );
}
