
declare module 'embla-carousel-autoplay' {
  import type { EmblaCarouselType } from 'embla-carousel';

  type AutoplayOptions = {
    delay?: number;
    stopOnInteraction?: boolean;
    stopOnMouseEnter?: boolean;
  };

  export default function Autoplay(
    options?: AutoplayOptions
  ): (emblaRoot: EmblaCarouselType) => void;
}
