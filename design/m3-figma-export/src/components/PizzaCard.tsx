import { ImageWithFallback } from './figma/ImageWithFallback';
import { Button } from './ui/button';
import { Plus } from 'lucide-react';

interface PizzaCardProps {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

export function PizzaCard({ name, description, price, imageUrl }: PizzaCardProps) {
  return (
    <div 
      className="bg-card rounded-xl overflow-hidden transition-transform hover:scale-[1.02]"
      style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)' }}
    >
      <ImageWithFallback 
        src={imageUrl} 
        alt={name}
        className="w-full h-[220px] object-cover"
      />
      <div className="p-6">
        <h4 className="text-[20px] mb-2" style={{ fontWeight: 700 }}>{name}</h4>
        <p className="text-muted-foreground text-[14px] mb-4 line-clamp-2">{description}</p>
        <div className="flex items-center justify-between">
          <span className="text-[24px] text-primary" style={{ fontWeight: 700 }}>{price} kr</span>
          <Button size="icon" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-10 w-10">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
