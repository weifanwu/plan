const COLLECTIONS = ["tasks", "routines", "schedule", "goals", "habits", "workouts", "trainingPlans", "exercises", "exerciseLogs", "activityLogs", "applications", "notes", "references"];
const ACTIONS = new Set(["add", "update", "delete", "reorder"]);

export function applyAIOperations(current, operations = [], makeId = () => `ai-${Date.now()}`) {
  const next = { ...current };
  for (const collection of COLLECTIONS) next[collection] = [...(current[collection] || [])];

  for (const rawOperation of operations) {
    if (!rawOperation || !COLLECTIONS.includes(rawOperation.collection) || !ACTIONS.has(rawOperation.operation)) continue;
    const { collection, operation } = rawOperation;
    const recordId = typeof rawOperation.recordId === "string" ? rawOperation.recordId.trim() : "";
    const records = next[collection];

    if (operation === "delete") {
      if (recordId) next[collection] = records.filter((record) => record.id !== recordId);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawOperation.recordJson || "");
    } catch {
      continue;
    }

    if (operation === "reorder") {
      if (!Array.isArray(parsed)) continue;
      const requestedIds = parsed.filter((id) => typeof id === "string");
      const byId = new Map(records.map((record) => [record.id, record]));
      const reordered = requestedIds.flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
      const requestedSet = new Set(requestedIds);
      next[collection] = [...reordered, ...records.filter((record) => !requestedSet.has(record.id))];
      continue;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    if (operation === "add") {
      const id = typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : recordId || makeId();
      if (records.some((record) => record.id === id)) continue;
      next[collection] = [...records, { ...parsed, id }];
      continue;
    }

    if (operation === "update" && recordId) {
      const index = records.findIndex((record) => record.id === recordId);
      if (index === -1) continue;
      const updated = [...records];
      updated[index] = { ...records[index], ...parsed, id: recordId };
      next[collection] = updated;
    }
  }

  return next;
}
