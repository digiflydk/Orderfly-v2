import { useState, forwardRef, useEffect } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProductBadge } from './ProductBadge';

interface ExtraQuantity {
  [key: string]: number;
}

interface CustomizationViewProps {
  pizza: {
    id: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    ingredients?: string[];
  };
  selectedExtras: string[];
  setSelectedExtras: (extras: string[]) => void;
  removedIngredients: string[];
  setRemovedIngredients: (ingredients: string[]) => void;
  currentStep: number;
  setCurrentStep: (step: number) => void;
  currentIngredientPage: number;
  setCurrentIngredientPage: (page: number) => void;
  selectedFries: string;
  setSelectedFries: (fries: string) => void;
  selectedDrink: string;
  setSelectedDrink: (drink: string) => void;
  selectedDip: string;
  setSelectedDip: (dip: string) => void;
  selectedUpsells: string[];
  setSelectedUpsells: (upsells: string[]) => void;
  extraQuantities: ExtraQuantity;
  setExtraQuantities: (quantities: ExtraQuantity) => void;
  onBack: () => void;
  onComplete: () => void;
  isSinglePizza?: boolean;
}

// Mock extra ingredients
const extraIngredients = [
  { id: 'extra-cheese', name: 'Ekstra cheddarost', price: 9, imageUrl: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400' },
  { id: 'extra-bacon', name: 'Ekstra Bacon', price: 9, imageUrl: 'https://images.unsplash.com/photo-1528607929212-2636ec44253e?w=400' },
  { id: 'extra-beef', name: 'Ekstra bøf fra irsk Hereford kødkvæg', price: 32, imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400' },
  { id: 'extra-pepperoni', name: 'Ekstra Pepperoni', price: 9, imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400' },
  { id: 'extra-mushroom', name: 'Ekstra Champignon', price: 7, imageUrl: 'https://images.unsplash.com/photo-1516714819001-8ee7a13b71d7?w=400' },
  { id: 'extra-olives', name: 'Ekstra Oliven', price: 7, imageUrl: 'https://images.unsplash.com/photo-1611250188496-e966be784bf9?w=400' },
];

// Mock fries options
const friesOptions = [
  { 
    id: 'mexican-deluxe', 
    name: 'Mexican Deluxe Fries', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1723763246578-99e614b2a91b?w=400',
    badge: { type: 'included' as const, text: 'INKLUDERET' },
  },
  { 
    id: 'extra-mexican-deluxe', 
    name: 'Ekstra Mexican Deluxe Fries', 
    price: 20, 
    imageUrl: 'https://images.unsplash.com/photo-1723763246578-99e614b2a91b?w=400',
    badge: { type: 'new' as const, text: 'NYHED' },
  },
  { 
    id: 'regular-fries', 
    name: 'Pommes frites', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1734774797087-b6435057a15e?w=400'
  },
  { 
    id: 'extra-fries', 
    name: 'Ekstra pommes frites', 
    price: 18, 
    imageUrl: 'https://images.unsplash.com/photo-1734774797087-b6435057a15e?w=400'
  },
];

// Mock drinks options
const drinksOptions = [
  { 
    id: 'coca-cola', 
    name: 'Coca-Cola 0,5L', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1574706226623-e5cc0da928c6?w=400',
    badge: { type: 'included' as const, text: 'INKLUDERET' },
  },
  { 
    id: 'coca-cola-zero', 
    name: 'Coca-Cola Zero 0,5L', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1574706226623-e5cc0da928c6?w=400',
  },
  { 
    id: 'sprite', 
    name: 'Sprite 0,5L', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1717439062391-1c2932e1c051?w=400'
  },
  { 
    id: 'fanta', 
    name: 'Fanta 0,5L', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1740741705445-3a5dfb5b0ba7?w=400'
  },
];

// Mock dip options
const dipOptions = [
  { 
    id: 'garlic-dip', 
    name: 'Hvidløgsdip', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1597232408482-10264c9153d3?w=400',
    badge: { type: 'included' as const, text: 'INKLUDERET' },
  },
  { 
    id: 'bearnaise', 
    name: 'Bearnaisesauce', 
    price: 10, 
    imageUrl: 'https://images.unsplash.com/photo-1759605233915-76406790a491?w=400',
  },
  { 
    id: 'truffle-mayo', 
    name: 'Trøffel mayo', 
    price: 15, 
    imageUrl: 'https://images.unsplash.com/photo-1759605233915-76406790a491?w=400',
    badge: { type: 'new' as const, text: 'NYHED' },
  },
  { 
    id: 'ketchup', 
    name: 'Ketchup', 
    price: 0, 
    imageUrl: 'https://images.unsplash.com/photo-1656269457984-bd54c519129a?w=400'
  },
];

// Mock upsell options
const upsellOptions = [
  { 
    id: 'extra-pizza', 
    name: 'Ekstra pizza', 
    description: 'Tilføj endnu en Margherita pizza', 
    price: 89, 
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400',
    badge: { type: 'popular' as const, text: 'POPULÆR' },
  },
  { 
    id: 'chicken-wings', 
    name: 'Chicken Wings', 
    description: '8 stk. sprøde wings med BBQ sauce', 
    price: 59, 
    imageUrl: 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=400',
  },
  { 
    id: 'mozzarella-sticks', 
    name: 'Mozzarella Sticks', 
    description: '6 stk. med sweet chili dip', 
    price: 49, 
    imageUrl: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?w=400',
    badge: { type: 'new' as const, text: 'NYHED' },
  },
];

export const CustomizationView = forwardRef<HTMLDivElement, CustomizationViewProps>(({
  pizza,
  selectedExtras,
  setSelectedExtras,
  removedIngredients,
  setRemovedIngredients,
  currentStep,
  setCurrentStep,
  currentIngredientPage,
  setCurrentIngredientPage,
  selectedFries,
  setSelectedFries,
  selectedDrink,
  setSelectedDrink,
  selectedDip,
  setSelectedDip,
  selectedUpsells,
  setSelectedUpsells,
  extraQuantities,
  setExtraQuantities,
  onBack,
  onComplete,
  isSinglePizza = false,
}, ref) => {

  const handleAddExtra = (extraId: string) => {
    const currentQty = extraQuantities[extraId] || 0;
    if (currentQty < 6) {
      setExtraQuantities({ ...extraQuantities, [extraId]: currentQty + 1 });
      if (!selectedExtras.includes(extraId)) {
        setSelectedExtras([...selectedExtras, extraId]);
      }
    }
  };

  const handleRemoveExtra = (extraId: string) => {
    const currentQty = extraQuantities[extraId] || 0;
    if (currentQty > 0) {
      const newQty = currentQty - 1;
      if (newQty === 0) {
        setExtraQuantities({ ...extraQuantities, [extraId]: 0 });
        setSelectedExtras(selectedExtras.filter(id => id !== extraId));
      } else {
        setExtraQuantities({ ...extraQuantities, [extraId]: newQty });
      }
    }
  };

  const handleToggleUpsell = (upsellId: string) => {
    if (selectedUpsells.includes(upsellId)) {
      setSelectedUpsells(selectedUpsells.filter(id => id !== upsellId));
    } else {
      setSelectedUpsells([...selectedUpsells, upsellId]);
    }
  };

  const handleNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBackClick = () => {
    if (currentStep === 1) {
      // First step - go back to menu
      onBack();
    } else {
      // Go to previous step
      setCurrentStep(currentStep - 1);
    }
  };

  const handleToggleIngredient = (ingredient: string) => {
    if (removedIngredients.includes(ingredient)) {
      setRemovedIngredients(removedIngredients.filter(i => i !== ingredient));
    } else {
      setRemovedIngredients([...removedIngredients, ingredient]);
    }
  };

  const ingredients = pizza.ingredients || [
    'Tomatsauce',
    'Mozzarella',
    'Basilikum',
    'Olivenolie',
  ];

  // Paginate ingredients - 6 per page for checkboxes
  const ingredientsPerPage = 6;
  const totalPages = Math.ceil(ingredients.length / ingredientsPerPage);
  const currentIngredients = ingredients.slice(
    currentIngredientPage * ingredientsPerPage,
    (currentIngredientPage + 1) * ingredientsPerPage
  );

  // Single pizza has only 2 steps: extras/remove + upsells
  // Menu has 5 steps: extras/remove + fries + drink + dip + upsells
  const totalSteps = isSinglePizza ? 2 : 5;

  // Scroll to top when step changes
  useEffect(() => {
    if (ref && typeof ref === 'object' && ref.current) {
      ref.current.scrollTop = 0;
    }
  }, [currentStep, ref]);

  const getStepTitle = () => {
    if (isSinglePizza) {
      switch (currentStep) {
        case 1:
          return 'Tilpas din pizza';
        case 2:
          return 'Tilføj ekstra til din bestilling';
        default:
          return '';
      }
    }
    switch (currentStep) {
      case 1: return 'Tilpas din ' + pizza.name + ' menu';
      case 2: return 'Vælg pommes frites';
      case 3: return 'Vælg drikkevare';
      case 4: return 'Vælg dip';
      case 5: return 'Tilføj ekstra?';
      default: return 'Step ' + currentStep;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#FFF8F0]">

      {/* Content - Scrollable */}
      <div ref={ref} className="flex-1 overflow-y-auto p-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h3 className="text-[#2D2D2D]/60 text-[18px] mb-2" style={{ fontWeight: 400 }}>
            {pizza.name}{!isSinglePizza ? ' menu' : ''}
          </h3>
          <h2 className="text-[#FF7A29] text-[32px] uppercase mb-2" style={{ fontWeight: 700 }}>
            {getStepTitle()}
          </h2>
          <p className="text-[#2D2D2D]/60 text-[16px]">
            Step {currentStep} af {totalSteps}
          </p>
        </div>

        {/* Step 1: Extra Ingredients Section */}
        {currentStep === 1 && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-8">
              <div className="grid grid-cols-2 gap-6 mb-8">
                {extraIngredients.slice(0, 2).map((extra) => (
                  <div
                    key={extra.id}
                    className="bg-white rounded-xl overflow-hidden border-2 border-transparent hover:border-[#FF7A29] transition-all shadow-sm"
                  >
                    <div className="aspect-[16/10] relative">
                      <ImageWithFallback
                        src={extra.imageUrl}
                        alt={extra.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-5 flex items-center justify-between">
                      <div>
                        <div className="text-[#2D2D2D] text-[15px] mb-1" style={{ fontWeight: 400 }}>
                          {extra.name}
                        </div>
                        <div className="text-[#2D2D2D] text-[16px]" style={{ fontWeight: 700 }}>
                          +{extra.price},00
                        </div>
                      </div>
                      {extraQuantities[extra.id] > 0 ? (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleRemoveExtra(extra.id)}
                            className="w-11 h-11 rounded-lg bg-[#2D2D2D] text-white flex items-center justify-center transition-all hover:bg-[#3D3D3D]"
                          >
                            <span className="text-[24px]" style={{ fontWeight: 700 }}>−</span>
                          </button>
                          <span className="text-[#2D2D2D] text-[18px] min-w-[20px] text-center" style={{ fontWeight: 700 }}>
                            {extraQuantities[extra.id]}
                          </span>
                          <button
                            onClick={() => handleAddExtra(extra.id)}
                            className="w-11 h-11 rounded-lg bg-[#FF7A29] text-white flex items-center justify-center transition-all hover:bg-[#E94F26]"
                          >
                            <span className="text-[24px]" style={{ fontWeight: 700 }}>+</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddExtra(extra.id)}
                          className="w-12 h-12 rounded-lg bg-[#FF7A29] text-white flex items-center justify-center transition-all hover:bg-[#E94F26]"
                        >
                          <span className="text-[28px]" style={{ fontWeight: 700 }}>+</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* More extras */}
              {extraIngredients.slice(2).map((extra) => (
                <div
                  key={extra.id}
                  className="bg-white rounded-xl p-5 flex items-center justify-between mb-4 border-2 border-transparent hover:border-[#FF7A29] transition-all shadow-sm"
                >
                  <div>
                    <div className="text-[#2D2D2D] text-[15px] mb-1" style={{ fontWeight: 400 }}>
                      {extra.name}
                    </div>
                    <div className="text-[#2D2D2D] text-[16px]" style={{ fontWeight: 700 }}>
                      +{extra.price},00
                    </div>
                  </div>
                  {extraQuantities[extra.id] > 0 ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleRemoveExtra(extra.id)}
                        className="w-11 h-11 rounded-lg bg-[#2D2D2D] text-white flex items-center justify-center transition-all hover:bg-[#3D3D3D]"
                      >
                        <span className="text-[24px]" style={{ fontWeight: 700 }}>−</span>
                      </button>
                      <span className="text-[#2D2D2D] text-[18px] min-w-[20px] text-center" style={{ fontWeight: 700 }}>
                        {extraQuantities[extra.id]}
                      </span>
                      <button
                        onClick={() => handleAddExtra(extra.id)}
                        className="w-11 h-11 rounded-lg bg-[#FF7A29] text-white flex items-center justify-center transition-all hover:bg-[#E94F26]"
                      >
                        <span className="text-[24px]" style={{ fontWeight: 700 }}>+</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddExtra(extra.id)}
                      className="w-12 h-12 rounded-lg bg-[#FF7A29] text-white flex items-center justify-center transition-all hover:bg-[#E94F26]"
                    >
                      <span className="text-[28px]" style={{ fontWeight: 700 }}>+</span>
                    </button>
                  )}
                </div>
              ))}

              {selectedExtras.length > 0 && (
                <div className="text-[#2D2D2D]/60 text-[13px] mt-3">
                  {selectedExtras.length} / 6 ekstra ingredienser valgt
                </div>
              )}
            </div>

            {/* Remove Ingredients Section */}
            <div className="max-w-5xl mx-auto mb-8">
              <div className="bg-[#F2E8DA] px-6 py-3 mb-6 rounded-lg">
                <h4 className="text-[#2D2D2D]/70 text-[13px] uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  Tilpas ingredienser
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {currentIngredients.map((ingredient) => (
                  <button
                    key={ingredient}
                    onClick={() => handleToggleIngredient(ingredient)}
                    className={`bg-white rounded-xl p-5 flex items-center gap-3 transition-all border-2 shadow-sm ${
                      removedIngredients.includes(ingredient)
                        ? 'border-transparent'
                        : 'border-[#FF7A29]'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center transition-all ${
                        removedIngredients.includes(ingredient)
                          ? 'bg-[#E1E1E1]'
                          : 'bg-[#FF7A29]'
                      }`}
                    >
                      {!removedIngredients.includes(ingredient) && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5">
                          <polyline points="2,8 6,12 14,4" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[#2D2D2D] text-[15px] uppercase" style={{ fontWeight: 400 }}>
                      {ingredient}
                    </span>
                  </button>
                ))}
              </div>

              {/* Pagination dots */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  {Array.from({ length: totalPages }).map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentIngredientPage(index)}
                      className={`w-3 h-3 rounded-full transition-all ${
                        currentIngredientPage === index ? 'bg-[#FF7A29]' : 'bg-[#E1E1E1]'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Pommes Frites Selection (Menu only) OR Upsells (Single pizza) */}
        {currentStep === 2 && !isSinglePizza && (
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-3 gap-6">
              {friesOptions.map((fries) => (
                <div key={fries.id} className="relative">
                  <button
                    onClick={() => setSelectedFries(fries.id)}
                    className={`w-full bg-white rounded-xl overflow-hidden border-3 transition-all shadow-sm ${
                      selectedFries === fries.id
                        ? 'border-[#FF7A29] ring-4 ring-[#FF7A29]/20'
                        : 'border-transparent hover:border-[#FF7A29]'
                    }`}
                  >
                    {/* Badge */}
                    {fries.badge && (
                      <div className="absolute top-4 left-4 z-10">
                        <ProductBadge type={fries.badge.type} text={fries.badge.text} />
                      </div>
                    )}

                    {/* Image */}
                    <div className="aspect-square relative">
                      <ImageWithFallback
                        src={fries.imageUrl}
                        alt={fries.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Content */}
                    <div className="p-5 text-left min-h-[100px] flex flex-col justify-between">
                      <h3 className="text-[#2D2D2D] text-[16px] mb-2" style={{ fontWeight: 700 }}>
                        {fries.name}
                      </h3>
                      {fries.price > 0 && (
                        <div className="text-[#2D2D2D] text-[15px]" style={{ fontWeight: 700 }}>
                          +{fries.price},00
                        </div>
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div className={`absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      selectedFries === fries.id
                        ? 'bg-[#FF7A29]'
                        : 'bg-[#E1E1E1]'
                    }`}>
                      {selectedFries === fries.id && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5">
                          <polyline points="2,8 6,12 14,4" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Drinks Selection */}
        {currentStep === 3 && (
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-3 gap-6">
              {drinksOptions.map((drink) => (
                <div key={drink.id} className="relative">
                  <button
                    onClick={() => setSelectedDrink(drink.id)}
                    className={`w-full bg-white rounded-xl overflow-hidden border-3 transition-all shadow-sm ${
                      selectedDrink === drink.id
                        ? 'border-[#FF7A29] ring-4 ring-[#FF7A29]/20'
                        : 'border-transparent hover:border-[#FF7A29]'
                    }`}
                  >
                    {/* Badge */}
                    {drink.badge && (
                      <div className="absolute top-4 left-4 z-10">
                        <ProductBadge type={drink.badge.type} text={drink.badge.text} />
                      </div>
                    )}

                    {/* Image */}
                    <div className="aspect-square relative">
                      <ImageWithFallback
                        src={drink.imageUrl}
                        alt={drink.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Content */}
                    <div className="p-5 text-left min-h-[100px] flex flex-col justify-between">
                      <h3 className="text-[#2D2D2D] text-[16px] mb-2" style={{ fontWeight: 700 }}>
                        {drink.name}
                      </h3>
                      {drink.price > 0 && (
                        <div className="text-[#2D2D2D] text-[15px]" style={{ fontWeight: 700 }}>
                          +{drink.price},00
                        </div>
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div className={`absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      selectedDrink === drink.id
                        ? 'bg-[#FF7A29]'
                        : 'bg-[#E1E1E1]'
                    }`}>
                      {selectedDrink === drink.id && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5">
                          <polyline points="2,8 6,12 14,4" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Dip Selection (Menu only) */}
        {currentStep === 4 && !isSinglePizza && (
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-3 gap-6">
              {dipOptions.map((dip) => (
                <div key={dip.id} className="relative">
                  <button
                    onClick={() => setSelectedDip(dip.id)}
                    className={`w-full bg-white rounded-xl overflow-hidden border-3 transition-all shadow-sm ${
                      selectedDip === dip.id
                        ? 'border-[#FF7A29] ring-4 ring-[#FF7A29]/20'
                        : 'border-transparent hover:border-[#FF7A29]'
                    }`}
                  >
                    {/* Badge */}
                    {dip.badge && (
                      <div className="absolute top-4 left-4 z-10">
                        <ProductBadge type={dip.badge.type} text={dip.badge.text} />
                      </div>
                    )}

                    {/* Image */}
                    <div className="aspect-square relative">
                      <ImageWithFallback
                        src={dip.imageUrl}
                        alt={dip.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Content */}
                    <div className="p-5 text-left min-h-[100px] flex flex-col justify-between">
                      <h3 className="text-[#2D2D2D] text-[16px] mb-2" style={{ fontWeight: 700 }}>
                        {dip.name}
                      </h3>
                      {dip.price > 0 && (
                        <div className="text-[#2D2D2D] text-[15px]" style={{ fontWeight: 700 }}>
                          +{dip.price},00
                        </div>
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div className={`absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      selectedDip === dip.id
                        ? 'bg-[#FF7A29]'
                        : 'bg-[#E1E1E1]'
                    }`}>
                      {selectedDip === dip.id && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5">
                          <polyline points="2,8 6,12 14,4" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 for Single Pizza OR Step 5 for Menu: Upsells */}
        {((isSinglePizza && currentStep === 2) || (!isSinglePizza && currentStep === 5)) && (
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-3 gap-6">
              {upsellOptions.map((upsell) => (
                <div key={upsell.id} className="relative">
                  <button
                    onClick={() => handleToggleUpsell(upsell.id)}
                    className={`w-full bg-white rounded-xl overflow-hidden border-3 transition-all shadow-sm ${
                      selectedUpsells.includes(upsell.id)
                        ? 'border-[#FF7A29] ring-4 ring-[#FF7A29]/20'
                        : 'border-transparent hover:border-[#FF7A29]'
                    }`}
                  >
                    {/* Badge */}
                    {upsell.badge && (
                      <div className="absolute top-4 left-4 z-10">
                        <ProductBadge type={upsell.badge.type} text={upsell.badge.text} />
                      </div>
                    )}

                    {/* Image */}
                    <div className="aspect-square relative">
                      <ImageWithFallback
                        src={upsell.imageUrl}
                        alt={upsell.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Content */}
                    <div className="p-5 text-left">
                      <h3 className="text-[#2D2D2D] text-[16px] mb-1" style={{ fontWeight: 700 }}>
                        {upsell.name}
                      </h3>
                      <p className="text-[#2D2D2D]/60 text-[13px] mb-2" style={{ fontWeight: 400 }}>
                        {upsell.description}
                      </p>
                      <div className="text-[#2D2D2D] text-[15px]" style={{ fontWeight: 700 }}>
                        +{upsell.price},00
                      </div>
                    </div>

                    {/* Selection indicator */}
                    <div className={`absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      selectedUpsells.includes(upsell.id)
                        ? 'bg-[#FF7A29]'
                        : 'bg-[#E1E1E1]'
                    }`}>
                      {selectedUpsells.includes(upsell.id) && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.5">
                          <polyline points="2,8 6,12 14,4" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              ))}
            </div>

            {/* Skip button */}
            <div className="text-center mt-8">
              <button
                onClick={handleNextStep}
                className="text-[#2D2D2D]/60 hover:text-[#2D2D2D] text-[15px] underline"
                style={{ fontWeight: 400 }}
              >
                Nej tak, fortsæt uden ekstra
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation - Sticky at bottom */}
      <div className="sticky bottom-0 bg-white border-t border-[#F2E8DA] shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-[88px] px-6">
          <button
            onClick={handleBackClick}
            className="text-[#2D2D2D] hover:text-[#E94F26] flex items-center gap-2 transition-colors h-[56px] px-6"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="12,4 6,10 12,16" />
            </svg>
            <span className="text-[16px]" style={{ fontWeight: 700 }}>Tilbage</span>
          </button>

          {/* Step Dots - Center */}
          <div className="flex items-center justify-center gap-3">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={`w-5 h-5 rounded-full transition-all ${
                  index + 1 === currentStep
                    ? 'bg-[#FF7A29] ring-4 ring-[#FF7A29]/30'
                    : index + 1 < currentStep
                    ? 'bg-[#FF7A29]'
                    : 'bg-[#8B8B8B]'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNextStep}
            className="bg-[#FF7A29] hover:bg-[#E94F26] text-white h-[56px] px-10 rounded-lg text-[16px] uppercase tracking-wide transition-all shadow-md min-w-[180px] flex items-center justify-center gap-2"
            style={{ fontWeight: 700 }}
          >
            <span>{currentStep === 5 ? 'Tilføj til kurv' : 'Næste'}</span>
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="8,4 14,10 8,16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

CustomizationView.displayName = 'CustomizationView';
