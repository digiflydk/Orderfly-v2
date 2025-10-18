"use client";

import { Button } from "@/components/ui/button";

export default function StickyOrderChoice() {
  // The state for delivery/pickup mode is no longer needed here,
  // but we keep the component structure in case a modal needs to be triggered.
  const handleOrderClick = () => {
    // Logic to open an order modal would go here.
    console.log("Bestil her clicked");
  };

  return (
    <>
      {/* Spacer so content is not hidden behind the sticky bar */}
      <div className="h-20 md:hidden" aria-hidden="true" />

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-m3-cream p-3 md:hidden">
        <Button
          size="lg"
          className="w-full h-14 bg-m3-orange text-m3-dark hover:bg-m3-orange/90 font-bold uppercase text-base"
          onClick={handleOrderClick}
        >
          Bestil her
        </Button>
      </div>
    </>
  );
}
