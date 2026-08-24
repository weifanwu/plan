export const COMPLETED_TASK_RETENTION_DAYS = 60;

export function isCompletedTaskArchived(task, today, retentionDays = COMPLETED_TASK_RETENTION_DAYS) {
  if (task.status !== "done") return false;
  const completedDate = task.completedAt || task.endDate || task.date;
  const age = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${completedDate}T12:00:00Z`)) / 86400000);
  return age >= retentionDays;
}
