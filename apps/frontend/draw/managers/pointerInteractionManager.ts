/**
 * Pointer interaction state machine and dispatch.
 *
 * Owns the interaction state flags and the top-level `handlePointerDown`,
 * `handlePointerUp`, and `handlePointerMove` methods. Tool-specific logic
 * is delegated to submodules so this file stays focused on dispatch.
 */

import {
    getShapeBounds,
    Shape,
    Point,
    Bounds,
    resolveStrokeColor,
    translateShape,
    resizeShape,
    resizeSelection,
    rotateSelection,
    rotatePointAround,
    getShapesBounds,
} from "@repo/shapes";
import rough from "roughjs";
import { hitTest, eraserIntersectsShape, drawDragSelect } from "../renderer";
import { STICKY_NOTES } from "../colorSystem";
import type { GameContext } from "../gameContext";
import type { ArrowManager } from "./arrowManager";
import type { ImageManager } from "./imageManager";
import type { PluginManager } from "./pluginManager";
import type { ShapeManager } from "./shapeManager";
import type { TextManager } from "./textManager";
import {
    createToolState,
    handleSelectPointerDown,
    handleTextPointerDown,
    handleImagePointerDown,
    handleEyedropperPointerDown,
    handleLinePointerDown,
    handleShapeToolPointerDown,
} from "./pointer/pointerToolHandlers";
import { finishPolyline, cancelPolyline } from "./pointer/polylineState";

/** Capabilities the PointerInteractionManager needs from the owning Game instance. */
export interface PointerInteractionApi {
    ctx: CanvasRenderingContext2D;
    rc: ReturnType<typeof rough.canvas>;
    setTool(tool: string): void;
    setHandPanning(active: boolean): void;
    startTextEdit(x: number, y: number, text: string | undefined, index: number | undefined, style: any): void;
    copySelectionAsPng(): void;
    setLaserPosition(x: number, y: number): void;
    toggleTheme(): void;
    toggleSnapToGrid(): void;
    toggleLock(): void;
    selectAll(): void;
    zoomIn(): void;
    zoomOut(): void;
    zoomToFit(): void;
    zoomToSelection(): void;
    resetZoom(): void;
    insertImage(): void;
    openImagePicker(coords: [number, number]): void;
    notifySelection(): void;
    syncShapes(): void;
    invalidateCache(): void;
    clearCanvas(): void;
    pushUndo(prev: Shape[], current: Shape[]): void;
    broadcastCursor(x: number, y: number): void;
    get styleChangeCallback(): (() => void) | null;
    get toolChangeCallback(): ((tool: string) => void) | null;
}

/**
 * Pointer interaction handling for all tool modes.
 *
 * Owns the interaction state flags and dispatches to focused submodules
 * for tool-specific logic.
 */
export class PointerInteractionManager {
    // Pointer interaction state
    isDragging = false;
    isSelecting = false;
    isResizing = false;
    isRotating = false;
    dragOffsetX = 0;
    dragOffsetY = 0;
    dragStartShapes: Shape[] | null = null;
    dragStartPoint: { x: number; y: number } | null = null;
    lastSnappedDelta: { x: number; y: number } | null = null;
    resizeHandle = -1;
    resizeStartBounds: { x: number; y: number; w: number; h: number } | null = null;
    resizeShiftKey = false;
    rotateStartAngle = 0;
    startX = 0;
    startY = 0;
    clicked = false;
    lastPointerX = 0;
    lastPointerY = 0;
    isPanning = false;
    /**
     * The most recent click-committed shape (shape tools commit a
     * default-size shape on click-up). Consumed by the double-click
     * handlers so the first half of a double-click doesn't leave a
     * stray shape behind.
     */
    lastClickCommit: { shapeId: string; x: number; y: number; t: number } | null = null;
    panStartX = 0;
    panStartY = 0;
    spacePressed = false;
    startBinding: { id: string; x: number; y: number } | null = null;
    endBinding: { id: string; x: number; y: number } | null = null;

    // Backward-compatible accessors for polyline/pen/eraser state.
    get isDrawingPolyline() { return this.toolState.drawing.isDrawingPolyline; }
    set isDrawingPolyline(v: boolean) { this.toolState.drawing.isDrawingPolyline = v; }
    get polylinePoints() { return this.toolState.drawing.polylinePoints; }
    set polylinePoints(v: Array<[number, number]>) { this.toolState.drawing.polylinePoints = v; }
    get polylineStartCount() { return this.toolState.drawing.polylineStartCount; }
    set polylineStartCount(v: number) { this.toolState.drawing.polylineStartCount = v; }
    get constantPenPoints() { return this.toolState.drawing.constantPenPoints; }
    set constantPenPoints(v: Array<[number, number]>) { this.toolState.drawing.constantPenPoints = v; }
    get eraserPoints() { return this.toolState.drawing.eraserPoints; }
    set eraserPoints(v: Array<[number, number]>) { this.toolState.drawing.eraserPoints = v; }
    get eraserRadius() { return this.toolState.drawing.eraserRadius; }
    set eraserRadius(v: number) { this.toolState.drawing.eraserRadius = v; }

    constructor(
        private context: GameContext,
        private api: PointerInteractionApi,
    ) {}

    private toolState = createToolState();

    /** Handle pointer down for all tool modes. */
    handlePointerDown(clientX: number, clientY: number, shiftKey: boolean, e: MouseEvent) {
        if (this.context.viewMode) return;
        this.isSelecting = false;
        this.isResizing = false;
        this.isRotating = false;
        this.clicked = true;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.context.viewport.getCanvasCoords(clientX, clientY);
        const isShapeTool =
            this.context.selectedTool === "rect" ||
            this.context.selectedTool === "circle" ||
            this.context.selectedTool === "diamond" ||
            this.context.selectedTool === "ellipsisArc" ||
            this.context.selectedTool === "arrow" ||
            this.context.selectedTool === "line" ||
            this.context.selectedTool === "stickyNote" ||
            this.context.selectedTool === "frame" ||
            this.context.selectedTool === "text";
        this.startX = isShapeTool ? this.snap(coords[0]) : coords[0];
        this.startY = isShapeTool ? this.snap(coords[1]) : coords[1];

        if (this.context.cropMode && this.context.cropRect) {
            const handleSize = 8 / this.context.viewport.zoom;
            const corners = [
                { x: this.context.cropRect.x, y: this.context.cropRect.y },
                { x: this.context.cropRect.x + this.context.cropRect.w, y: this.context.cropRect.y },
                { x: this.context.cropRect.x + this.context.cropRect.w, y: this.context.cropRect.y + this.context.cropRect.h },
                { x: this.context.cropRect.x, y: this.context.cropRect.y + this.context.cropRect.h },
            ];
            for (let i = 0; i < corners.length; i++) {
                const dx = coords[0] - corners[i].x;
                const dy = coords[1] - corners[i].y;
                if (dx * dx + dy * dy <= handleSize * handleSize) {
                    this.context.cropDragCorner = i;
                    this.context.cropStartRect = { ...this.context.cropRect };
                    return;
                }
            }
            return;
        }

        const pluginTool = this.context.pluginManager.getTool(this.context.selectedTool);
        if (pluginTool?.onMouseDown) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginTool.onMouseDown(ctx, coords[0], coords[1], e);
                return;
            }
        }

        if (this.context.selectedTool === "select") {
            handleSelectPointerDown(coords, shiftKey, this.toolState, this.context, this.api, e);
            return;
        }

        if (this.context.selectedTool === "text") {
            handleTextPointerDown(coords, this.toolState, this.context, this.api);
            return;
        }

        if (this.context.selectedTool === "image") {
            handleImagePointerDown(coords, this.toolState, this.context, this.api);
            return;
        }

        if (this.context.selectedTool === "eyedropper") {
            handleEyedropperPointerDown(coords, this.toolState, this.context, this.api);
            return;
        }

        if (this.context.selectedTool === "pen") {
            this.toolState.drawing.constantPenPoints = [[coords[0], coords[1]]];
        }

        if (this.context.selectedTool === "eraser") {
            this.toolState.drawing.eraserPoints = [[coords[0], coords[1]]];
        }

        if (this.context.selectedTool === "line") {
            handleLinePointerDown(this.toolState, this.context);
            return;
        }

        handleShapeToolPointerDown(coords, this.toolState, this.context);
    }

    /** Handle pointer up — commit shapes, finalize drag, or complete eraser stroke */
    handlePointerUp(e: MouseEvent, shiftKey = e.shiftKey) {
        if (this.context.cropMode && this.context.cropDragCorner !== null) {
            this.context.cropDragCorner = null;
            this.context.cropStartRect = null;
            this.api.clearCanvas();
            return;
        }

        if (this.isResizing) {
            this.isResizing = false;
            this.resizeHandle = -1;
            this.resizeStartBounds = null;
            if (this.dragStartShapes) {
                this.api.pushUndo(this.dragStartShapes, this.context.existingShapes);
                this.dragStartShapes = null;
            }
            this.api.syncShapes();
            return;
        }

        if (this.isRotating) {
            this.isRotating = false;
            if (this.dragStartShapes) {
                this.api.pushUndo(this.dragStartShapes, this.context.existingShapes);
                this.dragStartShapes = null;
            }
            this.api.syncShapes();
            return;
        }

        if (this.context.selectedTool === "select") {
            if (this.isSelecting) {
                const selX = Math.min(this.startX, this.lastPointerX);
                const selY = Math.min(this.startY, this.lastPointerY);
                const selW = Math.abs(this.lastPointerX - this.startX);
                const selH = Math.abs(this.lastPointerY - this.startY);
                if (selW > 5 || selH > 5) {
                    for (const shape of this.context.existingShapes) {
                        if (shape.locked) continue;
                        const bounds = getShapeBounds(shape);
                        if (bounds) {
                            const overlap =
                                bounds.x < selX + selW &&
                                bounds.x + bounds.w > selX &&
                                bounds.y < selY + selH &&
                                bounds.y + bounds.h > selY;
                            if (overlap && shape.id) this.context.selectedIds.add(shape.id);
                        }
                    }
                }
                this.api.notifySelection();
                this.api.clearCanvas();
            } else if (this.context.selectedIds.size > 0) {
                if (this.dragStartShapes) {
                    this.api.pushUndo(this.dragStartShapes, this.context.existingShapes);
                    this.dragStartShapes = null;
                }
                this.context.alignmentGuides = [];
                this.api.syncShapes();
            }
            return;
        }

        if (this.context.selectedTool === "pen") {
            if (this.toolState.drawing.constantPenPoints.length < 2) return;
            const pencilShape: Shape = {
                type: "pencil",
                points: [...this.toolState.drawing.constantPenPoints],
                constantWidth: true,
            };
            this.context.shapeManager.commitShape(pencilShape);
            this.lastClickCommit = { shapeId: pencilShape.id!, x: this.startX, y: this.startY, t: performance.now() };
            this.toolState.drawing.constantPenPoints = [];
            return;
        }

        if (this.context.selectedTool === "eraser") {
            if (this.toolState.drawing.eraserPoints.length === 0) return;

            const prev = [...this.context.existingShapes];
            this.context.existingShapes = this.context.existingShapes.filter(
                (shape) => !eraserIntersectsShape(this.toolState.drawing.eraserPoints, shape, this.toolState.drawing.eraserRadius),
            );
            this.api.pushUndo(prev, this.context.existingShapes);
            this.context.selectedIds.clear();
            this.api.notifySelection();
            this.toolState.drawing.eraserPoints = [];
            this.api.syncShapes();
            return;
        }

        const rawCoords = this.context.viewport.getCanvasCoords(this.lastPointerX, this.lastPointerY);
        const isShapeTool =
            this.context.selectedTool === "rect" ||
            this.context.selectedTool === "circle" ||
            this.context.selectedTool === "diamond" ||
            this.context.selectedTool === "ellipsisArc" ||
            this.context.selectedTool === "arrow" ||
            this.context.selectedTool === "line" ||
            this.context.selectedTool === "stickyNote" ||
            this.context.selectedTool === "frame";
        const coords: [number, number] = isShapeTool
            ? [this.snap(rawCoords[0]), this.snap(rawCoords[1])]
            : [rawCoords[0], rawCoords[1]];
        const width = coords[0] - this.startX;
        const height = coords[1] - this.startY;

        let shape: Shape | null = null;
        if (this.context.selectedTool === "rect") {
            shape = {
                type: "rect",
                x: Math.min(this.startX, coords[0]),
                y: Math.min(this.startY, coords[1]),
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
            };
        } else if (this.context.selectedTool === "circle") {
            if (shiftKey) {
                // Shift: constrain to perfect circle, anchored at drag start
                const size = Math.max(Math.abs(width), Math.abs(height));
                const dirX = width < 0 ? -1 : 1;
                const dirY = height < 0 ? -1 : 1;
                const centerX = this.startX + (dirX * size) / 2;
                const centerY = this.startY + (dirY * size) / 2;
                shape = { type: "circle", radius: size / 2, centerX, centerY };
            } else {
                // Default: ellipse matching the actual drag box
                const centerX = this.startX + width / 2;
                const centerY = this.startY + height / 2;
                const radiusX = Math.abs(width) / 2 || 50;
                const radiusY = Math.abs(height) / 2 || 50;
                shape = { type: "circle", radius: 0, radiusX, radiusY, centerX, centerY };
            }
        } else if (this.context.selectedTool === "diamond") {
            shape = {
                type: "diamond",
                centerX: this.startX + width / 2,
                centerY: this.startY + height / 2,
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
            };
        } else if (this.context.selectedTool === "ellipsisArc") {
            shape = {
                type: "ellipsisArc",
                centerX: this.startX + width / 2,
                centerY: this.startY + height / 2,
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
                startAngle: 0,
                endAngle: Math.PI,
            };
        } else if (this.context.selectedTool === "arrow") {
            const startBind = this.context.arrowManager.findNearestBinding([this.startX, this.startY]);
            const endBind = this.context.arrowManager.findNearestBinding([coords[0], coords[1]], startBind?.id);
            shape = {
                type: "arrow",
                startX: startBind?.x ?? this.startX,
                startY: startBind?.y ?? this.startY,
                endX: endBind?.x ?? coords[0],
                endY: endBind?.y ?? coords[1],
                arrowHeadSize: 10,
                startBinding: startBind?.id,
                endBinding: endBind?.id,
            };
        } else if (this.context.selectedTool === "line") {
            if (this.toolState.drawing.isDrawingPolyline) {
                const last = this.toolState.drawing.polylinePoints[this.toolState.drawing.polylinePoints.length - 1];
                const moved = Math.hypot(coords[0] - last[0], coords[1] - last[1]) > 3;
                if (moved) {
                    this.toolState.drawing.polylinePoints.push([coords[0], coords[1]]);
                    if (this.toolState.drawing.polylineStartCount === 1) {
                        finishPolyline(this.toolState.drawing, this.context, this.api);
                    }
                }
            }
        } else if (this.context.selectedTool === "stickyNote") {
            const noteColor = STICKY_NOTES[Math.floor(Math.random() * STICKY_NOTES.length)];
            shape = {
                type: "stickyNote",
                x: Math.min(this.startX, coords[0]),
                y: Math.min(this.startY, coords[1]),
                width: Math.abs(width) || 150,
                height: Math.abs(height) || 150,
                noteColor,
                text: "",
            };
        } else if (this.context.selectedTool === "frame") {
            const frameCount = this.context.existingShapes.filter((s) => s.type === "frame").length;
            shape = {
                type: "frame",
                x: Math.min(this.startX, coords[0]),
                y: Math.min(this.startY, coords[1]),
                width: Math.abs(width) || 300,
                height: Math.abs(height) || 200,
                name: `Frame ${frameCount + 1}`,
            };
        }

        if (!shape) return;
        this.context.shapeManager.commitShape(shape, true);
        this.lastClickCommit = { shapeId: shape.id!, x: this.startX, y: this.startY, t: performance.now() };
    }

    /**
     * A double-click's first click already committed a default-size shape
     * and switched back to select. That shape was never meant to exist —
     * discard it (and any sibling click-commits that landed with it) when
     * the double-click point is close to the commit point and recent
     * enough to be part of the same gesture. Mirrors Excalidraw's
     * double-click cleanup; accidental drag-commits are protected by the
     * 600ms window and the 25px distance check.
     */
    discardStrayClickCommit(coords: [number, number]) {
        const removed = new Set<string>();
        while (this.lastClickCommit) {
            const commit = this.lastClickCommit;
            this.lastClickCommit = null;
            if (performance.now() - commit.t > 600) break;
            const distSq = (coords[0] - commit.x) ** 2 + (coords[1] - commit.y) ** 2;
            if (distSq > 25 * 25) break;
            removed.add(commit.shapeId);
        }
        if (removed.size === 0) return;
        const prev = [...this.context.existingShapes];
        this.context.existingShapes = this.context.existingShapes.filter((s) => !removed.has(s.id!));
        for (const id of removed) this.context.selectedIds.delete(id);
        this.api.pushUndo(prev, this.context.existingShapes);
        this.api.notifySelection();
        this.api.syncShapes();
    }

    /** Handle pointer move for all tool modes. */
    handlePointerMove(clientX: number, clientY: number, e: MouseEvent) {
        if (this.context.viewMode) return;
        this.lastPointerX = clientX;
        this.lastPointerY = clientY;
        const coords = this.context.viewport.getCanvasCoords(clientX, clientY);

        if (this.context.selectedTool === "line" && this.toolState.drawing.isDrawingPolyline && this.toolState.drawing.polylinePoints.length > 0) {
            this.api.clearCanvas();
            this.api.ctx.save();
            // Correct transform order: scale by zoom FIRST, then translate by pan
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            const pts = this.toolState.drawing.polylinePoints;
            this.api.ctx.beginPath();
            this.api.ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
                this.api.ctx.lineTo(pts[i][0], pts[i][1]);
            }
            this.api.ctx.lineTo(this.snap(coords[0]), this.snap(coords[1]));
            this.api.ctx.strokeStyle = this.context.currentStyle.strokeColor;
            this.api.ctx.lineWidth = this.context.currentStyle.strokeWidth;
            this.api.ctx.globalAlpha = this.context.currentStyle.opacity;
            this.api.ctx.stroke();
            this.api.ctx.restore();
        }

        if (!this.clicked) return;

        if (this.context.cropMode && this.context.cropRect && this.context.cropDragCorner !== null && this.context.cropStartRect) {
            const s = this.context.cropStartRect;
            const opp = [
                { x: s.x + s.w, y: s.y + s.h },
                { x: s.x, y: s.y + s.h },
                { x: s.x, y: s.y },
                { x: s.x + s.w, y: s.y },
            ];
            const o = opp[this.context.cropDragCorner];
            const minX = Math.min(s.x, s.x + s.w);
            const maxX = Math.max(s.x, s.x + s.w);
            const minY = Math.min(s.y, s.y + s.h);
            const maxY = Math.max(s.y, s.y + s.h);
            const nx = Math.max(minX, Math.min(coords[0], maxX));
            const ny = Math.max(minY, Math.min(coords[1], maxY));
            const x = Math.min(nx, o.x);
            const y = Math.min(ny, o.y);
            const w = Math.abs(nx - o.x);
            const h = Math.abs(ny - o.y);
            this.context.cropRect = { x, y, w, h };
            this.api.clearCanvas();
            return;
        }

        const pluginToolMove = this.context.pluginManager.getTool(this.context.selectedTool);
        if (pluginToolMove?.onMouseMove) {
            const ctx = this.context.pluginManager.getContext();
            if (ctx) {
                pluginToolMove.onMouseMove(ctx, coords[0], coords[1], e as any);
                return;
            }
        }

        if (this.context.selectedTool === "select" && this.isSelecting) {
            this.dragOffsetX = coords[0] - this.startX;
            this.dragOffsetY = coords[1] - this.startY;
            this.api.clearCanvas();
            this.api.ctx.save();
            // Correct transform order: scale by zoom FIRST, then translate by pan
            this.api.ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
            this.api.ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
            drawDragSelect(this.api.ctx, this.startX, this.startY, coords[0], coords[1], this.context.viewport, this.context.isDark);
            this.api.ctx.restore();
            return;
        }

        if (this.context.selectedTool === "select" && this.isResizing && this.resizeStartBounds) {
            const selected = this.context.existingShapes.filter(
                (s) => s.id && this.context.selectedIds.has(s.id),
            );
            if (selected.length === 0) return;
            const from = this.resizeStartBounds;
            const single = selected.length === 1;
            let px = coords[0];
            let py = coords[1];
            if (single && selected[0] && selected[0].rotation) {
                // Map the pointer into the shape's unrotated frame so
                // resizing a rotated shape tracks its handles correctly.
                const rot = selected[0].rotation;
                const [lx, ly] = rotatePointAround(
                    [px, py],
                    from.x + from.w / 2,
                    from.y + from.h / 2,
                    -rot,
                );
                px = lx;
                py = ly;
            }
            const target = computeResizeTarget(from, px, py, this.resizeShiftKey, this.resizeHandle);
            if (single && selected[0]) {
                resizeShape(selected[0], from, target);
            } else {
                resizeSelection(selected, from, target);
            }
            for (const id of this.context.selectedIds) {
                this.context.arrowManager.updateBoundArrows(id);
                this.context.textManager.updateBoundText(id);
            }
            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }

        if (this.context.selectedTool === "select" && this.isRotating) {
            const selected = this.context.existingShapes.filter(
                (s) => s.id && this.context.selectedIds.has(s.id),
            );
            if (selected.length === 0) return;
            const bounds = getShapesBounds(selected);
            if (!bounds) return;
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            const currentAngle = Math.atan2(coords[1] - cy, coords[0] - cx);
            rotateSelection(selected, cx, cy, currentAngle - this.rotateStartAngle);
            for (const id of this.context.selectedIds) {
                this.context.arrowManager.updateBoundArrows(id);
                this.context.textManager.updateBoundText(id);
            }
            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }

        if (this.context.selectedTool === "select" && this.isDragging) {
            const rawX = coords[0] - this.dragStartPoint!.x;
            const rawY = coords[1] - this.dragStartPoint!.y;
            const snapped = this.snapDragDelta(rawX, rawY);
            const dx = snapped.x - this.lastSnappedDelta!.x;
            const dy = snapped.y - this.lastSnappedDelta!.y;
            this.lastSnappedDelta = snapped;

            for (const id of this.context.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape || shape.locked) continue;
                translateShape(shape, dx, dy);
            }

            for (const id of this.context.selectedIds) {
                this.context.arrowManager.updateBoundArrows(id);
            }
            for (const id of this.context.selectedIds) {
                this.context.textManager.updateBoundText(id);
            }

            this.dragOffsetX = coords[0];
            this.dragOffsetY = coords[1];

            this.context.alignmentGuides = [];
            const tolerance = 5;
            for (const id of this.context.selectedIds) {
                const shape = this.shapeById(id);
                if (!shape) continue;
                const bounds = getShapeBounds(shape);
                if (!bounds) continue;
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                for (const other of this.context.existingShapes) {
                    if (other.id && this.context.selectedIds.has(other.id)) continue;
                    const otherBounds = getShapeBounds(other);
                    if (!otherBounds) continue;
                    const otherCx = otherBounds.x + otherBounds.w / 2;
                    const otherCy = otherBounds.y + otherBounds.h / 2;
                    if (Math.abs(cx - otherCx) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherCx });
                    }
                    if (Math.abs(bounds.x - otherBounds.x) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherBounds.x });
                    }
                    if (Math.abs(bounds.x + bounds.w - otherBounds.x - otherBounds.w) < tolerance) {
                        this.context.alignmentGuides.push({ x: otherBounds.x + otherBounds.w });
                    }
                    if (Math.abs(cy - otherCy) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherCy });
                    }
                    if (Math.abs(bounds.y - otherBounds.y) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherBounds.y });
                    }
                    if (Math.abs(bounds.y + bounds.h - otherBounds.y - otherBounds.h) < tolerance) {
                        this.context.alignmentGuides.push({ y: otherBounds.y + otherBounds.h });
                    }
                }
            }

            this.api.invalidateCache();
            this.api.clearCanvas();
            return;
        }

        if (this.context.selectedTool === "pen") {
            this.toolState.drawing.constantPenPoints.push([coords[0], coords[1]]);
            return;
        }

        if (this.context.selectedTool === "eraser") {
            const last = this.toolState.drawing.eraserPoints[this.toolState.drawing.eraserPoints.length - 1];
            const dx = coords[0] - last[0];
            const dy = coords[1] - last[1];
            if (dx * dx + dy * dy > 25) {
                this.toolState.drawing.eraserPoints.push([coords[0], coords[1]]);
            }
            return;
        }
    }

    // ---- Polyline ----

    /**
     * Cancel the active transient operation (Escape).
     *
     * - Mid-drag / resize / rotate: restore shapes to their pre-operation
     *   snapshot without pushing an undo entry.
     * - Mid drag-select: end the rubber band.
     * - Drawing a shape or polyline: discard the in-progress geometry.
     * - Otherwise: clear the selection.
     */
    handleEscape() {
        if (this.toolState.drag.shape) {
            this.toolState.drag.shape = null;
            this.clicked = false;
            this.api.clearCanvas();
            return;
        }
        if (this.isDragging || this.isResizing || this.isRotating) {
            if (this.dragStartShapes) {
                this.context.existingShapes = structuredClone(this.dragStartShapes);
            }
            this.isDragging = false;
            this.isResizing = false;
            this.isRotating = false;
            this.resizeHandle = -1;
            this.resizeStartBounds = null;
            this.dragStartShapes = null;
            this.dragStartPoint = null;
            this.lastSnappedDelta = null;
            this.context.alignmentGuides = [];
            this.api.syncShapes();
            this.api.clearCanvas();
            return;
        }
        if (this.isSelecting) {
            this.isSelecting = false;
            this.api.clearCanvas();
            return;
        }
        if (this.toolState.drawing.isDrawingPolyline) {
            this.cancelPolyline();
            return;
        }
        if (this.context.selectedIds.size > 0) {
            this.context.selectedIds.clear();
            this.api.notifySelection();
            this.api.clearCanvas();
        }
    }

    /**
     * Finish the in-progress polyline: dedupe nearby points and commit it
     * as a line shape. No-op when fewer than 2 distinct points exist.
     */
    finishPolyline() {
        finishPolyline(this.toolState.drawing, this.context, this.api);
    }

    /** Cancel the in-progress polyline and clear the preview. */
    cancelPolyline() {
        cancelPolyline(this.toolState.drawing, this.api);
    }

    // ---- Helpers moved from Game ----

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    private snap(value: number): number {
        if (this.context.snapToGrid) {
            return Math.round(value / this.context.gridSize) * this.context.gridSize;
        }
        return value;
    }

    private snapDragDelta(rawDx: number, rawDy: number): { x: number; y: number } {
        if (!this.context.snapToGrid) return { x: rawDx, y: rawDy };
        const g = this.context.gridSize;
        const snap = (v: number) => Math.round(v / g) * g;
        const snappedX = snap(rawDx);
        const snappedY = snap(rawDy);
        const dx = snappedX - (this.lastSnappedDelta?.x ?? 0);
        const dy = snappedY - (this.lastSnappedDelta?.y ?? 0);
        return { x: snappedX, y: snappedY };
    }
}

/** Minimum resize dimension in canvas units. */
const MIN_RESIZE_SIZE = 5;

/** Clamp a signed dimension to the minimum size, preserving direction. */
function clampMinSize(v: number): number {
    return v < 0 ? Math.min(v, -MIN_RESIZE_SIZE) : Math.max(v, MIN_RESIZE_SIZE);
}

/**
 * Compute the target bounds for a resize drag.
 *
 * Corner handles (0,2,4,6) anchor on the opposite corner and track the
 * pointer in both axes; edge handles (1,3,5,7) keep the opposite edge and
 * the perpendicular dimension fixed. With Shift, corner handles scale
 * around the fixed anchor while preserving the aspect ratio.
 *
 * @param from - Bounds at drag start (shape-local frame for single
 *               shapes, selection frame for multi-select)
 * @param px - Pointer X in `from`'s coordinate frame
 * @param py - Pointer Y in `from`'s coordinate frame
 * @param shift - Whether Shift is held
 * @param handle - Resize handle index 0-7
 */
function computeResizeTarget(
    from: Bounds,
    px: number,
    py: number,
    shift: boolean,
    handle: number,
): Bounds {
    const right = from.x + from.w;
    const bottom = from.y + from.h;

    if (handle === 1 || handle === 5) {
        const isTop = handle === 1;
        const h = clampMinSize(isTop ? bottom - py : py - from.y);
        return { x: from.x, y: isTop ? bottom - h : from.y, w: from.w, h };
    }
    if (handle === 3 || handle === 7) {
        const isLeft = handle === 7;
        const w = clampMinSize(isLeft ? right - px : px - from.x);
        return { x: isLeft ? right - w : from.x, y: from.y, w, h: from.h };
    }

    const anchor =
        handle === 0
            ? { x: right, y: bottom }
            : handle === 2
              ? { x: from.x, y: bottom }
              : handle === 6
                ? { x: right, y: from.y }
                : { x: from.x, y: from.y };
    let w = px - anchor.x;
    let h = py - anchor.y;
    if (shift && from.w > 0 && from.h > 0) {
        const aspect = from.w / from.h;
        if (Math.abs(w) * from.h > Math.abs(h) * from.w) {
            h = w / aspect;
        } else {
            w = h * aspect;
        }
    }
    w = clampMinSize(w);
    h = clampMinSize(h);
    return {
        x: Math.min(anchor.x, anchor.x + w),
        y: Math.min(anchor.y, anchor.y + h),
        w: Math.abs(w),
        h: Math.abs(h),
    };
}
