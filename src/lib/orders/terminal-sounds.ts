export const TERMINAL_SOUNDS = {
  melody: { name: 'Melodi', notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 783.99, 1046.5], wave: 'sine' },
  bell: { name: 'Klokke', notes: [1046.5, 783.99, 1046.5, 783.99, 1046.5, 783.99, 1046.5, 783.99], wave: 'sine' },
  marimba: { name: 'Marimba', notes: [392, 523.25, 659.25, 523.25, 392, 523.25, 783.99, 659.25], wave: 'triangle' },
  alert: { name: 'Alarm', notes: [880, 440, 880, 440, 880, 440, 880, 440], wave: 'triangle' },
} as const;
export type TerminalSound = keyof typeof TERMINAL_SOUNDS;
export const isTerminalSound = (value: unknown): value is TerminalSound => typeof value === 'string' && Object.hasOwn(TERMINAL_SOUNDS, value);
