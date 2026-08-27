"use client";

/* eslint-disable jsx-a11y/no-autofocus -- the explicit quick-add editor opens on direct user action */

import { useMemo, useState } from "react";
import { buildMealProcurement } from "../../lib/meal-procurement";
import type { MealPlanEntry, MealRecipe, MealTheme } from "../../lib/meal-types";
import type { PurchaseCategory, PurchaseItem, PurchaseStatus } from "../../lib/shopping-types";
import SafeDeleteButton from "./SafeDeleteButton";

type Props = {
  today: string;
  items: PurchaseItem[];
  mealThemes: MealTheme[];
  mealPlans: MealPlanEntry[];
  mealRecipes: MealRecipe[];
  onChange: (items: PurchaseItem[]) => void;
  onDelete: (item: PurchaseItem) => void;
};

type ImportDraft = { id: string; selected: boolean; title: string; quantity: string; category: PurchaseCategory };

const SECTIONS: Array<{ status: PurchaseStatus; title: string; eyebrow: string; description: string }> = [
  { status: "next", title: "下次出门就买", eyebrow: "NEXT TRIP", description: "已经决定，需要在下一次去超市或商店时买。" },
  { status: "planned", title: "计划购买", eyebrow: "PLANNED", description: "确定需要，但不急着在下一次出门完成。" },
  { status: "considering", title: "考虑中", eyebrow: "MAYBE", description: "可买可不买，先记录，比较后再决定。" },
];
const CATEGORIES: PurchaseCategory[] = ["食品", "厨房", "生活", "设备", "其他"];

function uid(prefix = "purchase") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function dateAt(dateString: string, offset: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function shortDate(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export default function ShoppingModule({ today, items, mealThemes, mealPlans, mealRecipes, onChange, onDelete }: Props) {
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStatus, setQuickStatus] = useState<PurchaseStatus>("next");
  const [editor, setEditor] = useState<PurchaseItem | "new" | null>(null);
  const [importDraft, setImportDraft] = useState<ImportDraft[] | null>(null);
  const weekStart = mondayOf(today);
  const weekEnd = dateAt(weekStart, 6);
  const bought = items.filter((item) => item.status === "bought").sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  const groceryPreview = useMemo(() => {
    const procurement = buildMealProcurement(mealPlans, mealThemes, mealRecipes, weekStart, weekEnd);
    const existing = new Set(items.filter((item) => item.status !== "bought").map((item) => item.title.trim().toLowerCase()));
    return procurement.groceries.filter((item) => !existing.has(item.name.trim().toLowerCase())).map((item) => ({
      id: uid("import"),
      selected: true,
      title: item.name,
      quantity: item.uses.join("；"),
      category: "食品",
    } satisfies ImportDraft));
  }, [items, mealPlans, mealRecipes, mealThemes, weekEnd, weekStart]);

  function addQuick() {
    const title = quickTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
    onChange([{ id: uid(), title, quantity: "", details: "", category: "其他", status: quickStatus, source: "手动记录", createdAt: now, completedAt: null }, ...items]);
    setQuickTitle("");
  }

  function saveItem(item: PurchaseItem) {
    onChange(editor === "new" ? [item, ...items] : items.map((current) => current.id === item.id ? item : current));
    setEditor(null);
  }

  function toggleBought(item: PurchaseItem) {
    const done = item.status !== "bought";
    onChange(items.map((current) => current.id === item.id ? { ...current, status: done ? "bought" : "planned", completedAt: done ? new Date().toISOString() : null } : current));
  }

  function confirmImport() {
    if (!importDraft) return;
    const now = new Date().toISOString();
    const additions = importDraft.filter((item) => item.selected && item.title.trim()).map((item) => ({
      id: uid(),
      title: item.title.trim(),
      quantity: item.quantity.trim(),
      details: `来自 ${shortDate(weekStart)}—${shortDate(weekEnd)} 饮食计划`,
      category: item.category,
      status: "next" as const,
      source: "饮食计划",
      createdAt: now,
      completedAt: null,
    }));
    onChange([...additions, ...items]);
    setImportDraft(null);
  }

  return <div className="shopping-module">
    <section className="shopping-hero">
      <div><p className="section-kicker">PURCHASE MEMORY</p><h2>要买的东西，<br />不要再散落在 backlog。</h2><p>已经决定的放进下次采购；不着急的进入计划；可买可不买的留在考虑中。</p></div>
      <div className="shopping-hero-count"><strong>{items.filter((item) => item.status !== "bought").length}</strong><span>件待处理</span></div>
    </section>

    <section className="shopping-capture panel">
      <div><p className="section-kicker">QUICK ADD</p><h3>想到就记，不先填表。</h3></div>
      <div className="shopping-capture-controls"><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addQuick(); }} placeholder="例如：厨房滤水器" aria-label="快速添加要买的东西" /><select value={quickStatus} onChange={(event) => setQuickStatus(event.target.value as PurchaseStatus)} aria-label="加入购物清单分区"><option value="next">下次出门</option><option value="planned">计划购买</option><option value="considering">考虑中</option></select><button onClick={addQuick} disabled={!quickTitle.trim()}>加入</button></div>
      <button className="shopping-import-action" onClick={() => setImportDraft(groceryPreview)}><span>食</span><div><strong>从本周饮食计划导入</strong><small>{groceryPreview.length ? `${groceryPreview.length} 项新食材 · 先预览再加入` : "没有新的食材需要导入"}</small></div><i>→</i></button>
    </section>

    <section className="shopping-board">
      {SECTIONS.map((section) => {
        const sectionItems = items.filter((item) => item.status === section.status);
        return <article className={`shopping-column ${section.status}`} key={section.status}><header><div><p className="section-kicker">{section.eyebrow}</p><h3>{section.title}</h3><span>{section.description}</span></div><strong>{sectionItems.length}</strong></header><div className="shopping-list">{sectionItems.map((item) => <div className="shopping-row" key={item.id}><button className="shopping-check" onClick={() => toggleBought(item)} aria-label={`标记已买：${item.title}`}>✓</button><button className="shopping-row-main" onClick={() => setEditor(item)}><strong>{item.title}</strong>{item.quantity && <span>{item.quantity}</span>}<small>{item.category}{item.details ? ` · ${item.details}` : ""}</small></button><SafeDeleteButton className="shopping-row-delete" confirmLabel="确认" onConfirm={() => onDelete(item)} aria-label={`删除：${item.title}`}>×</SafeDeleteButton></div>)}<button className="shopping-empty-add" onClick={() => { setQuickStatus(section.status); setEditor("new"); }}>＋ 添加到这里</button></div></article>;
      })}
    </section>

    <section className="shopping-bought panel"><header><div><p className="section-kicker">RECENTLY BOUGHT</p><h3>最近买过</h3></div><span>{bought.length}</span></header>{bought.length ? <div>{bought.slice(0, 12).map((item) => <button key={item.id} onClick={() => toggleBought(item)}><span>✓</span><strong>{item.title}</strong><small>点一下放回计划购买</small></button>)}</div> : <p>买完的东西会暂时留在这里，方便确认。</p>}</section>

    {editor && <PurchaseEditor value={editor} defaultStatus={quickStatus} onClose={() => setEditor(null)} onSave={saveItem} onDelete={editor === "new" ? undefined : () => { onDelete(editor); setEditor(null); }} />}
    {importDraft && <ImportPreview items={importDraft} week={`${shortDate(weekStart)}—${shortDate(weekEnd)}`} onChange={setImportDraft} onClose={() => setImportDraft(null)} onConfirm={confirmImport} />}
  </div>;
}

function PurchaseEditor({ value, defaultStatus, onClose, onSave, onDelete }: { value: PurchaseItem | "new"; defaultStatus: PurchaseStatus; onClose: () => void; onSave: (item: PurchaseItem) => void; onDelete?: () => void }) {
  const now = new Date().toISOString();
  const [draft, setDraft] = useState<PurchaseItem>(value === "new" ? { id: uid(), title: "", quantity: "", details: "", category: "其他", status: defaultStatus, source: "手动记录", createdAt: now, completedAt: null } : value);
  const update = <K extends keyof PurchaseItem>(key: K, next: PurchaseItem[K]) => setDraft((current) => ({ ...current, [key]: next }));
  return <div className="modal-backdrop"><section className="modal purchase-modal"><header className="modal-head"><div><p className="section-kicker">PURCHASE ITEM</p><h2>{value === "new" ? "添加购买事项" : "编辑购买事项"}</h2></div><button className="modal-close" onClick={onClose}>×</button></header><div className="form-grid"><label className="wide"><span>要买什么</span><input autoFocus value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label><span>数量 / 规格</span><input value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} placeholder="例如 1 个" /></label><label><span>分类</span><select value={draft.category} onChange={(event) => update("category", event.target.value as PurchaseCategory)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="wide"><span>放到哪里</span><select value={draft.status} onChange={(event) => update("status", event.target.value as PurchaseStatus)}><option value="next">下次出门就买</option><option value="planned">计划购买</option><option value="considering">考虑中</option><option value="bought">已买</option></select></label><label className="wide"><span>备注</span><textarea value={draft.details} onChange={(event) => update("details", event.target.value)} /></label></div><div className="modal-actions">{onDelete && <SafeDeleteButton className="danger-button" onConfirm={onDelete}>删除</SafeDeleteButton>}<button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!draft.title.trim()} onClick={() => onSave(draft)}>保存</button></div></section></div>;
}

function ImportPreview({ items, week, onChange, onClose, onConfirm }: { items: ImportDraft[]; week: string; onChange: (items: ImportDraft[]) => void; onClose: () => void; onConfirm: () => void }) {
  const selected = items.filter((item) => item.selected).length;
  const update = (id: string, patch: Partial<ImportDraft>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  return <div className="modal-backdrop"><section className="modal shopping-import-modal"><header className="modal-head"><div><p className="section-kicker">IMPORT PREVIEW · {week}</p><h2>确认要加入的食材</h2></div><button className="modal-close" onClick={onClose}>×</button></header><p className="shopping-import-note">只导入需要提前买回家的食材；Tim Hortons、Nations Food Court 等到店现买项目不会进购物清单。标题和数量都可以先改。</p>{items.length ? <div className="shopping-import-list">{items.map((item) => <div className={item.selected ? "selected" : ""} key={item.id}><input type="checkbox" checked={item.selected} onChange={(event) => update(item.id, { selected: event.target.checked })} aria-label={`导入 ${item.title}`} /><input value={item.title} onChange={(event) => update(item.id, { title: event.target.value })} aria-label="商品名称" /><input value={item.quantity} onChange={(event) => update(item.id, { quantity: event.target.value })} aria-label="数量或用途" /><select value={item.category} onChange={(event) => update(item.id, { category: event.target.value as PurchaseCategory })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>)}</div> : <div className="shopping-import-empty">本周没有新的居家食材需要导入；现成购买不会出现在这里。</div>}<div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!selected} onClick={onConfirm}>导入 {selected} 项</button></div></section></div>;
}
