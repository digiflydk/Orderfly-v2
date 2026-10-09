'use client';
import { Button } from '@/components/ui/button';
export default function WebsiteError({reset}: {reset: () => void}) {
  return <div role="alert" className="space-y-4"><h1 className="text-xl font-semibold">Webshops kunne ikke indlæses</h1><p>Prøv igen. Der er ikke ændret nogen indstillinger.</p><Button onClick={reset}>Prøv igen</Button></div>;
}
