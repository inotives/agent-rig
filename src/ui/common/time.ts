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
