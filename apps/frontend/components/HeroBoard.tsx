"use client";

import { useEffect, useRef, useState } from "react";
import rough from "roughjs";

const FG = { light: "#1f2937", dark: "#c9d1d9" };
const MUTED = { light: "#6b7280", dark: "#8b949e" };
const ACCENT = { light: "#2563eb", dark: "#60a5fa" };
const BG = { light: "#fafafa", dark: "#131217" };
const SURFACE = { light: "#ffffff", dark: "#1d222b" };

export function HeroBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDark, setIsDark] = useState(false);

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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c: CanvasRenderingContext2D = ctx;

    const rc = rough.canvas(canvas);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

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

    function draw(t: number) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      c.save();
      const wobble = reduceMotion ? 0 : Math.sin(t / 2400) * 0.02;
      c.translate(W / 2, H / 2);
      c.rotate(wobble);
      c.translate(-W / 2, -H / 2);

      rc.rectangle(48, 56, 148, 84, {
        ...roughOpts,
        stroke: accent,
        fill: accent,
        fillStyle: "solid",
      });
      c.fillStyle = background;
      c.font = "600 15px ui-monospace, Menlo, monospace";
      c.fillText("codraw", 66, 94);

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

      rc.ellipse(330, 162, 46, 46, roughOpts);

      c.save();
      c.strokeStyle = muted;
      c.lineWidth = 1.5;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.roundRect(238, 70, 184, 184, 8);
      c.stroke();
      c.restore();

      rc.polygon(
        [
          [505, 36],
          [549, 80],
          [505, 124],
          [461, 80],
        ],
        roughOpts,
      );

      rc.path("M52 250 C 88 214, 104 268, 140 236 C 168 212, 190 260, 224 238", {
        ...roughOpts,
        strokeWidth: 2.5,
      });

      c.save();
      c.strokeStyle = muted;
      c.lineWidth = 1.5;
      c.fillStyle = surface;
      c.beginPath();
      c.roundRect(402, 28, 132, 40, 10);
      c.moveTo(474, 68);
      c.lineTo(466, 82);
      c.lineTo(486, 68);
      c.fill();
      c.stroke();
      c.fillStyle = muted;
      c.font = "13px ui-monospace, Menlo, monospace";
      c.fillText("nice diagram!", 420, 53);
      c.restore();

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
  }, [isDark]);

  return (
    <div className="overflow-hidden border border-border dark:border-border-dark rounded-lg bg-card dark:bg-card-dark">
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
    </div>
  );
}
