import type { TerminalOrder } from './terminal-types';

export type MobileKdsStage = 'received' | 'progress' | 'ready';
export type MobileReadyLane = 'waiting' | 'delivery';

/** "I levering" needs a real courier pickup signal, not merely Delivery + Ready. */
export function mobileReadyLane(order: Pick<TerminalOrder, 'status' | 'deliveryType' | 'managedDeliveryTracking'>): MobileReadyLane {
  return order.status === 'Ready' && order.deliveryType === 'Delivery' &&
    order.managedDeliveryTracking?.deliveryStatus === 'picked_up' ? 'delivery' : 'waiting';
}

export function mobileKdsCounts(orders: TerminalOrder[]) {
  return {
    received: orders.filter(order => order.status === 'Received').length,
    progress: orders.filter(order => order.status === 'In Progress').length,
    ready: orders.filter(order => order.status === 'Ready').length,
    waiting: orders.filter(order => order.status === 'Ready' && mobileReadyLane(order) === 'waiting').length,
    delivery: orders.filter(order => order.status === 'Ready' && mobileReadyLane(order) === 'delivery').length,
  };
}

/** The mobile view is a presentation of the same authorized kitchen snapshot. */
export function mobileKdsOrders(orders: TerminalOrder[], stage: MobileKdsStage, lane: MobileReadyLane) {
  const selected = orders.filter(order => stage === 'received' ? order.status === 'Received'
    : stage === 'progress' ? order.status === 'In Progress'
    : order.status === 'Ready' && mobileReadyLane(order) === lane);
  return selected.sort((a, b) =>
    (a.fulfillmentAt || a.createdAt || '').localeCompare(b.fulfillmentAt || b.createdAt || '') ||
    a.id.localeCompare(b.id));
}
