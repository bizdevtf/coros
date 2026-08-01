/**
 * Shared constants for the COROS MCP server.
 *
 * NOTE: COROS does not publish an official public API. These endpoints are the
 * ones used by the COROS Training Hub web app (training.coros.com) and are
 * well-known in the community (GoldenCheetah, coros-api, etc.). Field names
 * and codes may change without notice.
 */

/** Maximum characters returned in a single tool response before truncation. */
export const CHARACTER_LIMIT = 25000;

/** Regional API base URLs for the COROS Training Hub backend. */
export const REGION_BASE_URLS: Record<string, string> = {
  global: "https://teamapi.coros.com",
  eu: "https://teameuapi.coros.com",
  cn: "https://teamcnapi.coros.com",
};

/** Result code returned by the COROS API on success. */
export const COROS_OK_RESULT = "0000";

/**
 * Known COROS sportType codes. The numeric code is always included in tool
 * output; this map only adds a human-readable label for common codes.
 * Unknown codes are rendered as "Sport(<code>)".
 */
export const SPORT_TYPE_NAMES: Record<number, string> = {
  100: "Run",
  101: "Indoor Run",
  102: "Trail Run",
  103: "Track Run",
  200: "Bike",
  201: "Indoor Bike",
  300: "Pool Swim",
  301: "Open Water Swim",
  402: "Mountain Climb",
  700: "Gym Cardio",
  705: "Strength",
  800: "Multisport",
  900: "Ski",
  901: "Snowboard",
  902: "XC Ski",
};

/**
 * Export file type codes accepted by the activity download endpoint.
 * "fit" (4) is the most reliable and widely used.
 */
export const EXPORT_FILE_TYPES: Record<string, string> = {
  gpx: "0",
  tcx: "1",
  kml: "2",
  csv: "3",
  fit: "4",
};

export function sportName(sportType: number | undefined | null): string {
  if (sportType === undefined || sportType === null) return "Unknown";
  return SPORT_TYPE_NAMES[sportType] ?? `Sport(${sportType})`;
}
