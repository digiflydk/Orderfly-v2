"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Choice = "delivery" | "pickup";

export function StickyOrderChoice() {
  const [choice, setChoice] = useState<Choice>("delivery");

  return (
    <div className="fixed bottom-3 inset-x-3 z-50 h-16 bg-m3-dark rounded-full p-1.5 flex items-center shadow-lg">
      <Button
        onClick={() => setChoice("delivery")}
        className={cn(
          "flex-1 h-full rounded-full transition-all duration-300",
          choice === "delivery"
            ? "bg-m3-orange text-m3-dark"
            : "bg-transparent text-white"
        )}
      >
        Delivery
      </Button>
      <Button
        onClick={() => setChoice("pickup")}
        className={cn(
          "flex-1 h-full rounded-full transition-all duration-300",
          choice === "pickup"
            ? "bg-m3-orange text-m3-dark"
            : "bg-transparent text-white"
        )}
      >
        Pick up
      </Button>
    </div>
  );
}
