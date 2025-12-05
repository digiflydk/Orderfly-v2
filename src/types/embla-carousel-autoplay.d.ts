
declare module 'embla-carousel-autoplay' {
  type AutoplayOptions = {
    delay?: number;
    stopOnInteraction?: boolean;
    stopOnMouseEnter?: boolean;
  };

  type AutoplayPlugin = {
    stop: () => void;
    reset: () => void;
  };

  const Autoplay: (options?: AutoplayOptions) => AutoplayPlugin;

  export default Autoplay;
}
