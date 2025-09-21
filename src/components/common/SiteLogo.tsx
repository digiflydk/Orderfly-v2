"use client";
import Image from "next/image";

type Props = {
  /** Valgfri ekstra klasser til containeren */
  className?: string;
  /** Hvis logoet er above-the-fold, behold true (LCP) */
  priority?: boolean;
  /** Hvis du absolut vil tvinge en mål-højde via CSS, send fx "h-8" – vi sætter selv modsat dimension til auto */
  imgClassName?: string;
};

const LOGO_SRC = "https://i.postimg.cc/VNjfYZn3/Orderfly-Logo-F.png";
// De naturlige dimensioner, så Next kender aspect ratio:
const NATURAL_WIDTH = 164;
const NATURAL_HEIGHT = 36;

export default function SiteLogo({ className, priority = true, imgClassName }: Props) {
  return (
    <div className={className} style={{ display: "inline-block", lineHeight: 0 }}>
      <Image
        src={LOGO_SRC}
        alt="Orderfly"
        width={NATURAL_WIDTH}
        height={NATURAL_HEIGHT}
        priority={priority}
        // NØGLEN mod advarslen: hvis CSS kun sætter én dimension,
        // sørger vi for at den anden er 'auto', så aspect ratio bevares.
        style={{ width: "auto", height: "auto", maxWidth: "100%" }}
        className={imgClassName}
      />
    </div>
  );
}
