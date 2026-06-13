// Web Audio API tone generator — no audio files required
const Sounds = (() => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  function tone(freq, duration, type = 'sine', gain = 0.15, fadeOut = true) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const env = c.createGain();
      osc.connect(env);
      env.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      env.gain.setValueAtTime(gain, c.currentTime);
      if (fadeOut) env.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch (e) {}
  }

  function chord(freqs, duration, gain = 0.1) {
    freqs.forEach(f => tone(f, duration, 'sine', gain));
  }

  return {
    tick()     { tone(880, 0.06, 'square', 0.08); },
    urgentTick(){ tone(1100, 0.08, 'square', 0.12); },
    lock()     { chord([523, 659, 784], 0.25, 0.09); },
    match()    { chord([523, 659, 784, 1047], 0.5, 0.1); },
    noMatch()  { tone(220, 0.3, 'sawtooth', 0.1); },
    win()      { setTimeout(() => chord([523,659,784], 0.2, 0.12), 0); setTimeout(() => chord([659,784,1047], 0.3, 0.12), 220); setTimeout(() => chord([784,1047,1319], 0.5, 0.12), 500); },
    start()    { tone(440, 0.1, 'sine', 0.1); setTimeout(() => tone(880, 0.25, 'sine', 0.12), 120); },
    countdown(){ tone(660, 0.12, 'triangle', 0.1); },
    join()     { chord([440, 550], 0.2, 0.08); },
    kick()     { tone(200, 0.2, 'sawtooth', 0.12); }
  };
})();
