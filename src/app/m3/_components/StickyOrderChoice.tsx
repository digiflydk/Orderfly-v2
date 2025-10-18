"use client";
import { useState } from "react";

export default function StickyOrderChoice() {
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");

  return (
    <>
      {/* Spacer so content is not hidden behind the sticky bar */}
      <div className="h-28 md:hidden" aria-hidden />

      <div
        className="
          fixed left-0 right-0 bottom-0 z-50 md:hidden
          bg-m3-cream
          pt-3 pb-[max(env(safe-area-inset-bottom),12px)]
          px-4
        "
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Heading over buttons */}
          <p className="text-base font-bold text-m3-dark uppercase tracking-wide">
            Start your order
          </p>

          <div className="w-full grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("pickup")}
                className="h-12 rounded-lg text-sm font-bold uppercase transition-colors bg-m3-button text-m3-dark hover:bg-m3-buttonHover"
                aria-pressed={mode === "pickup"}
              >
                Pickup
              </button>

              <button
                onClick={() => setMode("delivery")}
                className="h-12 rounded-lg text-sm font-bold uppercase transition-colors bg-m3-button text-m3-dark hover:bg-m3-buttonHover"
                aria-pressed={mode === "delivery"}
              >
                Delivery
              </button>
          </div>
        </div>
      </div>
    </>
  );
}
