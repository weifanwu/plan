"use client";

import { useMemo, useState } from "react";
import type { IngredientCategory, MealAccent, MealPlanEntry, MealRecipe, MealSlot, MealSource, MealTheme } from "../../lib/meal-types";

type Props = {
  today: string;
  mealThemes: MealTheme[];
  mealPlans: MealPlanEntry[];
  mealRecipes: MealRecipe[];
  onChange: (change: Partial<Pick<Props, "mealThemes" | "mealPlans" | "mealRecipes">>) => void;
};

type MealTab = "week" | "themes" | "shopping" | "guides";
type PickerTarget = { date: string; mealSlot: MealSlot; source?: MealSource };
const WEEK_SLOTS: MealSlot[] = ["早餐", "午餐", "晚餐"];
const ALL_SLOTS: MealSlot[] = ["早餐", "午餐", "晚餐", "加餐"];
const SOURCES: MealSource[] = ["Nations", "Tim Hortons", "在家", "灵活"];
const ACCENTS: MealAccent[] = ["lime", "coral", "lavender", "blue"];
const CATEGORIES: IngredientCategory[] = ["蛋白质", "蔬果", "主食", "乳品与替代", "调味与其他"];
const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function dateAt(dateString: string, offset: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function shortDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function weekLabel(start: string) {
  return `${shortDate(start)}—${shortDate(dateAt(start, 6))}`;
}

function recipeDuration(recipe?: MealRecipe) {
  if (!recipe) return "无需菜谱";
  const minutes = recipe.prepMinutes + recipe.cookMinutes;
  return minutes === 0 ? "直接组合" : `${minutes} 分钟`;
}

function planTitle(plan: MealPlanEntry, theme?: MealTheme) {
  return theme?.title || plan.customTitle || "未命名餐食";
}

export default function MealPlannerModule({ today, mealThemes, mealPlans, mealRecipes, onChange }: Props) {
  const [tab, setTab] = useState<MealTab>("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [themeDetailId, setThemeDetailId] = useState<string | null>(null);
  const [themeEditor, setThemeEditor] = useState<MealTheme | "new" | null>(null);
  const [recipeEditor, setRecipeEditor] = useState<MealRecipe | "new" | null>(null);
  const [pendingRecipeThemeId, setPendingRecipeThemeId] = useState<string | null>(null);
  const [themeQuery, setThemeQuery] = useState("");
  const [themeSlot, setThemeSlot] = useState<"全部" | MealSlot>("全部");
  const [shoppingChecked, setShoppingChecked] = useState<Set<string>>(new Set());
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const themeById = useMemo(() => new Map(mealThemes.map((theme) => [theme.id, theme])), [mealThemes]);
  const recipeById = useMemo(() => new Map(mealRecipes.map((recipe) => [recipe.id, recipe])), [mealRecipes]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => ({ date: dateAt(weekStart, index), label: DAY_LABELS[index] })), [weekStart]);
  const weekEnd = weekDays[6].date;
  const weekPlans = useMemo(() => mealPlans.filter((plan) => plan.date >= weekStart && plan.date <= weekEnd), [mealPlans, weekEnd, weekStart]);
  const scheduledCount = weekPlans.filter((plan) => plan.themeId || plan.customTitle.trim()).length;
  const completedCount = weekPlans.filter((plan) => plan.completed).length;
  const activeThemeCount = mealThemes.filter((theme) => theme.active).length;
  const filteredThemes = useMemo(() => mealThemes.filter((theme) => {
    if (themeSlot !== "全部" && !theme.mealSlots.includes(themeSlot)) return false;
    const query = themeQuery.trim().toLowerCase();
    return !query || `${theme.title} ${theme.subtitle} ${theme.source} ${theme.tags.join(" ")}`.toLowerCase().includes(query);
  }), [mealThemes, themeQuery, themeSlot]);

  const shoppingGroups = useMemo(() => {
    const ingredients = new Map<string, { name: string; category: IngredientCategory; uses: string[] }>();
    for (const plan of weekPlans) {
      const theme = plan.themeId ? themeById.get(plan.themeId) : undefined;
      const recipe = theme?.recipeId ? recipeById.get(theme.recipeId) : undefined;
      if (!theme || !recipe) continue;
      for (const ingredient of recipe.ingredients) {
        if (ingredient.optional) continue;
        const key = ingredient.name.trim().toLowerCase();
        const existing = ingredients.get(key) || { name: ingredient.name, category: ingredient.category, uses: [] };
        existing.uses.push(`${ingredient.amount} · ${theme.title}`);
        ingredients.set(key, existing);
      }
    }
    return CATEGORIES.map((category) => ({ category, items: [...ingredients.values()].filter((item) => item.category === category) })).filter((group) => group.items.length);
  }, [recipeById, themeById, weekPlans]);

  const prepItems = useMemo(() => weekPlans.flatMap((plan) => {
    const theme = plan.themeId ? themeById.get(plan.themeId) : undefined;
    const recipe = theme?.recipeId ? recipeById.get(theme.recipeId) : undefined;
    return theme && recipe ? recipe.prepAhead.map((item) => ({ id: `${plan.id}-${item}`, date: plan.date, title: theme.title, item })) : [];
  }).filter((item, index, list) => list.findIndex((candidate) => candidate.item === item.item) === index), [recipeById, themeById, weekPlans]);

  const themeDetail = themeDetailId ? themeById.get(themeDetailId) : undefined;
  const detailRecipe = themeDetail?.recipeId ? recipeById.get(themeDetail.recipeId) : undefined;

  function savePlan(target: PickerTarget, themeId: string | null, customTitle = "") {
    const existing = mealPlans.find((plan) => plan.date === target.date && plan.mealSlot === target.mealSlot);
    const next: MealPlanEntry = existing
      ? { ...existing, themeId, customTitle, completed: false }
      : { id: id("meal-plan"), date: target.date, mealSlot: target.mealSlot, themeId, customTitle, notes: "", completed: false };
    onChange({ mealPlans: existing ? mealPlans.map((plan) => plan.id === existing.id ? next : plan) : [...mealPlans, next] });
    setPicker(null);
  }

  function removePlan(planId: string) {
    onChange({ mealPlans: mealPlans.filter((plan) => plan.id !== planId) });
  }

  function togglePlan(planId: string) {
    onChange({ mealPlans: mealPlans.map((plan) => plan.id === planId ? { ...plan, completed: !plan.completed } : plan) });
  }

  function movePlan(planId: string, date: string, mealSlot: MealSlot) {
    const source = mealPlans.find((plan) => plan.id === planId);
    if (!source) return;
    const target = mealPlans.find((plan) => plan.date === date && plan.mealSlot === mealSlot && plan.id !== planId);
    onChange({ mealPlans: mealPlans.map((plan) => {
      if (plan.id === source.id) return { ...plan, date, mealSlot };
      if (target && plan.id === target.id) return { ...plan, date: source.date, mealSlot: source.mealSlot };
      return plan;
    }) });
  }

  function fillBreakfasts() {
    const choices = mealThemes.filter((theme) => theme.active && theme.mealSlots.includes("早餐"));
    if (!choices.length) return;
    const withoutWeekBreakfasts = mealPlans.filter((plan) => !(plan.date >= weekStart && plan.date <= weekEnd && plan.mealSlot === "早餐"));
    const added = weekDays.map((day, index) => ({ id: id(`meal-breakfast-${index}`), date: day.date, mealSlot: "早餐" as const, themeId: choices[index % choices.length].id, customTitle: "", notes: "", completed: false }));
    onChange({ mealPlans: [...withoutWeekBreakfasts, ...added] });
  }

  function saveTheme(theme: MealTheme) {
    onChange({ mealThemes: themeEditor === "new" ? [...mealThemes, theme] : mealThemes.map((item) => item.id === theme.id ? theme : item) });
    setThemeEditor(null);
  }

  function deleteTheme(theme: MealTheme) {
    const recipeUsedElsewhere = mealThemes.some((item) => item.id !== theme.id && item.recipeId === theme.recipeId);
    onChange({
      mealThemes: mealThemes.filter((item) => item.id !== theme.id),
      mealPlans: mealPlans.filter((plan) => plan.themeId !== theme.id),
      ...(!recipeUsedElsewhere && theme.recipeId ? { mealRecipes: mealRecipes.filter((recipe) => recipe.id !== theme.recipeId) } : {}),
    });
    setThemeEditor(null);
    setThemeDetailId(null);
  }

  function saveRecipe(recipe: MealRecipe) {
    onChange({
      mealRecipes: recipeEditor === "new" ? [...mealRecipes, recipe] : mealRecipes.map((item) => item.id === recipe.id ? recipe : item),
      ...(recipeEditor === "new" && pendingRecipeThemeId ? { mealThemes: mealThemes.map((theme) => theme.id === pendingRecipeThemeId ? { ...theme, recipeId: recipe.id } : theme) } : {}),
    });
    setRecipeEditor(null);
    setPendingRecipeThemeId(null);
  }

  function deleteRecipe(recipeId: string) {
    onChange({ mealRecipes: mealRecipes.filter((recipe) => recipe.id !== recipeId), mealThemes: mealThemes.map((theme) => theme.recipeId === recipeId ? { ...theme, recipeId: null } : theme) });
    setRecipeEditor(null);
  }

  async function copyShoppingList() {
    const text = [`MAP · ${weekLabel(weekStart)} 采购清单`, ...shoppingGroups.flatMap((group) => [`\n${group.category}`, ...group.items.map((item) => `- ${item.name}：${item.uses.join("；")}`)]), ...(prepItems.length ? ["\n周日备菜", ...prepItems.map((item) => `- ${item.item}`)] : [])].join("\n");
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className="meal-module">
    <section className="meal-hero">
      <div><p className="section-kicker">FOOD SYSTEM · FLEXIBLE BY DESIGN</p><h2>周日决定，<br />工作日不用想。</h2><p>从主题库按心情选，不把每周菜单定死。排好后，采购、备菜和菜谱会自动连起来。</p><div className="meal-hero-actions"><button className="primary-button" onClick={() => { setTab("week"); setPicker({ date: dateAt(today, 1), mealSlot: "早餐", source: "Nations" }); }}>安排明天的 Nations 早餐</button><button className="ghost-button" onClick={() => setTab("shopping")}>查看本周采购</button></div></div>
      <div className="meal-hero-stats"><div><span>本周已安排</span><strong>{scheduledCount}<small> / 21 餐</small></strong></div><div><span>可选主题</span><strong>{activeThemeCount}<small> 个</small></strong></div><div><span>已完成</span><strong>{completedCount}<small> 餐</small></strong></div></div>
    </section>

    <nav className="meal-tabs" aria-label="饮食计划视图">
      {([ ["week", "本周餐盘", "按心情排"], ["themes", "主题库", "随时复用"], ["shopping", "采购与备菜", "自动汇总"], ["guides", "饮食规则", "需要时复习"] ] as Array<[MealTab, string, string]>).map(([value, label, note]) => <button className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}><strong>{label}</strong><span>{note}</span></button>)}
    </nav>

    {tab === "week" && <section className="meal-week-section">
      <header className="meal-section-header"><div><p className="section-kicker">WEEKLY MENU</p><h3>{weekLabel(weekStart)} · 这周想吃什么</h3><p>点空位挑主题；桌面端也可以直接拖动已安排的餐来交换日期。</p></div><div className="meal-week-actions"><button onClick={() => setWeekStart(dateAt(weekStart, -7))}>← 上周</button><button onClick={() => setWeekStart(mondayOf(today))}>本周</button><button onClick={() => setWeekStart(dateAt(weekStart, 7))}>下周 →</button><button className="meal-fill-button" onClick={fillBreakfasts}>一键排满早餐</button></div></header>
      <div className="meal-week-grid">
        {weekDays.map((day, dayIndex) => <article className={`meal-day ${day.date === today ? "today" : ""}`} key={day.date}><header><div><strong>{day.label}</strong><span>{shortDate(day.date)}</span></div>{day.date === today && <i>今天</i>}</header><div className="meal-day-slots">
          {WEEK_SLOTS.map((mealSlot) => {
            const plan = mealPlans.find((item) => item.date === day.date && item.mealSlot === mealSlot);
            const theme = plan?.themeId ? themeById.get(plan.themeId) : undefined;
            return <div className={`meal-slot ${plan ? "filled" : "empty"} ${theme?.accent || ""}`} key={mealSlot} onDragOver={(event) => { if (draggedPlanId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { event.preventDefault(); const planId = event.dataTransfer.getData("application/x-map-meal") || draggedPlanId; if (planId) movePlan(planId, day.date, mealSlot); setDraggedPlanId(null); }}>
              <span className="meal-slot-label">{mealSlot}</span>
              {plan ? <div draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-map-meal", plan.id); setDraggedPlanId(plan.id); }} onDragEnd={() => setDraggedPlanId(null)} className={plan.completed ? "done" : ""}><button className="meal-check" onClick={() => togglePlan(plan.id)} aria-label={plan.completed ? "标记未完成" : "标记已吃"}>{plan.completed ? "✓" : ""}</button><button className="meal-slot-main" onClick={() => theme ? setThemeDetailId(theme.id) : setPicker({ date: day.date, mealSlot })}><strong>{planTitle(plan, theme)}</strong><small>{theme ? `${theme.source} · ${theme.proteinHint}` : "自定义安排"}</small></button><div className="meal-slot-actions"><button onClick={() => setPicker({ date: day.date, mealSlot })}>换</button><button onClick={() => removePlan(plan.id)} aria-label={`删除${planTitle(plan, theme)}`}>×</button></div></div> : <button className="meal-empty-slot" onClick={() => setPicker({ date: day.date, mealSlot })}><span>＋</span> 选择主题</button>}
            </div>;
          })}
        </div><footer><span>0{dayIndex + 1}</span><button onClick={() => setPicker({ date: day.date, mealSlot: "加餐" })}>＋ 加餐</button>{mealPlans.filter((plan) => plan.date === day.date && plan.mealSlot === "加餐").map((plan) => <div className="meal-snack-chip" key={plan.id}><button onClick={() => plan.themeId ? setThemeDetailId(plan.themeId) : setPicker({ date: day.date, mealSlot: "加餐" })}>{planTitle(plan, plan.themeId ? themeById.get(plan.themeId) : undefined)}</button><button onClick={() => removePlan(plan.id)} aria-label={`删除${planTitle(plan, plan.themeId ? themeById.get(plan.themeId) : undefined)}`}>×</button></div>)}</footer></article>)}
      </div>
    </section>}

    {tab === "themes" && <section className="meal-library-section">
      <header className="meal-section-header"><div><p className="section-kicker">MEAL THEMES</p><h3>不用想菜名，从场景开始选</h3><p>“训练日”“想吃热的”“今天不想做饭”比固定周一吃什么更符合真实生活。</p></div><button className="primary-button" onClick={() => setThemeEditor("new")}>＋ 新建主题</button></header>
      <div className="meal-library-tools"><input value={themeQuery} onChange={(event) => setThemeQuery(event.target.value)} placeholder="搜索主题、来源或标签…" /><div>{(["全部", ...ALL_SLOTS] as const).map((slot) => <button className={themeSlot === slot ? "active" : ""} onClick={() => setThemeSlot(slot)} key={slot}>{slot}</button>)}</div></div>
      <div className="meal-theme-list">{filteredThemes.map((theme, index) => {
        const recipe = theme.recipeId ? recipeById.get(theme.recipeId) : undefined;
        return <article className={`meal-theme-row ${theme.accent} ${theme.active ? "" : "inactive"}`} key={theme.id}><div className="meal-theme-index">{String(index + 1).padStart(2, "0")}</div><button className="meal-theme-content" onClick={() => setThemeDetailId(theme.id)}><header><div><span>{theme.source}</span><h3>{theme.title}</h3></div><strong>{recipeDuration(recipe)}</strong></header><p>{theme.subtitle}</p><div className="meal-theme-tags">{theme.mealSlots.map((slot) => <i key={slot}>{slot}</i>)}{theme.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></button><div className="meal-theme-side"><small>蛋白质</small><strong>{theme.proteinHint}</strong><button onClick={() => setThemeEditor(theme)}>编辑</button></div></article>;
      })}</div>
    </section>}

    {tab === "shopping" && <section className="meal-shopping-section">
      <header className="meal-section-header"><div><p className="section-kicker">SUNDAY RESET</p><h3>{weekLabel(weekStart)} · 一次买齐，先处理最麻烦的</h3><p>清单只来自你这周真正选中的主题；替换菜单后会自动重算。</p></div><div className="meal-week-actions"><button onClick={() => setWeekStart(dateAt(weekStart, -7))}>←</button><button onClick={() => setWeekStart(mondayOf(today))}>本周</button><button onClick={() => setWeekStart(dateAt(weekStart, 7))}>→</button><button className="meal-fill-button" onClick={() => void copyShoppingList()}>{copied ? "已复制 ✓" : "复制清单"}</button></div></header>
      {shoppingGroups.length ? <div className="meal-shopping-layout"><div className="meal-grocery-groups">{shoppingGroups.map((group) => <section key={group.category}><header><strong>{group.category}</strong><span>{group.items.length}</span></header>{group.items.map((item) => { const checked = shoppingChecked.has(item.name); return <button className={checked ? "checked" : ""} key={item.name} onClick={() => setShoppingChecked((current) => { const next = new Set(current); if (checked) next.delete(item.name); else next.add(item.name); return next; })}><i>{checked ? "✓" : ""}</i><div><strong>{item.name}</strong><small>{item.uses.join("；")}</small></div></button>; })}</section>)}</div><aside className="meal-prep-board"><p className="section-kicker">PREP AHEAD</p><h3>周日先做这些</h3>{prepItems.length ? <ol>{prepItems.map((item, index) => <li key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.item}</strong><small>用于 {item.title}</small></div></li>)}</ol> : <p>本周主题没有必须提前准备的步骤。</p>}<div className="meal-nations-note"><strong>NATIONS RULE</strong><p>去 Food Court 时只记：一个蛋白质＋一个主食＋两种蔬菜。</p></div></aside></div> : <div className="meal-empty-shopping"><span>篮</span><h3>这周还没有采购清单</h3><p>先在“本周餐盘”安排几顿，MAP 会把对应菜谱里的材料自动合并。</p><button className="primary-button" onClick={() => setTab("week")}>开始安排本周</button></div>}
    </section>}

    {tab === "guides" && <NutritionGuides />}

    {picker && <MealPickerModal target={picker} themes={mealThemes.filter((theme) => theme.active && theme.mealSlots.includes(picker.mealSlot) && (!picker.source || theme.source === picker.source))} onClose={() => setPicker(null)} onPick={(themeId) => savePlan(picker, themeId)} onCustom={(title) => savePlan(picker, null, title)} />}
    {themeDetail && <MealDetailModal theme={themeDetail} recipe={detailRecipe} onClose={() => setThemeDetailId(null)} onEditTheme={() => { setThemeDetailId(null); setThemeEditor(themeDetail); }} onEditRecipe={() => { setThemeDetailId(null); setPendingRecipeThemeId(detailRecipe ? null : themeDetail.id); setRecipeEditor(detailRecipe || "new"); }} onSchedule={() => { savePlan({ date: today, mealSlot: themeDetail.mealSlots[0] }, themeDetail.id); setThemeDetailId(null); }} />}
    {themeEditor && <ThemeEditorModal value={themeEditor} recipes={mealRecipes} onClose={() => setThemeEditor(null)} onSave={saveTheme} onDelete={themeEditor === "new" ? undefined : () => deleteTheme(themeEditor)} />}
    {recipeEditor && <RecipeEditorModal value={recipeEditor} onClose={() => { setRecipeEditor(null); setPendingRecipeThemeId(null); }} onSave={saveRecipe} onDelete={recipeEditor === "new" ? undefined : () => deleteRecipe(recipeEditor.id)} />}
  </div>;
}

function MealModal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop meal-modal-backdrop"><section className="modal meal-modal"><header className="modal-head"><div><p className="section-kicker">{subtitle}</p><h2>{title}</h2></div><button className="modal-close" onClick={onClose} aria-label="关闭">×</button></header>{children}</section></div>;
}

function MealPickerModal({ target, themes, onClose, onPick, onCustom }: { target: PickerTarget; themes: MealTheme[]; onClose: () => void; onPick: (themeId: string) => void; onCustom: (title: string) => void }) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const visible = themes.filter((theme) => !query.trim() || `${theme.title} ${theme.subtitle} ${theme.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <MealModal title={`${shortDate(target.date)} · ${target.mealSlot}`} subtitle="PICK BY MOOD" onClose={onClose}><div className="meal-picker-intro"><strong>今天想吃什么感觉？</strong><p>选主题只是在这一天引用它，之后修改菜谱也不会把你的历史安排搞乱。</p><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索：热的、不做饭、训练日…" /></div><div className="meal-picker-list">{visible.map((theme) => <button className={theme.accent} key={theme.id} onClick={() => onPick(theme.id)}><span>{theme.source}</span><strong>{theme.title}</strong><p>{theme.subtitle}</p><small>{theme.proteinHint}</small></button>)}</div><div className="meal-custom-plan"><div><strong>这次不在主题库里</strong><small>只记录今天，不会创建新主题</small></div><input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="例如：和朋友出去吃" /><button disabled={!custom.trim()} onClick={() => onCustom(custom.trim())}>加入</button></div></MealModal>;
}

function MealDetailModal({ theme, recipe, onClose, onEditTheme, onEditRecipe, onSchedule }: { theme: MealTheme; recipe?: MealRecipe; onClose: () => void; onEditTheme: () => void; onEditRecipe: () => void; onSchedule: () => void }) {
  return <MealModal title={theme.title} subtitle={`${theme.source} · ${theme.mealSlots.join(" / ")}`} onClose={onClose}><div className={`meal-detail-hero ${theme.accent}`}><div><span>组合</span><strong>{theme.subtitle}</strong></div><div><span>蛋白质提示</span><strong>{theme.proteinHint}</strong></div><div><span>需要时间</span><strong>{recipeDuration(recipe)}</strong></div></div>{recipe ? <div className="meal-recipe-layout"><section><header><p className="section-kicker">INGREDIENTS</p><h3>需要什么</h3><span>{recipe.servings} 份</span></header><ul>{recipe.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}><i>{String(index + 1).padStart(2, "0")}</i><div><strong>{ingredient.name}{ingredient.optional ? "（可选）" : ""}</strong><small>{ingredient.amount} · {ingredient.category}</small></div></li>)}</ul></section><section><header><p className="section-kicker">METHOD</p><h3>怎么做</h3></header><ol>{recipe.steps.map((step, index) => <li key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>{recipe.prepAhead.length > 0 && <div className="meal-prep-tip"><strong>周日可提前</strong>{recipe.prepAhead.map((item) => <p key={item}>→ {item}</p>)}</div>}</section></div> : <div className="meal-no-recipe"><strong>这个主题还没有菜谱</strong><p>可以继续当作外食或自由组合使用，也可以补一份材料和步骤。</p></div>}<p className="meal-detail-note">{theme.notes}{recipe?.notes ? ` ${recipe.notes}` : ""}</p><div className="modal-actions"><button className="ghost-button" onClick={onEditTheme}>编辑主题</button><button className="ghost-button" onClick={onEditRecipe}>{recipe ? "编辑菜谱" : "添加菜谱"}</button><button className="primary-button" onClick={onSchedule}>安排到今天</button></div></MealModal>;
}

function ThemeEditorModal({ value, recipes, onClose, onSave, onDelete }: { value: MealTheme | "new"; recipes: MealRecipe[]; onClose: () => void; onSave: (theme: MealTheme) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState<MealTheme>(value === "new" ? { id: id("meal-theme"), title: "", subtitle: "", mealSlots: ["早餐"], source: "在家", tags: [], proteinHint: "", recipeId: null, prepNote: "", notes: "", accent: "lime", active: true } : value);
  const [tags, setTags] = useState(draft.tags.join("、"));
  const update = <K extends keyof MealTheme>(key: K, next: MealTheme[K]) => setDraft((current) => ({ ...current, [key]: next }));
  return <MealModal title={value === "new" ? "新建饮食主题" : draft.title} subtitle="MEAL THEME" onClose={onClose}><div className="form-grid meal-form"><label className="wide"><span>主题名称</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="例如 不想做饭日" /></label><label className="wide"><span>一句话组合</span><input value={draft.subtitle} onChange={(event) => update("subtitle", event.target.value)} placeholder="吃什么，一眼看懂" /></label><label><span>来源</span><select value={draft.source} onChange={(event) => update("source", event.target.value as MealSource)}>{SOURCES.map((source) => <option key={source}>{source}</option>)}</select></label><label><span>颜色</span><select value={draft.accent} onChange={(event) => update("accent", event.target.value as MealAccent)}>{ACCENTS.map((accent) => <option key={accent}>{accent}</option>)}</select></label><label className="wide meal-slot-picker"><span>适用餐次</span><div>{ALL_SLOTS.map((slot) => <button type="button" className={draft.mealSlots.includes(slot) ? "selected" : ""} onClick={() => update("mealSlots", draft.mealSlots.includes(slot) ? draft.mealSlots.filter((item) => item !== slot) : [...draft.mealSlots, slot])} key={slot}>{slot}</button>)}</div></label><label className="wide"><span>标签（用顿号或逗号分开）</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="训练日、免开火、周末" /></label><label className="wide"><span>蛋白质提示</span><input value={draft.proteinHint} onChange={(event) => update("proteinHint", event.target.value)} placeholder="例如 约 25–35g" /></label><label className="wide"><span>关联菜谱</span><select value={draft.recipeId || ""} onChange={(event) => update("recipeId", event.target.value || null)}><option value="">不关联菜谱</option>{recipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.title}</option>)}</select></label><label className="wide"><span>提前准备</span><textarea value={draft.prepNote} onChange={(event) => update("prepNote", event.target.value)} /></label><label className="wide"><span>注意事项</span><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label><label className="wide meal-active-toggle"><input type="checkbox" checked={draft.active} onChange={(event) => update("active", event.target.checked)} /> 在选餐时显示这个主题</label></div><div className="modal-actions">{onDelete && <button className="danger-button" onClick={onDelete}>删除主题</button>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.title.trim() || !draft.mealSlots.length} onClick={() => onSave({ ...draft, tags: tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) })}>保存主题</button></div></MealModal>;
}

function parseIngredients(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const [name, amount = "适量", rawCategory = "调味与其他"] = line.split("|").map((part) => part.trim());
    const category = CATEGORIES.includes(rawCategory as IngredientCategory) ? rawCategory as IngredientCategory : "调味与其他";
    return name ? [{ name, amount, category }] : [];
  });
}

function RecipeEditorModal({ value, onClose, onSave, onDelete }: { value: MealRecipe | "new"; onClose: () => void; onSave: (recipe: MealRecipe) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState<MealRecipe>(value === "new" ? { id: id("meal-recipe"), title: "", servings: 1, prepMinutes: 5, cookMinutes: 10, ingredients: [], steps: [], prepAhead: [], notes: "" } : value);
  const [ingredients, setIngredients] = useState(draft.ingredients.map((item) => `${item.name} | ${item.amount} | ${item.category}`).join("\n"));
  const [steps, setSteps] = useState(draft.steps.join("\n"));
  const [prepAhead, setPrepAhead] = useState(draft.prepAhead.join("\n"));
  const update = <K extends keyof MealRecipe>(key: K, next: MealRecipe[K]) => setDraft((current) => ({ ...current, [key]: next }));
  return <MealModal title={value === "new" ? "新建菜谱" : draft.title} subtitle="RECIPE" onClose={onClose}><div className="form-grid meal-form"><label className="wide"><span>菜谱名称</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label><span>份数</span><input type="number" min="1" value={draft.servings} onChange={(event) => update("servings", Math.max(1, Number(event.target.value)))} /></label><label><span>准备分钟</span><input type="number" min="0" value={draft.prepMinutes} onChange={(event) => update("prepMinutes", Math.max(0, Number(event.target.value)))} /></label><label><span>烹饪分钟</span><input type="number" min="0" value={draft.cookMinutes} onChange={(event) => update("cookMinutes", Math.max(0, Number(event.target.value)))} /></label><label className="wide"><span>材料 · 每行：名称 | 数量 | 分类</span><textarea className="meal-recipe-editor" value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder="鸡蛋 | 2 个 | 蛋白质" /></label><label className="wide"><span>步骤 · 每行一步</span><textarea className="meal-recipe-editor" value={steps} onChange={(event) => setSteps(event.target.value)} /></label><label className="wide"><span>提前准备 · 每行一项</span><textarea value={prepAhead} onChange={(event) => setPrepAhead(event.target.value)} /></label><label className="wide"><span>补充说明</span><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label></div><div className="modal-actions">{onDelete && <button className="danger-button" onClick={onDelete}>删除菜谱</button>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.title.trim()} onClick={() => onSave({ ...draft, ingredients: parseIngredients(ingredients), steps: steps.split("\n").map((item) => item.trim()).filter(Boolean), prepAhead: prepAhead.split("\n").map((item) => item.trim()).filter(Boolean) })}>保存菜谱</button></div></MealModal>;
}

function NutritionGuides() {
  const rules = ["每天至少 2–3 次明确蛋白质", "午餐和晚餐各有 1–2 拳蔬菜", "每天 2 份完整水果", "每顿约 1 拳主食，训练日可以稍多", "每周鱼 1–2 次、豆腐或豆类 2–3 次", "咖啡放上午，中杯、少糖", "甜点是配角，不替代正餐", "不用追踪所有卡路里和微量营养素"];
  return <section className="nutrition-guide-section"><div className="nutrition-manifesto"><p className="section-kicker">THE ONE-SENTENCE RULE</p><h3>每顿先看结构，<br />不用把吃饭变成数学考试。</h3><blockquote>每天三顿尽量都有蛋白质；午餐和晚餐吃足蔬菜；每天两份完整水果；正常吃米饭、面条和土豆；咖啡减糖。</blockquote><p>当前目标是长期健康、精力和适量肌肉，不是健美式增肌，也不是减脂餐。</p></div><div className="nutrition-targets"><div><span>蛋白质</span><strong>85–110g</strong><small>每天</small></div><div><span>蔬菜</span><strong>1–2 拳</strong><small>午餐和晚餐</small></div><div><span>水果</span><strong>2 份</strong><small>完整水果</small></div><div><span>碳水</span><strong>约 1 拳</strong><small>每顿</small></div><div><span>纤维</span><strong>逐步增加</strong><small>不要突然硬拉满</small></div><div><span>水分</span><strong>看口渴和尿色</strong><small>训练前后补</small></div></div><div className="nutrition-rules-layout"><section><header><p className="section-kicker">DAILY CHECK</p><h3>只检查这八条</h3></header><ol>{rules.map((rule, index) => <li key={rule}><span>{String(index + 1).padStart(2, "0")}</span><p>{rule}</p></li>)}</ol></section><aside><div className="coffee-rule"><p className="section-kicker">COFFEE</p><h3>统一规则</h3><ul><li>Medium，不必升级 Large</li><li>half sweet / less cane sugar</li><li>用 milk 替代较多 cream</li><li>能接受时选 unsweetened iced coffee＋一点牛奶</li><li>尽量只放上午，不在下午续杯</li></ul></div><div className="training-food-rule"><p className="section-kicker">AROUND TRAINING</p><h3>训练前后</h3><p><strong>前：</strong>两小时内吃过正餐就不用加；隔了 3–4 小时可吃香蕉＋酸奶。</p><p><strong>后：</strong>几小时内正常吃蛋白质＋碳水即可，不必追逐“30 分钟窗口”。</p></div></aside></div><footer className="nutrition-sources"><span>用于复习，不替代医生或注册营养师的个体建议。</span><a href="https://www.canada.ca/en/health-canada/services/food-guide/eating-support/cooking/make-healthy-meals-plate.html" target="_blank" rel="noreferrer">Canada’s Food Guide Plate ↗</a><a href="https://www.canada.ca/en/health-canada/services/food-guide/explore/healthy-eating-recommendations/eat-variety/eat-whole-grains.html" target="_blank" rel="noreferrer">Whole grains ↗</a></footer></section>;
}
