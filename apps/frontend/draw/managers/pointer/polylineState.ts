/**
 * Polyline / pen / eraser drawing state and lifecycle.
 *
 * Owns the in-progress point buffers and the commit/cancel operations
 * for freehand and polyline tools.
 */

import type { GameContext } from "../../gameContext";
import type { PointerInteractionApi } from "../pointerInteractionManager";

/** Point buffers for active freehand / polyline / eraser strokes. */
export interface PointerDrawingState {
    polylinePoints: Array<[number, number]>;
    isDrawingPolyline: boolean;
    polylineStartCount: number;
    constantPenPoints: Array<[number, number]>;
    eraserPoints: Array<[number, number]>;
    eraserRadius: number;
}

export function createDrawingState(): PointerDrawingState {
    return {
        polylinePoints: [],
        isDrawingPolyline: false,
        polylineStartCount: 0,
        constantPenPoints: [],
        eraserPoints: [],
        eraserRadius: 20,
    };
}

/**
 * Finish the in-progress polyline: dedupe nearby points and commit it
 * as a line shape. No-op when fewer than 2 distinct points exist.
 */
export function finishPolyline(
    state: PointerDrawingState,
    context: GameContext,
    api: PointerInteractionApi,
) {
    if (state.polylinePoints.length < 2) {
        state.polylinePoints = [];
        state.isDrawingPolyline = false;
        return;
    }
    const points: Array<[number, number]> = [];
    for (const p of state.polylinePoints) {
        const last = points[points.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 3) {
            points.push(p);
        }
    }
    if (points.length < 2) {
        state.polylinePoints = [];
        state.isDrawingPolyline = false;
        return;
    }
    const first = points[0]!;
    const last = points[points.length - 1]!;
    context.shapeManager.commitShape({
        type: "line",
        startX: first[0],
        startY: first[1],
        endX: last[0],
        endY: last[1],
        points,
    }, true);
    state.polylinePoints = [];
    state.isDrawingPolyline = false;
}

/** Cancel the in-progress polyline and clear the preview. */
export function cancelPolyline(
    state: PointerDrawingState,
    api: PointerInteractionApi,
) {
    state.polylinePoints = [];
    state.isDrawingPolyline = false;
    api.clearCanvas();
}
