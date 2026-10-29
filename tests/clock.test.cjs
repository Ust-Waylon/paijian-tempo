const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// The harness supplies the real imported pattern data and the worklet-only globals.
const source = fs
  .readFileSync(path.join(__dirname, '../audio/clock-processor.js'), 'utf8')
  .replace("import { DRUM_PATTERNS } from './patterns.mjs';", '');
let DRUM_PATTERNS;
before(async () => {
  ({ DRUM_PATTERNS } = await import('../audio/patterns.mjs'));
});

function engine(config = {}, sampleRate = 48000) {
  const messages = [];
  let Processor;
  const context = vm.createContext({
    sampleRate,
    currentFrame: 0,
    DRUM_PATTERNS,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (m) => messages.push(m) };
      }
    },
    registerProcessor: (_name, Class) => {
      Processor = Class;
    },
  });
  vm.runInContext(source, context);
  const processor = new Processor();
  const send = (data) => processor.port.onmessage({ data });
  send({ type: 'configure', config });
  const block = [new Float32Array(128), new Float32Array(128)];
  function render(seconds, collect = false) {
    const count = Math.ceil((seconds * sampleRate) / 128);
    let peak = 0,
      energy = 0;
    for (let b = 0; b < count; b += 1) {
      processor.process([], [block]);
      context.currentFrame += 128;
      if (collect)
        for (let i = 0; i < 128; i += 1) {
          assert.ok(Number.isFinite(block[0][i]), 'samples stay finite');
          assert.equal(
            block[0][i],
            block[1][i],
            'stereo channels are balanced',
          );
          peak = Math.max(peak, Math.abs(block[0][i]));
          energy += block[0][i] ** 2;
        }
    }
    return { peak, energy, lastBlock: block[0] };
  }
  return {
    processor,
    send,
    render,
    messages,
    ticks: () => messages.filter((m) => m.type === 'tick'),
  };
}

test('fractional sample timing has less than one sample of error over three minutes', () => {
  for (const sampleRate of [44100, 48000]) {
    const e = engine({ bpm: 127, subdivision: 3 }, sampleRate);
    e.send({ type: 'start', transportId: 1 });
    e.render(180);
    const ticks = e.ticks();
    assert.ok(ticks.length > 1100);
    for (let i = 0; i < ticks.length; i += 1) {
      const ideal = (i * 60) / 127 / 3;
      assert.ok(
        Math.abs(ticks[i].audioTime - ideal) <= 1.01 / sampleRate,
        `tick ${i} is sample accurate at ${sampleRate}`,
      );
    }
  }
});

test('all four sounds generate audible, bounded stereo audio', () => {
  for (const sound of ['wood', 'electronic', 'rim', 'soft']) {
    const e = engine({ sound, volume: 1, bpm: 240, subdivision: 4 });
    e.send({ type: 'start' });
    const result = e.render(0.8, true);
    assert.ok(
      result.peak > 0.1 && result.peak < 1,
      sound + ' has safe amplitude',
    );
    assert.ok(result.energy > 5, sound + ' contains audio');
  }
});

test('stop cancels all voices immediately and start resets to beat one', () => {
  const e = engine();
  e.send({ type: 'start', transportId: 1 });
  e.render(0.02);
  e.send({ type: 'stop', transportId: 2 });
  assert.equal(e.render(0.1, true).peak, 0);
  assert.equal(e.processor.running, false);
  assert.equal(e.messages.find((m) => m.type === 'stopped').transportId, 2);
  e.send({ type: 'start', transportId: 3 });
  e.render(0.02);
  assert.equal(e.ticks().at(-1).beat, 0);
  assert.equal(e.ticks().at(-1).bar, 1);
});

test('silent beats and mute produce silence while the clock continues', () => {
  const silent = engine({ accents: [0, 0, 0, 0], subdivision: 4 });
  silent.send({ type: 'start' });
  assert.equal(silent.render(1, true).peak, 0);
  assert.ok(silent.ticks().length >= 8);
  const muted = engine({ muted: true });
  muted.send({ type: 'start' });
  assert.equal(muted.render(1, true).peak, 0);
  assert.ok(muted.ticks().length >= 2);
});

test('rhythm changes wait for the bar boundary', () => {
  const e = engine({ bpm: 120, beats: 4, subdivision: 1 });
  e.send({ type: 'start' });
  e.render(0.6);
  e.send({
    type: 'configure',
    config: { beats: 3, subdivision: 2, accents: [2, 1, 1] },
  });
  e.render(2);
  const before = e.ticks().filter((t) => t.audioTime < 2);
  assert.deepEqual(
    before.map((t) => t.beat),
    [0, 1, 2, 3],
  );
  const after = e.ticks().filter((t) => t.audioTime >= 2);
  assert.equal(after[0].beat, 0);
  assert.equal(after[0].bar, 2);
  assert.ok(after.every((t) => t.beats === 3 && t.subdivision === 2));
  assert.ok(Math.abs(after[1].audioTime - after[0].audioTime - 0.25) < 0.0001);
});

test('progressive practice increases BPM at the configured bar and stops at target', () => {
  const e = engine({
    bpm: 120,
    beats: 2,
    practice: { enabled: true, every: 2, step: 4, target: 126 },
  });
  e.send({ type: 'start' });
  e.render(6);
  assert.deepEqual(
    e.messages.filter((m) => m.type === 'tempo').map((m) => m.bpm),
    [124, 126],
  );
  assert.equal(e.ticks().find((t) => t.bar === 3).bpm, 124);
  assert.equal(e.ticks().find((t) => t.bar === 5).bpm, 126);
});

test('practice timer counts playback only, supports resume, and stops at a sample boundary', () => {
  const e = engine({ duration: 1 });
  e.send({ type: 'start' });
  e.render(0.4);
  e.send({ type: 'stop' });
  const elapsed = e.messages.find((m) => m.type === 'stopped').elapsed;
  e.render(1);
  e.send({ type: 'start', elapsed });
  e.render(0.7);
  const ended = e.messages.filter((m) => m.type === 'stopped').at(-1);
  assert.equal(ended.reason, 'timer');
  assert.equal(ended.elapsed, 1);
  assert.equal(e.render(0.1, true).peak, 0);
});

test('malformed configuration cannot produce nonfinite audio or an unbounded clock', () => {
  const e = engine({
    bpm: NaN,
    beats: Infinity,
    subdivision: -99,
    volume: 'bad',
    accents: [Infinity],
    practice: { every: 0, step: NaN, target: Infinity },
  });
  e.send({ type: 'start' });
  const result = e.render(0.6, true);
  assert.ok(result.peak < 1);
  assert.ok(e.ticks().length < 20);
});

test('rock plays kick on 1 and 3, snare on 2 and 4, and eight hats without a metronome layer', () => {
  const e = engine({
    mode: 'drums',
    drumPattern: 'rock',
    bpm: 120,
    beats: 7,
    denominator: 8,
    subdivision: 1,
  });
  e.send({ type: 'start' });
  e.render(0.01);
  assert.ok(e.processor.voices.every((v) => v.track));
  e.render(2.01);
  const bar = e.ticks().filter((t) => t.bar === 1);
  assert.equal(bar.length, 16);
  assert.deepEqual(
    bar.filter((t) => t.hits.includes('kick')).map((t) => t.step),
    [0, 8],
  );
  assert.deepEqual(
    bar.filter((t) => t.hits.includes('snare')).map((t) => t.step),
    [4, 12],
  );
  assert.deepEqual(
    bar.filter((t) => t.hits.includes('hat')).map((t) => t.step),
    [0, 2, 4, 6, 8, 10, 12, 14],
  );
  assert.ok(
    bar.every(
      (t) => t.beats === 4 && t.denominator === 4 && t.subdivision === 4,
    ),
  );
});

test('all six drum grooves generate finite audible stereo output at slow and fast tempos', () => {
  assert.equal(Object.keys(DRUM_PATTERNS).length, 6);
  for (const drumPattern of Object.keys(DRUM_PATTERNS))
    for (const bpm of [30, 240]) {
      const e = engine({ mode: 'drums', drumPattern, bpm, volume: 1 });
      e.send({ type: 'start' });
      const audio = e.render(1.1, true);
      assert.ok(
        audio.peak > 0.1 && audio.peak < 1,
        `${drumPattern} at ${bpm} has bounded audio`,
      );
      assert.ok(audio.energy > 10, `${drumPattern} at ${bpm} is audible`);
    }
});

test('shuffle has a 2:1 long-short hi-hat feel while BPM still counts quarter notes', () => {
  const e = engine({ mode: 'drums', drumPattern: 'shuffle', bpm: 120 });
  e.send({ type: 'start' });
  e.render(2.01);
  const bar = e.ticks().filter((t) => t.bar === 1);
  const hats = bar.filter((t) => t.hits.includes('hat'));
  assert.equal(bar.length, 12);
  assert.equal(hats.length, 8);
  assert.ok(
    Math.abs(hats[1].audioTime - hats[0].audioTime - 1 / 3) < 1 / 48000,
  );
  assert.ok(
    Math.abs(hats[2].audioTime - hats[1].audioTime - 1 / 6) < 1 / 48000,
  );
  assert.ok(
    Math.abs(e.ticks().find((t) => t.bar === 2).audioTime - 2) < 1 / 48000,
  );
});

test('drum tempo changes do not reset the bar, and retain fractional sample timing', () => {
  const e = engine({ mode: 'drums', drumPattern: 'funk', bpm: 137 });
  e.send({ type: 'start' });
  e.render(8);
  const before = e.ticks();
  for (let i = 0; i < before.length; i++)
    assert.ok(
      Math.abs(before[i].audioTime - (i * 60) / 137 / 4) <= 1.01 / 48000,
    );
  e.send({ type: 'configure', config: { bpm: 93 } });
  e.render(2);
  const changed = e.ticks().filter((t) => t.bpm === 93);
  assert.ok(changed.length > 8);
  assert.ok(changed[0].bar >= before.at(-1).bar);
  for (let i = 1; i < changed.length; i++)
    assert.ok(
      Math.abs(changed[i].audioTime - changed[i - 1].audioTime - 60 / 93 / 4) <=
        1.01 / 48000,
    );
});

test('drum pattern and mode changes wait for a bar boundary and restore metronome meter', () => {
  const e = engine({
    mode: 'drums',
    drumPattern: 'rock',
    bpm: 120,
    beats: 3,
    subdivision: 2,
  });
  e.send({ type: 'start' });
  e.render(0.7);
  e.send({ type: 'configure', config: { drumPattern: 'shuffle' } });
  e.render(1.8);
  assert.ok(
    e
      .ticks()
      .filter((t) => t.audioTime < 2)
      .every((t) => t.drumPattern === 'rock'),
  );
  const firstShuffle = e.ticks().find((t) => t.drumPattern === 'shuffle');
  assert.equal(firstShuffle.step, 0);
  assert.equal(firstShuffle.bar, 2);
  assert.equal(firstShuffle.audioTime, 2);
  e.send({ type: 'configure', config: { mode: 'metronome' } });
  e.render(2);
  const firstClick = e.ticks().find((t) => t.mode === 'metronome');
  assert.equal(firstClick.audioTime, 4);
  assert.equal(firstClick.beats, 3);
  assert.equal(firstClick.subdivision, 2);
});

test('individual drum mutes remove active tails and leave the other drums playing', () => {
  const e = engine({ mode: 'drums', drumPattern: 'rock', bpm: 120 });
  e.send({ type: 'start' });
  e.render(0.01);
  assert.ok(e.processor.voices.some((v) => v.track === 'kick'));
  e.send({ type: 'configure', config: { drumMutes: { kick: true } } });
  assert.ok(e.processor.voices.every((v) => v.track !== 'kick'));
  e.render(2);
  const after = e.ticks().filter((t) => t.audioTime > 0.01);
  assert.ok(after.every((t) => !t.hits.includes('kick')));
  assert.ok(after.some((t) => t.hits.includes('snare')));
  e.send({
    type: 'configure',
    config: { drumMutes: { kick: true, snare: true, hat: true } },
  });
  assert.equal(e.render(0.2, true).peak, 0);
});

test('closed hi-hat chokes open hi-hat, and pause cancels every drum tail', () => {
  const e = engine({ mode: 'drums', drumPattern: 'disco', bpm: 240 });
  e.send({ type: 'start' });
  e.render(0.13);
  assert.ok(e.processor.voices.some((v) => v.track === 'hat' && v.open));
  e.render(0.125);
  const hats = e.processor.voices.filter((v) => v.track === 'hat');
  assert.equal(hats.length, 1);
  assert.equal(hats[0].open, false);
  e.send({ type: 'stop' });
  assert.equal(e.render(0.15, true).peak, 0);
});

test('progressive practice and the playback timer also work in drum mode', () => {
  const e = engine({
    mode: 'drums',
    drumPattern: 'shuffle',
    bpm: 120,
    duration: 3,
    practice: { enabled: true, every: 1, step: 5, target: 130 },
  });
  e.send({ type: 'start' });
  e.render(3.1);
  assert.deepEqual(
    e.messages.filter((m) => m.type === 'tempo').map((m) => m.bpm),
    [125],
  );
  assert.equal(e.ticks().find((t) => t.bar === 2).bpm, 125);
  assert.equal(e.messages.find((m) => m.type === 'stopped').reason, 'timer');
  assert.equal(e.messages.find((m) => m.type === 'stopped').elapsed, 3);
});
