import { TERMINAL_SOUNDS, type TerminalSound } from './terminal-sounds';

/** iPad desktop mode still identifies itself as a touch-capable Mac. */
export function needsTerminalMediaAudio() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** Local PCM asset: iOS ignores element.volume, so gain is encoded in the WAV. */
export function terminalSoundWav(sound: TerminalSound, volume: number) {
  const rate = 22050, samples = Math.round(rate * 3.6);
  const bytes = new ArrayBuffer(44 + samples * 2), view = new DataView(bytes);
  const ascii = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  const preset = TERMINAL_SOUNDS[sound], gain = 0.15 * Math.max(0, Math.min(100, volume)) / 100;
  for (let i = 0; i < samples; i++) {
    const time = i / rate, note = Math.min(7, Math.floor(time / 0.45)), within = time - note * 0.45;
    const envelope = Math.max(0, Math.min(1, within / 0.02, (0.42 - within) / 0.12));
    const sine = Math.sin(2 * Math.PI * preset.notes[note] * within);
    const wave = preset.wave === 'triangle' ? 2 / Math.PI * Math.asin(sine) : sine;
    view.setInt16(44 + i * 2, Math.round(wave * envelope * gain * 32767), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
