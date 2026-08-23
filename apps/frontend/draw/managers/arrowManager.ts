import { Shape, Point, getShapeBounds } from "@repo/shapes";
import type { GameContext } from "../gameContext";

/** Capabilities the ArrowManager needs from the owning Game instance. */
export interface ArrowManagerApi {
    syncShapes(): void;
}

/**
 * Arrow-specific behavior: binding detection, repositioning of bound
 * arrows when a shape moves, and arrowhead sizing for the selection.
 *
 * Arrow shapes are drawn and stored like any other shape; only their
 * connection logic lives here.
 */
export class ArrowManager {
    constructor(
        private context: GameContext,
        private api: ArrowManagerApi,
    ) {}

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    /**
     * Find the nearest shape edge or center to bind an arrow endpoint to.
     *
     * Checks all non-arrow shapes and returns the closest binding target
     * within the snap distance threshold. Returns null if no shape is close enough.
     *
     * @param point - The arrow endpoint [x, y] in canvas coordinates
     * @param excludeId - Shape ID to exclude (prevents binding to self)
     * @returns Binding info { id, x, y } or null
     */
    findNearestBinding(point: Point, excludeId?: string): { id: string; x: number; y: number } | null {
        const snapDist = 20 / this.context.viewport.zoom;
        let best: { id: string; x: number; y: number; dist: number } | null = null;

        for (const shape of this.context.existingShapes) {
            if (shape.type === "arrow" || shape.type === "line" || shape.type === "pencil" || shape.type === "eraser") continue;
            if (shape.id && shape.id === excludeId) continue;

            const bounds = getShapeBounds(shape);
            if (!bounds) continue;

            // Check center
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            const dcx = point[0] - cx;
            const dcy = point[1] - cy;
            const distCenter = Math.sqrt(dcx * dcx + dcy * dcy);

            // Check 4 edge midpoints
            const edges = [
                { x: bounds.x + bounds.w / 2, y: bounds.y, dist: Math.sqrt((point[0] - (bounds.x + bounds.w / 2)) ** 2 + (point[1] - bounds.y) ** 2) },
                { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2, dist: Math.sqrt((point[0] - (bounds.x + bounds.w)) ** 2 + (point[1] - (bounds.y + bounds.h / 2)) ** 2) },
                { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h, dist: Math.sqrt((point[0] - (bounds.x + bounds.w / 2)) ** 2 + (point[1] - (bounds.y + bounds.h)) ** 2) },
                { x: bounds.x, y: bounds.y + bounds.h / 2, dist: Math.sqrt((point[0] - bounds.x) ** 2 + (point[1] - (bounds.y + bounds.h / 2)) ** 2) },
            ];

            const candidates = [
                { x: cx, y: cy, dist: distCenter },
                ...edges,
            ];

            for (const c of candidates) {
                if (c.dist < snapDist && (!best || c.dist < best.dist)) {
                    best = { id: shape.id!, x: c.x, y: c.y, dist: c.dist };
                }
            }
        }

        return best ? { id: best.id, x: best.x, y: best.y } : null;
    }

    /**
     * Update arrow endpoints that are bound to a moved shape.
     *
     * After a shape is dragged, all arrows with startBinding or endBinding
     * referencing that shape have their endpoints repositioned to the shape's
     * current edge/center.
     *
     * @param movedShapeId - The ID of the shape that was moved
     */
    updateBoundArrows(movedShapeId: string) {
        const shape = this.shapeById(movedShapeId);
        if (!shape) return;
        const bounds = getShapeBounds(shape);
        if (!bounds) return;

        const cx = bounds.x + bounds.w / 2;
        const cy = bounds.y + bounds.h / 2;

        for (const s of this.context.existingShapes) {
            if (s.type !== "arrow") continue;

            if (s.startBinding === movedShapeId) {
                // Find closest edge of the moved shape
                const edges = [
                    { x: cx, y: bounds.y },
                    { x: bounds.x + bounds.w, y: cy },
                    { x: cx, y: bounds.y + bounds.h },
                    { x: bounds.x, y: cy },
                ];
                let best = edges[0]!;
                let bestDist = Infinity;
                for (const e of edges) {
                    const d = Math.sqrt((s.startX - e.x) ** 2 + (s.startY - e.y) ** 2);
                    if (d < bestDist) { bestDist = d; best = e; }
                }
                s.startX = best.x;
                s.startY = best.y;
            }

            if (s.endBinding === movedShapeId) {
                const edges = [
                    { x: cx, y: bounds.y },
                    { x: bounds.x + bounds.w, y: cy },
                    { x: cx, y: bounds.y + bounds.h },
                    { x: bounds.x, y: cy },
                ];
                let best = edges[0]!;
                let bestDist = Infinity;
                for (const e of edges) {
                    const d = Math.sqrt((s.endX - e.x) ** 2 + (s.endY - e.y) ** 2);
                    if (d < bestDist) { bestDist = d; best = e; }
                }
                s.endX = best.x;
                s.endY = best.y;
            }
        }
    }

    /**
     * Set the arrowhead size for all selected arrow shapes.
     * @param size - Arrowhead size in pixels
     */
    setArrowHeadSize(size: number) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = this.shapeById(id);
            if (shape?.type === "arrow") {
                shape.arrowHeadSize = size;
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }
}