import { Gift, Pizza, Salad, CupSoda, Tag, Package, Utensils, Beef, Sandwich, IceCream, Coffee, Fish, Cake, Wine, Soup, type LucideProps } from 'lucide-react';
const icons = {Gift, Pizza, Salad, CupSoda, Tag, Package, Utensils, Beef, Sandwich, IceCream, Coffee, Fish, Cake, Wine, Soup};
export function CategoryIcon({name, ...props}: LucideProps & {name: string}) {
  const Icon = icons[name as keyof typeof icons] || Utensils;
  return <Icon {...props} />;
}
