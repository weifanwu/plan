export type MealSlot = "早餐" | "午餐" | "晚餐" | "加餐";
export type MealSource = "Nations" | "Tim Hortons" | "在家" | "灵活";
export type MealAccent = "lime" | "coral" | "lavender" | "blue";
export type IngredientCategory = "蛋白质" | "蔬果" | "主食" | "乳品与替代" | "调味与其他";
export type MealProcurementMode = "groceries" | "ready-made";
export type NutritionGuideKind = "philosophy" | "formula" | "rule";

export type MealIngredient = {
  name: string;
  amount: string;
  category: IngredientCategory;
  optional?: boolean;
  purchaseMode?: "grocery" | "on-site";
};

export type MealRecipe = {
  id: string;
  title: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: MealIngredient[];
  steps: string[];
  prepAhead: string[];
  notes: string;
};

export type MealTheme = {
  id: string;
  title: string;
  subtitle: string;
  mealSlots: MealSlot[];
  source: MealSource;
  tags: string[];
  proteinHint: string;
  recipeId: string | null;
  prepNote: string;
  notes: string;
  accent: MealAccent;
  active: boolean;
  procurement?: MealProcurementMode;
};

export type MealPlanEntry = {
  id: string;
  date: string;
  mealSlot: MealSlot;
  themeId: string | null;
  customTitle: string;
  notes: string;
  completed: boolean;
};

export type NutritionGuide = {
  id: string;
  kind: NutritionGuideKind;
  title: string;
  content: string;
  accent: MealAccent;
};
