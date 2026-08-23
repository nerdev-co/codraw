import { Shape, flipSelection } from "@repo/shapes";
import { shapeById, type ShapeManagerApi } from "./shapeLifecycle";
import type { GameContext } from "../gameContext";

/**
 * Shape styling operations: flip, lock/unlock, copy/paste style.
 *
 * All operations mutate the shared shapes array in context and record an
 * undo entry; rendering and websocket sync happen through the injected
 * api so the manager stays pure shape logic.
 */
export class ShapeStyleManager {
    private copiedStyle: Partial<import("@repo/shapes").ShapeStyle> | null = null;

    /**
     * Flip all selected shapes horizontally or vertically.
     *
     * Mirrors each shape's bounds around the selection center axis and
     * flips each shape in place (point shapes mirror their points, box
     * shapes mirror their origin, text swaps alignment, and the rotation
     * sign is negated so rotated shapes flip correctly). Symmetric shapes
     * (circle, diamond, ellipsisArc) only negate rotation. Bound to
     * Shift+H / Shift+V.
     *
     * @param horizontal - `true` to flip left-right, `false` top-bottom
     */
    flipSelectedShapes(horizontal: boolean) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const selected = this.context.existingShapes.filter(
            (s) => s.id && this.context.selectedIds.has(s.id) && !s.locked,
        );
        flipSelection(selected, horizontal);
        // Bound text lives in container space: re-anchor + inherit the
        // container's flipped rotation so labels follow the flip.
        for (const shape of selected) {
            if (shape.boundTextId) {
                this.context.textManager.updateBoundText(shape.id!);
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Lock selected shapes so they cannot be moved or edited.
     *
     * Locked shapes are skipped by hit-testing, drag operations,
     * and deletion. They remain visible on the canvas.
     */
    lockShapes() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (shape) shape.locked = true;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Unlock selected shapes so they can be moved and edited again.
     *
     * Removes the `locked` flag from each selected shape, making them
     * eligible for hit-testing, dragging, and deletion.
     */
    unlockShapes() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (shape) delete shape.locked;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Copy the style of the first selected shape for pasting onto others.
     * Bound to Ctrl/Cmd+Alt+C.
     */
    copySelectedStyles() {
        const shape = this.getSelectedShape();
        if (!shape || !shape.style) return;
        this.copiedStyle = { ...shape.style };
    }

    /**
     * Apply the previously copied style to all selected shapes.
     * Bound to Ctrl/Cmd+Alt+V.
     */
    pasteSelectedStyles() {
        if (!this.copiedStyle) return;
        this.updateShapeStyle({ ...this.copiedStyle });
    }

    private getSelectedShape(): Shape | null {
        if (this.context.selectedIds.size === 0) return null;
        const first = [...this.context.selectedIds][0];
        if (!first) return null;
        return shapeById(this.context, first) ?? null;
    }

    private updateShapeStyle(updates: Partial<import("@repo/shapes").ShapeStyle>) {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            if (!shape.style) shape.style = { ...this.context.currentStyle };
            Object.assign(shape.style, updates);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    constructor(
        protected context: GameContext,
        protected api: ShapeManagerApi,
    ) {}
}
