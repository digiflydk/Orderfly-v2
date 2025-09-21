"use client";
import Image from "next/image";

type Props = {
  className?: string;
  priority?: boolean; // kan overrides pr. brug
};

export default function SiteLogo({ className, priority = true }: Props) {
  return (
    <Image
      src="https://i.postimg.cc/VNjfYZn3/Orderfly-Logo-F.png"
      alt="Orderfly"
      width={164}
      height={36}
      priority={priority}
      // Hvis CSS andetsteds ændrer kun én dimension, sørger vi for at den anden følger med
      style={{ height: "auto", width: "auto", maxWidth: "100%" }}
      className={className}
    />
  );
}
