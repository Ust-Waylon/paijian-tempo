const lane = (length, hits) => {
  const values = Array(length).fill(0);
  for (const hit of hits) {
    const [step, velocity] = Array.isArray(hit) ? hit : [hit, 1];
    values[step] = velocity;
  }
  return Object.freeze(values);
};
const eighths = [
  [0, 0.8],
  [2, 0.48],
  [4, 0.64],
  [6, 0.48],
  [8, 0.76],
  [10, 0.48],
  [12, 0.64],
  [14, 0.48],
];

// Original one-bar practice grooves. BPM always counts quarter notes, including shuffle.
export const DRUM_PATTERNS = Object.freeze({
  rock: Object.freeze({
    id: 'rock',
    name: '基础摇滚',
    english: 'Rock',
    feel: '八分踩镲',
    subdivision: 4,
    description: '底鼓在 1、3 拍，军鼓在 2、4 拍。',
    tracks: Object.freeze({
      kick: lane(16, [0, [8, 0.9]]),
      snare: lane(16, [
        [4, 0.88],
        [12, 0.95],
      ]),
      hat: lane(16, eighths),
    }),
    openHat: Object.freeze([]),
  }),
  pop: Object.freeze({
    id: 'pop',
    name: '流行反拍',
    english: 'Pop',
    feel: '切分底鼓',
    subdivision: 4,
    description: '切分底鼓加一点推动感，末拍轻轻开镲。',
    tracks: Object.freeze({
      kick: lane(16, [0, [6, 0.72], [8, 0.92]]),
      snare: lane(16, [
        [4, 0.86],
        [12, 0.94],
      ]),
      hat: lane(16, eighths),
    }),
    openHat: Object.freeze([14]),
  }),
  funk: Object.freeze({
    id: 'funk',
    name: '轻放克',
    english: 'Funk',
    feel: '十六分踩镲',
    subdivision: 4,
    description: '十六分踩镲、切分底鼓，配一记轻军鼓。',
    tracks: Object.freeze({
      kick: lane(16, [0, [7, 0.7], [10, 0.87]]),
      snare: lane(16, [
        [4, 0.9],
        [12, 0.97],
        [15, 0.26],
      ]),
      hat: lane(
        16,
        Array.from({ length: 16 }, (_, i) => [
          i,
          i % 4 === 0 ? 0.62 : i % 2 === 0 ? 0.45 : 0.24,
        ]),
      ),
    }),
    openHat: Object.freeze([]),
  }),
  disco: Object.freeze({
    id: 'disco',
    name: '四拍迪斯科',
    english: 'Disco',
    feel: '四拍底鼓',
    subdivision: 4,
    description: '每拍都有底鼓，反拍开镲带出舞曲律动。',
    tracks: Object.freeze({
      kick: lane(16, [0, [4, 0.92], [8, 0.96], [12, 0.92]]),
      snare: lane(16, [
        [4, 0.8],
        [12, 0.87],
      ]),
      hat: lane(16, [
        [0, 0.24],
        [2, 0.62],
        [4, 0.24],
        [6, 0.62],
        [8, 0.24],
        [10, 0.62],
        [12, 0.24],
        [14, 0.62],
      ]),
    }),
    openHat: Object.freeze([2, 6, 10, 14]),
  }),
  shuffle: Object.freeze({
    id: 'shuffle',
    name: '布鲁斯摇摆',
    english: 'Shuffle',
    feel: '三连音摆动',
    subdivision: 3,
    description: '长、短交替的 Shuffle，BPM 仍以四分音符计。',
    tracks: Object.freeze({
      kick: lane(12, [0, [6, 0.9]]),
      snare: lane(12, [
        [3, 0.86],
        [9, 0.94],
      ]),
      hat: lane(12, [
        [0, 0.76],
        [2, 0.43],
        [3, 0.6],
        [5, 0.4],
        [6, 0.72],
        [8, 0.43],
        [9, 0.6],
        [11, 0.4],
      ]),
    }),
    openHat: Object.freeze([]),
  }),
  halftime: Object.freeze({
    id: 'halftime',
    name: '半拍律动',
    english: 'Half-time',
    feel: '军鼓落在第 3 拍',
    subdivision: 4,
    description: '军鼓落在第 3 拍，同样的 BPM，更舒展的律动。',
    tracks: Object.freeze({
      kick: lane(16, [0, [6, 0.64], [10, 0.84]]),
      snare: lane(16, [[8, 0.96]]),
      hat: lane(16, eighths),
    }),
    openHat: Object.freeze([]),
  }),
});

export const DRUM_TRACKS = Object.freeze([
  Object.freeze({ id: 'kick', name: '底鼓' }),
  Object.freeze({ id: 'snare', name: '军鼓' }),
  Object.freeze({ id: 'hat', name: '踩镲' }),
]);

export const getDrumPattern = (id) =>
  Object.hasOwn(DRUM_PATTERNS, id) ? DRUM_PATTERNS[id] : DRUM_PATTERNS.rock;
