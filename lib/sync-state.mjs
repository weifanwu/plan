const COLLECTION_KEYS = ["tasks", "routines", "schedule", "goals", "habits", "workouts", "trainingPlans", "exercises", "exerciseLogs", "activityLogs", "mealThemes", "mealPlans", "mealRecipes", "nutritionGuides", "purchaseItems", "applications", "notes", "references"];
const SINGLETON_KEYS = ["phase", "uiPreferences", "habitDate", "workoutWeek"];

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeValue(base, local, remote) {
  if (same(local, remote)) return { value: local, conflicts: 0 };
  if (same(local, base)) return { value: remote, conflicts: 0 };
  if (same(remote, base)) return { value: local, conflicts: 0 };
  return { value: local, conflicts: 1 };
}

function ids(records) {
  return records.map((record) => record.id);
}

function mergeRecord(baseRecord, localRecord, remoteRecord) {
  // A missing record represents a real deletion. Preserve the existing
  // three-way deletion policy instead of reconstructing it field by field.
  if (localRecord === undefined || remoteRecord === undefined) return mergeValue(baseRecord, localRecord, remoteRecord);
  if (!localRecord || !remoteRecord || typeof localRecord !== "object" || typeof remoteRecord !== "object" || Array.isArray(localRecord) || Array.isArray(remoteRecord)) return mergeValue(baseRecord, localRecord, remoteRecord);

  const base = baseRecord && typeof baseRecord === "object" && !Array.isArray(baseRecord) ? baseRecord : {};
  const keys = new Set([...Object.keys(base), ...Object.keys(localRecord), ...Object.keys(remoteRecord)]);
  const value = {};
  let conflicts = 0;
  for (const key of keys) {
    const result = mergeValue(base[key], localRecord[key], remoteRecord[key]);
    conflicts += result.conflicts;
    if (result.value !== undefined) value[key] = result.value;
  }
  return { value, conflicts };
}

function taskSchedule(task) {
  return { date: task.date, endDate: task.endDate ?? null, carriedFrom: task.carriedFrom ?? null };
}

function isAutomaticRollover(base, candidate) {
  const due = base?.endDate || base?.date;
  return Boolean(base && candidate && base.status === "todo" && due && candidate.date > due
    && !candidate.endDate && candidate.carriedFrom === (base.carriedFrom || due));
}

function mergeTask(base, local, remote) {
  // Hydration advances overdue tasks before contacting the server. That is
  // derived state, not a user edit that should defeat a manual reschedule.
  const localRolled = isAutomaticRollover(base, local);
  const remoteRolled = isAutomaticRollover(base, remote);
  const localInput = localRolled ? { ...local, ...taskSchedule(base) } : local;
  const remoteInput = remoteRolled ? { ...remote, ...taskSchedule(base) } : remote;
  const result = mergeRecord(base, localInput, remoteInput);
  if (!result.value || !localInput || !remoteInput) return result;

  // A date range and its rollover marker form one schedule. Do not assemble
  // a new start date with an unrelated old end date from another device.
  const schedule = mergeValue(base ? taskSchedule(base) : undefined, taskSchedule(localInput), taskSchedule(remoteInput));
  const withoutSchedule = (task) => task && Object.fromEntries(Object.entries(task).filter(([key]) => !["date", "endDate", "carriedFrom"].includes(key)));
  const fields = mergeRecord(withoutSchedule(base), withoutSchedule(localInput), withoutSchedule(remoteInput));
  result.value = { ...fields.value, ...schedule.value };
  result.conflicts = fields.conflicts + schedule.conflicts;
  if (base && result.value.status === "todo" && same(schedule.value, taskSchedule(base)) && (localRolled || remoteRolled)) {
    const rolledDate = [localRolled ? local.date : "", remoteRolled ? remote.date : ""].sort().at(-1);
    result.value = { ...result.value, date: rolledDate, endDate: null, carriedFrom: base.carriedFrom || base.endDate || base.date };
  }
  return result;
}

function mergeCollection(baseRecords = [], localRecords = [], remoteRecords = [], mergeItem = mergeRecord) {
  const base = new Map(baseRecords.map((record) => [record.id, record]));
  const local = new Map(localRecords.map((record) => [record.id, record]));
  const remote = new Map(remoteRecords.map((record) => [record.id, record]));
  const allIds = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const selected = new Map();
  let conflicts = 0;

  for (const id of allIds) {
    // Merge records field by field so moving a task on one device does not
    // erase a completion, note, or priority update made on another device.
    const result = mergeItem(base.get(id), local.get(id), remote.get(id));
    conflicts += result.conflicts;
    if (result.value !== undefined) selected.set(id, result.value);
  }

  const baseOrder = ids(baseRecords);
  const localOrder = ids(localRecords);
  const remoteOrder = ids(remoteRecords);
  let preferredOrder;
  if (same(localOrder, remoteOrder)) preferredOrder = localOrder;
  else if (same(localOrder, baseOrder)) preferredOrder = remoteOrder;
  else if (same(remoteOrder, baseOrder)) preferredOrder = localOrder;
  else {
    preferredOrder = localOrder;
    if (localOrder.some((id) => remote.has(id)) && remoteOrder.some((id) => local.has(id))) conflicts += 1;
  }

  const orderedIds = [...preferredOrder, ...remoteOrder, ...localOrder].filter((id, index, list) => selected.has(id) && list.indexOf(id) === index);
  return { value: orderedIds.map((id) => selected.get(id)), conflicts };
}

export function toSyncPayload(data) {
  return Object.fromEntries([
    ...SINGLETON_KEYS.map((key) => [key, structuredClone(data[key])]),
    ...COLLECTION_KEYS.map((key) => {
      const records = Array.isArray(data[key]) ? data[key] : [];
      // Private references are deliberately absent from the cloud payload. A
      // note only crosses the device boundary after the user explicitly makes
      // it AI-readable (aiExcluded === false).
      const syncableRecords = key === "references" ? records.filter((record) => record?.aiExcluded === false) : records;
      return [key, structuredClone(syncableRecords)];
    }),
  ]);
}

export function mergeSyncPayload(base, local, remote) {
  const merged = {};
  let conflicts = 0;

  for (const key of SINGLETON_KEYS) {
    const result = mergeValue(base?.[key], local?.[key], remote?.[key]);
    merged[key] = result.value;
    conflicts += result.conflicts;
  }

  for (const key of COLLECTION_KEYS) {
    const result = mergeCollection(base?.[key], local?.[key], remote?.[key], key === "tasks" ? mergeTask : mergeRecord);
    merged[key] = result.value;
    conflicts += result.conflicts;
  }

  return { data: merged, conflicts };
}

export function syncPayloadEquals(left, right) {
  return same(left, right);
}
