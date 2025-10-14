import { useState, useEffect, useRef } from 'react';
import { CategorySidebar } from './CategorySidebar';
import { ProductCard } from './ProductCard';
import { PizzaCustomizationModal } from './PizzaCustomizationModal';
import { CustomizationView } from './CustomizationView';
import { ShoppingBag, Truck } from 'lucide-react';

interface MenuPageProps {
  deliveryMethod: 'takeaway' | 'delivery';
  onBack: () => void;
}

// Mock extra ingredients data
const extraIngredientsData = [
  { id: 'extra-cheese', name: 'Ekstra cheddarost', price: 9 },
  { id: 'extra-bacon', name: 'Ekstra Bacon', price: 9 },
  { id: 'extra-beef', name: 'Ekstra bøf fra irsk Hereford kødkvæg', price: 32 },
  { id: 'extra-pepperoni', name: 'Ekstra Pepperoni', price: 9 },
  { id: 'extra-mushroom', name: 'Ekstra Champignon', price: 7 },
  { id: 'extra-olives', name: 'Ekstra Oliven', price: 7 },
];

const friesData = [
  { id: 'mexican-deluxe', name: 'Mexican Deluxe Fries', price: 0 },
  { id: 'extra-mexican-deluxe', name: 'Ekstra Mexican Deluxe Fries', price: 20 },
  { id: 'regular-fries', name: 'Pommes frites', price: 0 },
  { id: 'extra-fries', name: 'Ekstra pommes frites', price: 18 },
];

const drinksData = [
  { id: 'coca-cola', name: 'Coca-Cola 0,5L', price: 0 },
  { id: 'coca-cola-zero', name: 'Coca-Cola Zero 0,5L', price: 0 },
  { id: 'sprite', name: 'Sprite 0,5L', price: 0 },
  { id: 'fanta', name: 'Fanta 0,5L', price: 0 },
];

const dipsData = [
  { id: 'garlic-dip', name: 'Hvidløgsdip', price: 0 },
  { id: 'bearnaise', name: 'Bearnaisesauce', price: 10 },
  { id: 'truffle-mayo', name: 'Trøffel mayo', price: 15 },
  { id: 'ketchup', name: 'Ketchup', price: 0 },
];

const upsellsData = [
  { id: 'extra-pizza', name: 'Ekstra pizza', price: 89 },
  { id: 'chicken-wings', name: 'Chicken Wings', price: 59 },
  { id: 'mozzarella-sticks', name: 'Mozzarella Sticks', price: 49 },
];

// Mock product data
const products = {
  kampagne: [
    {
      id: 'k1',
      name: 'Truffle & Parmesan',
      description: 'Cremet trøffelmayo, parmesan, mozzarella og frisk rucola på håndlavet bund',
      price: 89,
      imageUrl: 'https://images.unsplash.com/photo-1745145506817-3b76b8788699?w=800',
      badge: 'NYHED' as const,
    },
    {
      id: 'k2',
      name: 'Vinter Special',
      description: 'Sæsonens specialpizza med hjemmelavet pesto, soltørrede tomater og fetaost',
      price: 69,
      originalPrice: 95,
      imageUrl: 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800',
      badge: 'RABAT' as const,
    },
    {
      id: 'k3',
      name: 'Mega Deal',
      description: '2 store pizzaer + 1.5L sodavand - perfekt til familien',
      price: 149,
      originalPrice: 199,
      imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800',
      badge: 'RABAT' as const,
    },
  ],
  menu: [
    {
      id: 'm1',
      name: 'Familie Menu',
      description: '3 store pizzaer + 2L sodavand + hvidløgsbrød',
      price: 249,
      imageUrl: 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800',
      badge: 'RABAT' as const,
    },
  ],
  pizza: [
    {
      id: 'p1',
      name: 'Margherita',
      description: 'Klassisk italiensk med tomatsauce, mozzarella og frisk basilikum',
      price: 75,
      imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800',
    },
    {
      id: 'p2',
      name: 'Pepperoni',
      description: 'Dobbelt pepperoni, mozzarella og signatur tomatsauce',
      price: 79,
      imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800',
    },
    {
      id: 'p3',
      name: 'Vegetariana',
      description: 'Grillede grøntsager, oliven, champignon og mozzarella',
      price: 82,
      imageUrl: 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800',
    },
    {
      id: 'p4',
      name: 'Quattro Formaggi',
      description: 'Fire slags ost: mozzarella, gorgonzola, parmesan og ricotta',
      price: 89,
      imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
    },
    {
      id: 'p5',
      name: 'Diavola',
      description: 'Spicy salami, jalapeños, chili og mozzarella',
      price: 85,
      imageUrl: 'https://images.unsplash.com/photo-1595854341625-f33ee10dbf94?w=800',
    },
    {
      id: 'p6',
      name: 'Prosciutto',
      description: 'Parmaskinke, rucola, parmesan og balsamico',
      price: 92,
      imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
    },
  ],
  born: [
    {
      id: 'b1',
      name: 'Børne Pizza',
      description: 'Lille pizza med ost og tomatsauce',
      price: 45,
      imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
    },
    {
      id: 'b2',
      name: 'Børne Menu',
      description: 'Mini pizza, pommes frites og juice',
      price: 59,
      imageUrl: 'https://images.unsplash.com/photo-1571997478779-2adcbbe9ab2f?w=800',
    },
  ],
  sideordres: [
    {
      id: 's1',
      name: 'Hvidløgsbrød',
      description: 'Friskbagt brød med hvidløgssmør og persille',
      price: 35,
      imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800',
    },
    {
      id: 's2',
      name: 'Pommes Frites',
      description: 'Sprøde pommes frites serveret med ketchup',
      price: 30,
      imageUrl: 'https://images.unsplash.com/photo-1630384082527-89f26d5b6a2e?w=800',
    },
    {
      id: 's3',
      name: 'Mozzarella Sticks',
      description: '6 stk. panerede mozzarella sticks med dip',
      price: 45,
      imageUrl: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?w=800',
    },
  ],
  drikkevarer: [
    {
      id: 'd1',
      name: 'Coca-Cola 1.5L',
      description: 'Klassisk Coca-Cola i 1.5 liters flaske',
      price: 25,
      imageUrl: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800',
    },
    {
      id: 'd2',
      name: 'Faxe Kondi 1.5L',
      description: 'Dansk klassiker med citrussmag',
      price: 25,
      imageUrl: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=800',
    },
  ],
  dessert: [
    {
      id: 'de1',
      name: 'Tiramisu',
      description: 'Hjemmelavet italiensk dessert med mascarpone',
      price: 49,
      imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800',
    },
    {
      id: 'de2',
      name: 'Brownie',
      description: 'Varm chokoladebrownie med vaniljeis',
      price: 45,
      imageUrl: 'https://images.unsplash.com/photo-1607920591413-4ec007e70023?w=800',
    },
  ],
};

interface CartItem {
  id: string;
  quantity: number;
  extras?: Array<{ id: string; quantity: number; name: string; price: number }>;
  removedIngredients?: string[];
  fries?: { id: string; name: string; price: number };
  drink?: { id: string; name: string; price: number };
  dip?: { id: string; name: string; price: number };
  upsells?: Array<{ id: string; name: string; price: number }>;
  isMenu?: boolean;
}

export function MenuPage({ deliveryMethod, onBack }: MenuPageProps) {
  const [activeCategory, setActiveCategory] = useState('kampagne');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [pizzaModalOpen, setPizzaModalOpen] = useState(false);
  const [selectedPizza, setSelectedPizza] = useState<any>(null);
  const [customizationMode, setCustomizationMode] = useState(false);
  const [isSinglePizzaMode, setIsSinglePizzaMode] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [currentIngredientPage, setCurrentIngredientPage] = useState(0);
  const [selectedFries, setSelectedFries] = useState('mexican-deluxe');
  const [selectedDrink, setSelectedDrink] = useState('coca-cola');
  const [selectedDip, setSelectedDip] = useState('garlic-dip');
  const [selectedUpsells, setSelectedUpsells] = useState<string[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<{ [key: string]: number }>({});
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const customizationScrollRef = useRef<HTMLDivElement>(null);

  const handleAddToCart = (productId: string) => {
    // Find product to get price
    const allProducts = Object.values(products).flat();
    const product = allProducts.find(p => p.id === productId);
    
    if (product) {
      // Check if it's a pizza or kids pizza - show customization modal
      if (productId.startsWith('p') || productId.startsWith('b')) {
        setSelectedPizza(product);
        setPizzaModalOpen(true);
        return;
      }

      // For non-pizza items, add directly to cart (not a menu)
      const existingItemIndex = cartItems.findIndex(item => 
        item.id === productId && !item.isMenu
      );
      
      if (existingItemIndex >= 0) {
        // Increase quantity
        const updatedCart = [...cartItems];
        updatedCart[existingItemIndex].quantity += 1;
        setCartItems(updatedCart);
      } else {
        // Add new item
        setCartItems([...cartItems, { id: productId, quantity: 1, isMenu: false }]);
      }
      
      setCartTotal(cartTotal + product.price);
      console.log('Added to cart:', product.name);
    }
  };

  const handlePizzaCustomizationComplete = (type: 'menu' | 'single', extras: string[], removed: string[]) => {
    console.log('handlePizzaCustomizationComplete called with type:', type);
    if (!selectedPizza) {
      console.log('No selected pizza!');
      return;
    }

    if (type === 'menu') {
      console.log('Setting customization mode to true');
      // Show customization in center section
      setPizzaModalOpen(false);
      setCustomizationMode(true);
      setCurrentStep(1);
      setSelectedExtras([]);
      setRemovedIngredients([]);
      setCurrentIngredientPage(0);
      setSelectedFries('mexican-deluxe');
      setSelectedDrink('coca-cola');
      setSelectedDip('garlic-dip');
      setSelectedUpsells([]);
      setExtraQuantities({});
      
      // Scroll to top of customization view
      setTimeout(() => {
        if (customizationScrollRef.current) {
          customizationScrollRef.current.scrollTop = 0;
        }
      }, 0);
    } else {
      console.log('Opening single pizza customization');
      // Single pizza - show customization with 2 steps (extras/remove + upsells)
      setPizzaModalOpen(false);
      setCustomizationMode(true);
      setIsSinglePizzaMode(true);
      setCurrentStep(1);
      setSelectedExtras([]);
      setRemovedIngredients([]);
      setCurrentIngredientPage(0);
      setSelectedUpsells([]);
      setExtraQuantities({});
      
      // Scroll to top of customization view
      setTimeout(() => {
        if (customizationScrollRef.current) {
          customizationScrollRef.current.scrollTop = 0;
        }
      }, 0);
    }
  };

  const handleBackFromCustomization = () => {
    setCustomizationMode(false);
    setIsSinglePizzaMode(false);
    setSelectedPizza(null);
    setSelectedExtras([]);
    setRemovedIngredients([]);
    setCurrentStep(1);
    setCurrentIngredientPage(0);
    setSelectedFries('mexican-deluxe');
    setSelectedDrink('coca-cola');
    setSelectedDip('garlic-dip');
    setSelectedUpsells([]);
    setExtraQuantities({});
  };

  const handleCompleteSinglePizzaCustomization = () => {
    if (!selectedPizza) return;

    // Build extras array with quantities
    const extras = selectedExtras.map(extraId => {
      const extraData = extraIngredientsData.find(e => e.id === extraId);
      const quantity = extraQuantities[extraId] || 1;
      return extraData ? {
        id: extraId,
        quantity,
        name: extraData.name,
        price: extraData.price
      } : null;
    }).filter(Boolean) as Array<{ id: string; quantity: number; name: string; price: number }>;

    // Calculate extras price
    const extrasPrice = extras.reduce((sum, extra) => sum + (extra.price * extra.quantity), 0);

    // Get selected upsells
    const upsells = selectedUpsells.map(upsellId => {
      const upsellData = upsellsData.find(u => u.id === upsellId);
      return upsellData ? { id: upsellId, name: upsellData.name, price: upsellData.price } : null;
    }).filter(Boolean) as Array<{ id: string; name: string; price: number }>;

    // Calculate upsells price
    const upsellsPrice = upsells.reduce((sum, upsell) => sum + upsell.price, 0);

    // Calculate total price
    const totalPrice = selectedPizza.price + extrasPrice + upsellsPrice;

    // Create cart item
    const cartItem: CartItem = {
      id: selectedPizza.id,
      quantity: 1,
      isMenu: false,
      extras: extras.length > 0 ? extras : undefined,
      removedIngredients: removedIngredients.length > 0 ? removedIngredients : undefined,
      upsells: upsells.length > 0 ? upsells : undefined
    };

    // Always add as new item (customized items are unique)
    setCartItems([...cartItems, cartItem]);
    setCartTotal(cartTotal + totalPrice);
    handleBackFromCustomization();
  };

  const handleUpgradeToMenu = (index: number) => {
    const cartItem = cartItems[index];
    if (!cartItem) return;

    const allProducts = Object.values(products).flat();
    const product = allProducts.find(p => p.id === cartItem.id);
    
    if (product) {
      // Remove the single pizza from cart
      handleRemoveFromCart(index);
      
      // Open customization for menu
      setSelectedPizza(product);
      setPizzaModalOpen(false);
      setCustomizationMode(true);
      setIsSinglePizzaMode(false);
      setCurrentStep(1);
      setSelectedExtras([]);
      setRemovedIngredients([]);
      setCurrentIngredientPage(0);
      setSelectedFries('mexican-deluxe');
      setSelectedDrink('coca-cola');
      setSelectedDip('garlic-dip');
      setSelectedUpsells([]);
      setExtraQuantities({});
      
      // Scroll to top
      setTimeout(() => {
        if (customizationScrollRef.current) {
          customizationScrollRef.current.scrollTop = 0;
        }
      }, 0);
    }
  };

  const handleCompleteCustomization = () => {
    if (!selectedPizza) return;

    // Calculate total price
    const basePrice = selectedPizza.price;
    
    // Build extras array with quantities
    const extras = selectedExtras.map(extraId => {
      const extraData = extraIngredientsData.find(e => e.id === extraId);
      const quantity = extraQuantities[extraId] || 1;
      return extraData ? {
        id: extraId,
        quantity,
        name: extraData.name,
        price: extraData.price
      } : null;
    }).filter(Boolean) as Array<{ id: string; quantity: number; name: string; price: number }>;

    // Calculate extras price
    const extrasPrice = extras.reduce((sum, extra) => sum + (extra.price * extra.quantity), 0);

    // Get selected fries, drink, dip
    const fries = friesData.find(f => f.id === selectedFries);
    const drink = drinksData.find(d => d.id === selectedDrink);
    const dip = dipsData.find(d => d.id === selectedDip);

    // Get selected upsells
    const upsells = selectedUpsells.map(upsellId => {
      const upsellData = upsellsData.find(u => u.id === upsellId);
      return upsellData ? { id: upsellId, name: upsellData.name, price: upsellData.price } : null;
    }).filter(Boolean) as Array<{ id: string; name: string; price: number }>;

    // Calculate upsells price
    const upsellsPrice = upsells.reduce((sum, upsell) => sum + upsell.price, 0);

    // Calculate total menu price
    const totalPrice = basePrice + extrasPrice + (fries?.price || 0) + (drink?.price || 0) + (dip?.price || 0) + upsellsPrice;

    // Create cart item with all customizations
    const cartItem: CartItem = {
      id: selectedPizza.id,
      quantity: 1,
      isMenu: true,
      extras,
      removedIngredients,
      fries,
      drink,
      dip,
      upsells
    };

    const existingItemIndex = cartItems.findIndex(item => item.id === selectedPizza.id);
    
    // Always add as new item for now (customized items are unique)
    setCartItems([...cartItems, cartItem]);
    setCartTotal(cartTotal + totalPrice);
    handleBackFromCustomization();
  };

  const handleIncreaseQuantity = (index: number) => {
    const cartItem = cartItems[index];
    if (!cartItem) return;
    
    const allProducts = Object.values(products).flat();
    const product = allProducts.find(p => p.id === cartItem.id);
    
    if (product) {
      const updatedCart = [...cartItems];
      updatedCart[index] = { ...cartItem, quantity: cartItem.quantity + 1 };
      setCartItems(updatedCart);
      
      // Calculate price to add
      let priceToAdd = product.price;
      if (cartItem.isMenu) {
        if (cartItem.extras) {
          priceToAdd += cartItem.extras.reduce((sum, extra) => sum + (extra.price * extra.quantity), 0);
        }
        if (cartItem.fries) priceToAdd += cartItem.fries.price;
        if (cartItem.drink) priceToAdd += cartItem.drink.price;
        if (cartItem.dip) priceToAdd += cartItem.dip.price;
        if (cartItem.upsells) {
          priceToAdd += cartItem.upsells.reduce((sum, upsell) => sum + upsell.price, 0);
        }
      }
      
      setCartTotal(cartTotal + priceToAdd);
    }
  };

  const handleDecreaseQuantity = (index: number) => {
    const cartItem = cartItems[index];
    if (!cartItem) return;

    const allProducts = Object.values(products).flat();
    const product = allProducts.find(p => p.id === cartItem.id);
    
    if (product) {
      if (cartItem.quantity > 1) {
        const updatedCart = cartItems.map((item, i) =>
          i === index ? { ...item, quantity: item.quantity - 1 } : item
        );
        setCartItems(updatedCart);
        
        // Calculate price to subtract
        let priceToSubtract = product.price;
        if (cartItem.isMenu) {
          if (cartItem.extras) {
            priceToSubtract += cartItem.extras.reduce((sum, extra) => sum + (extra.price * extra.quantity), 0);
          }
          if (cartItem.fries) priceToSubtract += cartItem.fries.price;
          if (cartItem.drink) priceToSubtract += cartItem.drink.price;
          if (cartItem.dip) priceToSubtract += cartItem.dip.price;
          if (cartItem.upsells) {
            priceToSubtract += cartItem.upsells.reduce((sum, upsell) => sum + upsell.price, 0);
          }
        }
        
        setCartTotal(cartTotal - priceToSubtract);
      } else {
        // Remove item if quantity becomes 0
        handleRemoveFromCart(index);
      }
    }
  };

  const handleRemoveFromCart = (index: number) => {
    const item = cartItems[index];
    if (!item) return;

    const allProducts = Object.values(products).flat();
    const product = allProducts.find(p => p.id === item.id);
    
    if (product) {
      let itemPrice = product.price * item.quantity;
      
      // Add customization prices if it's a menu
      if (item.isMenu) {
        if (item.extras) {
          itemPrice += item.extras.reduce((sum, extra) => sum + (extra.price * extra.quantity), 0);
        }
        if (item.fries) itemPrice += item.fries.price;
        if (item.drink) itemPrice += item.drink.price;
        if (item.dip) itemPrice += item.dip.price;
        if (item.upsells) {
          itemPrice += item.upsells.reduce((sum, upsell) => sum + upsell.price, 0);
        }
      }
      
      const updatedCart = cartItems.filter((_, i) => i !== index);
      setCartItems(updatedCart);
      setCartTotal(cartTotal - itemPrice);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    const element = categoryRefs.current[categoryId];
    if (element) {
      const headerHeight = 100; // Approximate header height
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - headerHeight - 20;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  // Scroll sync - update active category based on scroll position
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const categoryId = entry.target.getAttribute('data-category');
            if (categoryId) {
              setActiveCategory(categoryId);
            }
          }
        });
      },
      {
        rootMargin: '-100px 0px -60% 0px',
        threshold: 0
      }
    );

    // Observe all category sections
    Object.keys(categoryRefs.current).forEach((key) => {
      const element = categoryRefs.current[key];
      if (element && observerRef.current) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const categoryNames: { [key: string]: string } = {
    kampagne: 'Kampagne',
    menu: 'Menu',
    pizza: 'Pizza',
    born: 'Børn',
    sideordres: 'Side ordres',
    drikkevarer: 'Drikkevarer',
    dessert: 'Dessert'
  };

  return (
    <>
      <PizzaCustomizationModal
        open={pizzaModalOpen}
        onOpenChange={setPizzaModalOpen}
        pizza={selectedPizza}
        onComplete={handlePizzaCustomizationComplete}
      />

      <div className="min-h-screen bg-[#FFF8F0] flex flex-col">
        {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FFF8F0] border-b border-[#F2E8DA]">
        <div className="px-8 py-5">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="text-[#E94F26] text-[32px] uppercase tracking-tight" style={{ fontWeight: 700 }}>
              M3 Pizza
            </div>

            {/* Delivery Method Pills */}
            <div className="flex items-center gap-3">
              {/* Afhentning */}
              <div 
                className={`flex items-center gap-2 px-5 py-3 rounded-lg border transition-all ${
                  deliveryMethod === 'takeaway' 
                    ? 'bg-white border-[#2D2D2D]' 
                    : 'bg-[#FFF8F0] border-[#E5E5E5]'
                }`}
              >
                <ShoppingBag className="h-4 w-4 text-[#2D2D2D]" />
                <span className="text-[#2D2D2D] text-[14px]" style={{ fontWeight: deliveryMethod === 'takeaway' ? 700 : 400 }}>
                  Afhentning
                </span>
              </div>

              {/* Levering */}
              <div 
                className={`flex items-center gap-2 px-5 py-3 rounded-lg border transition-all ${
                  deliveryMethod === 'delivery' 
                    ? 'bg-white border-[#2D2D2D]' 
                    : 'bg-[#FFF8F0] border-[#E5E5E5]'
                }`}
              >
                <Truck className="h-4 w-4 text-[#2D2D2D]" />
                <span className="text-[#2D2D2D] text-[14px]" style={{ fontWeight: deliveryMethod === 'delivery' ? 700 : 400 }}>
                  Levering
                </span>
              </div>

              {/* Time */}
              <div className="flex items-center gap-2 px-5 py-3 rounded-lg bg-white border border-[#E5E5E5]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span className="text-[#2D2D2D] text-[14px]" style={{ fontWeight: 400 }}>
                  15-17 min
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Full Width */}
      <main className="flex-1 flex relative">
        {/* Left Sidebar - Categories (Full Height, Sticky) */}
        <aside className="w-[280px] bg-[#FFF8F0] flex-shrink-0 border-r border-[#F2E8DA] sticky top-[85px] h-[calc(100vh-85px)] overflow-y-auto">
          <CategorySidebar
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryClick}
          />
        </aside>

        {/* Middle Content - All Products with Category Headers OR Customization */}
        <div className="flex-1 flex flex-col relative">
          {console.log('customizationMode:', customizationMode, 'selectedPizza:', selectedPizza)}
          {customizationMode && selectedPizza ? (
            <CustomizationView
              ref={customizationScrollRef}
              pizza={selectedPizza}
              selectedExtras={selectedExtras}
              setSelectedExtras={setSelectedExtras}
              removedIngredients={removedIngredients}
              setRemovedIngredients={setRemovedIngredients}
              currentStep={currentStep}
              setCurrentStep={setCurrentStep}
              currentIngredientPage={currentIngredientPage}
              setCurrentIngredientPage={setCurrentIngredientPage}
              selectedFries={selectedFries}
              setSelectedFries={setSelectedFries}
              selectedDrink={selectedDrink}
              setSelectedDrink={setSelectedDrink}
              selectedDip={selectedDip}
              setSelectedDip={setSelectedDip}
              selectedUpsells={selectedUpsells}
              setSelectedUpsells={setSelectedUpsells}
              extraQuantities={extraQuantities}
              setExtraQuantities={setExtraQuantities}
              onBack={handleBackFromCustomization}
              onComplete={isSinglePizzaMode ? handleCompleteSinglePizzaCustomization : handleCompleteCustomization}
              isSinglePizza={isSinglePizzaMode}
            />
          ) : (
            <div className="p-8 flex-1 overflow-y-auto">
              {Object.keys(products).map((categoryKey) => {
                const categoryProducts = products[categoryKey as keyof typeof products];
                
                return (
                  <div
                    key={categoryKey}
                    ref={(el) => (categoryRefs.current[categoryKey] = el)}
                    data-category={categoryKey}
                    className="mb-16"
                  >
                    {/* Category Header */}
                    <div className="mb-6">
                      <h2 className="text-[#1E1E1E] text-[22px] uppercase mb-2" style={{ fontWeight: 700 }}>
                        {categoryNames[categoryKey]}
                      </h2>
                      <div className="w-[40px] h-[3px] bg-[#F26422]" />
                    </div>

                    {/* Products Grid */}
                    <div className="grid grid-cols-3 gap-6">
                      {categoryProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          {...product}
                          onAddToCart={handleAddToCart}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar - Order Summary (Full Height, Sticky) */}
        <aside className="w-[380px] bg-white border-l border-[#F2E8DA] flex-shrink-0 sticky top-[85px] h-[calc(100vh-85px)]">
          <div className="h-full flex flex-col p-8">
            <div className="mb-8">
              <h3 className="text-[#2D2D2D] text-[24px] uppercase" style={{ fontWeight: 700 }}>
                Din Bestilling
              </h3>
            </div>

            {/* Cart Items - Scrollable */}
            <div className="flex-1 overflow-y-auto mb-6">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  {/* Icon - Empty Shopping Bag */}
                  <div className="mb-6">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="text-[#2D2D2D]/20">
                      {/* Shopping Bag */}
                      <path d="M20 30 L15 65 C15 67 16 70 20 70 L60 70 C64 70 65 67 65 65 L60 30 Z" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
                      {/* Handles */}
                      <path d="M28 30 L28 22 C28 16 32 12 40 12 C48 12 52 16 52 22 L52 30" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                      {/* Bag opening line */}
                      <line x1="20" y1="30" x2="60" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  
                  {/* Title */}
                  <h4 className="text-[#2D2D2D] text-[18px] uppercase mb-2" style={{ fontWeight: 700 }}>
                    Din Bestilling
                  </h4>
                  
                  {/* Description */}
                  <p className="text-[#2D2D2D]/50 text-[14px] text-center max-w-[200px]">
                    Start din bestilling ved at vælge varer
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cartItems.map((cartItem, index) => {
                    const allProducts = Object.values(products).flat();
                    const item = allProducts.find(p => p.id === cartItem.id);
                    return item ? (
                      <div key={index} className="py-4 border-b border-[#F2E8DA]">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="text-[#2D2D2D] text-[15px] mb-1" style={{ fontWeight: 700 }}>
                              {item.name}{cartItem.isMenu ? ' Menu' : ''}
                            </div>
                            
                            {/* Show customization details for BOTH menu and single pizzas */}
                            {(cartItem.extras || cartItem.removedIngredients || cartItem.fries || cartItem.drink || cartItem.dip || cartItem.upsells) && (
                              <div className="text-[#2D2D2D]/60 text-[12px] mt-2 space-y-1">
                                {/* Extras with prices */}
                                {cartItem.extras && cartItem.extras.length > 0 && (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>Ekstra: </span>
                                    {cartItem.extras.map((extra, i) => (
                                      <span key={i}>
                                        {extra.name} {extra.price > 0 && `${extra.price} kr.`}{extra.quantity > 1 && ` (${extra.quantity}x)`}{i < cartItem.extras!.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {/* Removed ingredients */}
                                {cartItem.removedIngredients && cartItem.removedIngredients.length > 0 && (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>Uden: </span>
                                    {cartItem.removedIngredients.join(', ')}
                                  </div>
                                )}
                                {/* Fries with price if extra */}
                                {cartItem.fries && (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>Pommes: </span>
                                    {cartItem.fries.name}{cartItem.fries.price > 0 && ` ${cartItem.fries.price} kr.`}
                                  </div>
                                )}
                                {/* Drink with price if extra */}
                                {cartItem.drink && (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>Drikkevare: </span>
                                    {cartItem.drink.name}{cartItem.drink.price > 0 && ` ${cartItem.drink.price} kr.`}
                                  </div>
                                )}
                                {/* Dip with price if extra */}
                                {cartItem.dip && (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>Dip: </span>
                                    {cartItem.dip.name}{cartItem.dip.price > 0 && ` ${cartItem.dip.price} kr.`}
                                  </div>
                                )}
                                {/* Upsells with prices */}
                                {cartItem.upsells && cartItem.upsells.length > 0 && (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>Ekstra: </span>
                                    {cartItem.upsells.map((upsell, i) => (
                                      <span key={i}>
                                        {upsell.name} {upsell.price} kr.{i < cartItem.upsells!.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Price on the right side */}
                          <div className="text-[#E94F26] text-[16px] ml-4" style={{ fontWeight: 700 }}>
                            {(() => {
                              const allProducts = Object.values(products).flat();
                              const product = allProducts.find(p => p.id === cartItem.id);
                              if (!product) return '0,00';
                              
                              let itemPrice = product.price;
                              
                              // Add menu price if it's a menu
                              if (cartItem.isMenu) {
                                itemPrice += 30; // Menu upgrade cost
                              }
                              
                              // Add extras price
                              if (cartItem.extras) {
                                itemPrice += cartItem.extras.reduce((sum, extra) => sum + (extra.price * extra.quantity), 0);
                              }
                              
                              // Add fries extra cost
                              if (cartItem.fries && cartItem.fries.price > 0) {
                                itemPrice += cartItem.fries.price;
                              }
                              
                              // Add drink extra cost
                              if (cartItem.drink && cartItem.drink.price > 0) {
                                itemPrice += cartItem.drink.price;
                              }
                              
                              // Add dip extra cost
                              if (cartItem.dip && cartItem.dip.price > 0) {
                                itemPrice += cartItem.dip.price;
                              }
                              
                              // Add upsells
                              if (cartItem.upsells) {
                                itemPrice += cartItem.upsells.reduce((sum, upsell) => sum + upsell.price, 0);
                              }
                              
                              return `${itemPrice.toFixed(2).replace('.', ',')}`;
                            })()}
                          </div>
                        </div>
                        
                        {/* Fjern and Rediger links */}
                        <div className="flex items-center gap-4 mb-3">
                          <button
                            onClick={() => handleRemoveFromCart(index)}
                            className="text-[#2D2D2D]/60 hover:text-[#E94F26] text-[13px] transition-colors underline"
                            style={{ fontWeight: 400 }}
                          >
                            Fjern
                          </button>
                          <button
                            className="text-[#2D2D2D]/60 hover:text-[#E94F26] text-[13px] transition-colors underline"
                            style={{ fontWeight: 400 }}
                          >
                            Rediger
                          </button>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          {/* Quantity Controls */}
                          <div className="flex items-center gap-3 bg-[#FFF8F0] rounded-lg px-3 py-2">
                            <button
                              onClick={() => handleDecreaseQuantity(index)}
                              className="text-[#2D2D2D] hover:text-[#E94F26] transition-colors"
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="4" y1="8" x2="12" y2="8"/>
                              </svg>
                            </button>
                            <span className="text-[#2D2D2D] text-[14px] min-w-[24px] text-center" style={{ fontWeight: 700 }}>
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() => handleIncreaseQuantity(index)}
                              className="text-[#2D2D2D] hover:text-[#E94F26] transition-colors"
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="8" y1="4" x2="8" y2="12"/>
                                <line x1="4" y1="8" x2="12" y2="8"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        
                        {/* Upgrade to Menu button - UNDER quantity controls */}
                        {!cartItem.isMenu && item.id.startsWith('p') && (
                          <button
                            onClick={() => handleUpgradeToMenu(index)}
                            className="w-full bg-[#FF7A29] hover:bg-[#E94F26] text-white px-4 py-2.5 rounded-lg text-[13px] transition-colors mt-3"
                            style={{ fontWeight: 700 }}
                          >
                            Opgrader til menu +30,00
                          </button>
                        )}
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Bottom Section - Fixed */}
            <div className="border-t border-[#F2E8DA] pt-6">

              {/* Total & Checkout */}
              <button 
                disabled={cartItems.length === 0}
                className={`w-full rounded-lg h-[56px] px-5 flex items-center justify-between transition-colors ${
                  cartItems.length === 0
                    ? 'bg-[#E5E5E5] text-[#2D2D2D]/30 cursor-not-allowed'
                    : 'bg-[#E94F26] hover:bg-[#d6451f] text-white cursor-pointer'
                }`}
              >
                <span className="text-[20px] uppercase" style={{ fontWeight: 700 }}>
                  Bestil
                </span>
                <span className="text-[28px]" style={{ fontWeight: 700 }}>
                  {cartTotal} kr
                </span>
              </button>
            </div>
          </div>
        </aside>
      </main>
      </div>
    </>
  );
}
