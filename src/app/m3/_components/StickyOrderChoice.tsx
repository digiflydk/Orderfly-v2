"use client";
import { useState } from "react";

export default function StickyOrderChoice() {
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");

  return (
    <>
      {/* Spacer so content is not hidden behind the sticky bar */}
      <div className="h-20 md:hidden" aria-hidden />

      <div
        className="
          fixed left-0 right-0 bottom-0 z-50 md:hidden
          pb-[max(env(safe-area-inset-bottom),12px)]
          px-3
        "
      >
        <div className="flex flex-col items-center gap-2 text-center">
          {/* Heading over buttons */}
          <p className="text-sm font-semibold text-white/90">
            Start your order
          </p>

          <div className="w-full rounded-full bg-[#2D2D2D] p-1 shadow-xl">
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setMode("delivery")}
                className={[
                  "h-12 rounded-full text-sm font-bold uppercase transition",
                  mode === "delivery"
                    ? "bg-[#FF7A29] text-[#2D2D2D]"
                    : "bg-transparent text-white"
                ].join(" ")}
                aria-pressed={mode === "delivery"}
              >
                Delivery
              </button>

              <button
                onClick={() => setMode("pickup")}
                className={[
                  "h-12 rounded-full text-sm font-bold uppercase transition",
                  mode === "pickup"
                    ? "bg-[#FF7A29] text-[#2D2D2D]"
                    : "bg-transparent text-white"
                ].join(" ")}
                aria-pressed={mode === "pickup"}
              >
                Pick up
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
