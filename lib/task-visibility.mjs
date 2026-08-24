export function isTaskActiveOn(task, date) {
  return task.date <= date && (task.endDate || task.date) >= date;
}

export function isTaskVisibleToday(task, date) {
  return task.status === "todo" ? isTaskActiveOn(task, date) : task.completedAt === date;
}
