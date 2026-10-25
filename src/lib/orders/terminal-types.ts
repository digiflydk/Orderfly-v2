import type { OrderStatus } from '@/types';

/** JSON-only snapshot shared by the terminal and its scoped read endpoint. */
export type TerminalOrderItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: string[];
};
export type TerminalOrder = {
  id: string;
  brandId: string;
  locationId: string;
  brandName: string;
  locationName: string;
  customerName: string;
  customerContact: string;
  customerPhone: string;
  deliveryAddress: string;
  notes: string;
  createdAt: string | null;
  fulfillmentAt: string | null;
  deliveryTime: string;
  deliveryType: 'Pickup' | 'Delivery';
  status: OrderStatus;
  paymentStatus: 'Paid' | 'Pending' | 'Failed';
  paymentMethod: string;
  totalAmount: number;
  refundedAmountOre: number;
  items: TerminalOrderItem[];
  paymentCollection?: { receivedAt: string; employeeId: string; employeeName: string; method: 'cash' | 'card' };
};
export type TerminalLocation = { brandId: string; brandName: string; locationId: string; locationName: string };
export type TerminalView = 'board' | 'history' | 'preorders';
export type TerminalQuery = {
  brandId?: string;
  locationId?: string;
  view?: TerminalView;
  cursor?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};
export type TerminalReadResult = {
  orders: TerminalOrder[];
  locations: TerminalLocation[];
  selectedBrandId: string | null;
  selectedLocationId: string | null;
  canEdit: boolean;
  serverTime: string;
  nextCursor: string | null;
  hasMore: boolean;
};
