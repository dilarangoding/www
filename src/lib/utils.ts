export function formatDate(date: Date) {
  return Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatMonthYear(date: Date) {
  return Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
  }).format(date);
}
