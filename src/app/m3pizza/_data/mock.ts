export type M3MenuItem = {
  id: string;
  name: string;
  description?: string;
  priceDkk: number;
};

export type M3Menu = {
  brandSlug: string;
  locationSlug: string;
  items: M3MenuItem[];
};

export const mockMenu: M3Menu = {
  brandSlug: "m3pizza",
  locationSlug: "m3-pizza-hellerup",
  items: [
    { id: "1", name: "Margherita (V)", description: "Tomat, mozzarella, oregano", priceDkk: 89 },
    { id: "2", name: "Hawaii", description: "Tomat, mozzarella, skinke, ananas", priceDkk: 99 },
    { id: "3", name: "Pepperoni", description: "Tomat, mozzarella, pepperoni", priceDkk: 99 }
  ],
};
