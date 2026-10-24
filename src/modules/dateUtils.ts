// Date Utility Functions
// Dates travel through the app as local ISO strings ("YYYY-MM-DD"). They are parsed in exactly one
// place so no caller has to remember the month offset or the timezone dance.

export function getLocalISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isoDateParts(isoStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoStr.split('-').map(Number);
  return { year, month, day };
}

// Local midnight for an ISO date — never UTC, so the day never shifts under the user
export function parseISODate(isoStr: string): Date {
  const { year, month, day } = isoDateParts(isoStr);
  return new Date(year, month - 1, day);
}

export function addDays(isoStr: string, count: number): string {
  const d = parseISODate(isoStr);
  d.setDate(d.getDate() + count);
  return getLocalISODate(d);
}

export function getWeekDates(offsetWeeks = 0): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + (offsetWeeks * 7));

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(getLocalISODate(d));
  }
  return days;
}

// "Today" / "Tomorrow" / "Yesterday" for the day either side of now, or null for any other date
function relativeDayLabel(isoStr: string): string | null {
  const today = getLocalISODate();
  if (isoStr === today) return 'Today';
  if (isoStr === addDays(today, 1)) return 'Tomorrow';
  if (isoStr === addDays(today, -1)) return 'Yesterday';
  return null;
}

export function formatFriendlyDate(isoStr: string | null | undefined): { title: string; sub: string } {
  if (!isoStr) return { title: 'No Date', sub: '' };
  const dateObj = parseISODate(isoStr);

  const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const relative = relativeDayLabel(isoStr);
  if (relative) {
    return { title: relative, sub: `${weekday}, ${monthDay}` };
  }
  const fullDay = dateObj.toLocaleDateString(undefined, { weekday: 'long' });
  return { title: fullDay, sub: `${monthDay}` };
}

export function formatShortDate(isoStr: string): string {
  return relativeDayLabel(isoStr) ?? parseISODate(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekRangeLabel(dates: string[]): string {
  if (!dates || dates.length < 7) return '';
  const startObj = parseISODate(dates[0]);
  const endObj = parseISODate(dates[6]);

  const startMonth = startObj.toLocaleDateString(undefined, { month: 'short' });
  const endMonth = endObj.toLocaleDateString(undefined, { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startObj.getDate()} – ${endObj.getDate()}, ${endObj.getFullYear()}`;
  }
  return `${startMonth} ${startObj.getDate()} – ${endMonth} ${endObj.getDate()}, ${endObj.getFullYear()}`;
}
