export function formatClockTime12h(hour24: number, minute: number): {
  timePart: string;
  period: 'AM' | 'PM';
  full: string;
} {
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hh = String(h12).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return {
    timePart: `${hh}:${mm}`,
    period,
    full: `${hh}:${mm} ${period}`,
  };
}

/**
 * Returns the next future (or current minute) timestamp in ms for a daily HH:MM alarm.
 */
export function getNextAlarmTimestamp(hour24: number, minute: number, nowMs = Date.now()): number {
  const now = new Date(nowMs);
  const candidate = new Date(now);
  candidate.setHours(hour24, minute, 0, 0);

  // If alarm minute already passed more than 59 seconds ago today, schedule for tomorrow
  if (candidate.getTime() + 59_000 < nowMs) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

export function isSameDayAlarm(targetMs: number, nowMs = Date.now()): 'Today' | 'Tomorrow' {
  const now = new Date(nowMs);
  const target = new Date(targetMs);
  return now.getDate() === target.getDate() && now.getMonth() === target.getMonth()
    ? 'Today'
    : 'Tomorrow';
}

export function formatCountdownParts(msRemaining: number): {
  hours: string;
  minutes: string;
  seconds: string;
  compact: string;
  isUrgent: boolean;
} {
  const clamped = Math.max(0, msRemaining);
  const totalSec = Math.floor(clamped / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const hours = String(hrs).padStart(2, '0');
  const minutes = String(mins).padStart(2, '0');
  const seconds = String(secs).padStart(2, '0');

  return {
    hours,
    minutes,
    seconds,
    compact: hrs > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`,
    isUrgent: clamped > 0 && clamped <= 15 * 60 * 1000,
  };
}

export interface WeekDayPill {
  dayLabel: string;
  dateNum: number;
  isToday: boolean;
  completed: boolean;
}

export function buildWeekStreakStrip(now = new Date()): WeekDayPill[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = now.getDay(); // 0=Sun..6=Sat
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const result: WeekDayPill[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + mondayOffset + i);
    const isToday = d.toDateString() === now.toDateString();
    const isPastOrToday = d.getTime() <= now.getTime();
    result.push({
      dayLabel: dayNames[d.getDay()],
      dateNum: d.getDate(),
      isToday,
      completed: isPastOrToday,
    });
  }
  return result;
}

/**
 * Haversine distance in meters between two GPS coordinates.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
