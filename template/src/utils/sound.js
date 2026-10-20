// Sonidos generados con WebAudio, sin archivos.
let ctx;

export function beep(freq = 660, duration = 0.08) {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime;

  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}
