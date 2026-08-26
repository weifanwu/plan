import type { IngredientCategory, MealPlanEntry, MealRecipe, MealTheme } from "./meal-types";

export type GrocerySummary = { key: string; name: string; category: IngredientCategory; uses: string[] };
export type ReadyMadeSummary = { key: string; title: string; source: string; dates: string[]; count: number };
export type PrepSummary = { key: string; item: string; themes: string[] };

function procurementMode(theme: MealTheme) {
  if (theme.procurement) return theme.procurement;
  if (theme.source === "Tim Hortons" || theme.tags.includes("外食")) return "ready-made";
  return "groceries";
}

function actionablePrep(item: string) {
  return item.trim() && !/(无需|不需要|当天再|当天洗|当天处理)/.test(item);
}

export function buildMealProcurement(plans: MealPlanEntry[], themes: MealTheme[], recipes: MealRecipe[], start: string, end: string) {
  const themeById = new Map(themes.map((theme) => [theme.id, theme]));
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const groceries = new Map<string, { name: string; category: IngredientCategory; useCounts: Map<string, number> }>();
  const readyMade = new Map<string, ReadyMadeSummary>();
  const prep = new Map<string, { item: string; themes: Set<string> }>();

  for (const plan of plans.filter((item) => item.date >= start && item.date <= end)) {
    const theme = plan.themeId ? themeById.get(plan.themeId) : undefined;
    if (!theme) continue;
    const recipe = theme.recipeId ? recipeById.get(theme.recipeId) : undefined;
    const mode = procurementMode(theme);

    if (mode === "ready-made") {
      const existing = readyMade.get(theme.id) || { key: theme.id, title: theme.title, source: theme.source, dates: [], count: 0 };
      existing.count += 1;
      existing.dates.push(plan.date);
      readyMade.set(theme.id, existing);
    }

    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.optional) continue;
      const purchaseMode = ingredient.purchaseMode || (mode === "ready-made" ? "on-site" : "grocery");
      if (purchaseMode !== "grocery") continue;
      const key = ingredient.name.trim().toLowerCase().replace(/\s+/g, " ");
      const existing = groceries.get(key) || { name: ingredient.name.trim(), category: ingredient.category, useCounts: new Map<string, number>() };
      const use = `${ingredient.amount} · ${theme.title}`;
      existing.useCounts.set(use, (existing.useCounts.get(use) || 0) + 1);
      groceries.set(key, existing);
    }

    if (mode === "groceries") {
      for (const item of recipe.prepAhead.filter(actionablePrep)) {
        const key = item.trim().toLowerCase().replace(/\s+/g, " ");
        const existing = prep.get(key) || { item: item.trim(), themes: new Set<string>() };
        existing.themes.add(theme.title);
        prep.set(key, existing);
      }
    }
  }

  return {
    groceries: [...groceries.entries()].map(([key, item]) => ({
      key,
      name: item.name,
      category: item.category,
      uses: [...item.useCounts.entries()].map(([use, count]) => count > 1 ? `${use} × ${count}` : use),
    } satisfies GrocerySummary)),
    readyMade: [...readyMade.values()].map((item) => ({ ...item, dates: [...new Set(item.dates)].sort() })),
    prep: [...prep.entries()].map(([key, item]) => ({ key, item: item.item, themes: [...item.themes] } satisfies PrepSummary)),
  };
}
