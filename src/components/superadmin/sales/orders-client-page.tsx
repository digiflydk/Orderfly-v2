
"use client";

import * as React from "react";

export type ClientOrderSummary = {
  id: string;
  total: number;
  createdAt?: string;
  // extend as needed
};

export function OrdersClientPage(props: { data?: ClientOrderSummary[] }) {
  // keep existing UI if present; placeholder to unblock build
  return null;
}

export default OrdersClientPage;
