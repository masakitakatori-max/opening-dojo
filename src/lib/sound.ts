// Tiny synthesized move sounds (no audio assets needed). Deliberately quiet and soft:
// everything goes through one master gain, and there are no harsh waveforms.
let ctx: AudioContext | undefined;
let master: GainNode | undefined;
const VOLUME = 0.28;
function out() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
  }
  return { a: ctx, dest: master! };
}
/** Short filtered-noise "tock" of a piece landing. */
function knock(freq: number, dur: number, gain: number, when = 0) {
  const { a, dest } = out();
  const t = a.currentTime + when;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 8);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 1.8;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}
function tone(freq: number, dur: number, gain: number, when = 0) {
  const { a, dest } = out();
  const t = a.currentTime + when;
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}
let muted = false;
export const setMuted = (m: boolean) => void (muted = m);
export const sfx = {
  move: () => !muted && knock(700, 0.07, 1),
  capture: () => !muted && (knock(560, 0.08, 1.15), knock(900, 0.05, 0.6, 0.04)),
  check: () => !muted && knock(700, 0.07, 1),
  good: () => !muted && tone(660, 0.14, 0.12),
  wrong: () => !muted && tone(150, 0.16, 0.2),
  done: () => !muted && [523, 659, 784].forEach((f, i) => tone(f, 0.2, 0.1, i * 0.1)),
};
