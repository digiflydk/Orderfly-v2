
import { ApiMapConfig } from '@/lib/docs/api-map-types';
import { brandWebsiteApiMap } from '@/lib/docs/api-maps/brand-website-api-map';

// Placeholder for other modules
const ordersApiMap: ApiMapConfig = { module: 'orders', label: 'Orders', cms: { areas: [] }, public: { areas: [] } };
const menusApiMap: ApiMapConfig = { module: 'menus', label: 'Menus', cms: { areas: [] }, public: { areas: [] } };

export const apiMapsByModule: Record<string, ApiMapConfig> = {
  orders: ordersApiMap,
  menus: menusApiMap,
  'brand-website': brandWebsiteApiMap,
};
