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
          bg-[#FFF8F0]
          pt-3 pb-[max(env(safe-area-inset-bottom),12px)]
          px-4
          border-t border-neutral-200
        "
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Heading over buttons */}
          <p className="text-base font-bold text-m3-dark uppercase tracking-wide">
            Bestil her
          </p>

          <div className="w-full grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode("delivery")}
                className={[
                  "h-12 rounded-lg text-sm font-bold uppercase transition",
                  mode === "delivery"
                    ? "bg-m3-orange text-m3-dark"
                    : "bg-m3-white text-m3-dark border border-neutral-300"
                ].join(" ")}
                aria-pressed={mode === "delivery"}
              >
                Leverer
              </button>
              
              <button
                onClick={() => setMode("pickup")}
                className={[
                  "h-12 rounded-lg text-sm font-bold uppercase transition",
                  mode === "pickup"
                    ? "bg-m3-orange text-m3-dark"
                    : "bg-m3-white text-m3-dark border border-neutral-300"
                ].join(" ")}
                aria-pressed={mode === "pickup"}
              >
                Afhenter
              </button>

          </div>
        </div>
      </div>
    </>
  );
}
