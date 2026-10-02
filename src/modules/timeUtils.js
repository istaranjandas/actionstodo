// Time Utility & NLP Parsing Functions
import { getLocalISODate } from './dateUtils.js';

export function addMinutesToTime(timeStr, minutesToAdd = 30) {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + minutesToAdd;
  totalMinutes = (totalMinutes + 1440) % 1440;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getDurationMinutes(startStr, endStr) {
  if (!startStr || !endStr) return 30;
  const [h1, m1] = startStr.split(':').map(Number);
  const [h2, m2] = endStr.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) diff += 1440;
  return diff;
}

export function parseTimeComponent(timeStr) {
  if (!timeStr) return { formatted: '', period: '' };
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { formatted: `${h}:${mStr}`, period };
}

export function formatTimeRangeDisplay(startTime, endTime) {
  if (!startTime) return '';
  const s = parseTimeComponent(startTime);
  if (!endTime) return `${s.formatted} ${s.period}`;
  const e = parseTimeComponent(endTime);

  if (s.period === e.period) {
    return `${s.formatted} – ${e.formatted} ${e.period}`;
  }
  return `${s.formatted} ${s.period} – ${e.formatted} ${e.period}`;
}

export function normalizeTimeString(str, hint = '') {
  if (!str) return null;
  str = str.trim().toLowerCase();
  let isPM = str.includes('pm');
  let isAM = str.includes('am');

  if (!isAM && !isPM && hint) {
    if (hint.toLowerCase().includes('pm')) isPM = true;
    if (hint.toLowerCase().includes('am')) isAM = true;
  }

  const clean = str.replace(/[a-z]/g, '').trim();
  let [hStr, mStr] = clean.split(':');
  let h = parseInt(hStr, 10);
  let m = mStr ? parseInt(mStr, 10) : 0;

  if (isNaN(h) || h < 0 || h > 24) return null;
  if (isNaN(m) || m < 0 || m > 59) return null;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  // If no am/pm specified and h is between 1 and 6, assume afternoon (e.g. "at 2" -> 2pm)
  if (!isAM && !isPM && h >= 1 && h <= 6) {
    h += 12;
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeFromText(text) {
  if (!text) return null;

  // Range regex: "10am-11am", "10:00 - 11:30", "2pm to 3:30pm", "9 to 10am", "2-3pm"
  const rangeRegex = /(?:at\s+|@\s*)?(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;
  const rangeMatch = text.match(rangeRegex);
  if (rangeMatch) {
    const start = normalizeTimeString(rangeMatch[1], rangeMatch[2]);
    const end = normalizeTimeString(rangeMatch[2]);
    if (start && end) {
      const cleanText = text.replace(rangeMatch[0], '').replace(/\s{2,}/g, ' ').trim();
      return { cleanText: cleanText || text, startTime: start, endTime: end, raw: rangeMatch[0] };
    }
  }

  // Single time regex: "at 2pm", "@ 3:30", "11:00am", "4pm", "at 14:00", "9am"
  const singleRegex = /(?:at\s+|@\s*)(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b)|(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)|(\b(?:[01]?\d|2[0-3]):[0-5]\d\b)/i;
  const match = text.match(singleRegex);
  if (match) {
    const matchedPart = match[1] || match[2] || match[3];
    const start = normalizeTimeString(matchedPart);
    if (start) {
      const cleanText = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
      return { cleanText: cleanText || text, startTime: start, endTime: addMinutesToTime(start, 30), raw: match[0] };
    }
  }

  return null;
}

export function getNextSmartSlot(dateStr, tasksList = []) {
  const dayTasks = tasksList
    .filter(t => t.date === dateStr && t.startTime)
    .sort((a, b) => (a.endTime || a.startTime).localeCompare(b.endTime || b.startTime));

  if (dayTasks.length > 0) {
    const latestTask = dayTasks[dayTasks.length - 1];
    const latestEnd = latestTask.endTime || addMinutesToTime(latestTask.startTime, 30);
    return {
      startTime: latestEnd,
      endTime: addMinutesToTime(latestEnd, 30)
    };
  }

  const today = getLocalISODate();
  if (dateStr === today) {
    const now = new Date();
    const curMin = now.getMinutes();
    let nextH = now.getHours();
    let nextM = curMin < 30 ? 30 : 0;
    if (curMin >= 30) nextH = (nextH + 1) % 24;
    const start = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
    return {
      startTime: start,
      endTime: addMinutesToTime(start, 30)
    };
  }

  return {
    startTime: '09:00',
    endTime: '09:30'
  };
}
