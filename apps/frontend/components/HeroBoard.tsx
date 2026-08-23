"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import rough from "roughjs";

const FG = { light: "#1f2937", dark: "#c9d1d9" };
const MUTED = { light: "#6b7280", dark: "#8b949e" };
const ACCENT = { light: "#2563eb", dark: "#60a5fa" };
const BG = { light: "#fafafa", dark: "#131217" };
const SURFACE = { light: "#ffffff", dark: "#1d222b" };

interface ShapeAnim {
  id: string;
  delay: number;
  duration: number;
  type:
    | "fade"
    | "scale-fade"
    | "scale-overshoot"
    | "rotate-fade"
    | "pop"
    | "draw-x"
    | "idle-bob";
  origin?: { x: number; y: number };
  clipX?: number;
  clipW?: number;
}

const SHAPES: readonly ShapeAnim[] = [
  { id: "rect", delay: 0, duration: 220, type: "fade" },
  { id: "arrow", delay: 120, duration: 280, type: "draw-x", clipX: 200, clipW: 82 },
  { id: "frame", delay: 240, duration: 260, type: "scale-fade", origin: { x: 330, y: 162 } },
  { id: "circle", delay: 360, duration: 260, type: "scale-overshoot", origin: { x: 330, y: 162 } },
  { id: "diamond", delay: 480, duration: 260, type: "rotate-fade", origin: { x: 505, y: 80 } },
  { id: "callout", delay: 600, duration: 260, type: "pop", origin: { x: 468, y: 48 } },
  { id: "squiggle", delay: 720, duration: 280, type: "draw-x", clipX: 52, clipW: 172 },
];

const ENTRANCE_DURATION = 1100;
const LOOP_DURATION = 7000;

interface CursorTarget {
  x: number;
  y: number;
}

const CURSOR_TARGETS: CursorTarget[] = [
  { x: 120, y: 120 },
  { x: 280, y: 160 },
  { x: 340, y: 110 },
  { x: 200, y: 200 },
  { x: 120, y: 120 },
];

const TEAM_TARGETS: CursorTarget[] = [
  { x: 460, y: 220 },
  { x: 520, y: 180 },
  { x: 480, y: 260 },
  { x: 420, y: 240 },
  { x: 460, y: 220 },
];

export function HeroBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);
  const [hovered, setHovered] = useState(false);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setIsDark(el.classList.contains("dark"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c: CanvasRenderingContext2D = ctx;

    const rc = rough.canvas(canvas);

    const fg = isDark ? FG.dark : FG.light;
    const muted = isDark ? MUTED.dark : MUTED.light;
    const accent = isDark ? ACCENT.dark : ACCENT.light;
    const background = isDark ? BG.dark : BG.light;
    const surface = isDark ? SURFACE.dark : SURFACE.light;

    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, W * dpr);
      canvas.height = Math.max(1, H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const roughOpts = {
      roughness: 0,
      bowing: 0.9,
      strokeWidth: 2,
      stroke: fg,
    };

    const easeOutBack = (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    };

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

    const mountTime = performance.now();

    const [
      rectAnim,
      arrowAnim,
      frameAnim,
      circleAnim,
      diamondAnim,
      calloutAnim,
      squiggleAnim,
    ] = SHAPES;

    function getProgress(shape: ShapeAnim | undefined, elapsed: number): number {
      if (!shape || reduceMotion || elapsed <= shape.delay) return 1;
      const raw = (elapsed - shape.delay) / shape.duration;
      return Math.max(0, Math.min(1, raw));
    }

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function getCursorPos(
      targets: CursorTarget[],
      elapsed: number,
      offset: number,
    ): { x: number; y: number } {
      if (targets.length === 0) return { x: 0, y: 0 };
      const total = targets.length - 1;
      const raw = ((elapsed - offset) % LOOP_DURATION) / LOOP_DURATION;
      const t = easeInOutSine(raw);
      const idx = Math.min(Math.floor(t * total), total);
      const next = Math.min(idx + 1, total);
      const frac = (t * total) - idx;
      const current = targets[idx]!;
      const target = targets[next]!;
      return {
        x: lerp(current.x, target.x, frac),
        y: lerp(current.y, target.y, frac),
      };
    }

    function draw(time: number) {
      const elapsed = time - mountTime;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      c.save();
      const wobble = reduceMotion ? 0 : Math.sin(time / 2400) * 0.02;
      c.translate(W / 2, H / 2);
      c.rotate(wobble);
      c.translate(-W / 2, -H / 2);

      const rectProgress = getProgress(rectAnim, elapsed);
      const arrowProgress = getProgress(arrowAnim, elapsed);
      const frameProgress = getProgress(frameAnim, elapsed);
      const circleProgress = getProgress(circleAnim, elapsed);
      const diamondProgress = getProgress(diamondAnim, elapsed);
      const calloutProgress = getProgress(calloutAnim, elapsed);
      const squiggleProgress = getProgress(squiggleAnim, elapsed);

      const entranceComplete = reduceMotion || elapsed >= ENTRANCE_DURATION;
      const loopElapsed = entranceComplete ? elapsed - ENTRANCE_DURATION : 0;
      const calloutPhase = Math.floor(loopElapsed / (LOOP_DURATION / 2));
      const showAltCallout = entranceComplete && calloutPhase % 2 === 1;

      // Rectangle
      if (rectProgress > 0) {
        c.globalAlpha = easeOutCubic(rectProgress);
        rc.rectangle(48, 56, 148, 84, {
          ...roughOpts,
          stroke: accent,
          fill: accent,
          fillStyle: "solid",
        });
        c.globalAlpha = 1;
      }

      // Arrow (draw-in via horizontal clip)
      if (arrowProgress > 0) {
        c.save();
        const ax = 200;
        const ay = 98;
        const aw = 82;
        const margin = 20;
        c.beginPath();
        c.rect(ax, ay - margin, aw * easeOutCubic(arrowProgress), margin * 2 + 60);
        c.clip();
        rc.line(200, 98, 282, 148, roughOpts);
        const ux = 82 / 94.3;
        const uy = 50 / 94.3;
        const px = -uy;
        const py = ux;
        const tipX = 282;
        const tipY = 148;
        const bx = tipX - ux * 13;
        const by = tipY - uy * 13;
        rc.polygon(
          [
            [tipX, tipY],
            [bx + px * 7, by + py * 7],
            [bx - px * 7, by - py * 7],
          ],
          { ...roughOpts, fill: fg, fillStyle: "solid" },
        );
        c.restore();
      }

      // Dashed frame (fade + scale from 95%)
      if (frameProgress > 0) {
        c.save();
        const fp = easeOutCubic(frameProgress);
        const scale = 0.95 + 0.05 * fp;
        const fx = 330;
        const fy = 162;
        c.translate(fx, fy);
        c.scale(scale, scale);
        c.translate(-fx, -fy);
        c.globalAlpha = fp;
        c.strokeStyle = muted;
        c.lineWidth = 1.5;
        c.setLineDash([6, 6]);
        c.beginPath();
        c.roundRect(238, 70, 184, 184, 8);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
        c.restore();
      }

      // Circle (scale from 0 with overshoot)
      if (circleProgress > 0) {
        c.save();
        const cp = easeOutBack(circleProgress);
        const cx = 330;
        const cy = 162;
        c.translate(cx, cy);
        c.scale(cp, cp);
        c.translate(-cx, -cy);
        rc.ellipse(330, 162, 46, 46, roughOpts);
        c.restore();
      }

      // Diamond (fade + slight rotate-in)
      if (diamondProgress > 0) {
        c.save();
        const dp = easeOutCubic(diamondProgress);
        const dx = 505;
        const dy = 80;
        c.translate(dx, dy);
        c.rotate((1 - dp) * -0.15);
        c.translate(-dx, -dy);
        c.globalAlpha = dp;
        rc.polygon(
          [
            [505, 36],
            [549, 80],
            [505, 124],
            [461, 80],
          ],
          roughOpts,
        );
        c.globalAlpha = 1;
        c.restore();
      }

      // Callout box (pop in 0.9 → 1) with cross-fade
      if (calloutProgress > 0) {
        c.save();
        const baseScale = 0.9 + 0.1 * easeOutBack(calloutProgress);
        const cbx = 402;
        const cby = 28;
        const cbw = 132;
        const cbh = 40;
        const cx = cbx + cbw / 2;
        const cy = cby + cbh / 2;
        c.translate(cx, cy);
        c.scale(baseScale, baseScale);
        c.translate(-cx, -cy);

        if (!showAltCallout) {
          c.globalAlpha = easeOutCubic(calloutProgress);
          c.strokeStyle = muted;
          c.lineWidth = 1.5;
          c.fillStyle = surface;
          c.beginPath();
          c.roundRect(cbx, cby, cbw, cbh, 10);
          c.moveTo(474, 68);
          c.lineTo(466, 82);
          c.lineTo(486, 68);
          c.fill();
          c.stroke();
          c.fillStyle = muted;
          c.font = "13px ui-monospace, Menlo, monospace";
          c.fillText("nice diagram!", 420, 53);
        } else {
          c.globalAlpha = easeOutCubic(calloutProgress);
          c.strokeStyle = muted;
          c.lineWidth = 1.5;
          c.fillStyle = surface;
          c.beginPath();
          c.roundRect(cbx, cby, cbw + 12, cbh, 10);
          c.moveTo(486, 68);
          c.lineTo(478, 82);
          c.lineTo(498, 68);
          c.fill();
          c.stroke();
          c.fillStyle = muted;
          c.font = "13px ui-monospace, Menlo, monospace";
          c.fillText("let's move this →", 420, 53);
        }

        c.globalAlpha = 1;
        c.restore();
      }

      // Squiggle (draw-in via horizontal clip)
      if (squiggleProgress > 0) {
        c.save();
        const sx = 52;
        const sy = 214;
        const sw = 172;
        const margin = 30;
        c.beginPath();
        c.rect(sx, sy - margin, sw * easeOutCubic(squiggleProgress), margin * 2 + 60);
        c.clip();
        rc.path(
          "M52 250 C 88 214, 104 268, 140 236 C 168 212, 190 260, 224 238",
          { ...roughOpts, strokeWidth: 2.5 },
        );
        c.restore();
      }

      // Cursors
      if (entranceComplete) {
        const youPos = getCursorPos(CURSOR_TARGETS, loopElapsed, 0);
        const teamPos = getCursorPos(TEAM_TARGETS, loopElapsed, LOOP_DURATION / 3);

        if (!hovered && !reduceMotion) {
          c.save();
          c.translate(youPos.x - 300, youPos.y - 30);
          c.fillStyle = accent;
          c.beginPath();
          c.moveTo(300, 30);
          c.lineTo(300, 44);
          c.lineTo(303.5, 39.5);
          c.lineTo(305.5, 45.5);
          c.lineTo(308, 43.5);
          c.lineTo(306, 37.5);
          c.lineTo(310.5, 37.5);
          c.closePath();
          c.fill();
          c.fillStyle = accent;
          c.font = "600 12px ui-monospace, Menlo, monospace";
          c.fillText("You", 306, 26);
          c.restore();

          c.save();
          c.translate(teamPos.x - 486, teamPos.y - 244);
          c.fillStyle = muted;
          c.beginPath();
          c.moveTo(486, 244);
          c.lineTo(486, 258);
          c.lineTo(489.5, 253.5);
          c.lineTo(491.5, 259.5);
          c.lineTo(494, 257.5);
          c.lineTo(492, 251.5);
          c.lineTo(496.5, 251.5);
          c.closePath();
          c.fill();
          c.fillStyle = muted;
          c.font = "600 12px ui-monospace, Menlo, monospace";
          c.fillText("Team", 492, 240);
          c.restore();
        } else if (hovered && !reduceMotion) {
          const mx = Math.max(0, Math.min(W, mouseRef.current.x));
          const my = Math.max(0, Math.min(H, mouseRef.current.y));

          c.save();
          c.translate(mx - 8, my - 8);
          c.fillStyle = accent;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(0, 14);
          c.lineTo(3.5, 9.5);
          c.lineTo(5.5, 15.5);
          c.lineTo(8, 13.5);
          c.lineTo(6, 7.5);
          c.lineTo(10.5, 7.5);
          c.closePath();
          c.fill();
          c.fillStyle = accent;
          c.font = "600 11px ui-monospace, Menlo, monospace";
          c.fillText("visitor", 12, 12);
          c.restore();
        }
      } else {
        const cursorFade = easeOutCubic(
          Math.max(arrowProgress, Math.max(squiggleProgress, 0.1)),
        );
        if (cursorFade > 0) {
          c.globalAlpha = cursorFade;
          c.fillStyle = accent;
          c.beginPath();
          c.moveTo(300, 30);
          c.lineTo(300, 44);
          c.lineTo(303.5, 39.5);
          c.lineTo(305.5, 45.5);
          c.lineTo(308, 43.5);
          c.lineTo(306, 37.5);
          c.lineTo(310.5, 37.5);
          c.closePath();
          c.fill();
          c.fillStyle = accent;
          c.font = "600 12px ui-monospace, Menlo, monospace";
          c.fillText("You", 306, 26);

          c.fillStyle = muted;
          c.beginPath();
          c.moveTo(486, 244);
          c.lineTo(486, 258);
          c.lineTo(489.5, 253.5);
          c.lineTo(491.5, 259.5);
          c.lineTo(494, 257.5);
          c.lineTo(492, 251.5);
          c.lineTo(496.5, 251.5);
          c.closePath();
          c.fill();
          c.fillStyle = muted;
          c.font = "600 12px ui-monospace, Menlo, monospace";
          c.fillText("Team", 492, 240);
          c.globalAlpha = 1;
        }
      }

      c.restore();
    }

    let raf = 0;
    const frame = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    const stop = () => cancelAnimationFrame(raf);

    if (reduceMotion) {
      draw(0);
    } else {
      const io = new IntersectionObserver(
        ([entry]) => entry?.isIntersecting ? start() : stop(),
        { rootMargin: "200px" },
      );
      io.observe(canvas);
      const onVisibility = () => {
        if (document.hidden) stop();
        else start();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        stop();
        ro.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }

    return () => {
      stop();
      ro.disconnect();
    };
  }, [isDark, reduceMotion]);

  return (
    <motion.div
      ref={wrapRef}
      className="overflow-hidden border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark"
      onMouseEnter={() => setHovered(true)}
      onMouseMove={(e) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          mouseRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
        }
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border dark:border-border-dark bg-muted dark:bg-muted-dark">
        <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
        <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
        <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-xs text-muted-foreground dark:text-muted-foreground-dark">
          codraw · live — rough.js canvas
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="block w-full h-[280px] sm:h-[320px]"
        aria-label="Live preview: hand-drawn shapes on a collaborative canvas"
        role="img"
      />
    </motion.div>
  );
}
