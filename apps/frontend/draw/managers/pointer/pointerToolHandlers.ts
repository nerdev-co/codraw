/**
 * Tool-specific pointer-down handlers for the canvas.
 *
 * Each handler receives the current pointer state and the canvas
 * coordinates for the down event, and mutates that state to advance
 * the interaction. The dispatcher in `PointerInteractionManager` calls
 * the appropriate handler after converting client coordinates.
 */

import {
    getShapeBounds,
    getLocalBounds,
    getShapesBounds,
    Shape,
    Point,
    Bounds,
    resolveStrokeColor,
} from "@repo/shapes";
import { hitTest, eraserIntersectsShape, drawDragSelect } from "../../renderer";
import { STICKY_NOTES } from "../../colorSystem";
import type { GameContext } from "../../gameContext";
import type { PointerInteractionApi } from "../pointerInteractionManager";
import { createDrawingState, finishPolyline, cancelPolyline } from "./polylineState";

/** Shape-tool state mutated during a drag gesture. */
export interface ToolDragState {
    shape: Shape | null;
    startX: number;
    startY: number;
    width: number;
    height: number;
    boundTextId: string | undefined;
}

/** Shared mutable state carried through the pointer tool handlers. */
export interface PointerToolState {
    /** In-progress drag state for shape tools. */
    drag: ToolDragState;
    /** Drawing buffers for pen/eraser/polyline. */
    drawing: ReturnType<typeof createDrawingState>;
}

export function createToolState(): PointerToolState {
    return {
        drag: {
            shape: null,
            startX: 0,
            startY: 0,
            width: 0,
            height: 0,
            boundTextId: undefined,
        },
        drawing: createDrawingState(),
    };
}

/** Handle pointer down while the Select tool is active. */
export function handleSelectPointerDown(
    coords: [number, number],
    shiftKey: boolean,
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
    e: MouseEvent,
) {
    const lockedIds = new Set(context.existingShapes.filter((s) => s.locked).map((s) => s.id!));
    const hit = hitTest(coords, context.existingShapes, context.viewport.zoom, lockedIds);
    const pointer = context.pointerInteractionManager;

    const selectedShapes = context.existingShapes.filter(
        (s) => s.id && context.selectedIds.has(s.id),
    );
    const selBounds = getShapesBounds(selectedShapes);
    const single = context.selectedIds.size === 1;

    if (selBounds) {
        // Rotation lever: shown only for single selection, hit-tested at
        // its drawn position (top-center, 24 canvas units above the box).
        if (single) {
            const leverX = selBounds.x + selBounds.w / 2;
            const leverY = selBounds.y - 24 / context.viewport.zoom;
            const leverDist = 30 / context.viewport.zoom;
            if (Math.hypot(coords[0] - leverX, coords[1] - leverY) <= leverDist) {
                const id = [...context.selectedIds][0];
                const shape = context.existingShapes.find((s) => s.id === id);
                if (shape) {
                    pointer.isRotating = true;
                    pointer.rotateStartAngle = Math.atan2(
                        coords[1] - (selBounds.y + selBounds.h / 2),
                        coords[0] - (selBounds.x + selBounds.w / 2),
                    );
                    pointer.dragStartShapes = structuredClone(context.existingShapes);
                    return;
                }
            }
        }

        const handleIdx = hitTestSelectionHandles(coords, selBounds, context.viewport.zoom);
        if (handleIdx !== -1) {
            pointer.isResizing = true;
            pointer.resizeHandle = handleIdx;
            pointer.resizeShiftKey = shiftKey;
            // Single shapes resize in their own (unrotated) frame so
            // handles on a rotated box stay visually correct; multi-select
            // resizes in the shared selection frame.
            pointer.resizeStartBounds =
                single && selectedShapes[0]
                    ? getLocalBounds(selectedShapes[0]) ?? selBounds
                    : selBounds;
            pointer.dragStartShapes = structuredClone(context.existingShapes);
            return;
        }
    }

    if (hit !== null) {
        const hitShape = context.existingShapes[hit];
        if (!hitShape) return;

        if (shiftKey) {
            if (context.selectedIds.has(hitShape.id!)) {
                context.selectedIds.delete(hitShape.id!);
            } else {
                context.selectedIds.add(hitShape.id!);
            }
            api.notifySelection();
            api.clearCanvas();
            return;
        }

        if (hitShape.groupId && !(e.metaKey || e.ctrlKey)) {
            context.selectedIds = new Set();
            for (const s of context.existingShapes) {
                if (s.groupId === hitShape.groupId && s.id) {
                    context.selectedIds.add(s.id);
                }
            }
        } else {
            context.selectedIds = new Set([hitShape.id!]);
        }
        api.notifySelection();
        pointer.isDragging = true;
        pointer.dragOffsetX = coords[0];
        pointer.dragOffsetY = coords[1];
        pointer.dragStartShapes = structuredClone(context.existingShapes);
        pointer.dragStartPoint = { x: coords[0], y: coords[1] };
        pointer.lastSnappedDelta = { x: 0, y: 0 };
    } else {
        context.selectedIds.clear();
        api.notifySelection();
        pointer.isSelecting = true;
        pointer.dragOffsetX = 0;
        pointer.dragOffsetY = 0;
    }
}

/** Handle pointer down while the Text tool is active. */
export function handleTextPointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    const hit = hitTest(coords, context.existingShapes, context.viewport.zoom);
    if (hit !== null) {
        const shape = context.existingShapes[hit];
        if (!shape) return;
        if (shape.type === "text") {
            api.startTextEdit(shape.x, shape.y, shape.text, hit, {
                bold: shape.bold,
                italic: shape.italic,
                fontFamily: shape.fontFamily,
                fontSize: shape.fontSize,
                textAlign: shape.textAlign || "left",
            });
            return;
        }
    }
    api.startTextEdit(context.pointerInteractionManager.startX, context.pointerInteractionManager.startY, undefined, undefined, {
        bold: context.textManager.textBold,
        italic: context.textManager.textItalic,
        fontFamily: context.textManager.textFontFamily,
        fontSize: context.textManager.textFontSize,
        textAlign: context.textManager.textAlign,
    });
}

/** Handle pointer down while the Image tool is active. */
export function handleImagePointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    api.openImagePicker(coords);
    context.pointerInteractionManager.clicked = false;
}

/** Handle pointer down while the Eyedropper tool is active. */
export function handleEyedropperPointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    const hit = hitTest(coords, context.existingShapes, context.viewport.zoom);
    if (hit !== null) {
        const shape = context.existingShapes[hit];
        if (!shape) return;
        if (shape.style?.strokeColor) {
            const resolved = resolveStrokeColor(shape.style, context.isDark);
            context.currentStyle = { ...context.currentStyle, strokeColor: resolved };
            context._styleCustomized = true;
            api.styleChangeCallback?.();
        }
    }
    api.setTool("select");
    context.pointerInteractionManager.clicked = false;
}

/** Handle pointer down while the Line tool is active. */
export function handleLinePointerDown(
    state: PointerToolState,
    context: GameContext,
) {
    if (!state.drawing.isDrawingPolyline) {
        state.drawing.polylinePoints = [[context.pointerInteractionManager.startX, context.pointerInteractionManager.startY]];
        state.drawing.isDrawingPolyline = true;
    } else {
        state.drawing.polylinePoints.push([context.pointerInteractionManager.startX, context.pointerInteractionManager.startY]);
    }
    state.drawing.polylineStartCount = state.drawing.polylinePoints.length;
}

/** Handle pointer down while a shape tool (rect/circle/diamond/etc.) is active. */
export function handleShapeToolPointerDown(
    coords: [number, number],
    state: PointerToolState,
    context: GameContext,
) {
    const startX = context.pointerInteractionManager.startX;
    const startY = context.pointerInteractionManager.startY;
    const width = coords[0] - startX;
    const height = coords[1] - startY;

    if (context.selectedTool === "rect") {
        state.drag.shape = {
            type: "rect",
            x: Math.min(startX, coords[0]),
            y: Math.min(startY, coords[1]),
            width: Math.abs(width) || 100,
            height: Math.abs(height) || 100,
        };
    } else if (context.selectedTool === "circle") {
        const size = Math.max(Math.abs(width), Math.abs(height));
        const centerX = startX + (coords[0] < startX ? -size : size) / 2;
        const centerY = startY + (coords[1] < startY ? -size : size) / 2;
        state.drag.shape = {
            type: "circle",
            radius: size / 2,
            centerX,
            centerY,
        };
        } else if (context.selectedTool === "diamond") {
            state.drag.shape = {
                type: "diamond",
                centerX: startX + width / 2,
                centerY: startY + height / 2,
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
            };
        } else if (context.selectedTool === "ellipsisArc") {
            state.drag.shape = {
                type: "ellipsisArc",
                centerX: startX + width / 2,
                centerY: startY + height / 2,
                width: Math.abs(width) || 100,
                height: Math.abs(height) || 100,
                startAngle: 0,
                endAngle: Math.PI,
            };
        } else if (context.selectedTool === "arrow") {
            const startBind = context.pointerInteractionManager.startBinding;
            const endBind = context.pointerInteractionManager.endBinding;
            state.drag.shape = {
                type: "arrow",
                startX: startBind?.x ?? startX,
                startY: startBind?.y ?? startY,
                endX: endBind?.x ?? coords[0],
                endY: endBind?.y ?? coords[1],
                arrowHeadSize: 10,
                startBinding: startBind?.id,
                endBinding: endBind?.id,
            };
    } else if (context.selectedTool === "stickyNote") {
        const noteColor = STICKY_NOTES[Math.floor(Math.random() * STICKY_NOTES.length)]!;
        state.drag.shape = {
            type: "stickyNote",
            x: Math.min(startX, coords[0]),
            y: Math.min(startY, coords[1]),
            width: Math.abs(width) || 150,
            height: Math.abs(height) || 150,
            noteColor,
            text: "",
        };
    } else if (context.selectedTool === "frame") {
        const frameCount = context.existingShapes.filter((s) => s.type === "frame").length;
        state.drag.shape = {
            type: "frame",
            x: Math.min(startX, coords[0]),
            y: Math.min(startY, coords[1]),
            width: Math.abs(width) || 300,
            height: Math.abs(height) || 200,
            name: `Frame ${frameCount + 1}`,
        };
    }

    if (state.drag.shape) {
        state.drag.startX = startX;
        state.drag.startY = startY;
        state.drag.width = width;
        state.drag.height = height;
        state.drag.boundTextId = state.drag.shape.boundTextId;
    }
}

// ---- Helpers moved from Game ----

/**
 * Hit-test the 8 resize handles of a bounds rectangle.
 *
 * @param coords - Pointer position in canvas coordinates
 * @param bounds - The rectangle whose handles are tested
 * @param zoom - Current viewport zoom (handle radius is screen-constant)
 * @returns Handle index 0-7, or -1 if no handle was hit
 */
function hitTestSelectionHandles(coords: [number, number], bounds: Bounds, zoom: number): number {
    const handles = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w / 2, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
        { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
        { x: bounds.x, y: bounds.y + bounds.h },
        { x: bounds.x, y: bounds.y + bounds.h / 2 },
    ];
    const handleSize = 8 / zoom;
    for (let i = 0; i < handles.length; i++) {
        const dx = coords[0] - handles[i]!.x;
        const dy = coords[1] - handles[i]!.y;
        if (dx * dx + dy * dy <= handleSize * handleSize) return i;
    }
    return -1;
}
