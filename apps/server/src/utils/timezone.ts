export const DEFAULT_APP_TIME_ZONE = "America/Sao_Paulo";

type TimeZoneParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function normalizeTimeZone(timeZone?: string | null) {
  const candidate = typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone.trim() : DEFAULT_APP_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_APP_TIME_ZONE;
  }
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getTimeZoneParts(date = new Date(), timeZone?: string | null): TimeZoneParts {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    hour: parts.find((part) => part.type === "hour")?.value ?? "00",
    minute: parts.find((part) => part.type === "minute")?.value ?? "00",
    second: parts.find((part) => part.type === "second")?.value ?? "00"
  };
}

export function getTimeZoneOffsetMinutes(date = new Date(), timeZone?: string | null) {
  const parts = getTimeZoneParts(date, timeZone);
  const localUtcMillis = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    0
  );

  return Math.round((localUtcMillis - date.getTime()) / 60000);
}

function formatOffset(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;
  return `${sign}${pad(offsetHours)}:${pad(offsetRemainderMinutes)}`;
}

export function formatTimeZoneDateKey(date = new Date(), timeZone?: string | null) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatTimeZoneClock(date = new Date(), timeZone?: string | null) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

export function formatTimeZoneTimestamp(date = new Date(), timeZone?: string | null) {
  const parts = getTimeZoneParts(date, timeZone);
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${formatOffset(offsetMinutes)}`;
}

export function getTimeZoneNowFields(date = new Date(), timeZone?: string | null) {
  const parts = getTimeZoneParts(date, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    timeZone: normalizeTimeZone(timeZone)
  };
}

export function shiftDateKey(dateKey: string, deltaDays: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  value.setUTCDate(value.getUTCDate() + deltaDays);
  return value.toISOString().slice(0, 10);
}

export function parseTimeZoneLocalDateTime(dateKey: string, time: string, timeZone?: string | null) {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localUtcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = new Date(localUtcMillis);
  const firstOffsetMinutes = getTimeZoneOffsetMinutes(firstGuess, resolvedTimeZone);
  const candidate = new Date(localUtcMillis - firstOffsetMinutes * 60 * 1000);
  const secondOffsetMinutes = getTimeZoneOffsetMinutes(candidate, resolvedTimeZone);

  if (secondOffsetMinutes === firstOffsetMinutes) {
    return candidate;
  }

  return new Date(localUtcMillis - secondOffsetMinutes * 60 * 1000);
}
