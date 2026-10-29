import { DRUM_PATTERNS } from './patterns.mjs';

/* All timing and synthesis run on the audio thread. No UI timers schedule clicks. */
const finite = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function cleanConfig(input = {}) {
  const beats = clamp(Math.round(finite(input.beats, 4)), 1, 12);
  return {
    bpm: clamp(Math.round(finite(input.bpm, 120)), 30, 240),
    beats,
    denominator: input.denominator === 8 ? 8 : 4,
    subdivision: clamp(Math.round(finite(input.subdivision, 1)), 1, 4),
    accents: Array.from({ length: beats }, (_, i) =>
      clamp(Math.round(finite(input.accents?.[i], i === 0 ? 2 : 1)), 0, 2),
    ),
    volume: clamp(finite(input.volume, 0.7), 0, 1),
    muted: Boolean(input.muted),
    sound: ['wood', 'electronic', 'rim', 'soft'].includes(input.sound)
      ? input.sound
      : 'wood',
    mode: input.mode === 'drums' ? 'drums' : 'metronome',
    drumPattern: Object.hasOwn(DRUM_PATTERNS, input.drumPattern)
      ? input.drumPattern
      : 'rock',
    drumMutes: {
      kick: Boolean(input.drumMutes?.kick),
      snare: Boolean(input.drumMutes?.snare),
      hat: Boolean(input.drumMutes?.hat),
    },
    duration: clamp(finite(input.duration, 0), 0, 7200),
    practice: {
      enabled: Boolean(input.practice?.enabled),
      every: clamp(Math.round(finite(input.practice?.every, 8)), 1, 64),
      step: clamp(Math.round(finite(input.practice?.step, 2)), 1, 20),
      target: clamp(Math.round(finite(input.practice?.target, 160)), 30, 240),
    },
  };
}

class TempoClock extends AudioWorkletProcessor {
  constructor() {
    super();
    this.config = cleanConfig();
    this.rhythm = this.config;
    this.running = false;
    this.gain = 0;
    this.voices = [];
    this.seed = 1234567;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'configure') {
        this.config = cleanConfig({ ...this.config, ...data.config });
        this.voices = this.voices.filter(
          (voice) => !voice.track || !this.config.drumMutes[voice.track],
        );
      }
      if (data.type === 'start') {
        this.transportId = data.transportId;
        this.running = true;
        this.rhythm = this.config;
        this.nextIn = 0;
        this.beat = 0;
        this.sub = 0;
        this.bar = 1;
        this.elapsedFrames = Math.max(0, finite(data.elapsed, 0)) * sampleRate;
        this.voices = [];
        this.post({ type: 'started' });
      }
      if (data.type === 'stop') {
        this.transportId = data.transportId;
        this.stop('pause');
      }
      if (data.type === 'reset') this.elapsedFrames = 0;
    };
  }

  post(data) {
    this.port.postMessage({ ...data, transportId: this.transportId });
  }

  stop(reason) {
    this.running = false;
    this.voices.length = 0;
    this.post({
      type: 'stopped',
      reason,
      elapsed: (this.elapsedFrames || 0) / sampleRate,
    });
  }

  tick(frame) {
    if (this.beat === 0 && this.sub === 0) {
      // Rhythm changes take effect on a bar boundary, without an extra click.
      this.rhythm = { ...this.config, accents: [...this.config.accents] };
      if (this.rhythm.mode === 'drums') {
        this.rhythm.beats = 4;
        this.rhythm.denominator = 4;
        this.rhythm.subdivision =
          DRUM_PATTERNS[this.rhythm.drumPattern].subdivision;
      }
      const p = this.config.practice;
      if (
        p.enabled &&
        this.bar > 1 &&
        (this.bar - 1) % p.every === 0 &&
        this.config.bpm < p.target
      ) {
        this.config.bpm = Math.min(p.target, this.config.bpm + p.step);
        this.post({ type: 'tempo', bpm: this.config.bpm });
      }
    }
    const step = this.beat * this.rhythm.subdivision + this.sub;
    const hits = [];
    if (this.rhythm.mode === 'drums') {
      const pattern = DRUM_PATTERNS[this.rhythm.drumPattern];
      for (const track of ['kick', 'snare', 'hat']) {
        const velocity = pattern.tracks[track][step];
        if (!velocity || this.config.drumMutes[track]) continue;
        const open = track === 'hat' && pattern.openHat.includes(step);
        // The next hi-hat strike closes the previous open or closed hat.
        if (track === 'hat')
          this.voices = this.voices.filter((voice) => voice.track !== 'hat');
        this.voices.push({
          age: 0,
          previousNoise: 0,
          filter1: 0,
          filter2: 0,
          phase: 0,
          track,
          open,
          velocity,
          length:
            sampleRate *
            (track === 'kick'
              ? 0.32
              : track === 'snare'
                ? 0.23
                : open
                  ? 0.24
                  : 0.055),
        });
        hits.push(track);
      }
    } else {
      const sameMeter =
        this.rhythm.beats === this.config.beats &&
        this.rhythm.denominator === this.config.denominator;
      const accents = sameMeter ? this.config.accents : this.rhythm.accents;
      const accent = accents[this.beat] ?? 1;
      if (accent > 0) {
        this.voices.push({
          age: 0,
          previousNoise: 0,
          sound: this.config.sound,
          strength: this.sub === 0 ? accent : 0,
        });
      }
    }
    this.post({
      type: 'tick',
      audioTime: frame / sampleRate,
      beat: this.beat,
      sub: this.sub,
      bar: this.bar,
      beats: this.rhythm.beats,
      denominator: this.rhythm.denominator,
      subdivision: this.rhythm.subdivision,
      bpm: this.config.bpm,
      mode: this.rhythm.mode,
      drumPattern: this.rhythm.drumPattern,
      step,
      hits,
      elapsed: this.elapsedFrames / sampleRate,
    });
    this.sub += 1;
    if (this.sub >= this.rhythm.subdivision) {
      this.sub = 0;
      this.beat += 1;
      if (this.beat >= this.rhythm.beats) {
        this.beat = 0;
        this.bar += 1;
      }
    }
    // Fractional sample remainder is retained: timing error cannot accumulate.
    this.nextIn +=
      (sampleRate * 60) / this.config.bpm / this.rhythm.subdivision;
  }

  voiceSample(voice) {
    const t = voice.age / sampleRate;
    const strong = voice.strength === 2;
    const quiet = voice.strength === 0;
    const level = quiet ? 0.22 : strong ? 0.72 : 0.47;
    const ratio = strong ? 1.32 : quiet ? 0.8 : 1;
    const attack = Math.min(1, voice.age / (sampleRate * 0.0006));
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    const noise = this.seed / 2147483648;
    if (voice.track) {
      const value = this.drumSample(voice, t, noise);
      voice.age += 1;
      return value;
    }
    let value;
    if (voice.sound === 'electronic') {
      value = Math.sin(2 * Math.PI * 1120 * ratio * t) * Math.exp(-t * 125);
    } else if (voice.sound === 'rim') {
      const highNoise = noise - voice.previousNoise * 0.85;
      value =
        highNoise * Math.exp(-t * 230) * 0.65 +
        Math.sin(2 * Math.PI * 420 * ratio * t) * Math.exp(-t * 155) * 0.45;
    } else if (voice.sound === 'soft') {
      value =
        Math.sin(2 * Math.PI * 680 * ratio * t) * Math.exp(-t * 180) * 0.85;
    } else {
      value =
        (Math.sin(2 * Math.PI * 920 * ratio * t) * 0.72 +
          Math.sin(2 * Math.PI * 1470 * ratio * t) * 0.28) *
          Math.exp(-t * 110) +
        noise * Math.exp(-t * 570) * 0.22;
    }
    voice.previousNoise = noise;
    voice.age += 1;
    return value * level * attack;
  }

  drumSample(voice, t, noise) {
    const attack = Math.min(1, voice.age / (sampleRate * 0.0007));
    let value;
    if (voice.track === 'kick') {
      voice.phase +=
        (2 * Math.PI * (49 + 110 * Math.exp(-t * 80))) / sampleRate;
      voice.filter1 += 0.18 * (noise - voice.filter1);
      value =
        Math.sin(voice.phase) * Math.exp(-t * 16) +
        0.13 * Math.sin(voice.phase * 2) * Math.exp(-t * 48) +
        0.28 * voice.filter1 * Math.exp(-t * 380);
      value *= 0.88;
    } else if (voice.track === 'snare') {
      voice.filter1 += 0.65 * (noise - voice.filter1);
      voice.filter2 += 0.14 * (voice.filter1 - voice.filter2);
      const band = voice.filter1 - voice.filter2;
      voice.phase +=
        (2 * Math.PI * (180 + 75 * Math.exp(-t * 65))) / sampleRate;
      value =
        band * Math.exp(-t * 24) * 1.1 +
        Math.sin(voice.phase) * Math.exp(-t * 43) * 0.45 +
        Math.sin(2 * Math.PI * 338 * t) * Math.exp(-t * 58) * 0.13;
      value *= 0.7;
    } else {
      voice.filter1 += 0.36 * (noise - voice.filter1);
      const high = noise - voice.filter1;
      const metal =
        Math.sin(2 * Math.PI * 6420 * t) * Math.sin(2 * Math.PI * 8740 * t);
      value =
        (high * 0.9 + metal * 0.14) *
        Math.exp(-t * (voice.open ? 26 : 115)) *
        0.38;
    }
    return value * voice.velocity * attack;
  }

  process(_inputs, outputs) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    const target = this.config.muted ? 0 : this.config.volume;
    for (let i = 0; i < channels[0].length; i += 1) {
      let value = 0;
      if (this.running) {
        if (
          this.config.duration &&
          this.elapsedFrames >= Math.round(this.config.duration * sampleRate)
        ) {
          this.stop('timer');
        } else {
          if (this.nextIn <= 0) this.tick(currentFrame + i);
          this.nextIn -= 1;
          this.elapsedFrames += 1;
        }
      }
      this.gain += (target - this.gain) * 0.004;
      for (let v = this.voices.length - 1; v >= 0; v -= 1) {
        value += this.voiceSample(this.voices[v]);
        if (this.voices[v].age > (this.voices[v].length || sampleRate * 0.085))
          this.voices.splice(v, 1);
      }
      value = Math.tanh(value * this.gain);
      for (let c = 0; c < channels.length; c += 1) channels[c][i] = value;
    }
    return true;
  }
}

registerProcessor('tempo-clock', TempoClock);
