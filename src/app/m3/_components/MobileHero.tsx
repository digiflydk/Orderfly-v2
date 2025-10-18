import Image from "next/image";
import { Button } from "@/components/ui/button";

export function MobileHero() {
  return (
    <section className="relative h-[60vh] w-full flex items-end p-4 text-white">
      <Image
        src="https://picsum.photos/seed/m3hero/600/800"
        alt="Lækker pizza"
        fill
        className="object-cover"
        priority
        data-ai-hint="gourmet pizza"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="relative z-10 w-full">
        <h1 className="text-4xl font-bold uppercase">Truffle & Parmesan Pizza</h1>
        <p className="mt-2 text-sm max-w-xs">
          Sprød, håndlavet bund med cremet trøffelmayo, parmesan, mozzarella og frisk rucola.
        </p>
        <Button className="mt-4 bg-m3-orange text-m3-dark hover:bg-m3-orange/90 font-bold uppercase text-xs px-4 py-2 rounded-lg">
          Bestil nu
        </Button>
      </div>
    </section>
  );
}
