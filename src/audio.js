let ctx = null;
let armed = true;

export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume();
}

function tone(time, freq, duration = 1.05) {
  const osc = ctx.createOscillator();
  const partial = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.82, time + duration);

  partial.type = "sine";
  partial.frequency.setValueAtTime(freq * 2.15, time);
  partial.frequency.exponentialRampToValueAtTime(freq * 1.6, time + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4200, time);
  filter.Q.value = 1.1;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.2, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(filter);
  partial.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  partial.start(time);
  osc.stop(time + duration);
  partial.stop(time + duration);
}

function ring() {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  tone(now, 1568);
  tone(now + 0.17, 1865);
}

export function syncBell(progress) {
  if (progress > 0.88 && armed) {
    armed = false;
    unlockAudio();
    ring();
    return true;
  }
  if (progress < 0.32) armed = true;
  return false;
}
