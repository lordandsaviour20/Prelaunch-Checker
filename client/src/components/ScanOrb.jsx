import { useEffect, useRef } from 'react';
import { useReducedMotion, usePageVisible } from '../hooks/useMotion';

/**
 * A wireframe globe rendered with hand-rolled 3D projection on a 2D canvas.
 * No WebGL, no dependencies — a perf-audit tool shipping 600kb of 3D library
 * to draw a loading state would be its own worst finding.
 *
 * A latitude "scan plane" sweeps top-to-bottom; wireframe segments and surface
 * nodes light up as it crosses them, which is what makes it read as a scanner
 * rather than a generic spinner.
 */

const MERIDIANS = 14; // vertical lines of longitude
const PARALLELS = 9; // horizontal rings of latitude
const MERIDIAN_STEPS = 40; // segments per meridian
const PARALLEL_STEPS = 56;
const NODE_COUNT = 44;
const CAM_DIST = 2.7; // camera distance in sphere radii
const TILT = -0.38; // fixed X-axis tilt, radians
const SCAN_BAND = 0.3; // half-height of the glowing band, in sphere-y units

/** Deterministic node placement via the golden-angle spiral — even coverage, no clumping. */
function makeNodes(count) {
  const nodes = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // 1 .. -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    nodes.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return nodes;
}

const NODES = makeNodes(NODE_COUNT);

export default function ScanOrb({ size = 260, running = true, complete = false, grade = null }) {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();
  const visible = usePageVisible();

  // Live props for the rAF loop, so changing them never restarts the animation.
  // Synced in an effect rather than during render — writing a ref mid-render
  // is unsafe once React can discard or replay a render pass.
  const stateRef = useRef({ running, complete });
  useEffect(() => {
    stateRef.current = { running, complete };
  }, [running, complete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let dpr = 1;
    let w = size;
    let h = size;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2: 3x costs 2.25x fill for no visible gain
      const rect = canvas.getBoundingClientRect();
      w = rect.width || size;
      h = rect.height || size;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const project = (p, spin) => {
      // rotate around Y
      const cs = Math.cos(spin);
      const sn = Math.sin(spin);
      const x1 = p.x * cs + p.z * sn;
      const z1 = -p.x * sn + p.z * cs;
      // tilt around X
      const ct = Math.cos(TILT);
      const st = Math.sin(TILT);
      const y2 = p.y * ct - z1 * st;
      const z2 = p.y * st + z1 * ct;

      const scale = CAM_DIST / (CAM_DIST - z2);
      return { sx: x1 * scale, sy: y2 * scale, depth: (z2 + 1) / 2, scale };
    };

    /** 0 (untouched) .. 1 (dead centre of the scan band) */
    const glowAt = (y, scanY) => {
      const d = Math.abs(y - scanY);
      if (d >= SCAN_BAND) return 0;
      const t = 1 - d / SCAN_BAND;
      return t * t; // quadratic falloff — tighter, brighter core
    };

    const start = performance.now();

    const draw = (now) => {
      const { running: isRunning, complete: isComplete } = stateRef.current;
      const t = (now - start) / 1000;

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.29; // leaves headroom for perspective scale-up

      // Idle globes drift slowly; a running scan spins with intent.
      const spin = t * (isRunning ? 0.55 : 0.16);

      // Sweep top -> bottom on a 2.4s cycle. Parked mid-sphere once complete.
      const scanY = isComplete ? -2 : isRunning ? 1 - 2 * ((t / 2.4) % 1) : -2;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';

      // ---- Parallels: glow is constant along a ring, so one stroke each ----
      for (let i = 1; i < PARALLELS; i++) {
        const lat = -Math.PI / 2 + (Math.PI * i) / PARALLELS;
        const y = Math.sin(lat);
        const ringR = Math.cos(lat);
        const g = glowAt(y, scanY);

        ctx.beginPath();
        let depthSum = 0;
        for (let s = 0; s <= PARALLEL_STEPS; s++) {
          const th = (s / PARALLEL_STEPS) * Math.PI * 2;
          const pt = project({ x: Math.cos(th) * ringR, y, z: Math.sin(th) * ringR }, spin);
          depthSum += pt.depth;
          const X = pt.sx * R;
          const Y = pt.sy * R;
          if (s === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        }
        const depth = depthSum / (PARALLEL_STEPS + 1);
        const base = 0.05 + depth * 0.16;
        if (g > 0.01) {
          ctx.strokeStyle = `rgba(74, 222, 128, ${(base + g * 0.75).toFixed(3)})`;
          ctx.lineWidth = 1 + g * 1.4;
          ctx.shadowColor = 'rgba(34, 197, 94, 0.85)';
          ctx.shadowBlur = 10 * g;
        } else {
          ctx.strokeStyle = `rgba(148, 163, 184, ${base.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // ---- Meridians: glow varies along the line, so batch dim segments into
      //      one path and only stroke lit segments individually. ----
      const litSegments = [];
      ctx.beginPath();
      for (let m = 0; m < MERIDIANS; m++) {
        const lon = (m / MERIDIANS) * Math.PI * 2;
        let prev = null;
        for (let s = 0; s <= MERIDIAN_STEPS; s++) {
          const lat = -Math.PI / 2 + (Math.PI * s) / MERIDIAN_STEPS;
          const y = Math.sin(lat);
          const rr = Math.cos(lat);
          const pt = project({ x: Math.cos(lon) * rr, y, z: Math.sin(lon) * rr }, spin);
          const cur = { X: pt.sx * R, Y: pt.sy * R, depth: pt.depth, y };
          if (prev) {
            const g = glowAt((prev.y + cur.y) / 2, scanY);
            if (g > 0.01) {
              litSegments.push({ a: prev, b: cur, g, depth: (prev.depth + cur.depth) / 2 });
            } else {
              ctx.moveTo(prev.X, prev.Y);
              ctx.lineTo(cur.X, cur.Y);
            }
          }
          prev = cur;
        }
      }
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.shadowColor = 'rgba(34, 197, 94, 0.8)';
      for (const seg of litSegments) {
        ctx.beginPath();
        ctx.moveTo(seg.a.X, seg.a.Y);
        ctx.lineTo(seg.b.X, seg.b.Y);
        ctx.strokeStyle = `rgba(74, 222, 128, ${(0.1 + seg.g * 0.8 * (0.45 + seg.depth * 0.55)).toFixed(3)})`;
        ctx.lineWidth = 1 + seg.g * 1.3;
        ctx.shadowBlur = 9 * seg.g;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // ---- Surface nodes ----
      for (const n of NODES) {
        const pt = project(n, spin);
        const g = glowAt(n.y, scanY);
        const X = pt.sx * R;
        const Y = pt.sy * R;
        const rad = (0.9 + pt.depth * 1.3) * (1 + g * 1.5);

        ctx.beginPath();
        ctx.arc(X, Y, rad, 0, Math.PI * 2);
        if (g > 0.02) {
          ctx.fillStyle = `rgba(134, 239, 172, ${(0.35 + g * 0.65).toFixed(3)})`;
          ctx.shadowColor = 'rgba(34, 197, 94, 0.9)';
          ctx.shadowBlur = 12 * g;
        } else {
          ctx.fillStyle = `rgba(148, 163, 184, ${(0.1 + pt.depth * 0.3).toFixed(3)})`;
          ctx.shadowBlur = 0;
        }
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // ---- Horizon rim: sells the sphere as a solid volume ----
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.002, 0, Math.PI * 2);
      ctx.strokeStyle = isComplete ? 'rgba(74, 222, 128, 0.4)' : 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      if (!reduced && visible) raf = requestAnimationFrame(draw);
    };

    if (reduced || !visible) {
      // One static frame at a representative pose — never a blank box.
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [size, reduced, visible]);

  return (
    <div className={`scan-orb ${running ? 'is-running' : ''} ${complete ? 'is-complete' : ''}`}>
      <div className="scan-orb-glow" aria-hidden="true" />
      {/* CSS-3D orbital rings, counter-rotating around the canvas for layered depth */}
      <div className="scan-orb-rings" aria-hidden="true">
        <span className="orbit orbit-1" />
        <span className="orbit orbit-2" />
        <span className="orbit orbit-3" />
      </div>
      <canvas
        ref={canvasRef}
        className="scan-orb-canvas"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
      {complete && grade && (
        <div className="scan-orb-grade" aria-hidden="true">
          {grade}
        </div>
      )}
    </div>
  );
}
