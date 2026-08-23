/**
 * Diff-based undo/redo manager for shape state.
 *
 * Instead of storing full snapshots of all shapes, this module computes
 * lightweight diffs (added/removed/modified sets) between consecutive
 * states. Undo reverses a diff; redo re-applies it.
 *
 * This keeps memory usage proportional to the number of *changes* rather
 * than the total shape count, which matters for large canvases.
 *
 * @module undoManager
 */

import { Shape, ShapeDiff, ShapeStyle } from "@repo/shapes";

/**
 * Compare two shape styles for deep equality.
 *
 * @param a - First style (may be `undefined`)
 * @param b - Second style (may be `undefined`)
 * @returns `true` if both styles have identical field values
 */
function styleEqual(a: ShapeStyle | undefined, b: ShapeStyle | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
        a.strokeColor === b.strokeColor &&
        a.backgroundColor === b.backgroundColor &&
        a.strokeWidth === b.strokeWidth &&
        a.roughness === b.roughness &&
        a.opacity === b.opacity &&
        (a.fillStyle ?? "solid") === (b.fillStyle ?? "solid")
    );
}

/**
 * Compare two point arrays for element-wise equality.
 *
 * @param a - First point array
 * @param b - Second point array
 * @returns `true` if both arrays have the same length and identical coordinates
 */
function pointsEqual(a: [number, number][], b: [number, number][]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i]![0] !== b[i]![0] || a[i]![1] !== b[i]![1]) return false;
    }
    return true;
}

/**
 * Deep equality check for two shapes of the same type.
 *
 * Compares type-specific geometric fields plus style and groupId.
 * Does NOT compare IDs (two different shape instances may share an ID
 * during diffing).
 *
 * @param a - First shape
 * @param b - Second shape
 * @returns `true` if both shapes are structurally identical
 */
export function shapesEqual(a: Shape, b: Shape): boolean {
    if (a.type !== b.type) return false;
    if (!styleEqual(a.style, b.style)) return false;
    if (a.groupId !== b.groupId) return false;

    switch (a.type) {
        case "rect": {
            const r = b as typeof a;
            return a.x === r.x && a.y === r.y && a.width === r.width && a.height === r.height;
        }
        case "circle": {
            const c = b as typeof a;
            return a.centerX === c.centerX && a.centerY === c.centerY && a.radius === c.radius;
        }
        case "ellipsisArc": {
            const e = b as typeof a;
            return a.centerX === e.centerX && a.centerY === e.centerY && a.width === e.width && a.height === e.height && a.startAngle === e.startAngle && a.endAngle === e.endAngle;
        }
        case "diamond": {
            const d = b as typeof a;
            return a.centerX === d.centerX && a.centerY === d.centerY && a.width === d.width && a.height === d.height;
        }
        case "pencil": {
            return pointsEqual(a.points, (b as typeof a).points);
        }
        case "arrow": {
            const ar = b as typeof a;
            return (
                a.startX === ar.startX && a.startY === ar.startY &&
                a.endX === ar.endX && a.endY === ar.endY &&
                a.arrowHeadSize === ar.arrowHeadSize &&
                a.label === ar.label &&
                a.startBinding === ar.startBinding &&
                a.endBinding === ar.endBinding
            );
        }
        case "line": {
            const l = b as typeof a;
            if (a.points && l.points) {
                if (a.points.length !== l.points.length) return false;
                return a.points.every((p, i) => p[0] === l.points![i]![0] && p[1] === l.points![i]![1]);
            }
            return a.startX === l.startX && a.startY === l.startY && a.endX === l.endX && a.endY === l.endY;
        }
        case "text": {
            const t = b as typeof a;
            return (
                a.x === t.x && a.y === t.y &&
                a.text === t.text && a.fontSize === t.fontSize &&
                a.bold === t.bold && a.italic === t.italic &&
                a.fontFamily === t.fontFamily && a.textAlign === t.textAlign
            );
        }
        case "image": {
            const im = b as typeof a;
            return a.x === im.x && a.y === im.y && a.width === im.width && a.height === im.height && a.imageData === im.imageData;
        }
        case "eraser": {
            const e = b as typeof a;
            return a.strokeWidth === e.strokeWidth && pointsEqual(a.points, e.points);
        }
        case "stickyNote": {
            const s = b as typeof a;
            return a.x === s.x && a.y === s.y && a.width === s.width && a.height === s.height && a.noteColor === s.noteColor && a.text === s.text;
        }
        case "frame": {
            const f = b as typeof a;
            return a.x === f.x && a.y === f.y && a.width === f.width && a.height === f.height && a.name === f.name;
        }
    }
}

/**
 * Compute the diff between two shape arrays.
 *
 * Builds three maps keyed by shape ID:
 * - `added` — shapes in `next` but not in `prev`
 * - `removed` — shapes in `prev` but not in `next`
 * - `modified` — shapes in both but with different values
 *
 * @param prev - Previous shape array
 * @param next - New shape array
 * @returns A {@link ShapeDiff} describing all changes
 */
function computeDiff(prev: Shape[], next: Shape[]) {
    const prevMap = new Map<string, Shape>();
    for (const s of prev) {
        if (s.id) prevMap.set(s.id, s);
    }
    const nextMap = new Map<string, Shape>();
    for (const s of next) {
        if (s.id) nextMap.set(s.id, s);
    }

    const added = new Map<string, Shape>();
    const removed = new Map<string, Shape>();
    const modified = new Map<string, { prev: Shape; next: Shape }>();

    for (const [id, shape] of nextMap) {
        if (!prevMap.has(id)) {
            added.set(id, shape);
        } else if (!shapesEqual(shape, prevMap.get(id)!)) {
            modified.set(id, { prev: prevMap.get(id)!, next: shape });
        }
    }
    for (const [id, shape] of prevMap) {
        if (!nextMap.has(id)) {
            removed.set(id, shape);
        }
    }
    return { added, removed, modified };
}

/**
 * Merge two diffs into a single diff that represents the combined effect.
 *
 * This is used to collapse consecutive operations on the same shapes into
 * a single undo step. For example, dragging a shape, then immediately
 * dragging it again, should be one undo step rather than two.
 *
 * @param first - The earlier diff
 * @param second - The later diff
 * @returns A merged diff representing the combined change
 */
function mergeDiffs(first: ShapeDiff, second: ShapeDiff): ShapeDiff {
    const added = new Map<string, Shape>();
    const removed = new Map<string, Shape>();
    const modified = new Map<string, { prev: Shape; next: Shape }>();

    const allIds = new Set([
        ...first.added.keys(),
        ...first.removed.keys(),
        ...first.modified.keys(),
        ...second.added.keys(),
        ...second.removed.keys(),
        ...second.modified.keys(),
    ]);

    for (const id of allIds) {
        const inFirstAdded = first.added.has(id);
        const inFirstRemoved = first.removed.has(id);
        const inFirstModified = first.modified.has(id);
        const inSecondAdded = second.added.has(id);
        const inSecondRemoved = second.removed.has(id);
        const inSecondModified = second.modified.has(id);

        if (inFirstAdded && inSecondAdded) {
            added.set(id, second.added.get(id)!);
        } else if (inFirstAdded && inSecondRemoved) {
            // added then removed = no change
        } else if (inFirstAdded && inSecondModified) {
            added.set(id, second.modified.get(id)!.next);
        } else if (inFirstRemoved && inSecondAdded) {
            modified.set(id, { prev: first.removed.get(id)!, next: second.added.get(id)! });
        } else if (inFirstRemoved && inSecondRemoved) {
            removed.set(id, first.removed.get(id)!);
        } else if (inFirstRemoved && inSecondModified) {
            removed.set(id, first.removed.get(id)!);
        } else if (inFirstModified && inSecondAdded) {
            added.set(id, second.added.get(id)!);
        } else if (inFirstModified && inSecondRemoved) {
            removed.set(id, second.removed.get(id)!);
        } else if (inFirstModified && inSecondModified) {
            modified.set(id, {
                prev: first.modified.get(id)!.prev,
                next: second.modified.get(id)!.next,
            });
        } else if (inSecondAdded) {
            added.set(id, second.added.get(id)!);
        } else if (inSecondRemoved) {
            removed.set(id, second.removed.get(id)!);
        } else if (inSecondModified) {
            modified.set(id, second.modified.get(id)!);
        }
    }

    return { added, removed, modified };
}

/**
 * Check if two diffs affect overlapping shape IDs.
 *
 * @param a - First diff
 * @param b - Second diff
 * @returns `true` if both diffs touch at least one common shape ID
 */
function diffsOverlap(a: ShapeDiff, b: ShapeDiff): boolean {
    const aIds = new Set([
        ...a.added.keys(),
        ...a.removed.keys(),
        ...a.modified.keys(),
    ]);
    for (const id of b.added.keys()) {
        if (aIds.has(id)) return true;
    }
    for (const id of b.removed.keys()) {
        if (aIds.has(id)) return true;
    }
    for (const id of b.modified.keys()) {
        if (aIds.has(id)) return true;
    }
    return false;
}

/**
 * Apply a forward diff to a shape array (used by redo).
 *
 * @param shapes - Current shape array
 * @param diff - The diff to apply
 * @returns New shape array with the diff applied
 */
function applyDiff(shapes: Shape[], diff: ShapeDiff): Shape[] {
    const result = [...shapes];
    for (const [id, shape] of diff.removed) {
        const idx = result.findIndex((s) => s.id === id);
        if (idx !== -1) result.splice(idx, 1);
    }
    for (const [id, shape] of diff.added) {
        if (!result.some((s) => s.id === id)) result.push(shape);
    }
    for (const [id, { next }] of diff.modified) {
        const idx = result.findIndex((s) => s.id === id);
        if (idx !== -1) result[idx] = next;
    }
    return result;
}

/**
 * Apply a reverse diff to a shape array (used by undo).
 *
 * Inverts every operation: added→removed, removed→added, modified→previous.
 *
 * @param shapes - Current shape array
 * @param diff - The diff to reverse
 * @returns New shape array with the diff reversed
 */
function applyReverseDiff(shapes: Shape[], diff: ShapeDiff): Shape[] {
    const result = [...shapes];
    for (const [id, shape] of diff.added) {
        const idx = result.findIndex((s) => s.id === id);
        if (idx !== -1) result.splice(idx, 1);
    }
    for (const [id, shape] of diff.removed) {
        if (!result.some((s) => s.id === id)) result.push(shape);
    }
    for (const [id, { prev }] of diff.modified) {
        const idx = result.findIndex((s) => s.id === id);
        if (idx !== -1) result[idx] = prev;
    }
    return result;
}

/**
 * Manages an undo/redo stack using shape diffs.
 *
 * Each call to {@link UndoManager.push} records the diff between the previous and new
 * shape states. Undo reverses the most recent diff; redo re-applies it.
 * The redo stack is cleared whenever a new change is pushed.
 */

/** Maximum number of undo/redo entries to retain */
const MAX_STACK_SIZE = 100;

export class UndoManager {
    private undoStack: ShapeDiff[] = [];
    private redoStack: ShapeDiff[] = [];

    /**
     * Record a shape state change.
     *
     * Computes the diff between `currentShapes` and `nextShapes` and
     * pushes it onto the undo stack. The redo stack is cleared.
     *
     * If the new diff affects the same shapes as the last undo entry,
     * the two diffs are merged so that consecutive operations on the
     * same shapes collapse into a single undo step.
     *
     * @param currentShapes - Shape array before the change
     * @param nextShapes - Shape array after the change
     */
    push(currentShapes: Shape[], nextShapes: Shape[]) {
        const diff = computeDiff(currentShapes, nextShapes);
        if (diff.added.size > 0 || diff.removed.size > 0 || diff.modified.size > 0) {
            if (this.undoStack.length > 0 && diffsOverlap(this.undoStack[this.undoStack.length - 1]!, diff)) {
                this.undoStack[this.undoStack.length - 1] = mergeDiffs(
                    this.undoStack[this.undoStack.length - 1]!,
                    diff,
                );
            } else {
                this.undoStack.push(diff);
                if (this.undoStack.length > MAX_STACK_SIZE) {
                    this.undoStack.shift();
                }
                this.redoStack = [];
            }
        }
    }

    /**
     * Undo the most recent change.
     *
     * @param shapes - Current shape array
     * @returns Updated shape array with the last change reversed,
     *   or `null` if nothing to undo
     */
    undo(shapes: Shape[]): Shape[] | null {
        if (this.undoStack.length === 0) return null;
        const diff = this.undoStack.pop()!;
        this.redoStack.push(diff);
        return applyReverseDiff(shapes, diff);
    }

    /**
     * Redo the most recently undone change.
     *
     * @param shapes - Current shape array
     * @returns Updated shape array with the undone change re-applied,
     *   or `null` if nothing to redo
     */
    redo(shapes: Shape[]): Shape[] | null {
        if (this.redoStack.length === 0) return null;
        const diff = this.redoStack.pop()!;
        this.undoStack.push(diff);
        return applyDiff(shapes, diff);
    }

    /**
     * Clear both undo and redo stacks.
     * Called when the canvas is fully reset (e.g. room change).
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /** Whether there are undo steps available */
    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /** Whether there are redo steps available */
    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }
}
