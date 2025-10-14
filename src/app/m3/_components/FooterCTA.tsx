import { Button } from "@/components/ui/button";
import { footerCTAContent } from "../_data/constants";

export function FooterCTA() {
  return (
    <section className="bg-primary text-primary-foreground py-16 mt-8">
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl lg:text-4xl font-bold uppercase max-w-3xl mx-auto">
          {footerCTAContent.title}
        </h2>
        <Button
          size="lg"
          className="mt-8 bg-secondary hover:bg-secondary/90 text-black font-bold uppercase tracking-wide transition-colors"
        >
          {footerCTAContent.ctaText}
        </Button>
      </div>
    </section>
  );
}
