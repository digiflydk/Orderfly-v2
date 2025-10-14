import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProductBadge } from './ProductBadge';
import { Button } from './ui/button';

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  badge?: 'NYHED' | 'RABAT';
  originalPrice?: number;
  onAddToCart: (id: string) => void;
}

export function ProductCard({ id, name, description, price, imageUrl, badge, originalPrice, onAddToCart }: ProductCardProps) {
  const hasDiscount = originalPrice && originalPrice > price;
  
  return (
    <div 
      onClick={() => onAddToCart(id)}
      className="bg-white rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-lg group border border-[#F2E8DA]"
      style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}
    >
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <ImageWithFallback
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {/* Badge */}
        {badge && (
          <div className="absolute top-4 left-4">
            <ProductBadge 
              type={badge === 'NYHED' ? 'new' : 'discount'} 
              text={badge} 
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Title & Price */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-[#2D2D2D] text-[18px] flex-1 pr-3 uppercase leading-tight" style={{ fontWeight: 700 }}>
            {name}
          </h3>
          <div className="flex flex-col items-end">
            {hasDiscount ? (
              <>
                <div className="text-[#E94F26] text-[18px] whitespace-nowrap" style={{ fontWeight: 700 }}>
                  {price} kr
                </div>
                <div className="text-[#2D2D2D] text-[14px] line-through whitespace-nowrap" style={{ fontWeight: 400 }}>
                  {originalPrice} kr
                </div>
              </>
            ) : (
              <div className="text-[#2D2D2D] text-[18px] whitespace-nowrap" style={{ fontWeight: 700 }}>
                {price} kr
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-[#2D2D2D]/70 text-[14px] leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
