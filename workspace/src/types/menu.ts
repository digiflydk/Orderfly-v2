
export type Product = {
  id: string;
  productName: string;
  // ...existing fields
};

export type Category = {
  id: string;
  name: string;
  // ...existing fields
};

export type MenuData = {
  categories: Category[];
  productsByCategory: Record<string, Product[]>;
  fallbackUsed?: boolean;
};
