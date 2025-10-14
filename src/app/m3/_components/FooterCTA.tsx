import { Button } from "@/components/ui/button";
import { footerCTAContent } from "../_data/constants";

export function FooterCTA() {
  return (
    <section className="bg-primary text-primary-foreground py-16">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-4xl font-bold uppercase max-w-3xl mx-auto">
          {footerCTAContent.title}
        </h2>
        <Button
          size="lg"
          className="mt-8 bg-secondary hover:bg-secondary/90 text-black font-bold uppercase tracking-wide"
        >
          {footerCTAContent.ctaText}
        </Button>
      </div>
    </section>
  );
}
