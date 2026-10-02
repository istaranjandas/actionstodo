// Date Utility Functions

export function getLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(isoStr, count) {
  const parts = isoStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + count);
  return getLocalISODate(d);
}

export function getWeekDates(offsetWeeks = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + (offsetWeeks * 7));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(getLocalISODate(d));
  }
  return days;
}

export function formatFriendlyDate(isoStr) {
  if (!isoStr) return { title: 'No Date', sub: '' };
  const today = getLocalISODate();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const parts = isoStr.split('-').map(Number);
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

  const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (isoStr === today) {
    return { title: 'Today', sub: `${weekday}, ${monthDay}` };
  } else if (isoStr === tomorrow) {
    return { title: 'Tomorrow', sub: `${weekday}, ${monthDay}` };
  } else if (isoStr === yesterday) {
    return { title: 'Yesterday', sub: `${weekday}, ${monthDay}` };
  } else {
    const fullDay = dateObj.toLocaleDateString(undefined, { weekday: 'long' });
    return { title: fullDay, sub: `${monthDay}` };
  }
}

export function formatShortDate(isoStr) {
  const today = getLocalISODate();
  if (isoStr === today) return 'Today';
  if (isoStr === addDays(today, 1)) return 'Tomorrow';
  if (isoStr === addDays(today, -1)) return 'Yesterday';
  const parts = isoStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekRangeLabel(dates) {
  if (!dates || dates.length < 7) return '';
  const startParts = dates[0].split('-').map(Number);
  const endParts = dates[6].split('-').map(Number);
  const startObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const endObj = new Date(endParts[0], endParts[1] - 1, endParts[2]);

  const startMonth = startObj.toLocaleDateString(undefined, { month: 'short' });
  const endMonth = endObj.toLocaleDateString(undefined, { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${startObj.getDate()} – ${endObj.getDate()}, ${endObj.getFullYear()}`;
  }
  return `${startMonth} ${startObj.getDate()} – ${endMonth} ${endObj.getDate()}, ${endObj.getFullYear()}`;
}
