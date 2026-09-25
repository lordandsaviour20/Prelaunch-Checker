import { useEffect, useRef, useState } from 'react';

/**
 * Tracks prefers-reduced-motion live, so a user flipping the OS setting
 * doesn't have to reload to stop the animations.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Reports whether the tab is currently visible. Every rAF loop in this app
 * checks it so background tabs cost zero CPU.
 */
export function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

/**
 * Pointer-driven 3D tilt. Writes --rx/--ry/--px/--py custom properties on the
 * element rather than setting `transform` directly, so CSS keeps full control
 * of the final transform chain (and can layer its own translate/scale on top).
 *
 * Only transform-adjacent custom props are written and the update is coalesced
 * into a single rAF, so this never triggers layout.
 */
export function useTilt({ max = 9, disabled = false } = {}) {
  const ref = useRef(null);
  const frame = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || disabled) return;

    // Coarse pointers have no hover; tilting on touch just fights the scroll.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const write = (rx, ry, px, py) => {
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      el.style.setProperty('--px', `${px.toFixed(1)}%`);
      el.style.setProperty('--py', `${py.toFixed(1)}%`);
    };

    const onPointerMove = (e) => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5; // -0.5 .. 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5;
        write(-ny * max * 2, nx * max * 2, (nx + 0.5) * 100, (ny + 0.5) * 100);
        el.dataset.tilting = 'true';
      });
    };

    const onPointerLeave = () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      write(0, 0, 50, 50);
      delete el.dataset.tilting;
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerleave', onPointerLeave);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [max, disabled, reduced]);

  return ref;
}

/**
 * Eases a number toward `target` on rAF. Used for the score counter so the
 * grade reveal lands on the real value instead of a fake fixed-duration count.
 */
export function useCountUp(target, { duration = 1400, enabled = true } = {}) {
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();
  const animate = enabled && !reduced;

  useEffect(() => {
    if (!animate) return; // the final value is returned directly below
    let raf = 0;
    const start = performance.now();
    const from = 0;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // expo.out — fast start, long settle
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, animate]);

  return animate ? value : target;
}

/**
 * Scrolls the returned ref into view once on mount. Results render below a
 * tall hero, so without this a scan appears to do nothing on a laptop screen.
 * Honours reduced-motion by jumping instead of animating.
 */
export function useScrollIntoView(enabled = true, delay = 0) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const doScroll = () => {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    };

    if (delay > 0 && !reduced) {
      const id = setTimeout(doScroll, delay);
      return () => clearTimeout(id);
    }
    doScroll();
    // Mount-only: re-scrolling on a prop change would fight the user's scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, delay]);

  return ref;
}