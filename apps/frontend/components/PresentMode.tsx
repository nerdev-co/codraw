/**
 * PresentMode — fullscreen presentation mode using frames as slides.
 *
 * Navigates through frames with arrow keys or click.
 * Each slide shows the frame zoomed to fit the viewport.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Game } from "@/draw/Game";
import { Shape, getShapeBounds, resolveStrokeColor } from "@repo/shapes";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { PRESENT_SLIDE_BG, SELECTION_OUTLINE, FRAME_LABEL_BG, FRAME_LABEL_TEXT, PRESENT_FALLBACK_FILL, pick } from "@/draw/colorSystem";

export function PresentMode({
    game,
    active,
    onClose,
}: {
    game: Game | undefined;
    active: boolean;
    onClose: () => void;
}) {
    const [slides, setSlides] = useState<Shape[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const wasActive = useRef(false);

    // Collect slides when entering present mode
    useEffect(() => {
        if (active && !wasActive.current && game) {
            const s = game.getSlides();
            setSlides(s);
            setCurrentIndex(0);
        }
        wasActive.current = active;
    }, [active, game]);

    // Draw the current slide on the canvas
    useEffect(() => {
        if (!active || !game || slides.length === 0) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const frame = slides[currentIndex];
        if (!frame) return;
        const vp = game.getSlideViewport(frame, canvas.width, canvas.height);

        // Get shapes inside the frame bounds
        const frameBounds = getShapeBounds(frame);
        if (!frameBounds) return;

        // Collect all shapes (frame + shapes inside it)
        const allShapes = game.getShapesForMinimap();
        const isDark = game.isDark;
        const bg = PRESENT_SLIDE_BG;

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = isDark ? bg.dark : bg.light;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply viewport transform
        ctx.save();
        ctx.translate(vp.panX, vp.panY);
        ctx.scale(vp.zoom, vp.zoom);

        // Draw shapes that are inside or overlapping the frame
        for (const shape of allShapes) {
            const b = getShapeBounds(shape);
            if (!b) continue;

            // Check if shape overlaps with frame bounds (with some padding)
            const overlaps =
                b.x < frameBounds.x + frameBounds.w + 50 &&
                b.x + b.w > frameBounds.x - 50 &&
                b.y < frameBounds.y + frameBounds.h + 50 &&
                b.y + b.h > frameBounds.y - 50;

            if (overlaps && shape.id !== frame.id) {
                // Draw shape as simple filled rectangle for now
                const st = shape.style;
                if (st) {
                    ctx.fillStyle = st.backgroundColor !== "transparent" ? st.backgroundColor : resolveStrokeColor(st, isDark);
                    ctx.globalAlpha = st.opacity;
                } else {
                    ctx.fillStyle = pick(PRESENT_FALLBACK_FILL, isDark);
                    ctx.globalAlpha = 1;
                }

                const sb = getShapeBounds(shape);
                if (sb) {
                    if (shape.type === "text") {
                        ctx.font = `${shape.fontSize || 14}px ${shape.fontFamily || "Arial"}`;
                        ctx.fillStyle = resolveStrokeColor(st, isDark);
                        ctx.fillText(shape.text, shape.x, shape.y);
                    } else if (shape.type === "rect" || shape.type === "stickyNote") {
                        ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
                    } else if (shape.type === "circle") {
                        ctx.beginPath();
                        ctx.ellipse(sb.x + sb.w / 2, sb.y + sb.h / 2, sb.w / 2, sb.h / 2, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.globalAlpha = 1;
            }
        }

        // Draw frame border
        ctx.strokeStyle = pick(SELECTION_OUTLINE, isDark);
        ctx.lineWidth = 2 / vp.zoom;
        ctx.strokeRect(frameBounds.x, frameBounds.y, frameBounds.w, frameBounds.h);

        // Draw frame label pill (same treatment as the canvas renderer + SVG export)
        const label = frame.type === "frame" ? frame.name : `Slide ${currentIndex + 1}`;
        ctx.font = `bold ${14 / vp.zoom}px Arial`;
        const labelText = label || "Slide";
        const labelW = ctx.measureText(labelText).width + 16 / vp.zoom;
        const labelH = 24 / vp.zoom;
        ctx.fillStyle = pick(FRAME_LABEL_BG, isDark);
        ctx.fillRect(frameBounds.x, frameBounds.y - labelH, labelW, labelH);
        ctx.fillStyle = pick(FRAME_LABEL_TEXT, isDark);
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, frameBounds.x + 8 / vp.zoom, frameBounds.y - labelH / 2);

        ctx.restore();
    }, [active, game, slides, currentIndex]);

    const navigate = useCallback((dir: 1 | -1) => {
        if (slides.length === 0) return;
        setCurrentIndex(prev => (prev + dir + slides.length) % slides.length);
    }, [slides.length]);

    useEffect(() => {
        if (!active) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                navigate(1);
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                navigate(-1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [active, onClose, navigate]);

    if (!active || slides.length === 0) return null;

    return (
        <div className="fixed inset-0 z-50">
            <canvas
                ref={canvasRef}
                width={window.innerWidth}
                height={window.innerHeight}
                className="w-full h-full"
            />

            {/* Navigation controls */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1.5 border border-white/10 animate-panel-in motion-reduce:animate-none">
                <button
                    onClick={() => navigate(-1)}
                    className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white cursor-pointer rounded-full transition-[color,background-color] duration-fast hover:bg-white/10 active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Previous slide"
                >
                    <ChevronLeft size={18} />
                </button>
                <span className="text-white/70 text-sm tabular-nums min-w-[60px] text-center">
                    {currentIndex + 1} / {slides.length}
                </span>
                <button
                    onClick={() => navigate(1)}
                    className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white cursor-pointer rounded-full transition-[color,background-color] duration-fast hover:bg-white/10 active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Next slide"
                >
                    <ChevronRight size={18} />
                </button>
                <div className="w-px h-4 bg-white/20 mx-1" />
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white cursor-pointer rounded-full transition-[color,background-color] duration-fast hover:bg-white/10 active:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Exit present mode"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Slide name */}
            <div className="fixed top-8 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/50 backdrop-blur-sm rounded-md px-3 py-1.5 animate-fade-in motion-reduce:animate-none">
                {slides[currentIndex]?.type === "frame" ? slides[currentIndex].name : `Slide ${currentIndex + 1}`}
            </div>
        </div>
    );
}
