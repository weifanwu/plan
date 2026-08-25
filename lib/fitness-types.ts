export type WeightUnit = "lb" | "kg";
export type LoadMode = "weight" | "bodyweight" | "assisted" | "added";
export type ExerciseBodyPart = "胸部" | "背部" | "肩部" | "二头" | "三头" | "腹部" | "腿部" | "有氧与活动";
export type TrainingKind = "strength" | "cardio" | "recovery" | "flex";
export type ActivityIntensity = "" | "轻松" | "中等" | "较高";

export type ExerciseDefinition = {
  id: string;
  name: string;
  bodyPart: ExerciseBodyPart;
  mastered: boolean;
  notes: string;
  currentWeight: number | null;
  unit: WeightUnit;
  loadMode: LoadMode;
  defaultSets: number;
  defaultReps: string;
};

export type TrainingPlan = {
  id: string;
  title: string;
  weekday: number;
  kind: TrainingKind;
  durationMinutes: number;
  maxMinutes: number;
  exerciseIds: string[];
  warmupMinutes: number;
  strengthMinutes: number;
  cardioMinutes: number;
  notes: string;
  active: boolean;
};

export type ExerciseLog = {
  id: string;
  exerciseId: string;
  date: string;
  loadMode: LoadMode;
  weight: number | null;
  unit: WeightUnit;
  sets: number;
  reps: number[];
  rir: number | null;
  notes: string;
  planId?: string | null;
};

export type ActivityLog = {
  id: string;
  type: string;
  date: string;
  durationMinutes: number;
  distance: number | null;
  distanceUnit: "km" | "mi";
  intensity: ActivityIntensity;
  notes: string;
  planId?: string | null;
};

export type FitnessHabit = { id: string; label: string; done: boolean; icon: string };

