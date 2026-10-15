/** Short English time since `value`. After 30 days, show the date. */
export function relativeTime(value: string, now: number = Date.now()) {
  const time = new Date(value).getTime();
  if (!value) return "—";
  if (Number.isNaN(time)) return value;
  const seconds = Math.floor((now - time) / 1000);
  if (seconds < 60) return "just now";
  const unit = (amount: number, name: string) => `${amount} ${name}${amount === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  const days = Math.floor(hours / 24);
  return days <= 30 ? unit(days, "day") : new Date(time).toLocaleDateString();
}

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A short calendar date, for example `14 Oct 2026`. A date without a time stays on its own day. Empty or bad input gives a dash or the input. */
export function formatDay(value: string) {
  if (!value) return "—";
  const match = DAY_ONLY.exec(value);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Whole hours from `start` to `end`, for example `54 h`. A span under 1 hour is `< 1 h`. A missing, bad, or negative span is a dash. */
export function elapsedHours(start: string, end: string) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!start || !end || Number.isNaN(from) || Number.isNaN(to) || to < from) return "—";
  return formatHours(to - from);
}

/** Whole hours for a span in ms, for example `54 h`. Under 1 hour is `< 1 h`. A bad or negative span is a dash. */
export function formatHours(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const hours = Math.round(ms / 3_600_000);
  return hours < 1 ? "< 1 h" : `${hours.toLocaleString("en-US")} h`;
}
