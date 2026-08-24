/**
 * @typedef {{ status: "todo" | "done", date: string, endDate?: string | null, carriedFrom?: string | null }} RollableTask
 */

/**
 * Move unfinished tasks whose effective due date has passed onto the current day.
 * Multi-day tasks stay in place until their end date passes.
 *
 * @template {RollableTask} T
 * @param {T[]} tasks
 * @param {string} currentDay YYYY-MM-DD in the user's local planning timezone.
 * @returns {T[]}
 */
export function rollOverTasks(tasks, currentDay) {
  let changed = false;
  const nextTasks = tasks.map((task) => {
    const dueDate = task.endDate || task.date;
    if (task.status !== "todo" || !dueDate || dueDate >= currentDay) return task;
    changed = true;
    return /** @type {T} */ ({
      ...task,
      date: currentDay,
      endDate: null,
      carriedFrom: task.carriedFrom || dueDate,
    });
  });
  return changed ? nextTasks : tasks;
}
