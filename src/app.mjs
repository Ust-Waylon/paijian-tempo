import { MetronomeAudio } from './audio.mjs';
import {
  DRUM_PATTERNS,
  DRUM_TRACKS,
  getDrumPattern,
} from '../audio/patterns.mjs';

const $ = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const number = (value, fallback, min, max) =>
  Number.isFinite(Number(value))
    ? clamp(Math.round(Number(value)), min, max)
    : fallback;
const meters = ['free', '1/4', '2/4', '3/4', '4/4', '5/4', '6/8', '7/8'];
const soundNames = {
  wood: '木块',
  electronic: '电子',
  rim: '鼓边',
  soft: '轻敲',
};
const key = 'tempo-studio-v1';
const defaults = {
  bpm: 120,
  meter: '4/4',
  subdivision: 1,
  accents: [2, 1, 1, 1],
  volume: 70,
  muted: false,
  sound: 'wood',
  duration: 0,
  practice: { enabled: false, every: 8, step: 2, target: 160 },
  dark: false,
};

function beatCount(meter) {
  return meter === 'free' ? 4 : Number(meter.split('/')[0]);
}
function defaultAccents(meter) {
  return Array.from({ length: beatCount(meter) }, (_, i) =>
    meter === 'free' ? 1 : i === 0 || (meter === '6/8' && i === 3) ? 2 : 1,
  );
}
function cleanSettings(raw = {}) {
  const meter = meters.includes(raw.meter) ? raw.meter : defaults.meter;
  const fallback = defaultAccents(meter);
  return {
    bpm: number(raw.bpm ?? 120, 120, 30, 240),
    meter,
    subdivision: number(raw.subdivision ?? 1, 1, 1, 4),
    accents: fallback.map((value, i) =>
      number(raw.accents?.[i] ?? value, value, 0, 2),
    ),
    volume: number(raw.volume ?? 70, 70, 0, 100),
    muted: Boolean(raw.muted),
    sound: Object.hasOwn(soundNames, raw.sound) ? raw.sound : 'wood',
    mode: raw.mode === 'drums' ? 'drums' : 'metronome',
    drumPattern: Object.hasOwn(DRUM_PATTERNS, raw.drumPattern)
      ? raw.drumPattern
      : 'rock',
    drumMutes: {
      kick: Boolean(raw.drumMutes?.kick),
      snare: Boolean(raw.drumMutes?.snare),
      hat: Boolean(raw.drumMutes?.hat),
    },
    duration: [0, 300, 600, 900, 1800, 3600].includes(raw.duration)
      ? raw.duration
      : 0,
    practice: {
      enabled: Boolean(raw.practice?.enabled),
      every: number(raw.practice?.every ?? 8, 8, 1, 64),
      step: number(raw.practice?.step ?? 2, 2, 1, 20),
      target: number(raw.practice?.target ?? 160, 160, 30, 240),
    },
    dark: Boolean(raw.dark),
  };
}

const stockPresets = [
  { id: 'slow', name: '慢练', ...cleanSettings({ bpm: 60 }) },
  { id: 'steady', name: '日常', ...cleanSettings({ bpm: 90 }) },
  { id: 'flow', name: '提速', ...cleanSettings({ bpm: 120 }) },
];
let state = cleanSettings();
let hiddenStockPresets = new Set();
let presets = [...stockPresets];
try {
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  if (stored && typeof stored === 'object') {
    state = cleanSettings(stored.settings);
    if (Array.isArray(stored.hiddenStockPresets))
      hiddenStockPresets = new Set(
        stored.hiddenStockPresets.filter((id) =>
          stockPresets.some((p) => p.id === id),
        ),
      );
    presets = [
      ...stockPresets.filter((p) => !hiddenStockPresets.has(p.id)),
      ...(Array.isArray(stored.presets) ? stored.presets : [])
        .filter(
          (p) =>
            p?.custom && typeof p.name === 'string' && typeof p.id === 'string',
        )
        .slice(0, 3)
        .map((p) => ({
          ...cleanSettings(p),
          custom: true,
          id: p.id.slice(0, 80),
          name: p.name.trim().slice(0, 12) || '我的节奏',
        })),
    ];
  }
} catch {
  /* An invalid previous file must not prevent opening the instrument. */
}

let playing = false;
let starting = false;
let elapsed = 0;
let lastTick = null;
let visualQueue = [];
let focusMode = false;
let pinned = false;
let taps = [];
let toastTimer;
let tapTimer;
let tapClassTimer;
let lastDisplayedSecond = -1;
let presetSnapshot = null;
const audio = new MetronomeAudio(onAudioMessage);

function persist() {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        settings: state,
        presets: presets.filter((p) => p.custom),
        hiddenStockPresets: [...hiddenStockPresets],
      }),
    );
    return true;
  } catch {
    toast('当前设置仍可使用，但没有保存成功。请检查本机储存空间。');
    return false;
  }
}
function config() {
  return {
    ...state,
    beats: beatCount(state.meter),
    denominator: state.meter.endsWith('/8') ? 8 : 4,
    volume: state.volume / 100,
  };
}
function configure() {
  audio.configure(config());
  persist();
  renderPresetSelection();
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400);
}
function tempoWords(bpm) {
  if (bpm < 45) return ['Grave', '庄重地'];
  if (bpm < 60) return ['Largo', '宽缓地'];
  if (bpm < 76) return ['Adagio', '从容地'];
  if (bpm < 108) return ['Andante', '行走般的速度'];
  if (bpm < 120) return ['Moderato', '适中地'];
  if (bpm < 168) return ['Allegro', '轻快地'];
  if (bpm < 200) return ['Presto', '急速地'];
  return ['Prestissimo', '极快地'];
}
function polar(radius, angle) {
  const a = (angle * Math.PI) / 180;
  return { x: 200 + radius * Math.cos(a), y: 200 + radius * Math.sin(a) };
}
function arc(radius, start, end) {
  const a = polar(radius, start),
    b = polar(radius, end);
  return `M${a.x} ${a.y} A${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}
function renderDial() {
  const elements = [];
  for (let i = 0; i <= 70; i += 1) {
    const angle = 135 + (i / 70) * 270;
    const major = i % 10 === 0;
    const p1 = polar(major ? 156 : 161, angle),
      p2 = polar(170, angle);
    elements.push(
      `<line class="dial-tick${major ? ' major' : ''}" data-tick-bpm="${30 + i * 3}" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>`,
    );
    if (major) {
      const p = polar(187, angle);
      elements.push(
        `<text class="dial-label" x="${p.x}" y="${p.y}">${30 + i * 3}</text>`,
      );
    }
  }
  $('dialTicks').innerHTML = elements.join('');
  $('dialTrack').setAttribute('d', arc(147, 135, 405));
}
function renderTempo() {
  $('bpmInput').value = String(state.bpm);
  const [italian, description] = tempoWords(state.bpm);
  $('tempoName').textContent = italian;
  $('tempoDescription').textContent = description;
  const angle = 135 + ((state.bpm - 30) / 210) * 270;
  $('dialValue').setAttribute('d', arc(147, 135, Math.max(135.01, angle)));
  const point = polar(147, angle);
  $('dialCap').setAttribute('cx', point.x);
  $('dialCap').setAttribute('cy', point.y);
  $('tempoDial').setAttribute('aria-valuenow', state.bpm);
  $('tempoDial').setAttribute(
    'aria-valuetext',
    `${state.bpm} 拍每分钟，${description}`,
  );
  document
    .querySelectorAll('[data-tick-bpm]')
    .forEach((el) =>
      el.classList.toggle('passed', Number(el.dataset.tickBpm) <= state.bpm),
    );
  $('bpmDown').disabled = state.bpm <= 30;
  $('bpmUp').disabled = state.bpm >= 240;
}
function setBpm(value) {
  state.bpm = number(value, state.bpm, 30, 240);
  renderTempo();
  configure();
}
function renderBeats() {
  const el = $('beatPattern');
  el.style.setProperty('--beats', state.accents.length);
  el.dataset.many = state.accents.length > 5;
  el.replaceChildren(
    ...state.accents.map((accent, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'beat-button';
      button.dataset.accent = accent;
      button.setAttribute(
        'aria-label',
        `第 ${i + 1} 拍：${['静音', '轻音', '重音'][accent]}，点击切换`,
      );
      button.innerHTML = `<span class="beat-number">${i + 1}</span><span class="beat-mark" aria-hidden="true"><i></i>${accent === 2 ? '<i></i>' : ''}</span>`;
      button.addEventListener('click', () => {
        state.accents[i] = (state.accents[i] + 2) % 3;
        button.dataset.accent = state.accents[i];
        button.setAttribute(
          'aria-label',
          `第 ${i + 1} 拍：${['静音', '轻音', '重音'][state.accents[i]]}，点击切换`,
        );
        button.querySelector('.beat-mark').innerHTML =
          '<i></i>' + (state.accents[i] === 2 ? '<i></i>' : '');
        configure();
      });
      return button;
    }),
  );
  $('beatUnit').textContent = state.meter.endsWith('/8')
    ? '♪ = 一拍'
    : '♩ = 一拍';
}
function highlightBeat(index) {
  [...$('beatPattern').children].forEach((el, i) =>
    el.classList.toggle('is-current', i === index),
  );
}
function idleHint() {
  if (state.mode === 'drums')
    return `${getDrumPattern(state.drumPattern).name} · 4/4 · 四分音符 = 一拍`;
  return '跟着你的节奏，慢慢来。';
}
function renderDrumPatterns() {
  $('drumPatterns').replaceChildren(
    ...Object.values(DRUM_PATTERNS).map((pattern) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'drum-pattern-button';
      button.dataset.drumPattern = pattern.id;
      button.setAttribute('aria-label', `${pattern.name}，${pattern.english}`);
      button.title = pattern.description;
      const name = document.createElement('span');
      name.textContent = pattern.name;
      const subtitle = document.createElement('small');
      subtitle.textContent = pattern.english;
      button.append(name, subtitle);
      button.addEventListener('click', () => {
        if (state.drumPattern === pattern.id) return;
        state.drumPattern = pattern.id;
        renderSettings();
        configure();
        if (playing) toast(`${pattern.name}将在下一小节开始。`);
      });
      return button;
    }),
  );
}
function renderDrumControls() {
  const pattern = getDrumPattern(state.drumPattern);
  document
    .querySelectorAll('[data-drum-pattern]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        button.dataset.drumPattern === pattern.id,
      ),
    );
  const grid = $('drumGrid');
  if (grid.dataset.pattern !== pattern.id) {
    grid.dataset.pattern = pattern.id;
    grid.style.setProperty('--steps', 4 * pattern.subdivision);
    grid.setAttribute(
      'aria-label',
      `${pattern.name}的节奏图；${pattern.description}`,
    );
    const counts = document.createElement('div');
    counts.className = 'drum-counts';
    counts.setAttribute('aria-hidden', 'true');
    for (let step = 0; step < 4 * pattern.subdivision; step += 1) {
      const count = document.createElement('span');
      const sub = step % pattern.subdivision;
      count.textContent =
        sub === 0
          ? Math.floor(step / pattern.subdivision) + 1
          : pattern.subdivision === 3
            ? sub === 2
              ? 'a'
              : '·'
            : sub === 2
              ? '&'
              : '·';
      if (sub === 0) count.className = 'main-count';
      counts.append(count);
    }
    grid.replaceChildren(counts);
    for (const track of DRUM_TRACKS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'drum-track-button';
      button.dataset.drumTrack = track.id;
      button.textContent = track.name;
      button.addEventListener('click', () => {
        state.drumMutes[track.id] = !state.drumMutes[track.id];
        renderDrumControls();
        configure();
      });
      const lane = document.createElement('div');
      lane.className = 'drum-lane';
      lane.dataset.track = track.id;
      lane.setAttribute('aria-hidden', 'true');
      for (const [step, velocity] of pattern.tracks[track.id].entries()) {
        const cell = document.createElement('span');
        cell.className = 'drum-step';
        cell.dataset.step = step;
        cell.classList.toggle('on', velocity > 0);
        cell.classList.toggle(
          'open',
          track.id === 'hat' && pattern.openHat.includes(step),
        );
        cell.style.setProperty('--velocity', velocity);
        lane.append(cell);
      }
      grid.append(button, lane);
    }
  }
  for (const track of DRUM_TRACKS) {
    const muted = state.drumMutes[track.id];
    const button = grid.querySelector(`[data-drum-track="${track.id}"]`);
    button.setAttribute('aria-pressed', muted);
    button.setAttribute(
      'aria-label',
      `${track.name}，${muted ? '已静音，点击恢复' : '点击静音'}`,
    );
    button.title = muted ? `恢复${track.name}` : `静音${track.name}`;
    grid
      .querySelector(`[data-track="${track.id}"]`)
      .classList.toggle('muted', muted);
  }
  $('drumDescription').textContent = pattern.description;
  updateDrumPending();
  highlightDrumStep(lastTick);
}
function updateDrumPending() {
  const pending = Boolean(
    playing &&
    lastTick &&
    (lastTick.mode !== state.mode ||
      lastTick.drumPattern !== state.drumPattern),
  );
  $('drumFeel').textContent = pending
    ? '下一小节切换'
    : getDrumPattern(state.drumPattern).feel;
  $('drumFeel').parentElement.classList.toggle('pending', pending);
}
function highlightDrumStep(tick) {
  const active =
    playing &&
    state.mode === 'drums' &&
    tick?.mode === 'drums' &&
    tick.drumPattern === state.drumPattern;
  $('drumGrid')
    .querySelectorAll('.drum-step')
    .forEach((cell) =>
      cell.classList.toggle(
        'is-current',
        Boolean(active && Number(cell.dataset.step) === tick.step),
      ),
    );
}
function renderMode() {
  document.body.classList.toggle('drum-mode', state.mode === 'drums');
  document
    .querySelectorAll('[data-mode]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', button.dataset.mode === state.mode),
    );
  $('soundHeadingLabel').textContent = state.mode === 'drums' ? '音量' : '音色';
  $('soundHeadingEnglish').textContent =
    state.mode === 'drums' ? 'LEVEL' : 'SOUND';
  $('dialHint').textContent =
    state.mode === 'drums' ? '拖动圆环 · 鼓组跟随 BPM' : '拖动圆环调速';
  if (!taps.length) $('tapFeedback').textContent = idleHint();
  renderDrumControls();
}
function renderSettings() {
  renderMode();
  $('meterSelect').value = state.meter;
  $('subdivisionValue').textContent = `每拍 ${state.subdivision} 声`;
  document.querySelectorAll('[data-subdivision]').forEach((el) => {
    const selected = Number(el.dataset.subdivision) === state.subdivision;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', selected);
  });
  document.querySelectorAll('[data-sound]').forEach((el) => {
    const selected = el.dataset.sound === state.sound;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', selected);
  });
  $('volumeInput').value = state.volume;
  $('volumeInput').style.setProperty('--fill', state.volume + '%');
  $('volumeValue').innerHTML =
    `${state.muted ? 0 : state.volume}<span>%</span>`;
  $('muteButton').setAttribute('aria-pressed', state.muted);
  $('muteButton').setAttribute('aria-label', state.muted ? '取消静音' : '静音');
  $('volumeIcon').setAttribute(
    'href',
    state.muted || state.volume === 0 ? '#i-mute' : '#i-volume',
  );
  $('practiceToggle').setAttribute('aria-checked', state.practice.enabled);
  $('practiceSummary').textContent =
    `每 ${state.practice.every} 小节加快 ${state.practice.step} BPM`;
  $('practiceTarget').textContent = `目标 ${state.practice.target} BPM`;
  renderTheme();
}
function renderTheme() {
  document.documentElement.dataset.theme = state.dark ? 'dark' : 'light';
  $('themeButton').setAttribute(
    'aria-label',
    state.dark ? '切换浅色界面' : '切换深色界面',
  );
  $('themeButton').title = state.dark ? '切换浅色界面' : '切换深色界面';
  $('themeButton')
    .querySelector('use')
    .setAttribute('href', state.dark ? '#i-sun' : '#i-moon');
  window.tempoDesktop?.theme(state.dark);
}
function renderTransport() {
  document.body.classList.toggle('playing', playing);
  $('playButton').setAttribute('aria-pressed', playing);
  $('playButton').disabled = starting;
  $('playLabel').textContent = starting
    ? '准备声音…'
    : playing
      ? '暂停练习'
      : elapsed > 0
        ? '继续练习'
        : '开始练习';
  $('playIcon').setAttribute('href', playing ? '#i-pause' : '#i-play');
  $('statusText').textContent = starting
    ? '正在准备'
    : playing
      ? '练习中'
      : elapsed > 0
        ? '已暂停'
        : '准备就绪';
  window.tempoDesktop?.playing(playing);
  if (!playing) {
    highlightBeat(-1);
    highlightDrumStep(null);
    updateDrumPending();
    $('phaseProgress').setAttribute('stroke-dashoffset', 1);
  }
}
function getElapsed() {
  if (playing && lastTick)
    return Math.max(
      elapsed,
      lastTick.elapsed + Math.max(0, audio.audibleTime() - lastTick.audioTime),
    );
  return elapsed;
}
function renderTimer(force = false) {
  const total = state.duration
    ? Math.min(state.duration, getElapsed())
    : getElapsed();
  const second = Math.floor(total);
  if (!force && second === lastDisplayedSecond) return;
  lastDisplayedSecond = second;
  const format = (seconds) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  $('sessionTime').textContent = format(second);
  $('sessionTime').setAttribute(
    'aria-label',
    `已练习 ${Math.floor(second / 60)} 分 ${second % 60} 秒`,
  );
  $('sessionTime').title = state.duration
    ? `定时 ${format(state.duration)} 结束`
    : '只累计播放时间';
  if (state.duration)
    $('sessionTime').textContent += ` / ${format(state.duration)}`;
}
function stop() {
  elapsed = getElapsed();
  playing = false;
  starting = false;
  audio.stop();
  visualQueue = [];
  lastTick = null;
  renderTransport();
  renderTimer(true);
}
async function togglePlay() {
  if (starting) return;
  if (playing) {
    stop();
    return;
  }
  if (state.duration && elapsed >= state.duration) elapsed = 0;
  starting = true;
  renderTransport();
  try {
    const started = await audio.start(config, elapsed);
    if (!started) {
      starting = false;
      renderTransport();
    }
  } catch (error) {
    starting = false;
    playing = false;
    renderTransport();
    console.error('Unable to start audio:', error);
    toast('声音没有启动，请检查音频输出后再点开始。');
  }
}
function onAudioMessage(data) {
  if (data.type === 'started') {
    starting = false;
    playing = true;
    renderTransport();
  }
  if (data.type === 'tick' && playing) {
    visualQueue.push(data);
    if (visualQueue.length > 64) visualQueue.splice(0, visualQueue.length - 8);
  }
  if (data.type === 'tempo') {
    state.bpm = data.bpm;
    renderTempo();
    persist();
    renderPresetSelection();
  }
  if (data.type === 'stopped') {
    elapsed = data.elapsed;
    playing = false;
    starting = false;
    lastTick = null;
    visualQueue = [];
    renderTransport();
    renderTimer(true);
    if (data.reason === 'timer') {
      $('statusText').textContent = '练习完成';
      toast('这一段练习完成了，休息一下吧。');
    }
  }
  if (
    (data.type === 'interrupted' || data.type === 'error') &&
    (playing || starting)
  ) {
    stop();
    toast(data.message || '音频输出已中断。准备好后，点击继续练习。');
  }
}
function animate() {
  if (playing) {
    const now = audio.audibleTime();
    let current;
    while (visualQueue.length && visualQueue[0].audioTime <= now)
      current = visualQueue.shift();
    if (current) {
      const changedBeat =
        !lastTick ||
        current.beat !== lastTick.beat ||
        current.bar !== lastTick.bar;
      lastTick = current;
      highlightDrumStep(current);
      updateDrumPending();
      if (changedBeat) {
        highlightBeat(current.beat);
        $('statusText').textContent =
          `第 ${current.bar} 小节 · ${current.beat + 1} / ${current.beats}`;
      }
    }
    if (lastTick) {
      const beatsSinceTick =
        (Math.max(0, now - lastTick.audioTime) * lastTick.bpm) / 60;
      const progress =
        ((lastTick.beat +
          lastTick.sub / lastTick.subdivision +
          beatsSinceTick) /
          lastTick.beats) %
        1;
      $('phaseProgress').setAttribute('stroke-dashoffset', 1 - progress);
    }
    renderTimer();
  }
  requestAnimationFrame(animate);
}
function presetMatches(p) {
  if (!p.custom && state.mode === 'drums') return p.bpm === state.bpm;
  if (p.mode !== state.mode) return false;
  if (state.mode === 'drums')
    return (
      p.bpm === state.bpm &&
      p.drumPattern === state.drumPattern &&
      DRUM_TRACKS.every(
        (track) => p.drumMutes[track.id] === state.drumMutes[track.id],
      )
    );
  return (
    ['bpm', 'meter', 'subdivision', 'sound'].every((k) => p[k] === state[k]) &&
    p.accents.join() === state.accents.join()
  );
}
function renderPresetSelection() {
  document.querySelectorAll('[data-preset]').forEach((el) => {
    const preset = presets.find((p) => p.id === el.dataset.preset);
    const selected = preset && presetMatches(preset);
    el.classList.toggle('selected', Boolean(selected));
    el.setAttribute('aria-pressed', Boolean(selected));
  });
}
function renderPresets() {
  $('presetList').replaceChildren(
    ...presets.map((p) => {
      const item = document.createElement('div');
      item.className = 'preset-item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset-button';
      button.dataset.preset = p.id;
      button.title =
        p.mode === 'drums'
          ? `${p.name} · ${p.bpm} BPM · ${getDrumPattern(p.drumPattern).name}`
          : `${p.name} · ${p.bpm} BPM · ${p.meter === 'free' ? '自由拍' : p.meter} · 每拍 ${p.subdivision} 声`;
      const name = document.createElement('span');
      name.textContent = p.name;
      const bpm = document.createElement('strong');
      bpm.textContent = p.bpm;
      button.append(name, bpm);
      button.addEventListener('click', () => {
        const tempoOnly = !p.custom && state.mode === 'drums';
        const rhythmChanged =
          !tempoOnly &&
          (p.mode !== state.mode ||
            p.drumPattern !== state.drumPattern ||
            p.meter !== state.meter ||
            p.subdivision !== state.subdivision);
        if (tempoOnly) state.bpm = p.bpm;
        else {
          for (const k of ['bpm', 'meter', 'subdivision', 'sound'])
            state[k] = p[k];
          state.accents = [...p.accents];
          if (p.custom) {
            state.mode = p.mode;
            state.drumPattern = p.drumPattern;
            state.drumMutes = { ...p.drumMutes };
          }
        }
        renderTempo();
        renderSettings();
        renderBeats();
        configure();
        if (playing && rhythmChanged) toast('新的节奏将在下一小节生效。');
      });
      item.append(button);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'preset-delete';
      remove.setAttribute('aria-label', `移除节奏 ${p.name}`);
      remove.title = `移除 ${p.name}`;
      remove.innerHTML = '<svg><use href="#i-close"/></svg>';
      remove.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const previousPresets = presets;
        const previousHidden = new Set(hiddenStockPresets);
        presets = presets.filter((preset) => preset.id !== p.id);
        if (!p.custom) hiddenStockPresets.add(p.id);
        if (!persist()) {
          presets = previousPresets;
          hiddenStockPresets = previousHidden;
          return;
        }
        renderPresets();
        toast(`已移除「${p.name}」`);
      });
      item.append(remove);
      return item;
    }),
  );
  renderPresetSelection();
}
function tapTempo() {
  const now = performance.now();
  if (taps.length && now - taps.at(-1) > 2200) taps = [];
  if (taps.length && now - taps.at(-1) < 100) return;
  taps.push(now);
  if (taps.length > 7) taps.shift();
  if (taps.length > 1) {
    const intervals = taps
      .slice(1)
      .map((time, i) => time - taps[i])
      .sort((a, b) => a - b);
    const measured = intervals.length > 4 ? intervals.slice(1, -1) : intervals;
    const average = measured.reduce((a, b) => a + b, 0) / measured.length;
    setBpm(60000 / average);
    $('tapFeedback').textContent =
      `已拍击 ${taps.length} 次 · ${state.bpm} BPM`;
  } else $('tapFeedback').textContent = '再拍一下，找到你的速度。';
  $('tapButton').classList.add('tapped');
  clearTimeout(tapClassTimer);
  tapClassTimer = setTimeout(
    () => $('tapButton').classList.remove('tapped'),
    140,
  );
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => {
    taps = [];
    $('tapFeedback').textContent = idleHint();
  }, 2500);
}
function toggleFocus(value = !focusMode) {
  focusMode = value;
  document.body.classList.toggle('focus-mode', value);
  $('focusButton').setAttribute('aria-pressed', value);
  $('focusLabel').textContent = value ? '退出专注' : '专注模式';
  $('focusButton')
    .querySelector('use')
    .setAttribute('href', value ? '#i-contract' : '#i-expand');
}
function toggleMute() {
  state.muted = !state.muted;
  renderSettings();
  configure();
}
function openDialog(id) {
  $(id).showModal();
}

$('playButton').addEventListener('click', togglePlay);
document.querySelectorAll('[data-mode]').forEach((button) =>
  button.addEventListener('click', () => {
    if (state.mode === button.dataset.mode) return;
    state.mode = button.dataset.mode;
    renderSettings();
    configure();
    if (playing)
      toast(
        `将在下一小节切换到${state.mode === 'drums' ? '鼓机' : '节拍器'}。`,
      );
  }),
);
$('bpmDown').addEventListener('click', () => setBpm(state.bpm - 1));
$('bpmUp').addEventListener('click', () => setBpm(state.bpm + 1));
$('bpmInput').addEventListener('change', (e) => {
  if (e.target.value.trim()) setBpm(e.target.value);
  else renderTempo();
});
$('bpmInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
  if (e.key === 'Escape') {
    renderTempo();
    e.target.blur();
  }
});
$('bpmInput').addEventListener('focus', (e) => e.target.select());
$('tempoDial').addEventListener('keydown', (e) => {
  $('tempoDial').classList.remove('pointer-focus');
  const map = {
    ArrowUp: 1,
    ArrowRight: 1,
    ArrowDown: -1,
    ArrowLeft: -1,
    PageUp: 10,
    PageDown: -10,
  };
  if (map[e.key]) {
    e.preventDefault();
    e.stopPropagation();
    setBpm(state.bpm + map[e.key] * (e.shiftKey ? 10 : 1));
  }
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    setBpm(e.key === 'Home' ? 30 : 240);
  }
});
let dialPointer = null;
function moveDial(e) {
  if (dialPointer !== e.pointerId) return;
  const rect = $('tempoDial').getBoundingClientRect();
  const x = e.clientX - (rect.left + rect.width / 2),
    y = e.clientY - (rect.top + rect.height / 2);
  let angle = (Math.atan2(y, x) * 180) / Math.PI;
  if (angle < 135) angle += 360;
  if (angle > 405) angle = angle > 450 ? 135 : 405;
  setBpm(30 + ((angle - 135) / 270) * 210);
}
$('tempoDial').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  dialPointer = e.pointerId;
  $('tempoDial').classList.add('pointer-focus');
  $('tempoDial').setPointerCapture(e.pointerId);
  $('tempoDial').focus({ preventScroll: true });
  moveDial(e);
});
$('tempoDial').addEventListener('pointermove', moveDial);
$('tempoDial').addEventListener('blur', () =>
  $('tempoDial').classList.remove('pointer-focus'),
);
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('tempoDial').addEventListener(name, () => {
    dialPointer = null;
  });
$('meterSelect').addEventListener('change', (e) => {
  state.meter = e.target.value;
  state.accents = defaultAccents(state.meter);
  renderBeats();
  configure();
  if (playing) toast('新的拍号将在下一小节生效。');
});
document.querySelectorAll('[data-subdivision]').forEach((el) =>
  el.addEventListener('click', () => {
    state.subdivision = Number(el.dataset.subdivision);
    renderSettings();
    configure();
    if (playing) toast('新的分拍将在下一小节生效。');
  }),
);
document.querySelectorAll('[data-sound]').forEach((el) =>
  el.addEventListener('click', () => {
    state.sound = el.dataset.sound;
    renderSettings();
    configure();
  }),
);
$('volumeInput').addEventListener('input', (e) => {
  state.volume = Number(e.target.value);
  state.muted = false;
  renderSettings();
  configure();
});
$('muteButton').addEventListener('click', toggleMute);
$('tapButton').addEventListener('click', tapTempo);
$('focusButton').addEventListener('click', () => toggleFocus());
$('themeButton').addEventListener('click', () => {
  state.dark = !state.dark;
  renderTheme();
  persist();
});
$('pinButton').addEventListener('click', async () => {
  try {
    pinned = await window.tempoDesktop.pin(!pinned);
    $('pinButton').setAttribute('aria-pressed', pinned);
    $('pinButton').title = pinned ? '取消窗口置顶' : '窗口置顶';
    toast(pinned ? '窗口已置顶。' : '已取消窗口置顶。');
  } catch {
    toast('窗口置顶没有成功，请再试一次。');
  }
});
$('resetSession').addEventListener('click', () => {
  elapsed = 0;
  lastTick = null;
  visualQueue = [];
  audio.reset();
  renderTimer(true);
  renderTransport();
  toast('练习计时已归零。');
});
$('practiceToggle').addEventListener('click', () => {
  if (!state.practice.enabled && state.practice.target <= state.bpm) {
    toast('先把目标速度设得高于当前速度。');
    openPracticeSettings();
    return;
  }
  state.practice.enabled = !state.practice.enabled;
  renderSettings();
  configure();
});
function openPracticeSettings() {
  $('practiceEvery').value = state.practice.every;
  $('practiceStep').value = state.practice.step;
  $('practiceGoal').value = state.practice.target;
  $('durationSelect').value = state.duration;
  $('practiceError').textContent = '';
  openDialog('settingsDialog');
}
$('practiceSettings').addEventListener('click', openPracticeSettings);
$('practiceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const target = Number($('practiceGoal').value);
  if (state.practice.enabled && target <= state.bpm) {
    $('practiceError').textContent = '目标速度需要高于当前速度。';
    $('practiceGoal').focus();
    return;
  }
  state.practice.every = Number($('practiceEvery').value);
  state.practice.step = Number($('practiceStep').value);
  state.practice.target = target;
  state.duration = Number($('durationSelect').value);
  renderSettings();
  configure();
  renderTimer(true);
  $('settingsDialog').close();
  toast('练习设置已保存。');
});
$('addPreset').addEventListener('click', () => {
  if (presets.filter((p) => p.custom).length >= 3) {
    toast('可以保存 3 个自定义节奏。先移除一个，再保存新的。');
    return;
  }
  $('presetName').value = '';
  $('presetError').textContent = '';
  presetSnapshot = cleanSettings(state);
  $('presetDescription').textContent =
    state.mode === 'drums'
      ? `鼓机 · ${getDrumPattern(state.drumPattern).name} · ${state.bpm} BPM`
      : `${state.bpm} BPM · ${state.meter === 'free' ? '自由拍' : state.meter} · 每拍 ${state.subdivision} 声 · ${soundNames[state.sound]}`;
  openDialog('presetDialog');
});
$('presetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('presetName').value.trim();
  if (!name) {
    $('presetError').textContent = '给这个节奏起个名字。';
    return;
  }
  const p = { ...presetSnapshot, name, custom: true, id: crypto.randomUUID() };
  presets.push(p);
  if (persist()) {
    renderPresets();
    $('presetDialog').close();
    toast(`已保存「${name}」`);
  } else presets.pop();
});
$('shortcutsButton').addEventListener('click', () =>
  openDialog('shortcutsDialog'),
);
document
  .querySelectorAll('[data-close]')
  .forEach((el) =>
    el.addEventListener('click', () => el.closest('dialog').close()),
  );
document.querySelectorAll('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      dialog.close();
  }),
);
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest('input,select,textarea,[contenteditable=true]')) return;
  if (e.code === 'Space') {
    if (e.target.closest('button')) return;
    e.preventDefault();
    if (!e.repeat) togglePlay();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    setBpm(state.bpm + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
  } else if (!e.repeat) {
    if (e.key.toLowerCase() === 't') tapTempo();
    if (e.key.toLowerCase() === 'f') toggleFocus();
    if (e.key.toLowerCase() === 'm') toggleMute();
    if (e.key === '?') openDialog('shortcutsDialog');
    if (e.key === 'Escape') toggleFocus(false);
  }
});
window.tempoDesktop?.onAction((action) => {
  if (action === 'play') togglePlay();
  if (action === 'focus') toggleFocus();
  if (action === 'help' && !document.querySelector('dialog[open]'))
    openDialog('shortcutsDialog');
});
if (window.tempoDesktop) {
  document.body.classList.add('desktop');
  document.body.classList.add(`platform-${window.tempoDesktop.platform}`);
}
renderDial();
renderTempo();
renderBeats();
renderDrumPatterns();
renderSettings();
renderPresets();
renderTransport();
renderTimer(true);
requestAnimationFrame(animate);
