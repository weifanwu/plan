const DAY_MS = 86_400_000;

function dayNumber(date) {
  const parsed = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / DAY_MS) : null;
}

function dateFromDayNumber(value) {
  return new Date(value * DAY_MS).toISOString().slice(0, 10);
}

export function routineIntervalDays(routine) {
  if (routine?.frequency === "daily") return 1;
  const interval = Number(routine?.intervalDays);
  return Number.isInteger(interval) ? Math.min(365, Math.max(1, interval)) : 1;
}

export function isRoutineDueOn(routine, date) {
  if (!routine?.active || typeof routine.startDate !== "string") return false;
  const start = dayNumber(routine.startDate);
  const target = dayNumber(date);
  if (start === null || target === null || target < start) return false;
  return (target - start) % routineIntervalDays(routine) === 0;
}

export function latestRoutineOccurrence(routine, date) {
  if (!routine?.active || typeof routine.startDate !== "string") return null;
  const start = dayNumber(routine.startDate);
  const target = dayNumber(date);
  if (start === null || target === null || target < start) return null;
  const interval = routineIntervalDays(routine);
  return dateFromDayNumber(target - ((target - start) % interval));
}

export function routineTodayEntry(routine, date) {
  const occurrenceDate = latestRoutineOccurrence(routine, date);
  if (!occurrenceDate) return null;
  const completedDates = Array.isArray(routine.completedDates) ? routine.completedDates : [];
  const completed = completedDates.includes(occurrenceDate);
  if (occurrenceDate !== date && completed) return null;
  return { occurrenceDate, completed, overdue: occurrenceDate < date };
}

export function nextRoutineOccurrence(routine, fromDate, includeFrom = true) {
  if (!routine?.active || typeof routine.startDate !== "string") return null;
  const start = dayNumber(routine.startDate);
  const from = dayNumber(fromDate);
  if (start === null || from === null) return null;
  if (from < start) return routine.startDate;
  const interval = routineIntervalDays(routine);
  const distance = from - start;
  const remainder = distance % interval;
  if (includeFrom && remainder === 0) return fromDate;
  return dateFromDayNumber(from + (remainder === 0 ? interval : interval - remainder));
}

export function routineFrequencyLabel(routine) {
  const interval = routineIntervalDays(routine);
  return interval === 1 ? "每天" : `每 ${interval} 天`;
}
