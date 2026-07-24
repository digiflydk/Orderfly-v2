
declare module 'embla-carousel-autoplay' {
  import type { CreatePluginType } from 'embla-carousel';

  type AutoplayOptions = {
    delay?: number;
    stopOnInteraction?: boolean;
    stopOnMouseEnter?: boolean;
  };

  type AutoplayPlugin = CreatePluginType<{
    play: (jump?: boolean) => void;
    stop: () => void;
    reset: () => void;
    isPlaying: () => boolean;
    timeUntilNext: () => number | null;
  }, AutoplayOptions>;

  type AutoplayType = AutoplayPlugin;
  type AutoplayOptionsType = AutoplayOptions;

  function Autoplay(userOptions?: AutoplayOptions): AutoplayType;
  namespace Autoplay {
    let globalOptions: AutoplayOptions | undefined;
  }

  export type { AutoplayType, AutoplayOptionsType };
  export default Autoplay;
}
