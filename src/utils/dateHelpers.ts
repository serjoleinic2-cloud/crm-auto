export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

export function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / 86400000);
}
