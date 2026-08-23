import rough from "roughjs";
import { Shape, getShapeBounds } from "@repo/shapes";
import { renderShape, drawSelection } from "../renderer";
import { ImageCache } from "../imageCache";
import { GRID_DOT, GRID_CROSS, SELECTION_FAINT, SELECTION_GUIDE, SELECTION_HANDLE, TEXTAREA_FOCUS, CROP_DIM, pick } from "../colorSystem";
import type { GameContext } from "../gameContext";

/** Compare two sets for equality. */
function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) {
        if (!b.has(v)) return false;
    }
    return true;
}

/** Capabilities the RenderManager needs from the owning Game instance. */
export interface RenderManagerApi {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    imageCache: ImageCache;
    getSelectedShape(): Shape | null;
    drawRemoteCursors(ctx: CanvasRenderingContext2D): void;
}

/**
 * Owns the off-screen scene cache and the main render pass.
 *
 * Shapes are rendered once into an off-screen cache canvas; `clearCanvas`
 * blits that cache to the visible canvas and overlays selection handles,
 * crop guides, the laser pointer, remote cursors, and alignment guides.
 *
 * The cache is baked in *world space* at the current viewport transform
 * plus a margin (`overdraw`): panning stays inside the baked region and
 * small zoom changes stay inside {@link CACHE_MAX_ZOOM_RATIO}, so both
 * re-blit the cached bitmap instead of re-running the expensive Rough.js
 * scene build. The cache is rebuilt only when the viewport leaves the
 * baked window or the scene itself changes (`invalidateCache`).
 */
export class RenderManager {
    private cacheCanvas: HTMLCanvasElement;
    private cacheCtx: CanvasRenderingContext2D;
    private cacheRc: ReturnType<typeof rough.canvas>;
    private cacheValid = false;
    private selectionAnim: { start: number; duration: number } | null = null;
    private lastSelectionKey = "";
    private reducedMotion: boolean | null = null;

    /** World-space extent covered by the cache (bake-time viewport plus margin). */
    private bakeWorldX = 0;
    private bakeWorldY = 0;
    private bakeWorldW = 0;
    private bakeWorldH = 0;
    /** Viewport state the cache was baked at. */
    private bakedZoom = 1;

    /** Cache covers this multiple of the viewport area (25% margin each side). */
    private readonly overdraw = 1.5;
    /** Zoom range around the baked zoom that re-blits instead of rebuilding. */
    private readonly maxZoomRatio = 1.25;

    /** Stable key for the current selection (order-independent). */
    private selectionKey(): string {
        return [...this.context.selectedIds].sort().join("|");
    }

    /** Cached frame highlight state to avoid redundant iteration. */
    private lastHighlightFrameId: string | null = null;
    private lastHighlightShapeIds = new Set<string>();

    /** Whether the user prefers reduced motion (checked once, cached). */
    private prefersReducedMotion(): boolean {
        if (this.reducedMotion === null) {
            this.reducedMotion =
                typeof matchMedia !== "undefined" &&
                matchMedia("(prefers-reduced-motion: reduce)").matches;
        }
        return this.reducedMotion;
    }

    constructor(
        private context: GameContext,
        private api: RenderManagerApi,
    ) {
        this.cacheCanvas = api.canvas.ownerDocument.createElement("canvas");
        this.cacheCanvas.width = api.canvas.width;
        this.cacheCanvas.height = api.canvas.height;
        this.cacheCtx = this.cacheCanvas.getContext("2d")!;
        this.cacheRc = rough.canvas(this.cacheCanvas);
    }

    /** Mark the scene cache as stale so the next render rebuilds it. */
    invalidateCache() {
        this.cacheValid = false;
    }

    /**
     * Draw the canvas background based on the current background style.
     *
     * Renders solid fill, dot grid, cross grid, or transparent (plain)
     * backgrounds. Dot and cross grids are offset by the current pan
     * position so they appear fixed relative to the canvas.
     *
     * @param ctx - Target canvas 2D context
     * @param width - Width of the area to fill
     * @param height - Height of the area to fill
     */
    private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const bg = this.context._background;
        if (bg.type === "solid") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
        } else if (bg.type === "dots") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
            const { dotSize = 1.5, spacing = 20 } = bg;
            const offsetX = ((this.context.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.context.viewport.panY % spacing) + spacing) % spacing;
            ctx.fillStyle = pick(GRID_DOT, this.context.isDark);
            for (let x = offsetX; x < width; x += spacing) {
                for (let y = offsetY; y < height; y += spacing) {
                    ctx.beginPath();
                    ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else if (bg.type === "crosses") {
            ctx.fillStyle = bg.color;
            ctx.fillRect(0, 0, width, height);
            const { crossSize, spacing = 20 } = bg;
            const offsetX = ((this.context.viewport.panX % spacing) + spacing) % spacing;
            const offsetY = ((this.context.viewport.panY % spacing) + spacing) % spacing;
            ctx.strokeStyle = pick(GRID_CROSS, this.context.isDark);
            ctx.lineWidth = 1;
            for (let x = offsetX; x < width; x += spacing) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = offsetY; y < height; y += spacing) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        } else if (bg.type === "plain") {
            ctx.clearRect(0, 0, width, height);
        }
    }

    /**
     * Re-render all shapes to the off-screen cache canvas.
     *
     * Bakes the scene in world coordinates at the current viewport
     * transform, sized `overdraw`× larger than the viewport so pan/zoom
     * can re-blit without re-rendering while inside the baked window.
     * The background is drawn live every frame, not baked, so the grid
     * stays crisp at every zoom.
     */
    buildCache() {
        const dpr = this.context.dpr;
        const viewport = this.context.viewport;
        this.bakedZoom = viewport.zoom;

        const cacheWorldW = this.context.cssWidth / viewport.zoom;
        const cacheWorldH = this.context.cssHeight / viewport.zoom;
        this.bakeWorldW = cacheWorldW * this.overdraw;
        this.bakeWorldH = cacheWorldH * this.overdraw;
        this.bakeWorldX = viewport.panX - (cacheWorldW * (this.overdraw - 1)) / 2;
        this.bakeWorldY = viewport.panY - (cacheWorldH * (this.overdraw - 1)) / 2;

        const cacheW = Math.max(1, Math.round(this.bakeWorldW * dpr * viewport.zoom));
        const cacheH = Math.max(1, Math.round(this.bakeWorldH * dpr * viewport.zoom));
        this.cacheCanvas.width = cacheW;
        this.cacheCanvas.height = cacheH;

        // World point (wx, wy) → cache pixel: (wx - bakeWorldX) * cacheScale.
        const cacheScale = dpr * viewport.zoom;
        this.cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.cacheCtx.clearRect(0, 0, cacheW, cacheH);
        this.cacheCtx.setTransform(
            cacheScale,
            0,
            0,
            cacheScale,
            -this.bakeWorldX * cacheScale,
            -this.bakeWorldY * cacheScale,
        );
        for (const shape of this.context.existingShapes) {
            renderShape(shape, this.cacheCtx, this.cacheRc, viewport.zoom, this.context.isDark, this.api.imageCache);
        }
        this.drawFrameHighlight();
        this.cacheValid = true;
    }

    /**
     * Whether the cached scene can be blitted for the current viewport:
     * cache valid, zoom within the baked zoom window, and the viewport's
     * world rect inside the baked world rect.
     */
    private cacheUsable(): boolean {
        if (!this.cacheValid) return false;
        const viewport = this.context.viewport;
        const zoomRatio = viewport.zoom / this.bakedZoom;
        if (zoomRatio < 1 / this.maxZoomRatio || zoomRatio > this.maxZoomRatio) return false;
        const vx = viewport.panX;
        const vy = viewport.panY;
        const vw = this.context.cssWidth / viewport.zoom;
        const vh = this.context.cssHeight / viewport.zoom;
        const eps = 0.5;
        return (
            vx >= this.bakeWorldX - eps &&
            vy >= this.bakeWorldY - eps &&
            vx + vw <= this.bakeWorldX + this.bakeWorldW + eps &&
            vy + vh <= this.bakeWorldY + this.bakeWorldH + eps
        );
    }

    /** Blit the cached scene into the visible canvas for the current viewport. */
    private blitCache() {
        const viewport = this.context.viewport;
        const scale = this.context.dpr * this.bakedZoom;
        const vx = viewport.panX;
        const vy = viewport.panY;
        const vw = this.context.cssWidth / viewport.zoom;
        const vh = this.context.cssHeight / viewport.zoom;
        const sx = (vx - this.bakeWorldX) * scale;
        const sy = (vy - this.bakeWorldY) * scale;
        const sw = vw * scale;
        const sh = vh * scale;
        this.api.ctx.save();
        this.api.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.api.ctx.drawImage(
            this.cacheCanvas,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            this.api.canvas.width,
            this.api.canvas.height,
        );
        this.api.ctx.restore();
    }

    /**
     * Draw a subtle highlight around shapes inside the selected frame.
     *
     * When a frame is selected, all non-frame shapes within its bounds
     * get a faint blue tint to visually group them with the frame.
     */
    private drawFrameHighlight() {
        const selected = this.api.getSelectedShape();
        if (!selected || selected.type !== "frame") return;
        const bounds = getShapeBounds(selected);
        if (!bounds) return;

        const currentIds = new Set(
            this.context.existingShapes
                .filter(s => s.type !== "frame" && s.id !== selected.id)
                .map(s => s.id)
                .filter((id): id is string => id !== undefined),
        );

        if (!selected.id || (selected.id === this.lastHighlightFrameId && setsEqual(currentIds, this.lastHighlightShapeIds))) {
            return;
        }
        this.lastHighlightFrameId = selected.id;
        this.lastHighlightShapeIds = currentIds;

        const zoom = this.context.viewport.zoom;
        this.cacheCtx.save();
        this.cacheCtx.strokeStyle = pick(SELECTION_FAINT, this.context.isDark);
        this.cacheCtx.lineWidth = 1 / zoom;
        this.cacheCtx.setLineDash([4 / zoom, 4 / zoom]);

        for (const shape of this.context.existingShapes) {
            if (shape.type === "frame" || shape.id === selected.id) continue;
            const sb = getShapeBounds(shape);
            if (!sb) continue;
            if (sb.x >= bounds.x && sb.y >= bounds.y &&
                sb.x + sb.w <= bounds.x + bounds.w &&
                sb.y + sb.h <= bounds.y + bounds.h) {
                this.cacheCtx.strokeRect(sb.x, sb.y, sb.w, sb.h);
            }
        }
        this.cacheCtx.restore();
    }

    /**
     * Clear the canvas, rebuild the cache if needed, and draw selection handles.
     *
     * This is the main render method called after any state change. It:
     * 1. Clears the visible canvas
     * 2. Draws the background
     * 3. Copies the cached scene (rebuilding if stale)
     * 4. Draws selection handles and alignment guides
     */
    clearCanvas() {
        this.renderPass();
    }

    private renderPass() {
        const { canvas, ctx } = this.api;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(this.context.dpr, 0, 0, this.context.dpr, 0, 0);

        this.drawBackground(ctx, this.context.cssWidth, this.context.cssHeight);

        if (!this.cacheUsable()) {
            this.buildCache();
        }
        this.blitCache();

        const selectionKey = this.selectionKey();
        if (selectionKey !== this.lastSelectionKey) {
            this.lastSelectionKey = selectionKey;
            this.selectionAnim = this.prefersReducedMotion()
                ? null
                : { start: performance.now(), duration: 260 };
        }
        drawSelection(
            this.api.ctx,
            this.context.existingShapes,
            this.context.selectedIds,
            this.context.viewport,
            this.context.isDark,
            this.selectionAnim,
        );

        if (this.context.cropMode && this.context.cropRect) {
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            const r = this.context.cropRect;
            this.api.ctx.fillStyle = CROP_DIM;
            this.api.ctx.fillRect(r.x, r.y, r.w, r.h);
            this.api.ctx.strokeStyle = pick(TEXTAREA_FOCUS, this.context.isDark);
            this.api.ctx.lineWidth = 2 / this.context.viewport.zoom;
            this.api.ctx.setLineDash([6 / this.context.viewport.zoom, 4 / this.context.viewport.zoom]);
            this.api.ctx.strokeRect(r.x, r.y, r.w, r.h);
            this.api.ctx.setLineDash([]);
            const corners = [
                { x: r.x, y: r.y },
                { x: r.x + r.w, y: r.y },
                { x: r.x + r.w, y: r.y + r.h },
                { x: r.x, y: r.y + r.h },
            ];
            const handleSize = 8 / this.context.viewport.zoom;
            for (const c of corners) {
                this.api.ctx.fillStyle = pick(SELECTION_HANDLE, this.context.isDark);
                this.api.ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
            }
            this.api.ctx.restore();
        }

        this.api.drawRemoteCursors(this.api.ctx);
        this.context.laserManager.drawLaserPointer(this.api.ctx);

        // Draw alignment guides
        if (this.context.alignmentGuides.length > 0) {
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            this.api.ctx.strokeStyle = pick(SELECTION_GUIDE, this.context.isDark);
            this.api.ctx.lineWidth = 1 / this.context.viewport.zoom;
            this.api.ctx.setLineDash([4 / this.context.viewport.zoom, 4 / this.context.viewport.zoom]);
            for (const guide of this.context.alignmentGuides) {
                if (guide.x !== undefined) {
                    this.api.ctx.beginPath();
                    this.api.ctx.moveTo(guide.x, 0);
                    this.api.ctx.lineTo(guide.x, this.context.cssHeight / this.context.viewport.zoom);
                    this.api.ctx.stroke();
                }
                if (guide.y !== undefined) {
                    this.api.ctx.beginPath();
                    this.api.ctx.moveTo(0, guide.y);
                    this.api.ctx.lineTo(this.context.cssWidth / this.context.viewport.zoom, guide.y);
                    this.api.ctx.stroke();
                }
            }
            this.api.ctx.setLineDash([]);
            this.api.ctx.restore();
        }

        if (this.selectionAnim && typeof requestAnimationFrame !== "undefined") {
            if (performance.now() - this.selectionAnim.start >= this.selectionAnim.duration) {
                this.selectionAnim = null;
            } else {
                requestAnimationFrame(() => this.renderPass());
            }
        }

        ctx.restore();
    }

    /**
     * Invalidate the scene cache after a DPR change so it re-renders
     * at the new scale (the bake transform is derived from `dpr`).
     */
    updateDpr(dpr: number) {
        this.invalidateCache();
    }
}