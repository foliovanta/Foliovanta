// Pure presentation helpers for the public portfolio renderer. No React, no DB.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Formats a snapshot date-only string ("YYYY-MM-DD") as "Mon YYYY" without any
 * timezone math (parsed from the string parts directly). Returns null for null
 * or malformed input.
 */
export function formatMonthYear(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = match[1]!;
  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS[monthIndex];
  return month ? `${month} ${year}` : null;
}

/**
 * Renders a start–end range. `isCurrent` (and a missing end) read as "Present".
 * Returns null when there is nothing to show.
 */
export function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent = false,
): string | null {
  const start = formatMonthYear(startDate);
  const end = isCurrent ? "Present" : formatMonthYear(endDate);
  if (!start && !end) return null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

// Only absolute http(s) URLs are rendered as links; anything else is dropped so
// no javascript:/data: or relative URLs reach the public page.
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// A readable label for a link (host without www, no scheme/trailing slash).
export function linkLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.host.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

// Up to two initials from a display name, for the avatar monogram fallback.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}
