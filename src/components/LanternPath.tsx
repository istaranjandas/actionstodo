// The Lantern Path on the phone: the day is a trail through a valley and every task is a lantern on it.
// The focus lantern burns down for the task you are on, the path scrolls sideways through the day
// (time is distance), and lighting a lantern marks its task done. Everything reads live task data.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, Check, Clock3, Repeat2 } from 'lucide-react';
import { setTaskCompleted } from '../modules/taskActions';
import { taskDuration } from '../modules/listDrag';
import { formatTimeRangeDisplay } from '../modules/timeUtils';
import { addDays, parseISODate } from '../modules/dateUtils';
import { useTaskSelection } from './TaskSelection';
import type { Task, Theme } from '../types';

export const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const clock12 = (m: number) => {
  const total = Math.round(m);
  const h = Math.floor(total / 60) % 24;
  return `${h % 12 || 12}:${String(total % 60).padStart(2, '0')}`;
};
const period = (m: number) => (Math.floor(Math.round(m) / 60) % 24 >= 12 ? 'PM' : 'AM');
export const time12 = (m: number) => `${clock12(m)} ${period(m)}`;

export const minutesLabel = (m: number) => {
  const mins = Math.max(1, Math.round(m));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
};

// Milliseconds since local midnight, ticking every second while a lantern is burning
export function useSecondClock(active: boolean): number {
  const read = () => {
    const d = new Date();
    return ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(read());
    tick();
    if (!active) return;
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
}

// Tasks that were just ticked done, so their lanterns can play the ignite once
function useJustLit(tasks: Task[]): Set<string> {
  const previous = useRef<Map<string, boolean> | null>(null);
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const before = previous.current;
    previous.current = new Map(tasks.map(t => [t.id, t.completed]));
    if (!before) return;
    const fresh = tasks.filter(t => t.completed && before.get(t.id) === false).map(t => t.id);
    if (!fresh.length) return;
    setLit(current => new Set([...current, ...fresh]));
    window.setTimeout(() => {
      setLit(current => {
        const next = new Set(current);
        fresh.forEach(id => next.delete(id));
        return next;
      });
    }, 1300);
  }, [tasks]);
  return lit;
}

// ---------- Seeded valley shapes ----------

export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function ridgeYAt(x: number, base: number, amp: number, seed: number, freq = 1) {
  return base - amp * (0.52 * Math.sin(x * 0.0052 * freq + seed) + 0.3 * Math.sin(x * 0.0121 * freq + seed * 1.7) + 0.18 * Math.sin(x * 0.029 * freq + seed * 2.9));
}

function ridgePath(width: number, height: number, base: number, amp: number, seed: number, freq = 1, step = 6) {
  let d = `M0,${height}`;
  for (let x = 0; x <= width + step; x += step) d += ` L${x},${ridgeYAt(x, base, amp, seed, freq).toFixed(1)}`;
  return `${d} L${width + step},${height} Z`;
}

const treePath = (x: number, y: number, h: number, w: number) =>
  `M${x},${y - h} C${x + w * 0.18},${y - h * 0.62} ${x + w * 0.52},${y - h * 0.28} ${x + w * 0.36},${y} L${x - w * 0.36},${y} C${x - w * 0.52},${y - h * 0.28} ${x - w * 0.18},${y - h * 0.62} ${x},${y - h} Z`;

const STARS = (() => {
  const r = seeded(7);
  return Array.from({ length: 46 }, (_, i) => ({
    x: r() * 100,
    y: r() * 62,
    r: r() * 0.9 + 0.35,
    o: 0.45 + r() * 0.55,
    twinkle: i % 6 === 0 ? r() * 4 : null
  }));
})();

export function LanternSky() {
  return (
    <div className="lp-sky" aria-hidden="true">
      <div className="lp-sky-l lp-sky-day" />
      <div className="lp-sky-l lp-sky-night" />
      <svg className="lp-stars" width="100%" height="100%">
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x.toFixed(2)}%`}
            cy={`${s.y.toFixed(2)}%`}
            r={s.r.toFixed(2)}
            opacity={s.o.toFixed(2)}
            className={s.twinkle === null ? undefined : 'lp-twinkle'}
            style={s.twinkle === null ? undefined : { animationDelay: `${s.twinkle.toFixed(2)}s` }}
          />
        ))}
      </svg>
    </div>
  );
}

// ---------- Header: the horizon dial ----------

export function HorizonDial({ theme, onSetTheme }: { theme: Theme; onSetTheme: (theme: Theme) => void }) {
  const isNight = theme === 'dark';
  return (
    <button
      type="button"
      className="lp-dial"
      aria-label={isNight ? 'Night path. Switch to day' : 'Day path. Switch to night'}
      title={isNight ? 'Switch to day' : 'Switch to night'}
      data-sfx={isNight ? 'toggleOff' : 'toggleOn'}
      onClick={() => onSetTheme(isNight ? 'light' : 'dark')}
    >
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <defs>
          <clipPath id="lp-dial-clip">
            <circle cx="14" cy="14" r="13" />
          </clipPath>
        </defs>
        <g clipPath="url(#lp-dial-clip)">
          <rect className="lp-dial-sky" x="0" y="0" width="28" height="28" />
          <g className="lp-dial-wheel">
            <circle cx="14" cy="9.5" r="4.6" fill="#E8A23C" />
            <g transform="rotate(180 14 20)">
              <circle cx="14" cy="9.5" r="4.4" fill="#ECE4CB" />
              <circle cx="12.4" cy="8.6" r="1" fill="#D4C9A8" />
              <circle cx="15.6" cy="10.8" r="0.7" fill="#D4C9A8" />
            </g>
          </g>
          <path className="lp-dial-ground" d="M0,19 Q7,16.5 14,18.5 T28,17.5 V28 H0 Z" />
        </g>
        <circle cx="14" cy="14" r="13" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" />
      </svg>
      <span>{isNight ? 'Night' : 'Day'}</span>
    </button>
  );
}

// ---------- Focus: the lantern you stand under ----------

export type FocusState = 'running' | 'ready' | 'missed' | 'rest' | 'empty';

interface FocusModel {
  state: FocusState;
  task?: Task;
  start: number;
  duration: number;
}

export function readFocus(timed: Task[], nowMinutes: number): FocusModel {
  const start = (t: Task) => toMinutes(t.startTime);
  const current = timed.find(t => !t.completed && start(t) <= nowMinutes && start(t) + taskDuration(t) > nowMinutes);
  if (current) return { state: 'running', task: current, start: start(current), duration: taskDuration(current) };
  const next = timed.find(t => !t.completed && start(t) > nowMinutes);
  if (next) return { state: 'ready', task: next, start: start(next), duration: taskDuration(next) };
  // Nothing left ahead: the latest lantern whose time passed unlit, else the day is done
  const missed = [...timed].reverse().find(t => !t.completed);
  if (missed) return { state: 'missed', task: missed, start: start(missed), duration: taskDuration(missed) };
  return { state: timed.length ? 'rest' : 'empty', start: 0, duration: 30 };
}

const CANDLE_TOP = 98;
const CANDLE_BOTTOM = 156;

export function Waypost({ state, left, bloom }: { state: FocusState; left: number; bloom: boolean }) {
  // The candle burns from full to a stub; a lantern waiting to start shows a fresh one
  const height = state === 'running' ? 8 + (CANDLE_BOTTOM - CANDLE_TOP - 8) * left : CANDLE_BOTTOM - CANDLE_TOP;
  const y = CANDLE_BOTTOM - height;
  const lit = state === 'rest';
  const wayState = bloom ? 'lit' : lit ? 'rest' : state === 'running' ? 'running' : 'ready';
  return (
    <svg className={`lp-waypost ${bloom ? 'is-bloom' : ''}`} data-state={wayState} viewBox="0 0 150 330" aria-hidden="true">
      <defs>
        <radialGradient id="lp-gA" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFCC72" stopOpacity=".9" />
          <stop offset=".5" stopColor="#FFB24A" stopOpacity=".32" />
          <stop offset="1" stopColor="#FFB24A" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-gJ" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#B8F5D9" stopOpacity=".9" />
          <stop offset=".5" stopColor="#7BDDB2" stopOpacity=".3" />
          <stop offset="1" stopColor="#7BDDB2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-gHA" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFC066" stopOpacity=".55" />
          <stop offset=".4" stopColor="#F7A846" stopOpacity=".18" />
          <stop offset="1" stopColor="#F7A846" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-gHJ" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#A6F0CF" stopOpacity=".5" />
          <stop offset=".4" stopColor="#7BDDB2" stopOpacity=".16" />
          <stop offset="1" stopColor="#7BDDB2" stopOpacity="0" />
        </radialGradient>
        <clipPath id="lp-glass-clip">
          <path d="M37,73 L87,73 L83,160 L41,160 Z" />
        </clipPath>
      </defs>
      <circle className="lp-orb-sun" cx="62" cy="116" r="54" />
      <g className="lp-orb-moon">
        <circle cx="62" cy="112" r="38" />
        <circle className="lp-crater" cx="50" cy="102" r="6" />
        <circle className="lp-crater" cx="74" cy="120" r="4.5" />
        <circle className="lp-crater" cx="66" cy="96" r="3" />
      </g>
      <circle className="lp-bighalo" cx="62" cy="118" r="120" fill="url(#lp-gHA)" />
      <circle className="lp-bighalo-j" cx="62" cy="118" r="120" fill="url(#lp-gHJ)" />
      <path className="lp-iron-s" d="M127,18 V330" strokeWidth="6" />
      <circle className="lp-iron" cx="127" cy="13" r="4.5" />
      <path className="lp-iron-s" d="M130,27 H54" strokeWidth="4" strokeLinecap="round" />
      <path className="lp-iron-s" d="M127,58 C112,56 98,46 94,28" strokeWidth="2.4" />
      <path className="lp-iron-s" d="M54,27 c-4,0 -5,-5 -1,-6" strokeWidth="2.4" strokeLinecap="round" />
      <g className="lp-swing">
        <path className="lp-iron-s" d="M62,27 V40" strokeWidth="2" />
        <circle className="lp-iron-s" cx="62" cy="44.5" r="4.6" strokeWidth="2.4" />
        <path className="lp-iron" d="M40,66 L62,50 L84,66 Z" />
        <rect className="lp-iron" x="33" y="65" width="58" height="8" rx="2" />
        <path className="lp-glass" d="M37,73 L87,73 L83,160 L41,160 Z" />
        <g clipPath="url(#lp-glass-clip)">
          <ellipse className="lp-bigglow" cx="62" cy="116" rx="44" ry="60" fill="url(#lp-gA)" />
          <ellipse className="lp-bigglow-j" cx="62" cy="116" rx="46" ry="62" fill="url(#lp-gJ)" />
          <g className="lp-candle">
            <rect className="lp-wax" x="53" y={y} width="18" height={height} rx="3" />
            <rect className="lp-wax-s" x="65" y={y} width="6" height={height} rx="2" />
          </g>
          <g className="lp-flame-wrap" transform={`translate(0,${y})`}>
            <path d="M62,0 V-5" stroke="#3A2A18" strokeWidth="1.4" strokeLinecap="round" />
            <g className="lp-bf">
              <path className="lp-bf-o" d="M62,-26 C67,-19 70,-12 69,-7 C68,-2 65,0 62,0 C59,0 56,-2 55,-7 C54,-12 57,-19 62,-26 Z" />
              <path className="lp-bf-c" d="M62,-15 C64.6,-11 65.4,-8 64.8,-5 C64.3,-2.6 63.2,-1.6 62,-1.6 C60.8,-1.6 59.7,-2.6 59.2,-5 C58.6,-8 59.4,-11 62,-15 Z" />
            </g>
            <path className="lp-smoke" d="M62,-6 c-3,-4 3,-7 0,-11 c-2,-3 2,-5 0,-8" />
          </g>
          <circle className="lp-big-ring" cx="62" cy="112" r="20" />
        </g>
        <path className="lp-iron-s" d="M47,73 L49.5,160 M77,73 L74.5,160" strokeWidth="1.4" opacity=".55" />
        {/* Etched marks every sixth of the burn */}
        {[1, 2, 3, 4, 5].map(k => {
          const ty = CANDLE_TOP + ((CANDLE_BOTTOM - CANDLE_TOP) * k) / 6;
          return <line key={k} className="lp-tick" x1="88" x2={k === 3 ? 95 : 92} y1={ty} y2={ty} />;
        })}
        <path className="lp-iron" d="M37,159 L87,159 L80,172 L44,172 Z" />
        <rect className="lp-iron" x="49" y="171" width="26" height="5" rx="1.5" />
      </g>
    </svg>
  );
}

export function LanternFocus({ timed, today }: { timed: Task[]; today: string }) {
  const { openTask } = useTaskSelection();
  const nowMs = useSecondClock(true);
  const nowMinutes = nowMs / 60000;
  const focus = readFocus(timed, nowMinutes);
  const [bloom, setBloom] = useState(false);
  const bloomTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(bloomTimer.current), []);

  const end = focus.start + focus.duration;
  const leftMs = Math.max(0, (end - nowMinutes) * 60000);
  const leftFraction = focus.state === 'running' ? Math.min(1, leftMs / (focus.duration * 60000)) : 1;
  const secondsLeft = Math.ceil(leftMs / 1000);
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const markDone = (task: Task) => {
    window.clearTimeout(bloomTimer.current);
    setBloom(true);
    bloomTimer.current = window.setTimeout(() => setBloom(false), 1250);
    setTaskCompleted(task, true);
  };

  let copy: ReactNode;
  if (focus.task) {
    const task = focus.task;
    const window_ = formatTimeRangeDisplay(task.startTime, task.endTime);
    copy = (
      <>
        <h2 className="lp-focus-title" id="lp-focus-title">{task.text}</h2>
        <p className="lp-window">
          <Clock3 size={14} strokeWidth={2} aria-hidden="true" />
          <span>{window_}</span>
        </p>
        {focus.state === 'running' ? (
          <p className="lp-clock" aria-label={`${minutesLabel(leftMs / 60000)} left`}>
            <span className="lp-mmss">{mmss}</span>
            <span className="lp-unit">
              left
              <br />
              of {minutesLabel(focus.duration)}
            </span>
          </p>
        ) : focus.state === 'missed' ? (
          <p className="lp-clock is-waiting">
            <span className="lp-unit">
              Its time has passed,
              <br />
              <b>still unlit</b>
            </span>
          </p>
        ) : (
          <p className="lp-clock is-waiting">
            <span className="lp-unit">
              Next on the path
              <br />
              starts in <b>{minutesLabel(focus.start - nowMinutes)}</b>
            </span>
          </p>
        )}
      </>
    );
  } else if (focus.state === 'rest') {
    copy = (
      <>
        <h2 className="lp-focus-title" id="lp-focus-title">Every lantern on today&rsquo;s path is lit</h2>
        <p className="lp-window">Rest, or place one more below.</p>
      </>
    );
  } else {
    copy = (
      <>
        <h2 className="lp-focus-title" id="lp-focus-title">No lanterns on today&rsquo;s path yet</h2>
        <p className="lp-window">Place one below, like &ldquo;Gym at 6pm&rdquo;.</p>
      </>
    );
  }

  return (
    <section className="lp-focus" aria-labelledby="lp-focus-title" data-today={today}>
      <Waypost state={focus.state} left={leftFraction} bloom={bloom} />
      <div className="lp-focus-copy" key={focus.task?.id ?? focus.state}>
        {copy}
      </div>
      {focus.task && (
        <div className="lp-focus-actions">
          <button type="button" className="lp-btn lp-btn-amber" data-sfx="none" onClick={() => markDone(focus.task!)}>
            <Check size={19} strokeWidth={2.2} aria-hidden="true" />
            Mark done
          </button>
          <button type="button" className="lp-btn lp-btn-chip" data-sfx="open" onClick={() => openTask(focus.task!.id)}>
            Details
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- The path ----------

const PX = 140; // pixels per hour
const LP = 70;
const RP = 190;
const PH = 262;
const RY = PH - 10;

const pathY = (x: number) => 150 + 9 * Math.sin(x / 190 + 0.6) + 5 * Math.sin(x / 71 + 2.1);
const hillY = (x: number) => pathY(x) - 15 + 2.2 * Math.sin(x / 23);

function trailD(x0: number, x1: number, step = 6) {
  let d = `M${x0.toFixed(1)},${pathY(x0).toFixed(1)}`;
  for (let x = x0 + step; x < x1; x += step) d += ` L${x.toFixed(1)},${pathY(x).toFixed(1)}`;
  return `${d} L${x1.toFixed(1)},${pathY(x1).toFixed(1)}`;
}

function MiniLantern() {
  return (
    <svg className="lp-ml" viewBox="0 0 44 92" width="44" height="92" aria-hidden="true">
      <path className="lp-ml-post" d="M10,93 V15 Q10,6 18,6 Q26,6 26,13" />
      <circle className="lp-ml-ring" cx="26" cy="16" r="2.6" />
      <path className="lp-ml-iron" d="M19,24.5 L26,19.6 L33,24.5 Z" />
      <rect className="lp-ml-iron" x="17.4" y="23.6" width="17.2" height="3.4" rx="1" />
      <path className="lp-ml-glass" d="M19.4,27 L32.6,27 L31.4,45 L20.6,45 Z" />
      <path className="lp-ml-tint" d="M19.4,27 L32.6,27 L31.4,45 L20.6,45 Z" />
      <g className="lp-ml-flame">
        <path className="fo" d="M26,30 C28.8,33.6 29.8,36.8 29.2,39.5 C28.7,41.9 27.4,43 26,43 C24.6,43 23.3,41.9 22.8,39.5 C22.2,36.8 23.2,33.6 26,30 Z" />
        <path className="fc" d="M26,35.4 C27.3,37.2 27.7,38.9 27.4,40.3 C27.1,41.5 26.6,42 26,42 C25.4,42 24.9,41.5 24.6,40.3 C24.3,38.9 24.7,37.2 26,35.4 Z" />
      </g>
      <circle className="lp-ml-burst" cx="26" cy="36" r="9" />
      <path className="lp-ml-iron" d="M18.6,44.6 L33.4,44.6 L31,50 L21,50 Z" />
    </svg>
  );
}

interface PanoramaProps {
  timed: Task[];
  isToday: boolean;
  tasks: Task[];
  // Desktop: how far the day slate reaches over the path from its left edge (px). The traveller stands in
  // the open part, and lanterns and hour labels that slide under the slate fade out.
  cover?: number;
  // Desktop: extra trail before the first hour, so early lanterns can still be walked clear of the slate
  leadIn?: number;
  // Desktop: the mouse wheel and a drag walk the path sideways
  pointerWalk?: boolean;
}

export function LanternPanorama({ timed, isToday, tasks, cover = 0, leadIn = 0, pointerWalk = false }: PanoramaProps) {
  const { openTask } = useTaskSelection();
  const nowMs = useSecondClock(isToday);
  const nowMinutes = nowMs / 60000;
  const focus = isToday ? readFocus(timed, nowMinutes) : null;
  const justLit = useJustLit(tasks);
  const scroller = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(SVGSVGElement | null)[]>([]);
  const [viewWidth, setViewWidth] = useState(390);
  const [showBack, setShowBack] = useState(false);

  // The range always covers 6 AM to 11 PM and stretches for anything outside it
  const { h0, h1, width } = useMemo(() => {
    const starts = timed.map(t => toMinutes(t.startTime));
    const ends = timed.map(t => toMinutes(t.startTime) + taskDuration(t));
    const from = Math.min(6, Math.floor(Math.min(6 * 60, ...starts) / 60));
    const to = Math.max(23, Math.ceil(Math.max(23 * 60, ...ends) / 60));
    return { h0: from, h1: to, width: LP + leadIn + (to - from) * PX + RP };
  }, [timed, leadIn]);
  const xOf = (m: number) => LP + leadIn + (m / 60 - h0) * PX;
  // Where you stand on screen: a little left of the middle of the part of the path you can see
  const standAt = (el: HTMLElement) => cover + (el.clientWidth - cover) * 0.42;

  const travellerX = useMemo(() => {
    if (!isToday) return null;
    if (focus?.state === 'running') {
      const p = Math.min(1, Math.max(0, (nowMinutes - focus.start) / focus.duration));
      return xOf(focus.start) + p * (xOf(focus.start + focus.duration) - xOf(focus.start));
    }
    if (focus?.state === 'ready') return Math.max(xOf(nowMinutes), xOf(focus.start) - 120);
    return xOf(Math.min(Math.max(nowMinutes, h0 * 60), h1 * 60));
  }, [isToday, focus?.state, focus?.start, focus?.duration, Math.floor(nowMinutes / 0.25), h0, h1, leadIn]);

  const layers = useMemo(() => {
    const spec = [
      { f: 0.12, cls: 'r1', base: 92, amp: 34, seed: 1.1, freq: 0.7, trees: 0 },
      { f: 0.3, cls: 'r2', base: 140, amp: 26, seed: 2.6, freq: 1, trees: 0.5 },
      { f: 0.58, cls: 'r3', base: 180, amp: 18, seed: 3.9, freq: 1.4, trees: 1 }
    ];
    return spec.map(layer => {
      const w = Math.ceil(viewWidth + (width - viewWidth) * layer.f + 80);
      let d = ridgePath(w, 362, layer.base, layer.amp, layer.seed, layer.freq);
      if (layer.trees) {
        const r = seeded(Math.floor(layer.seed * 100));
        for (let x = 30 + r() * 60; x < w; x += (layer.trees === 1 ? 46 : 80) + r() * 150) {
          const y = ridgeYAt(x, layer.base, layer.amp, layer.seed, layer.freq) + 4;
          const h = (layer.trees === 1 ? 26 : 16) + r() * (layer.trees === 1 ? 22 : 12);
          d += ` ${treePath(x, y, h, h * 0.42)}`;
          if (r() > 0.55) d += ` ${treePath(x + h * 0.32, y + 2, h * 0.7, h * 0.32)}`;
        }
      }
      return { ...layer, w, d };
    });
  }, [viewWidth, width]);

  const fireflies = useMemo(() => {
    const r = seeded(99);
    return Array.from({ length: 7 }, () => ({
      left: r() * 100,
      top: 150 + r() * 90,
      fx: (r() - 0.5) * 40,
      fy: (r() - 0.5) * 30,
      d: 3 + r() * 4
    }));
  }, []);

  const parallax = () => {
    const el = scroller.current;
    if (!el) return;
    const sl = el.scrollLeft;
    layers.forEach((layer, i) => {
      const node = layerRefs.current[i];
      if (node) node.style.transform = `translate3d(${(-sl * layer.f).toFixed(1)}px,0,0)`;
    });
    if (travellerX !== null) setShowBack(travellerX < sl + cover + 20 || travellerX > sl + el.clientWidth - 20);
    // Under the desktop slate: a lantern, label or hour hides as soon as its left side reaches the slate,
    // so nothing peeks out of the slate's edge or shows half its name
    if (cover > 0 || el.querySelector('.is-covered')) {
      const edge = cover > 0 ? sl + cover : -Infinity;
      el.querySelectorAll<HTMLElement | SVGElement>('[data-x]').forEach(node => {
        // A lantern's glow and pool of light go with it
        const halfWidth = node.matches('.lp-stop, .lp-halo, .lp-pool') ? 68 : node.classList.contains('lp-traveller') ? 15 : 16;
        node.classList.toggle('is-covered', Number(node.dataset.x) - halfWidth < edge);
      });
    }
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewWidth(el.clientWidth || 390);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Arrive where you stand (or at the first lantern on another day)
  const anchor = travellerX ?? (timed.length ? xOf(toMinutes(timed[0].startTime)) : xOf(9 * 60));
  const anchorKey = `${isToday}-${timed[0]?.date ?? ''}`;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, anchor - standAt(el));
    parallax();
  }, [anchorKey, viewWidth, cover, leadIn]);

  // Layout effect, so lanterns under the desktop slate are hidden before the frame paints
  useLayoutEffect(parallax);

  // Desktop: the wheel walks the path sideways and a mouse drag pulls it along
  useEffect(() => {
    const el = scroller.current;
    if (!pointerWalk || !el) return;
    let drag: { x: number; left: number; moved: boolean } | null = null;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) {
        drag.moved = true;
        el.classList.add('is-dragging');
      }
      if (drag.moved) el.scrollLeft = drag.left - dx;
    };
    // The click that ends a drag lands on the scroller, not on a lantern; the class lifts right after
    const onUp = () => {
      if (drag?.moved) window.setTimeout(() => el.classList.remove('is-dragging'), 0);
      drag = null;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [pointerWalk]);

  // When the focus moves on (Mark done), the path follows the traveller to the next lantern
  const focusId = focus?.task?.id ?? focus?.state ?? '';
  const lastFocus = useRef(focusId);
  useEffect(() => {
    if (lastFocus.current === focusId) return;
    lastFocus.current = focusId;
    const el = scroller.current;
    if (!el || travellerX === null) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: Math.max(0, travellerX - standAt(el)), behavior: reduce ? 'auto' : 'smooth' });
  }, [focusId, travellerX]);

  const backToYou = () => {
    const el = scroller.current;
    if (!el || travellerX === null) return;
    el.scrollTo({ left: Math.max(0, travellerX - standAt(el)), behavior: 'smooth' });
  };

  const full = trailD(0, width);
  let hill = `M0,${PH} L0,${hillY(0).toFixed(1)}`;
  for (let x = 6; x <= width; x += 6) hill += ` L${x},${hillY(x).toFixed(1)}`;
  hill += ` L${width},${PH} Z`;

  const stateOf = (t: Task) => {
    if (t.completed) return 'is-lit';
    if (focus?.task?.id === t.id) return focus.state === 'running' ? 'is-now' : focus.state === 'missed' ? 'is-missed' : 'is-next';
    return 'is-off';
  };

  let prevX = -999;
  let prevRow = 1;
  const stops = timed.map(t => {
    const x = xOf(toMinutes(t.startTime));
    const row = x - prevX < 132 && prevRow === 0 ? 1 : 0;
    prevX = x;
    prevRow = row;
    return { t, x, row, st: stateOf(t) };
  });

  const nowX = isToday ? xOf(nowMinutes) : null;

  return (
    <section className="lp-panorama" aria-label={isToday ? "Today's path" : "This day's path"}>
      <div className="lp-ridges" aria-hidden="true">
        {layers.map((layer, i) => (
          <svg key={layer.cls} ref={node => { layerRefs.current[i] = node; }} width={layer.w} height="362" viewBox={`0 0 ${layer.w} 362`}>
            <path className={`lp-${layer.cls}`} d={layer.d} />
          </svg>
        ))}
        {fireflies.map((f, i) => (
          <span
            key={i}
            className="lp-fly"
            style={{ left: `${f.left}%`, top: `${f.top}px`, '--fx': `${f.fx}px`, '--fy': `${f.fy}px`, '--d': `${f.d}s` } as CSSProperties}
          />
        ))}
      </div>
      <div className="lp-scroller" ref={scroller} onScroll={parallax} tabIndex={0} aria-label="Scroll sideways to move through the day">
        <div className="lp-track" style={{ width }}>
          <svg width={width} height={PH} viewBox={`0 0 ${width} ${PH}`} aria-hidden="true">
            <defs>
              <radialGradient id="lp-pJ">
                <stop offset="0" stopColor="#B8F5D9" stopOpacity=".55" />
                <stop offset=".55" stopColor="#7BDDB2" stopOpacity=".16" />
                <stop offset="1" stopColor="#7BDDB2" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="lp-pA">
                <stop offset="0" stopColor="#FFCC72" stopOpacity=".6" />
                <stop offset=".55" stopColor="#F7A846" stopOpacity=".18" />
                <stop offset="1" stopColor="#F7A846" stopOpacity="0" />
              </radialGradient>
              <clipPath id="lp-walk-clip">
                <rect x="0" y="0" width={travellerX ?? 0} height={PH} />
              </clipPath>
            </defs>
            {stops.map(({ t, x, st }) =>
              st === 'is-lit' || st === 'is-now' ? (
                <circle key={`h-${t.id}`} className="lp-halo" cx={x} cy={pathY(x) - 54} r="58" fill={`url(#${st === 'is-lit' ? 'lp-pJ' : 'lp-pA'})`} data-x={x} />
              ) : null
            )}
            <path className="lp-hill" d={hill} />
            <path className="lp-trail-band" d={full} />
            <path className="lp-trail-stones" d={full} />
            {travellerX !== null && (
              <g clipPath="url(#lp-walk-clip)">
                <path className="lp-trail-walked" d={full} />
              </g>
            )}
            {stops.map(({ t, x, st }) => {
              const x1 = xOf(toMinutes(t.startTime) + taskDuration(t));
              const cls = st === 'is-lit' ? 'lp-seg-done' : st === 'is-now' ? 'lp-seg-now' : st === 'is-next' ? 'lp-seg-next' : '';
              return (
                <g key={`s-${t.id}`}>
                  {cls && <path className={cls} d={trailD(x, x1, 4)} />}
                  {(st === 'is-lit' || st === 'is-now') && (
                    <ellipse className="lp-pool" cx={x + 6} cy={pathY(x) + 4} rx="74" ry="20" fill={`url(#${st === 'is-lit' ? 'lp-pJ' : 'lp-pA'})`} data-x={x} />
                  )}
                </g>
              );
            })}
            {Array.from({ length: h1 - h0 + 1 }, (_, i) => {
              const h = h0 + i;
              const x = xOf(h * 60);
              const label = h === 12 ? 'NOON' : h === 0 || h === 24 ? '12 AM' : h % 6 === 0 ? `${h % 12} ${h < 12 ? 'AM' : 'PM'}` : `${h % 12}`;
              return (
                <g key={h}>
                  <line className="lp-ruler-tick" x1={x} y1={pathY(x) + 9} x2={x} y2={pathY(x) + 13} />
                  {(nowX === null || Math.abs(x - nowX) > 26) && (
                    <text className="lp-ruler" x={x} y={RY} textAnchor="middle" data-x={x}>
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
            {nowX !== null && (
              <g>
                <path className="lp-now-notch" d={`M${nowX - 4},${RY - 14} L${nowX + 4},${RY - 14} L${nowX},${RY - 19} Z`} data-x={nowX} />
                <text className="lp-now-txt" x={nowX} y={RY} textAnchor="middle" data-x={nowX}>
                  {clock12(nowMinutes)}
                </text>
              </g>
            )}
          </svg>

          {stops.map(({ t, x, row, st }) => {
            const start = toMinutes(t.startTime);
            const repeats = Boolean(t.repeat || t.isOccurrence);
            const when = t.endTime ? formatTimeRangeDisplay(t.startTime, t.endTime) : time12(start);
            return (
              <div
                key={t.id}
                className={`lp-stop ${st} ${row ? 'row2' : ''} ${justLit.has(t.id) ? 'igniting' : ''}`}
                style={{ left: x - 62, top: pathY(x) - 90 }}
                data-id={t.id}
                data-x={x}
              >
                <button
                  type="button"
                  className="lp-stop-lamp"
                  aria-pressed={t.completed}
                  aria-label={`${t.text}, ${when}. ${t.completed ? 'Lit. Put the lantern out' : 'Light the lantern to mark it done'}`}
                  data-sfx="none"
                  onClick={() => setTaskCompleted(t, !t.completed)}
                >
                  <MiniLantern />
                </button>
                <button type="button" className="lp-plabel" data-sfx="open" aria-label={`Open “${t.text}”`} onClick={() => openTask(t.id)}>
                  <span className="lp-plabel-t">
                    {st === 'is-lit' && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
                    {time12(start)}
                    {st === 'is-now' && ' · now'}
                    {st === 'is-next' && ' · next'}
                    {st === 'is-missed' && ' · unlit'}
                    {repeats && st === 'is-off' && <Repeat2 size={12} strokeWidth={2.2} aria-hidden="true" />}
                  </span>
                  <span className="lp-plabel-n">{t.text}</span>
                </button>
              </div>
            );
          })}

          {travellerX !== null && (
            <svg className="lp-traveller" viewBox="0 0 30 36" aria-hidden="true" data-x={travellerX} style={{ transform: `translate(${(travellerX - 15).toFixed(1)}px,${(pathY(travellerX) - 33).toFixed(1)}px)` }}>
              <g className="lp-body">
                <path className="lp-scarf" d="M14,11.5 C19,10.5 22,13 27,11" />
                <path className="lp-cloak" d="M12,9.5 C16,9.5 18,12.5 18.2,16.5 L21.5,33.5 C15.5,35.2 8.5,35.2 2.5,33.5 L5.8,16.5 C6,12.5 8,9.5 12,9.5 Z" />
                <circle className="lp-cloak" cx="12" cy="6" r="4" />
                <path className="lp-rim" d="M18.2,16.5 L21.5,33.5" />
              </g>
            </svg>
          )}
        </div>
      </div>
      {travellerX !== null && (
        <button type="button" className={`lp-backto ${showBack ? 'is-shown' : ''}`} tabIndex={showBack ? 0 : -1} aria-hidden={!showBack} onClick={backToYou}>
          <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          Back to you
        </button>
      )}
      {!timed.length && <p className="lp-path-empty">No set times on this day yet.</p>}
    </section>
  );
}

// ---------- The week as cairns ----------

const weekStart = (date: string) => addDays(date, -((parseISODate(date).getDay() + 6) % 7));

export function WeekCairns({ tasks, today, focusDate, onPickDate }: { tasks: Task[]; today: string; focusDate: string; onPickDate: (date: string) => void }) {
  const days = useMemo(() => {
    const start = weekStart(focusDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const dayTasks = tasks.filter(t => t.date === date);
      const done = dayTasks.filter(t => t.completed).length;
      return { date, total: dayTasks.length, done };
    });
  }, [tasks, focusDate]);

  return (
    <div className="lp-week" role="list" aria-label="This week">
      {days.map(({ date, total, done }) => {
        const d = parseISODate(date);
        const stones = Math.min(total, 6);
        const lit = Math.min(done, stones);
        const isFocus = date === focusDate;
        return (
          <div role="listitem" key={date} className="lp-day-cell">
            <button
              type="button"
              className={`lp-day ${date === today ? 'is-today' : ''} ${isFocus ? 'is-focus' : ''}`}
              aria-current={isFocus ? 'date' : undefined}
              aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${total ? `${done} of ${total} done` : 'nothing planned'}`}
              data-sfx="select"
              onClick={() => onPickDate(date)}
            >
              <svg viewBox="0 0 40 62" aria-hidden="true">
                {stones === 0 ? (
                  <rect className="lp-st is-ghost" x="9" y="52" width="22" height="6" rx="3" />
                ) : (
                  Array.from({ length: stones }, (_, i) => {
                    const w = Math.max(16, 30 - i * 2.6);
                    return <rect key={i} className={`lp-st ${i < lit ? 'is-lit' : ''}`} x={20 - w / 2} y={52 - i * 8.4} width={w} height="7" rx="3.5" />;
                  })
                )}
              </svg>
              <span className="lp-dl">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="lp-dn">{d.getDate()}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Lists on the ground: the pack and what was left on the trail ----------

export function LampGlyph() {
  return (
    <svg viewBox="0 0 22 34" aria-hidden="true">
      <path className="lp-gl-iron" d="M11 2.2a2 2 0 110 4 2 2 0 010-4zM5.5 10.5L11 6.8l5.5 3.7z" />
      <rect className="lp-gl-iron" x="4" y="10" width="14" height="2.6" rx="1" />
      <path className="lp-gl-glass" d="M5.6 12.6h10.8l-1 13H6.6z" />
      <path className="lp-gl-fl" d="M11 15.2c2 2.6 2.6 4.6 2.2 6.2-.3 1.3-1.1 2-2.2 2s-1.9-.7-2.2-2c-.4-1.6.2-3.6 2.2-6.2z" />
      <path className="lp-gl-iron" d="M5 25.6h12l-1.6 3.4H6.6z" />
    </svg>
  );
}

export function TrailList({ tasks, meta }: { tasks: Task[]; meta: (task: Task) => string }) {
  const { selectedTaskId, openTask } = useTaskSelection();
  const justLit = useJustLit(tasks);
  return (
    <ul className="lp-trail-list">
      {tasks.map(task => (
        <li key={task.id} className={`${task.completed ? 'is-done' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''}`} data-id={task.id}>
          <button
            type="button"
            className={`lp-lampbtn ${justLit.has(task.id) ? 'igniting' : ''}`}
            role="checkbox"
            aria-checked={task.completed}
            aria-label={task.completed ? `Mark “${task.text}” as not done` : `Mark “${task.text}” as done`}
            data-sfx="none"
            onClick={() => setTaskCompleted(task, !task.completed)}
          >
            <LampGlyph />
          </button>
          <button type="button" className="lp-li-txt" data-sfx="open" onClick={() => openTask(task.id)}>
            <span className="lp-li-title">{task.text}</span>
            {meta(task) && <span className="lp-li-meta">{meta(task)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

