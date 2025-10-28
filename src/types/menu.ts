
export type Product = {
  id: string;
  productName?: string;
  name?: string;
  title?: string;
};

export type Category = {
  id: string;  // must be string (used as key)
  name: string;
};

export type MenuData = {
  categories: Category[];
  productsByCategory: Record<string, Product[]>;
};
