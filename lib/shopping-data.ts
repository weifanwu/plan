import type { PurchaseItem } from "./shopping-types";

export const defaultPurchaseItems: PurchaseItem[] = [
  {
    id: "purchase-water-filter",
    title: "饮用水过滤器",
    quantity: "1 个",
    details: "先确认水龙头或滤水壶规格，再决定型号。",
    category: "厨房",
    status: "next",
    source: "手动记录",
    createdAt: "2026-08-25T12:00:00.000Z",
    completedAt: null,
  },
];
