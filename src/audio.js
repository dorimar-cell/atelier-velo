let ctx = null;

export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume();
}

function blip(time, freq, duration, gainValue) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + duration);
}

export function playPlace() {
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  blip(now, 420, 0.16, 0.07);
  blip(now + 0.05, 620, 0.2, 0.05);
}

export function playComplete() {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  blip(now, 523, 0.28, 0.08);
  blip(now + 0.12, 659, 0.32, 0.07);
  blip(now + 0.24, 784, 0.4, 0.06);
}
