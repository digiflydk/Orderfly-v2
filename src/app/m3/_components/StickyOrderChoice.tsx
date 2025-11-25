
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface StickyOrderChoiceProps {
  onOrderClick: () => void;
}

export default function StickyOrderChoice({ onOrderClick }: StickyOrderChoiceProps) {
  return (
    <>
      {/* Spacer so content is not hidden behind the sticky bar */}
      <div className="h-14 md:hidden" aria-hidden="true" />

      <div
        className="
          fixed left-0 right-0 bottom-0 z-50 md:hidden
          bg-m3-cream
          pb-[max(env(safe-area-inset-bottom),0px)]
        "
      >
        <Button
          size="lg"
          className="w-full h-14 bg-m3-button text-m3-dark hover:bg-m3-button-hover font-bold uppercase text-base rounded-none"
          onClick={onOrderClick}
        >
          BESTIL HER
        </Button>
      </div>
    </>
  );
}
