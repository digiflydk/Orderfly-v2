
import { Button } from "@/components/ui/button";


export function FooterCTA({brandName, onOrderClick}: {brandName: string; onOrderClick: () => void}) {
  return (
    <section className="bg-m3-button text-m3-dark py-16 mt-8">
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl lg:text-4xl font-bold uppercase max-w-3xl mx-auto">
          Bestil hos {brandName}
        </h2>
        <Button
          onClick={onOrderClick}
          size="lg"
          className="mt-8 bg-m3-white hover:bg-m3-gray text-[#2D2D2D] font-bold uppercase tracking-wide transition-colors"
        >
          Bestil nu
        </Button>
      </div>
    </section>
  );
}
