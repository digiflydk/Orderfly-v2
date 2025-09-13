'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';

export default function StickyCta() {
  return (
    <div className="sticky bottom-0 z-40 w-full bg-gradient-to-t from-background via-background/90 to-transparent py-4">
      <div className="container mx-auto flex max-w-7xl items-center justify-center">
        <Button asChild size="lg" className="shadow-lg animate-pulse">
          <Link href="#kontakt">
            Start Dit AI-Projekt i Dag <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
