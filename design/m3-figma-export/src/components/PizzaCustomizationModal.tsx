import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { X } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface PizzaCustomizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pizza: {
    id: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    ingredients?: string[];
  } | null;
  onComplete: (type: 'menu' | 'single', extras: string[], removed: string[]) => void;
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

export function PizzaCustomizationModal({ open, onOpenChange, pizza, onComplete }: PizzaCustomizationModalProps) {
  const [step, setStep] = useState<'choice' | 'customize'>('choice');
  const [selectedType, setSelectedType] = useState<'menu' | 'single' | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep('choice');
      setSelectedType(null);
      setSelectedExtras([]);
      setRemovedIngredients([]);
      setCurrentPage(0);
    }, 200);
  };

  const handleChoiceClick = (type: 'menu' | 'single') => {
    setSelectedType(type);
    // Both menu and single complete immediately
    // Menu will show CustomizationView in main content area
    // Single will add directly to cart
    onComplete(type, [], []);
    handleClose();
  };

  const handleToggleExtra = (extraId: string) => {
    if (selectedExtras.includes(extraId)) {
      setSelectedExtras(selectedExtras.filter(id => id !== extraId));
    } else {
      if (selectedExtras.length < 6) {
        setSelectedExtras([...selectedExtras, extraId]);
      }
    }
  };

  const handleToggleIngredient = (ingredient: string) => {
    if (removedIngredients.includes(ingredient)) {
      setRemovedIngredients(removedIngredients.filter(i => i !== ingredient));
    } else {
      setRemovedIngredients([...removedIngredients, ingredient]);
    }
  };

  const handleComplete = () => {
    if (selectedType) {
      onComplete(selectedType, selectedExtras, removedIngredients);
      handleClose();
    }
  };

  if (!pizza) return null;

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
    currentPage * ingredientsPerPage,
    (currentPage + 1) * ingredientsPerPage
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="bg-[#1E1E1E] border-none p-0 !max-w-[1200px] sm:!max-w-[1200px]"
        style={{ maxHeight: '90vh' }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-8 top-8 z-50 text-white hover:text-[#F7C948] transition-colors"
        >
          <X className="h-8 w-8" />
        </button>

        {step === 'choice' && (
          <div className="p-16">
            <DialogTitle className="sr-only">
              Vælg pizza type for {pizza.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Vælg mellem pizza menu eller single pizza
            </DialogDescription>

            {/* Header */}
            <div className="text-center mb-12">
              <h2 className="text-white text-[48px] mb-4" style={{ fontWeight: 700 }}>
                {pizza.name}
              </h2>
              <p className="text-white/80 text-[18px]" style={{ fontWeight: 400 }}>
                Skal din bestilling være en menu?
              </p>
            </div>

            {/* Two choices */}
            <div className="grid grid-cols-2 gap-8">
              {/* Menu Option */}
              <button
                onClick={() => handleChoiceClick('menu')}
                className="relative bg-[#2D2D2D] hover:bg-[#3D3D3D] border-4 border-[#F7C948] rounded-2xl overflow-hidden transition-all group"
              >
                <div className="absolute top-6 left-6 bg-[#F7C948] text-[#1E1E1E] px-6 py-3 rounded-lg text-[13px] uppercase tracking-wide z-10" style={{ fontWeight: 700 }}>
                  Mest populær
                </div>

                <div className="aspect-[4/3] relative">
                  <ImageWithFallback
                    src={pizza.imageUrl}
                    alt="Pizza menu"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="p-8 text-left">
                  <h3 className="text-white text-[26px] mb-3" style={{ fontWeight: 700 }}>
                    Pizza menu
                  </h3>
                  <p className="text-white/70 text-[16px] mb-4">
                    Ja, gør det til en menu
                  </p>
                  <div className="text-[#F7C948] text-[22px]" style={{ fontWeight: 700 }}>
                    +30,00
                  </div>
                </div>
              </button>

              {/* Single Option */}
              <button
                onClick={() => handleChoiceClick('single')}
                className="relative bg-[#2D2D2D] hover:bg-[#3D3D3D] border-4 border-transparent hover:border-[#F7C948] rounded-2xl overflow-hidden transition-all group"
              >
                <div className="aspect-[4/3] relative">
                  <ImageWithFallback
                    src={pizza.imageUrl}
                    alt="Single pizza"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="p-8 text-left">
                  <h3 className="text-white text-[26px] mb-3" style={{ fontWeight: 700 }}>
                    Single pizza
                  </h3>
                  <p className="text-white/70 text-[16px] mb-4">
                    Kun pizza
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === 'customize' && (
          <div className="p-8 max-h-[90vh] overflow-y-auto">
            <DialogTitle className="sr-only">
              Tilpas din {pizza.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Tilføj ekstra ingredienser og tilpas din pizza
            </DialogDescription>

            {/* Header */}
            <div className="text-center mb-8">
              <h3 className="text-white text-[18px] mb-2" style={{ fontWeight: 400 }}>
                {pizza.name}
              </h3>
              <h2 className="text-[#F7C948] text-[32px] uppercase" style={{ fontWeight: 700 }}>
                Tilpas din {pizza.name}
              </h2>
            </div>

            {/* Extra Ingredients Section */}
            <div className="mb-8">
              <div className="grid grid-cols-2 gap-4 mb-6">
                {extraIngredients.slice(0, 2).map((extra) => (
                  <div
                    key={extra.id}
                    className="bg-[#2D2D2D] rounded-xl overflow-hidden border-2 border-transparent hover:border-[#F7C948] transition-all"
                  >
                    <div className="aspect-[16/10] relative">
                      <ImageWithFallback
                        src={extra.imageUrl}
                        alt={extra.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <div className="text-white text-[15px] mb-1" style={{ fontWeight: 400 }}>
                          {extra.name}
                        </div>
                        <div className="text-white text-[16px]" style={{ fontWeight: 700 }}>
                          +{extra.price},00
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleExtra(extra.id)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          selectedExtras.includes(extra.id)
                            ? 'bg-[#F7C948] text-[#1E1E1E]'
                            : 'bg-[#F7C948] text-[#1E1E1E] hover:bg-[#F7C948]/90'
                        }`}
                      >
                        <span className="text-[24px]" style={{ fontWeight: 700 }}>+</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* More extras */}
              {extraIngredients.slice(2).map((extra) => (
                <div
                  key={extra.id}
                  className="bg-[#2D2D2D] rounded-xl p-4 flex items-center justify-between mb-3 border-2 border-transparent hover:border-[#F7C948] transition-all"
                >
                  <div>
                    <div className="text-white text-[15px] mb-1" style={{ fontWeight: 400 }}>
                      {extra.name}
                    </div>
                    <div className="text-white text-[16px]" style={{ fontWeight: 700 }}>
                      +{extra.price},00
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleExtra(extra.id)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                      selectedExtras.includes(extra.id)
                        ? 'bg-[#F7C948] text-[#1E1E1E]'
                        : 'bg-[#F7C948] text-[#1E1E1E] hover:bg-[#F7C948]/90'
                    }`}
                  >
                    <span className="text-[24px]" style={{ fontWeight: 700 }}>+</span>
                  </button>
                </div>
              ))}

              {selectedExtras.length > 0 && (
                <div className="text-white/60 text-[13px] mt-2">
                  {selectedExtras.length} / 6 ekstra ingredienser valgt
                </div>
              )}
            </div>

            {/* Remove Ingredients Section */}
            <div className="mb-8">
              <div className="bg-[#3D3D3D] px-6 py-3 mb-4">
                <h4 className="text-white/60 text-[13px] uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  Tilpas ingredienser
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {currentIngredients.map((ingredient) => (
                  <button
                    key={ingredient}
                    onClick={() => handleToggleIngredient(ingredient)}
                    className={`bg-[#2D2D2D] rounded-xl p-5 flex items-center gap-3 transition-all border-2 ${
                      removedIngredients.includes(ingredient)
                        ? 'border-transparent'
                        : 'border-[#F7C948]'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                        removedIngredients.includes(ingredient)
                          ? 'bg-[#3D3D3D]'
                          : 'bg-[#F7C948]'
                      }`}
                    >
                      {!removedIngredients.includes(ingredient) && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1E1E1E" strokeWidth="2.5">
                          <polyline points="2,7 6,11 12,3" />
                        </svg>
                      )}
                    </div>
                    <span className="text-white text-[15px] uppercase" style={{ fontWeight: 400 }}>
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
                      onClick={() => setCurrentPage(index)}
                      className={`w-3 h-3 rounded-full transition-all ${
                        currentPage === index ? 'bg-[#F7C948]' : 'bg-[#3D3D3D]'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-[#3D3D3D]">
              <button
                onClick={() => setStep('choice')}
                className="text-white hover:text-[#F7C948] flex items-center gap-2 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="12,4 6,10 12,16" />
                </svg>
                <span className="text-[15px]" style={{ fontWeight: 400 }}>Tilbage</span>
              </button>

              <button
                onClick={handleComplete}
                className="bg-[#F7C948] hover:bg-[#F7C948]/90 text-[#1E1E1E] px-8 py-4 rounded-lg text-[16px] uppercase tracking-wide transition-all"
                style={{ fontWeight: 700 }}
              >
                Næste
                <svg className="inline-block ml-2 w-5 h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="8,4 14,10 8,16" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
