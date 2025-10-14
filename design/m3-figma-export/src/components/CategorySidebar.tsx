import { Flame, UtensilsCrossed, Pizza, Baby, Package, Wine, Dessert } from 'lucide-react';

interface CategorySidebarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const categories = [
  { id: 'kampagne', label: 'Kampagne', icon: Flame },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'pizza', label: 'Pizza', icon: Pizza },
  { id: 'born', label: 'Børn', icon: Baby },
  { id: 'sideordres', label: 'Side ordres', icon: Package },
  { id: 'drikkevarer', label: 'Drikkevarer', icon: Wine },
  { id: 'dessert', label: 'Dessert', icon: Dessert },
];

export function CategorySidebar({ activeCategory, onCategoryChange }: CategorySidebarProps) {
  return (
    <nav className="py-8 flex flex-col h-full">
      <div className="flex-1">
        {categories.map((category) => {
          const Icon = category.icon;
          const isActive = activeCategory === category.id;
          
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={`w-full flex items-center gap-4 px-8 py-5 text-[#2D2D2D] transition-all relative hover:bg-[#F2E8DA] ${
                isActive ? 'bg-[#F2E8DA]' : ''
              }`}
              style={{ fontWeight: isActive ? 700 : 400 }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E94F26]" />
              )}
              
              <Icon className="h-6 w-6" strokeWidth={2} />
              <span className="text-[18px]">{category.label}</span>
            </button>
          );
        })}
      </div>

      {/* Allergen Information Link */}
      <div className="border-t border-[#F2E8DA] mt-4">
        <button className="w-full flex items-center gap-4 px-8 py-5 text-[#2D2D2D] transition-all hover:bg-[#F2E8DA]">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span className="text-[14px]" style={{ fontWeight: 400 }}>
            Se information om allergener
          </span>
        </button>
      </div>
    </nav>
  );
}
