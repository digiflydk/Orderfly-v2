
"use client";

import * as React from "react";

export type ClientOrderSummary = {
  id: string;
  total: number;
  createdAt?: string;
  // extend as needed
};

type Brand = { id: string; name: string };
type Location = { id: string; name: string; brandId: string };

export function OrdersClientPage(props: {
  initialOrders?: ClientOrderSummary[];
  brands?: Brand[];
  locations?: Location[];
  initialFilters?: unknown;
  data?: ClientOrderSummary[];
}) {
  // keep existing UI if present; placeholder to unblock build
  return null;
}

export default OrdersClientPage;
