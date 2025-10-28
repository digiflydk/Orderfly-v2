"use client";

export type ClientOrderSummary = {
  id: string;
  total: number;
  createdAt?: string;
  // extend as needed
};

// Named export expected by /superadmin/sales/orders/page.tsx
export function OrdersClientPage(props: { data?: ClientOrderSummary[] }) {
  // keep existing UI if present; placeholder to unblock build
  return null;
}

// Also keep default export so other imports don’t break
export default OrdersClientPage;
