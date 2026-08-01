/**
 * Body-composition (smart scale) data tool.
 *
 * Smart scales like atFlee have no public API, so data arrives as a CSV
 * export — from the scale's own app, Samsung Health's personal data
 * download, or a spreadsheet the user maintains. This tool normalizes any
 * of those into a consistent measurement list for cross-analysis with
 * COROS training data.
 */

import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BodyMeasurement } from "../services/csv.js";
import { parseBodyCompositionCsv } from "../services/csv.js";
import { enforceCharacterLimit, toErrorMessage } from "../services/format.js";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function summarize(measurements: BodyMeasurement[]): Record<string, unknown> {
  const weights = measurements.filter((m) => m.weight_kg !== undefined);
  if (weights.length === 0) return {};
  const first = weights[0];
  const last = weights[weights.length - 1];
  const values = weights.map((m) => m.weight_kg as number);
  return {
    period: `${first.date} ~ ${last.date}`,
    measurements: measurements.length,
    weight_start_kg: first.weight_kg,
    weight_end_kg: last.weight_kg,
    weight_change_kg: round1((last.weight_kg as number) - (first.weight_kg as number)),
    weight_min_kg: Math.min(...values),
    weight_max_kg: Math.max(...values),
    ...(first.body_fat_pct !== undefined && last.body_fat_pct !== undefined
      ? { body_fat_change_pct: round1(last.body_fat_pct - first.body_fat_pct) }
      : {}),
  };
}

export function registerBodyTools(server: McpServer): void {
  server.registerTool(
    "body_load_measurements",
    {
      title: "Load Body Composition CSV",
      description: `Load smart-scale body composition data (weight, body fat %, skeletal muscle, BMI, etc.) from a CSV file on the local filesystem, for cross-analysis with COROS training data.

Supported inputs:
  - atFlee (앳플리) or other scale-app CSV exports
  - Samsung Health "personal data download" weight CSV (metadata line is skipped automatically)
  - Any CSV with a date column plus weight/body-composition columns (Korean or English headers)

Args:
  - file_path (string): Absolute path to the CSV file
  - start_date / end_date (string, optional): Inclusive YYYY-MM-DD date filter
  - response_format ('markdown' | 'json'): default markdown

Returns normalized measurements sorted by date: { date, time?, weight_kg, body_fat_pct, skeletal_muscle_kg, muscle_mass_kg, bmi, body_water_pct, visceral_fat, bmr_kcal } plus a summary (start/end/min/max weight and total change). Also reports which CSV columns were detected, so you can spot mapping problems.

Use together with coros_list_activities to correlate training volume with weight and body-fat trends.`,
      inputSchema: {
        file_path: z.string().min(1).describe("Absolute path to the CSV file"),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .optional()
          .describe("Only include measurements on/after this date"),
        end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .optional()
          .describe("Only include measurements on/before this date"),
        response_format: z
          .enum(["markdown", "json"])
          .default("markdown")
          .describe("markdown for a table + summary, json for full structured data"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        let text: string;
        try {
          text = await readFile(params.file_path, "utf-8");
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Could not read file '${params.file_path}': ${reason}. Provide an absolute path to an existing CSV file.`,
              },
            ],
            isError: true,
          };
        }

        const { measurements, detectedColumns, skippedRows } = parseBodyCompositionCsv(text);
        if (measurements.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Error: No body measurements could be parsed from this CSV. " +
                  "Expected a header row containing a date column (date/날짜/측정일/start_time...) " +
                  "and at least one metric column (weight/체중, body fat/체지방률, BMI...). " +
                  "Check the file's header names, or share the first few lines so the mapping can be extended.",
              },
            ],
            isError: true,
          };
        }

        const filtered = measurements.filter(
          (m) =>
            (!params.start_date || m.date >= params.start_date) &&
            (!params.end_date || m.date <= params.end_date),
        );
        const summary = summarize(filtered);
        const output = {
          summary,
          detectedColumns,
          skippedRows,
          count: filtered.length,
          measurements: filtered,
        };

        let textOut: string;
        if (params.response_format === "json") {
          textOut = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Body Composition (${filtered.length} measurements)`,
            "",
            `Summary: ${JSON.stringify(summary)}`,
            `Detected columns: ${JSON.stringify(detectedColumns)}`,
            "",
            "| date | weight_kg | body_fat_% | skeletal_muscle_kg | bmi |",
            "|------|-----------|------------|--------------------|-----|",
            ...filtered.map(
              (m) =>
                `| ${m.date}${m.time ? " " + m.time : ""} | ${m.weight_kg ?? ""} | ${m.body_fat_pct ?? ""} | ${m.skeletal_muscle_kg ?? ""} | ${m.bmi ?? ""} |`,
            ),
          ];
          textOut = lines.join("\n");
        }

        return {
          content: [{ type: "text" as const, text: enforceCharacterLimit(textOut) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: toErrorMessage(error) }], isError: true };
      }
    },
  );
}
