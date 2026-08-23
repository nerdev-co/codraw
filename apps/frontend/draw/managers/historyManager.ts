import type { Shape } from "@repo/shapes";
import type { GameContext } from "../gameContext";

/** Capabilities the HistoryManager needs from the owning Game instance. */
export interface HistoryManagerApi {
    removeTextOverlay(): void;
    notifySelection(): void;
    syncShapes(): void;
}

/**
 * Undo/redo stack integration and trash (deleted shape recovery).
 *
 * Applies undo/redo steps through the shared UndoManager, keeps the
 * trash list consistent with restored shapes, and notifies the UI
 * whenever the trash contents change.
 */
export class HistoryManager {
    private trashChangeCallback: (() => void) | null = null;

    constructor(
        private context: GameContext,
        private api: HistoryManagerApi,
    ) {}

    /** Register a callback fired when the trash contents change. */
    setTrashChangeCallback(cb: (() => void) | null) {
        this.trashChangeCallback = cb;
    }

    /**
     * Undo the last shape change and re-render.
     *
     * Restores the shape array to its previous state via the undo manager,
     * clears the selection, and syncs the changes.
     */
    undo() {
        const result = this.context.undoManager.undo(this.context.existingShapes);
        if (!result) return;
        this.api.removeTextOverlay();
        this.context.selectedIds.clear();
        this.api.notifySelection();
        this.cleanupTrash(this.context.existingShapes, result);
        this.context.existingShapes = result;
        this.api.syncShapes();
        this.notifyTrashChange();
    }

    /**
     * Redo the last undone shape change and re-render.
     *
     * Re-applies the most recently undone change via the undo manager,
     * clears the selection, and syncs the changes.
     */
    redo() {
        const result = this.context.undoManager.redo(this.context.existingShapes);
        if (!result) return;
        this.api.removeTextOverlay();
        this.context.selectedIds.clear();
        this.api.notifySelection();

        const currentIds = new Set(this.context.existingShapes.map(s => s.id).filter(Boolean) as string[]);
        const nextIds = new Set(result.map(s => s.id).filter(Boolean) as string[]);
        for (const id of currentIds) {
            if (!nextIds.has(id)) {
                const shape = this.context.existingShapes.find(s => s.id === id);
                if (shape && !this.context.trash.some(s => s.id === id)) {
                    this.context.trash.push(structuredClone(shape));
                }
            }
        }

        this.cleanupTrash(this.context.existingShapes, result);
        this.context.existingShapes = result;
        this.api.syncShapes();
        this.notifyTrashChange();
    }

    /** Whether an undo step is available (for UI disabled states) */
    get canUndo(): boolean {
        return this.context.undoManager.canUndo;
    }

    /** Whether a redo step is available (for UI disabled states) */
    get canRedo(): boolean {
        return this.context.undoManager.canRedo;
    }

    /**
     * Remove shapes from trash that have been restored to existingShapes
     * by undo/redo.
     */
    private cleanupTrash(prevShapes: Shape[], nextShapes: Shape[]) {
        const prevIds = new Set(prevShapes.map(s => s.id).filter(Boolean) as string[]);
        const restoredIds = new Set<string>();
        for (const s of nextShapes) {
            if (s.id && !prevIds.has(s.id)) {
                restoredIds.add(s.id);
            }
        }
        if (restoredIds.size > 0) {
            this.context.trash = this.context.trash.filter(s => !restoredIds.has(s.id!));
        }
    }

    /** Notify listeners that the trash contents changed */
    notifyTrashChange() {
        this.trashChangeCallback?.();
    }

    /**
     * Get all shapes currently in the trash.
     * @returns Array of deleted shapes available for restore
     */
    getTrash(): Shape[] {
        return [...this.context.trash];
    }

    /**
     * Restore a shape from the trash back to the canvas.
     * @param id - The shape ID to restore
     */
    restoreFromTrash(id: string) {
        const idx = this.context.trash.findIndex((s) => s.id === id);
        if (idx === -1) return;
        const shape = this.context.trash[idx]!;
        const prev = [...this.context.existingShapes];
        this.context.existingShapes.push(structuredClone(shape));
        this.context.trash.splice(idx, 1);
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
        this.notifyTrashChange();
    }

    /**
     * Permanently remove all shapes from the trash.
     * This action cannot be undone.
     */
    emptyTrash() {
        if (this.context.trash.length === 0) return;
        const prev = [...this.context.existingShapes];
        this.context.trash = [];
        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
        this.notifyTrashChange();
    }
}
