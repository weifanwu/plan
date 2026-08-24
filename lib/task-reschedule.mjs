function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function shiftTaskToDate(task, nextDate) {
  const duration = task.endDate && task.endDate > task.date ? daysBetween(task.date, task.endDate) : 0;
  return {
    ...task,
    date: nextDate,
    endDate: duration > 0 ? addDays(nextDate, duration) : null,
    carriedFrom: null,
  };
}
