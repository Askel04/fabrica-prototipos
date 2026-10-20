// Sonidos generados con WebAudio, sin archivos.
let ctx;
function ac() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function beep(freq = 660, duration = 0.08, type = 'square', vol = 0.2) {
  const c = ac();
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function noise(duration, freq, q, vol) {
  const c = ac();
  const len = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

// Golpe de pala: "toc" seco, más grave y fuerte con más potencia
export function hitSound(power = 0.5) {
  noise(0.09, 900 + power * 600, 1.5, 0.9);
  beep(220 + power * 120, 0.06, 'triangle', 0.25);
}
export const bounceSound = () => beep(140, 0.05, 'sine', 0.25);
export const glassSound = () => { noise(0.18, 2600, 3, 0.35); beep(1200, 0.12, 'sine', 0.06); };
export const netSound = () => noise(0.12, 400, 0.8, 0.4);
export const whiffSound = () => noise(0.15, 1800, 0.6, 0.25);
export function pointSound(win) {
  const notes = win ? [523, 659, 784] : [392, 330];
  notes.forEach((n, i) => setTimeout(() => beep(n, 0.14, 'square', 0.12), i * 110));
}
