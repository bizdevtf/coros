/**
 * Shared formatting helpers used by all tools.
 */

import { CHARACTER_LIMIT, sportName } from "../constants.js";
import { CorosApiError } from "./client.js";

/** Format seconds as H:MM:SS (or M:SS below one hour). */
export function formatDuration(totalSeconds: number | undefined | null): string {
  if (totalSeconds === undefined || totalSeconds === null || !isFinite(totalSeconds)) {
    return "-";
  }
  const s = Math.round(totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Convert an epoch-seconds timestamp to an ISO-8601 string. */
export function epochToIso(epochSeconds: number | undefined | null): string | undefined {
  if (!epochSeconds) return undefined;
  return new Date(epochSeconds * 1000).toISOString();
}

/** Format a COROS `date` integer like 20250801 as "2025-08-01". */
export function formatCorosDate(date: number | undefined | null): string | undefined {
  if (!date) return undefined;
  const s = String(date);
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * Extract a normalized summary from a raw COROS activity object.
 * All original fields are preserved by callers that need them; this only
 * derives convenient display values, tolerating missing/renamed fields.
 */
export function summarizeActivity(raw: Record<string, unknown>): Record<string, unknown> {
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const distance = num(raw.distance);
  const duration = num(raw.totalTime) ?? num(raw.workoutTime) ?? num(raw.duration);
  const sportType = num(raw.sportType);

  return {
    labelId: raw.labelId ?? raw.label_id,
    name: raw.name,
    sportType,
    sport: sportName(sportType),
    date: formatCorosDate(num(raw.date)) ?? epochToIso(num(raw.startTime)),
    startTime: epochToIso(num(raw.startTime)),
    distance_m: distance,
    distance_km: distance !== undefined ? Math.round(distance / 10) / 100 : undefined,
    duration_s: duration,
    duration: formatDuration(duration),
    calorie: raw.calorie,
    avgHeartRate: raw.avgHeartRate ?? raw.avgHr,
    avgSpeed: raw.avgSpeed,
    avgPace: raw.avgPace,
    trainingLoad: raw.trainingLoad,
  };
}

/** One-line markdown rendering of a summarized activity. */
export function activityLine(summary: Record<string, unknown>): string {
  const parts = [
    summary.date ?? "?",
    summary.sport,
    summary.distance_km !== undefined ? `${summary.distance_km} km` : null,
    summary.duration !== "-" ? summary.duration : null,
    summary.avgHeartRate !== undefined && summary.avgHeartRate !== null
      ? `avg HR ${summary.avgHeartRate}`
      : null,
    `labelId: ${summary.labelId}`,
  ].filter((p) => p !== null && p !== undefined);
  return `- ${parts.join(" | ")}`;
}

/** Truncate a response string that exceeds the character limit. */
export function enforceCharacterLimit(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[Response truncated at ${CHARACTER_LIMIT} characters. ` +
    `Use pagination (page/size) or narrower filters to reduce the result size.]`
  );
}

/** Convert any thrown error into an actionable message for the agent. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof CorosApiError) {
    return `Error: ${error.message}`;
  }
  return `Error: Unexpected failure: ${error instanceof Error ? error.message : String(error)}`;
}
