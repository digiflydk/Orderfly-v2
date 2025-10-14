import { ImageWithFallback } from './figma/ImageWithFallback';
import { Button } from './ui/button';

interface FeatureCardProps {
  title: string;
  description: string;
  buttonText: string;
  imageUrl: string;
  bgColor?: string;
}

export function FeatureCard({ title, description, buttonText, imageUrl, bgColor = '#ffffff' }: FeatureCardProps) {
  return (
    <div 
      className="rounded-2xl p-8 shadow-sm flex flex-col justify-between h-[400px]"
      style={{ backgroundColor: bgColor, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)' }}
    >
      <div>
        <h3 className="text-[32px] mb-3" style={{ fontWeight: 700 }}>{title}</h3>
        <p className="text-muted-foreground mb-6">{description}</p>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg">
          {buttonText}
        </Button>
      </div>
      <div className="mt-6">
        <ImageWithFallback 
          src={imageUrl} 
          alt={title}
          className="w-full h-[180px] object-cover rounded-xl"
        />
      </div>
    </div>
  );
}
