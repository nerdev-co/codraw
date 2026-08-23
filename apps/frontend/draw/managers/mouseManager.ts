import { hitTest } from "../renderer";
import { resolveStrokeColor } from "@repo/shapes";
import type { GameContext } from "../gameContext";
import type { PointerInteractionManager } from "./pointerInteractionManager";
import { openShapeEditor, ShapeEditApi } from "./shapeEdit";

/** Capabilities the MouseManager needs from the owning Game instance. */
export interface MouseManagerApi extends ShapeEditApi {
    ctx: CanvasRenderingContext2D;
    pointerInteractionManager: PointerInteractionManager;
    setLaserPosition(x: number, y: number): void;
    clearLaser(): void;
}

/**
 * Mouse + wheel event handling for desktop interaction.
 *
 * Owns mouse down/up/move, double-click, wheel zoom, context menu, and
 * laser-hover handlers. Single-click gestures delegate to the shared
 * pointer interaction manager; double-click delegates to the shared
 * shape editor.
 */
export class MouseManager {
    private contextMenuCallback: ((x: number, y: number) => void) | null = null;

    constructor(
        private context: GameContext,
        private api: MouseManagerApi,
    ) {}

    /** Register (or clear) the callback fired on right-click. */
    setContextMenuCallback(cb: ((x: number, y: number) => void) | null) {
        this.contextMenuCallback = cb;
    }

    private contextMenuHandler = (e: Event) => {
        e.preventDefault();
        const me = e as MouseEvent;
        this.contextMenuCallback?.(me.clientX, me.clientY);
    };

    private laserMouseLeave = () => {
        if (this.context.selectedTool === "laser") {
            this.api.clearLaser();
        }
    };

    private laserMouseEnter = (e: MouseEvent) => {
        if (this.context.selectedTool === "laser") {
            const coords = this.context.viewport.getCanvasCoords(e.clientX, e.clientY);
            this.api.setLaserPosition(coords[0], coords[1]);
        }
    };

    /** Handle mouse down — start panning, drawing, or selecting. */
    mouseDownHandler = (e: MouseEvent) => {
        const pointer = this.api.pointerInteractionManager;
        if (pointer.spacePressed || e.button === 1) {
            pointer.isPanning = true;
            const [localX, localY] = this.context.viewport.clientToCanvasLocal(e.clientX, e.clientY);
            pointer.panStartX = localX - this.context.viewport.panX;
            pointer.panStartY = localY - this.context.viewport.panY;
            return;
        }
        pointer.handlePointerDown(e.clientX, e.clientY, e.shiftKey, e);
    };

    /** Handle mouse up — finalize drawing, erasing, or selection. */
    mouseUpHandler = (e: MouseEvent) => {
        const pointer = this.api.pointerInteractionManager;
        const wasPanning = pointer.isPanning;
        pointer.isPanning = false;
        pointer.isDragging = false;
        pointer.clicked = false;
        if (wasPanning) return;
        pointer.handlePointerUp(e);
    };

    /** Handle mouse move — cursor broadcast, previews, panning, or drawing. */
    mouseMoveHandler = (e: MouseEvent) => {
        const coords = this.context.viewport.getCanvasCoords(e.clientX, e.clientY);
        this.context.cursorManager.broadcastCursor(coords[0], coords[1]);

        if (this.context.selectedTool === "text" && !this.context.textManager.hasTextEditOverlay) {
            this.api.clearCanvas();
            this.api.ctx.save();
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            this.api.ctx.font = `${this.context.textManager.textFontSize}px ${this.context.textManager.textFontFamily}`;
            this.api.ctx.fillStyle = resolveStrokeColor(this.context.currentStyle, this.context.isDark);
            this.api.ctx.globalAlpha = 0.5;
            this.api.ctx.fillText("|", coords[0], coords[1]);
            this.api.ctx.restore();
            return;
        }

        if (this.context.selectedTool === "laser") {
            this.api.setLaserPosition(coords[0], coords[1]);
            return;
        }

        const pluginToolMove = this.context.pluginManager.getTool(this.context.selectedTool);
        if (pluginToolMove?.onMouseMove && this.api.pointerInteractionManager.clicked) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginToolMove.onMouseMove(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.api.pointerInteractionManager.isPanning) {
            const [localX, localY] = this.context.viewport.clientToCanvasLocal(e.clientX, e.clientY);
            this.context.viewport.panX = localX - this.api.pointerInteractionManager.panStartX;
            this.context.viewport.panY = localY - this.api.pointerInteractionManager.panStartY;
            this.context.textManager.syncTextOverlayPosition();
            // Viewport-only change: the render pass re-blits the cached
            // scene; no scene rebuild needed until the pan leaves the
            // baked window.
            this.api.clearCanvas();
            return;
        }
        this.api.pointerInteractionManager.handlePointerMove(e.clientX, e.clientY, e);
    };

    /** Handle double-click — finish a polyline or edit the shape below. */
    dblClickHandler = (e: MouseEvent) => {
        if (this.context.viewMode) return;
        if (this.context.selectedTool === "line" && this.context.pointerInteractionManager.isDrawingPolyline) {
            this.context.pointerInteractionManager.finishPolyline();
            return;
        }
        // The first click of the pair may have committed a stray shape
        // (shape/pen tools commit on click-up). Discard it so the
        // double-click doesn't leave an accidental shape behind.
        const coords = this.context.viewport.getCanvasCoords(e.clientX, e.clientY);
        this.api.pointerInteractionManager.discardStrayClickCommit(coords);
        // Text tool: the clicks themselves already opened the text
        // overlay; opening an editor on top would yank focus away.
        if (this.context.selectedTool === "text") return;
        const lockedIds = new Set(this.context.existingShapes.filter(s => s.locked).map(s => s.id!));
        const hit = hitTest(coords, this.context.existingShapes, this.context.viewport.zoom, lockedIds);
        if (hit === null) return;
        openShapeEditor(this.context, hit, this.api);
    };

    /** Handle scroll wheel — zoom in/out via the viewport. */
    wheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        this.context.viewport.handleWheel(e, this.context.cssWidth, this.context.cssHeight);
        this.context.textManager.syncTextOverlayPosition();
        this.api.clearCanvas();
    };

    /** Attach mouse and wheel event listeners to the canvas. */
    init(canvas: HTMLCanvasElement) {
        canvas.addEventListener("mousedown", this.mouseDownHandler);
        canvas.addEventListener("mouseup", this.mouseUpHandler);
        canvas.addEventListener("mousemove", this.mouseMoveHandler);
        canvas.addEventListener("dblclick", this.dblClickHandler);
        canvas.addEventListener("contextmenu", this.contextMenuHandler);
        canvas.addEventListener("mouseleave", this.laserMouseLeave);
        canvas.addEventListener("mouseenter", this.laserMouseEnter);
        canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
    }

    /** Remove mouse and wheel event listeners from the canvas. */
    destroy(canvas: HTMLCanvasElement) {
        canvas.removeEventListener("mousedown", this.mouseDownHandler);
        canvas.removeEventListener("mouseup", this.mouseUpHandler);
        canvas.removeEventListener("mousemove", this.mouseMoveHandler);
        canvas.removeEventListener("dblclick", this.dblClickHandler);
        canvas.removeEventListener("contextmenu", this.contextMenuHandler);
        canvas.removeEventListener("mouseleave", this.laserMouseLeave);
        canvas.removeEventListener("mouseenter", this.laserMouseEnter);
        canvas.removeEventListener("wheel", this.wheelHandler);
    }
}