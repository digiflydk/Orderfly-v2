import React from 'react';
import { icons, LucideProps, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DynamicIconProps extends Omit<LucideProps, 'name'> {
  name: string;
}

export function DynamicIcon({ name, className, ...props }: DynamicIconProps) {
  const LucideIcon = icons[name as keyof typeof icons];

  if (!LucideIcon) {
    // Return a fallback icon if the name is invalid
    return <AlertCircle className={cn("text-destructive", className)} {...props} />;
  }

  return <LucideIcon className={cn(className)} {...props} />;
}
