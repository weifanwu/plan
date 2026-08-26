export type PurchaseStatus = "next" | "planned" | "considering" | "bought";
export type PurchaseCategory = "食品" | "厨房" | "生活" | "设备" | "其他";

export type PurchaseItem = {
  id: string;
  title: string;
  quantity: string;
  details: string;
  category: PurchaseCategory;
  status: PurchaseStatus;
  source: string;
  createdAt: string;
  completedAt: string | null;
};
