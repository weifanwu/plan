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

function mergeCollection(baseRecords = [], localRecords = [], remoteRecords = []) {
  const base = new Map(baseRecords.map((record) => [record.id, record]));
  const local = new Map(localRecords.map((record) => [record.id, record]));
  const remote = new Map(remoteRecords.map((record) => [record.id, record]));
  const allIds = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const selected = new Map();
  let conflicts = 0;

  for (const id of allIds) {
    const result = mergeValue(base.get(id), local.get(id), remote.get(id));
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
    const result = mergeCollection(base?.[key], local?.[key], remote?.[key]);
    merged[key] = result.value;
    conflicts += result.conflicts;
  }

  return { data: merged, conflicts };
}

export function syncPayloadEquals(left, right) {
  return same(left, right);
}
