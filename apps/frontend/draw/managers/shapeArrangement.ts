import { getShapeBounds, translateShape } from "@repo/shapes";
import { shapeById, type ShapeManagerApi } from "./shapeLifecycle";
import type { GameContext } from "../gameContext";

/**
 * Shape grouping, z-order manipulation, alignment, and distribution.
 *
 * All operations mutate the shared shapes array in context and record an
 * undo entry; rendering and websocket sync happen through the injected
 * api so the manager stays pure shape logic.
 */
export class ShapeArrangement {
    /**
     * Group all selected shapes under a shared group ID.
     *
     * Grouped shapes are selected and moved together. The group ID is
     * a random UUID generated at group time.
     */
    group() {
        if (this.context.selectedIds.size < 2) return;
        const groupId = crypto.randomUUID();
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (shape) shape.groupId = groupId;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Remove the group ID from all selected shapes.
     *
     * After ungrouping, each shape can be selected and moved independently.
     */
    ungroup() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (shape) delete shape.groupId;
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Bring selected shapes forward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately above it
     * (higher index) in the shapes array. Shapes already at the top
     * remain unchanged.
     */
    bringForward() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const shapes = this.context.existingShapes;
        for (let i = shapes.length - 2; i >= 0; i--) {
            if (shapes[i]!.id && this.context.selectedIds.has(shapes[i]!.id!) && shapes[i + 1]!.id && !this.context.selectedIds.has(shapes[i + 1]!.id!)) {
                [shapes[i]!, shapes[i + 1]!] = [shapes[i + 1]!, shapes[i]!];
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Send selected shapes backward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately below it
     * (lower index) in the shapes array. Shapes already at the bottom
     * remain unchanged.
     */
    sendBackward() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const shapes = this.context.existingShapes;
        for (let i = 1; i < shapes.length; i++) {
            if (shapes[i]!.id && this.context.selectedIds.has(shapes[i]!.id!) && shapes[i - 1]!.id && !this.context.selectedIds.has(shapes[i - 1]!.id!)) {
                [shapes[i]!, shapes[i - 1]!] = [shapes[i - 1]!, shapes[i]!];
            }
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Bring selected shapes to the front (top of z-order).
     *
     * Moves all selected shapes to the end of the shapes array,
     * so they are rendered last (on top of everything else).
     */
    bringToFront() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const selected = this.context.existingShapes.filter(s => s.id && this.context.selectedIds.has(s.id));
        const rest = this.context.existingShapes.filter(s => !s.id || !this.context.selectedIds.has(s.id));
        this.context.existingShapes = [...rest, ...selected];
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Send selected shapes to the back (bottom of z-order).
     *
     * Moves all selected shapes to the beginning of the shapes array,
     * so they are rendered first (behind everything else).
     */
    sendToBack() {
        if (this.context.selectedIds.size === 0) return;
        const prev = [...this.context.existingShapes];
        const selected = this.context.existingShapes.filter(s => s.id && this.context.selectedIds.has(s.id));
        const rest = this.context.existingShapes.filter(s => !s.id || !this.context.selectedIds.has(s.id));
        this.context.existingShapes = [...selected, ...rest];
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the left edge of the leftmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its left edge matches the minimum left edge across all selections.
     */
    alignLeft() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let minX = Infinity;
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            minX = Math.min(minX, bounds.x);
        }
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            translateShape(shape, minX - bounds.x, 0);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the right edge of the rightmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its right edge matches the maximum right edge across all selections.
     */
    alignRight() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let maxX = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            maxX = Math.max(maxX, bounds.x + bounds.w);
        }
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            translateShape(shape, maxX - (bounds.x + bounds.w), 0);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the horizontal center of the selection.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its center aligns with the average center X of all selections.
     */
    alignCenter() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let sumCenterX = 0;
        let count = 0;
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            sumCenterX += bounds.x + bounds.w / 2;
            count++;
        }
        if (count === 0) return;
        const targetX = sumCenterX / count;
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            const shapeCenterX = bounds.x + bounds.w / 2;
            translateShape(shape, targetX - shapeCenterX, 0);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Evenly space selected shapes horizontally.
     *
     * Requires at least 3 selected shapes. Sorts by X position, then
     * redistributes the shapes so the gaps between them are equal.
     * The leftmost and rightmost shapes stay in place.
     */
    distributeHorizontal() {
        if (this.context.selectedIds.size < 3) return;
        const prev = [...this.context.existingShapes];
        const selected = [];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            selected.push({ shape, bounds });
        }
        if (selected.length < 3) return;
        selected.sort((a, b) => a.bounds.x - b.bounds.x);
        const totalWidth = (selected.at(-1)!.bounds.x + selected.at(-1)!.bounds.w) - selected[0]!.bounds.x;
        const totalShapesWidth = selected.reduce((sum, s) => sum + s.bounds.w, 0);
        const gap = (totalWidth - totalShapesWidth) / (selected.length - 1);
        let currentX = selected[0]!.bounds.x;
        for (const { shape, bounds } of selected) {
            const dx = currentX - bounds.x;
            translateShape(shape, dx, 0);
            currentX += bounds.w + gap;
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Evenly space selected shapes vertically.
     *
     * Requires at least 3 selected shapes. Sorts by Y position, then
     * redistributes the shapes so the gaps between them are equal.
     * The topmost and bottommost shapes stay in place.
     */
    distributeVertical() {
        if (this.context.selectedIds.size < 3) return;
        const prev = [...this.context.existingShapes];
        const selected = [];
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            selected.push({ shape, bounds });
        }
        if (selected.length < 3) return;
        selected.sort((a, b) => a.bounds.y - b.bounds.y);
        const totalHeight = (selected.at(-1)!.bounds.y + selected.at(-1)!.bounds.h) - selected[0]!.bounds.y;
        const totalShapesHeight = selected.reduce((sum, s) => sum + s.bounds.h, 0);
        const gap = (totalHeight - totalShapesHeight) / (selected.length - 1);
        let currentY = selected[0]!.bounds.y;
        for (const { shape, bounds } of selected) {
            const dy = currentY - bounds.y;
            translateShape(shape, 0, dy);
            currentY += bounds.h + gap;
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the top edge of the topmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its top edge matches the minimum top edge across all selections.
     */
    alignTop() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let minY = Infinity;
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            minY = Math.min(minY, bounds.y);
        }
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            translateShape(shape, 0, minY - bounds.y);
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
    }

    /**
     * Align selected shapes to the bottom edge of the bottommost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its bottom edge matches the maximum bottom edge across all selections.
     */
    alignBottom() {
        if (this.context.selectedIds.size < 2) return;
        const prev = [...this.context.existingShapes];
        let maxY = -Infinity;
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            maxY = Math.max(maxY, bounds.y + bounds.h);
        }
        for (const id of this.context.selectedIds) {
            const shape = shapeById(this.context, id);
            if (!shape) continue;
            const bounds = getShapeBounds(shape);
            if (!bounds) continue;
            translateShape(shape, 0, maxY - (bounds.y + bounds.h));
        }
        for (const id of this.context.selectedIds) {
            this.context.textManager.updateBoundText(id);
        }
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.invalidateCache();
        this.api.clearCanvas();
        this.api.syncShapes();
    }

    constructor(
        protected context: GameContext,
        protected api: ShapeManagerApi,
    ) {}
}
