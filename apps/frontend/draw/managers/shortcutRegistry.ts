/**
 * Data-driven keyboard shortcut registry.
 *
 * Each entry describes a key combination, its category, and the action
 * to perform. The `KeyboardManager` dispatches events by matching
 * against this registry instead of a long if/else chain.
 */

import { getShapeBounds, translateShape } from "@repo/shapes";
import type { GameContext } from "../gameContext";

export interface KeyboardManagerApi {
    selectedTool: string;
    setTool(tool: string): void;
    setHandPanning(active: boolean): void;
    enterEditAction(): void;
    insertImage(): void;
    copySelectionAsPng(): void;
    toggleLock(): void;
    cancelPolyline(): void;
    cancelImageCrop(): void;
    searchCallback?: (() => void) | null;
    shortcutsCallback?: (() => void) | null;
    invalidateCache(): void;
    clearCanvas(): void;
    syncShapes(): void;
    notifySelection(): void;
    setSpacePressed(v: boolean): void;
}

export type ShortcutCategory =
    | "tool"
    | "view"
    | "edit"
    | "navigation"
    | "text"
    | "panel"
    | "misc";

export interface Shortcut {
    id: string;
    category: ShortcutCategory;
    description: string;
    match: (e: KeyboardEvent, ctx: GameContext) => boolean;
    action: (ctx: GameContext, api: KeyboardManagerApi, e: KeyboardEvent) => void;
}

export function createShortcutRegistry(): Shortcut[] {
    return [
        // ── Tool switching ─────────────────────────────────────────
        {
            id: "tool:select",
            category: "tool",
            description: "Select tool (V)",
            match: (e, ctx) =>
                e.key === "v" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("select"),
        },
        {
            id: "tool:hand",
            category: "tool",
            description: "Hand/pan tool (H)",
            match: (e, ctx) =>
                e.key === "h" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setHandPanning(!ctx._handMode),
        },
        {
            id: "tool:rect",
            category: "tool",
            description: "Rectangle tool (R)",
            match: (e, ctx) =>
                e.key === "r" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("rect"),
        },
        {
            id: "tool:diamond",
            category: "tool",
            description: "Diamond tool (D)",
            match: (e, ctx) =>
                e.key === "d" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("diamond"),
        },
        {
            id: "tool:circle",
            category: "tool",
            description: "Circle tool (O)",
            match: (e, ctx) =>
                e.key === "o" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("circle"),
        },
        {
            id: "tool:arrow",
            category: "tool",
            description: "Arrow tool (A)",
            match: (e, ctx) =>
                e.key === "a" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("arrow"),
        },
        {
            id: "tool:line",
            category: "tool",
            description: "Line tool (L)",
            match: (e, ctx) =>
                e.key === "l" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("line"),
        },
        {
            id: "tool:pen",
            category: "tool",
            description: "Pen/pencil tool (P)",
            match: (e, ctx) =>
                e.key === "p" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("pen"),
        },
        {
            id: "tool:text",
            category: "tool",
            description: "Text tool (T)",
            match: (e, ctx) =>
                e.key === "t" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("text"),
        },
        {
            id: "tool:image",
            category: "tool",
            description: "Image tool (digit 9)",
            match: (e, ctx) =>
                e.key === "9" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.insertImage(),
        },
        {
            id: "tool:eraser",
            category: "tool",
            description: "Eraser tool (E)",
            match: (e, ctx) =>
                e.key === "e" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("eraser"),
        },
        {
            id: "tool:eyedropper",
            category: "tool",
            description: "Eyedropper tool (I)",
            match: (e, ctx) =>
                e.key === "i" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("eyedropper"),
        },
        {
            id: "tool:frame",
            category: "tool",
            description: "Frame tool (F)",
            match: (e, ctx) =>
                e.key === "f" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("frame"),
        },
        {
            id: "tool:laser",
            category: "tool",
            description: "Laser pointer (K)",
            match: (e, ctx) =>
                e.key === "k" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.setTool("laser"),
        },
        {
            id: "tool:digitTools",
            category: "tool",
            description: "Digit tool shortcuts (1-8, 0)",
            match: (e, ctx) => {
                const digitTools: Record<string, string> = {
                    "1": "select",
                    "2": "rect",
                    "3": "diamond",
                    "4": "circle",
                    "5": "arrow",
                    "6": "line",
                    "7": "pen",
                    "8": "text",
                    "0": "eraser",
                };
                return (
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey &&
                    !e.shiftKey &&
                    e.key in digitTools
                );
            },
            action: (ctx, api, e) => {
                const digitTools: Record<string, string> = {
                    "1": "select",
                    "2": "rect",
                    "3": "diamond",
                    "4": "circle",
                    "5": "arrow",
                    "6": "line",
                    "7": "pen",
                    "8": "text",
                    "0": "eraser",
                };
                const tool = digitTools[e.key];
                if (tool === "image") {
                    api.insertImage();
                } else {
                    api.setTool(tool);
                }
            },
        },

        // ── View / zoom ────────────────────────────────────────────
        {
            id: "view:zoomIn",
            category: "view",
            description: "Zoom in (Ctrl/Cmd + =)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                (e.key === "=" || e.key === "+"),
            action: (ctx, api, _e) => {
                ctx.viewport.zoomIn(ctx.cssWidth, ctx.cssHeight);
                ctx.textManager.syncTextOverlayPosition();
                api.clearCanvas();
            },
        },
        {
            id: "view:zoomOut",
            category: "view",
            description: "Zoom out (Ctrl/Cmd + -)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "-",
            action: (ctx, api, _e) => {
                ctx.viewport.zoomOut(ctx.cssWidth, ctx.cssHeight);
                ctx.textManager.syncTextOverlayPosition();
                api.clearCanvas();
            },
        },
        {
            id: "view:resetZoom",
            category: "view",
            description: "Reset zoom (Ctrl/Cmd + 0)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "0",
            action: (ctx, api, _e) => {
                ctx.viewport.zoom = 1;
                ctx.viewport.panX = 0;
                ctx.viewport.panY = 0;
                ctx.textManager.syncTextOverlayPosition();
                api.clearCanvas();
            },
        },
        {
            id: "view:zoomToSelection",
            category: "view",
            description: "Zoom to selection (Shift + 2)",
            match: (e, ctx) =>
                e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                e.key === "2",
            action: (ctx, api, _e) => {
                if (ctx.selectedIds.size === 0) return;
                let minX = Infinity,
                    minY = Infinity,
                    maxX = -Infinity,
                    maxY = -Infinity;
                for (const id of ctx.selectedIds) {
                    const shape =
                        ctx.existingShapes.find((s) => s.id === id) ??
                        ctx.trash.find((s) => s.id === id);
                    if (!shape) continue;
                    const b = getShapeBounds(shape);
                    if (!b) continue;
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.w);
                    maxY = Math.max(maxY, b.y + b.h);
                }
                if (minX === Infinity) return;
                ctx.viewport.zoomToFit(
                    { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
                    ctx.cssWidth,
                    ctx.cssHeight,
                );
                ctx.textManager.syncTextOverlayPosition();
                api.clearCanvas();
            },
        },
        {
            id: "view:zoomToFit",
            category: "view",
            description: "Zoom to fit (Shift + 1)",
            match: (e, ctx) =>
                e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                e.key === "1",
            action: (ctx, api, _e) => {
                let minX = Infinity,
                    minY = Infinity,
                    maxX = -Infinity,
                    maxY = -Infinity;
                let hasShapes = false;
                for (const shape of ctx.existingShapes) {
                    if (shape.type === "eraser") continue;
                    const b = getShapeBounds(shape);
                    if (!b) continue;
                    hasShapes = true;
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.w);
                    maxY = Math.max(maxY, b.y + b.h);
                }
                if (!hasShapes) return;
                ctx.viewport.zoomToFit(
                    { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
                    ctx.cssWidth,
                    ctx.cssHeight,
                );
                ctx.textManager.syncTextOverlayPosition();
                api.clearCanvas();
            },
        },

        // ── Edit ───────────────────────────────────────────────────
        {
            id: "edit:undo",
            category: "edit",
            description: "Undo (Ctrl/Cmd + Z)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                e.key === "z" &&
                !e.shiftKey,
            action: (ctx) => ctx.historyManager.undo(),
        },
        {
            id: "edit:redo",
            category: "edit",
            description: "Redo (Ctrl/Cmd + Shift + Z)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                e.key === "z" &&
                e.shiftKey,
            action: (ctx) => ctx.historyManager.redo(),
        },
        {
            id: "edit:copy",
            category: "edit",
            description: "Copy selected shapes (Ctrl/Cmd + C)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "c",
            action: (ctx) => ctx.clipboardManager.copySelectedShape(),
        },
        {
            id: "edit:paste",
            category: "edit",
            description: "Paste (Ctrl/Cmd + V)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "v",
            action: (ctx) => {
                ctx.clipboardManager.pendingPaste = true;
            },
        },
        {
            id: "edit:cut",
            category: "edit",
            description: "Cut selected shapes (Ctrl/Cmd + X)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "x",
            action: (ctx) => {
                ctx.clipboardManager.copySelectedShape();
                ctx.shapeManager.deleteSelectedShape();
            },
        },
        {
            id: "edit:duplicate",
            category: "edit",
            description: "Duplicate selected shapes (Ctrl/Cmd + D)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "d",
            action: (ctx) => ctx.shapeManager.duplicateSelected(),
        },
        {
            id: "edit:group",
            category: "edit",
            description: "Group selected shapes (Ctrl/Cmd + G)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "g",
            action: (ctx) => ctx.shapeManager.group(),
        },
        {
            id: "edit:ungroup",
            category: "edit",
            description: "Ungroup selected shapes (Ctrl/Cmd + Shift + G)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                e.shiftKey &&
                e.key === "g",
            action: (ctx) => ctx.shapeManager.ungroup(),
        },
        {
            id: "edit:delete",
            category: "edit",
            description: "Delete selected shapes (Delete/Backspace)",
            match: (e, ctx) =>
                (e.code === "Delete" || e.code === "Backspace") &&
                ctx.selectedIds.size > 0,
            action: (ctx) => ctx.shapeManager.deleteSelectedShape(),
        },
        {
            id: "edit:escape",
            category: "edit",
            description: "Cancel current action / deselect (Esc)",
            match: (e, ctx) =>
                e.key === "Escape" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey,
            action: (ctx, api, _e) => {
                ctx.pointerInteractionManager.handleEscape();
                api.clearCanvas();
            },
        },
        {
            id: "edit:selectAll",
            category: "edit",
            description: "Select all shapes (Ctrl/Cmd + A)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "a",
            action: (ctx, api, _e) => {
                ctx.selectedIds = new Set(
                    ctx.existingShapes
                        .map((s) => s.id)
                        .filter((id): id is string => id !== undefined),
                );
                api.notifySelection?.();
                api.clearCanvas();
            },
        },

        // ── Text formatting ────────────────────────────────────────
        {
            id: "text:bold",
            category: "text",
            description: "Toggle bold (Ctrl/Cmd + B)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "b",
            action: (ctx) => {
                ctx.textManager.textBold = !ctx.textManager.textBold;
            },
        },
        {
            id: "text:italic",
            category: "text",
            description: "Toggle italic (Ctrl/Cmd + I)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "i",
            action: (ctx) => {
                ctx.textManager.textItalic = !ctx.textManager.textItalic;
            },
        },

        // ── Alignment & distribution ───────────────────────────────
        {
            id: "edit:alignTop",
            category: "edit",
            description: "Align top (Ctrl/Cmd + Shift + T)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "t",
            action: (ctx) => ctx.shapeManager.alignTop(),
        },
        {
            id: "edit:alignBottom",
            category: "edit",
            description: "Align bottom (Ctrl/Cmd + Shift + B)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "b",
            action: (ctx) => ctx.shapeManager.alignBottom(),
        },
        {
            id: "edit:alignLeft",
            category: "edit",
            description: "Align left (Ctrl/Cmd + Shift + L)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "l",
            action: (ctx) => ctx.shapeManager.alignLeft(),
        },
        {
            id: "edit:alignRight",
            category: "edit",
            description: "Align right (Ctrl/Cmd + Shift + R)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "r",
            action: (ctx) => ctx.shapeManager.alignRight(),
        },
        {
            id: "edit:alignCenter",
            category: "edit",
            description: "Align center (Ctrl/Cmd + Shift + C)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "c",
            action: (ctx) => ctx.shapeManager.alignCenter(),
        },
        {
            id: "edit:distributeHorizontal",
            category: "edit",
            description: "Distribute horizontally (Ctrl/Cmd + Shift + H)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "h",
            action: (ctx) => ctx.shapeManager.distributeHorizontal(),
        },
        {
            id: "edit:distributeVertical",
            category: "edit",
            description: "Distribute vertically (Ctrl/Cmd + Shift + V)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "v",
            action: (ctx) => ctx.shapeManager.distributeVertical(),
        },

        // ── Z-order ────────────────────────────────────────────────
        {
            id: "edit:bringForward",
            category: "edit",
            description: "Bring forward (Ctrl/Cmd + ])",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "]",
            action: (ctx) => ctx.shapeManager.bringForward(),
        },
        {
            id: "edit:sendBackward",
            category: "edit",
            description: "Send backward (Ctrl/Cmd + [)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "[",
            action: (ctx) => ctx.shapeManager.sendBackward(),
        },
        {
            id: "edit:bringToFront",
            category: "edit",
            description: "Bring to front (Ctrl/Cmd + Shift + ])",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "]",
            action: (ctx) => ctx.shapeManager.bringToFront(),
        },
        {
            id: "edit:sendToBack",
            category: "edit",
            description: "Send to back (Ctrl/Cmd + Shift + [)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                !e.altKey &&
                e.key === "[",
            action: (ctx) => ctx.shapeManager.sendToBack(),
        },

        // ── Lock ───────────────────────────────────────────────────
        {
            id: "edit:lock",
            category: "edit",
            description: "Lock/unlock selected shapes (Ctrl/Cmd + L)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "l",
            action: (ctx, api, _e) => {
                if (ctx.selectedIds.size === 0) {
                    api.toggleLock();
                    return;
                }
                const allLocked = [...ctx.selectedIds].every((id) => {
                    const shape =
                        ctx.existingShapes.find((s) => s.id === id) ??
                        ctx.trash.find((s) => s.id === id);
                    return shape?.locked;
                });
                if (allLocked) {
                    ctx.shapeManager.unlockShapes();
                } else {
                    ctx.shapeManager.lockShapes();
                }
            },
        },

        // ── Copy/paste style ──────────────────────────────────────
        {
            id: "edit:copyStyle",
            category: "edit",
            description: "Copy shape style (Ctrl/Cmd + Alt + C)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.altKey &&
                !e.shiftKey &&
                e.code === "KeyC",
            action: (ctx) => ctx.shapeManager.copySelectedStyles(),
        },
        {
            id: "edit:pasteStyle",
            category: "edit",
            description: "Paste shape style (Ctrl/Cmd + Alt + V)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                e.altKey &&
                !e.shiftKey &&
                e.code === "KeyV",
            action: (ctx) => ctx.shapeManager.pasteSelectedStyles(),
        },
        {
            id: "edit:copyPng",
            category: "edit",
            description: "Copy selection as PNG (Shift + Alt + C)",
            match: (e, ctx) =>
                e.shiftKey &&
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                e.code === "KeyC",
            action: (ctx, api, _e) => api.copySelectionAsPng(),
        },

        // ── Flip ──────────────────────────────────────────────────
        {
            id: "edit:flipHorizontal",
            category: "edit",
            description: "Flip horizontally (Shift + H)",
            match: (e, ctx) =>
                e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                e.code === "KeyH",
            action: (ctx) => ctx.shapeManager.flipSelectedShapes(true),
        },
        {
            id: "edit:flipVertical",
            category: "edit",
            description: "Flip vertically (Shift + V)",
            match: (e, ctx) =>
                e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                e.code === "KeyV",
            action: (ctx) => ctx.shapeManager.flipSelectedShapes(false),
        },

        // ── Panels ────────────────────────────────────────────────
        {
            id: "panel:search",
            category: "panel",
            description: "Open search (Ctrl/Cmd + F)",
            match: (e, ctx) =>
                (e.ctrlKey || e.metaKey) &&
                !e.altKey &&
                !e.shiftKey &&
                e.key === "f",
            action: (ctx, api, _e) => api.searchCallback?.(),
        },
        {
            id: "panel:shortcuts",
            category: "panel",
            description: "Show shortcuts panel (?)",
            match: (e, ctx) =>
                e.key === "?" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey,
            action: (ctx, api, _e) => api.shortcutsCallback?.(),
        },

        // ── Misc ──────────────────────────────────────────────────
        {
            id: "misc:theme",
            category: "misc",
            description: "Toggle theme (Alt + Shift + D)",
            match: (e, ctx) =>
                e.altKey &&
                e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                e.code === "KeyD",
            action: (ctx) => ctx.styleManager.setTheme(!ctx.isDark),
        },
        {
            id: "misc:zenMode",
            category: "misc",
            description: "Toggle zen mode (Alt + Z)",
            match: (e, ctx) =>
                e.altKey &&
                !e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                e.code === "KeyZ",
            action: (ctx, api, _e) => {
                ctx.zenMode = !ctx.zenMode;
                api.clearCanvas();
            },
        },
        {
            id: "misc:viewMode",
            category: "misc",
            description: "Toggle view mode (Alt + R)",
            match: (e, ctx) =>
                e.altKey &&
                !e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                e.code === "KeyR",
            action: (ctx, api, _e) => {
                ctx.viewMode = !ctx.viewMode;
                if (ctx.viewMode) {
                    ctx.selectedIds.clear();
                    api.notifySelection?.();
                }
                api.clearCanvas();
            },
        },
        {
            id: "misc:snapToGrid",
            category: "misc",
            description: "Toggle snap to grid (G / Ctrl/Cmd + ')",
            match: (e, ctx) =>
                ((e.ctrlKey || e.metaKey) &&
                    !e.altKey &&
                    !e.shiftKey &&
                    e.key === "'") ||
                (!e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey &&
                    !e.shiftKey &&
                    e.code === "KeyG"),
            action: (ctx) => {
                ctx.snapToGrid = !ctx.snapToGrid;
            },
        },
        {
            id: "misc:snapToObjects",
            category: "misc",
            description: "Toggle snap to objects (Alt + S)",
            match: (e, ctx) =>
                e.altKey &&
                !e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                e.code === "KeyS",
            action: (ctx) => {
                ctx.snapToObjects = !ctx.snapToObjects;
            },
        },
        {
            id: "misc:background",
            category: "misc",
            description: "Cycle background (B)",
            match: (e, ctx) =>
                e.key === "b" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx) => ctx.styleManager.cycleBackground(),
        },
        {
            id: "misc:stayAfterDraw",
            category: "misc",
            description: "Toggle keep tool active after drawing (Q)",
            match: (e, ctx) =>
                e.key === "q" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx) => {
                ctx.stayAfterDraw = !ctx.stayAfterDraw;
            },
        },
        {
            id: "misc:toggleShapeType",
            category: "misc",
            description: "Cycle shape type (Tab)",
            // Only intercept Tab while a shape tool is active so the
            // browser's focus navigation keeps working everywhere else
            // (accessibility: Tab must move focus out of the canvas).
            match: (e, ctx) =>
                e.key === "Tab" &&
                ["rect", "diamond", "circle", "arrow", "line"].includes(
                    ctx.selectedTool ?? "",
                ),
            action: (ctx, api, e) => {
                if (api.selectedTool === "arrow") {
                    api.setTool("line");
                    return;
                }
                if (api.selectedTool === "line") {
                    api.setTool("arrow");
                    return;
                }
                const cycle = ["rect", "diamond", "circle"];
                const idx = cycle.indexOf(api.selectedTool as string);
                if (idx === -1) {
                    api.setTool("rect");
                    return;
                }
                api.setTool(cycle[(idx + (e.shiftKey ? cycle.length - 1 : 1)) % cycle.length]);
            },
        },
        {
            id: "misc:enterEdit",
            category: "misc",
            description: "Enter edit action (Enter)",
            match: (e, ctx) =>
                e.key === "Enter" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !e.shiftKey,
            action: (ctx, api, _e) => api.enterEditAction(),
        },

        // ── Navigation (arrow keys, page up/down) ────────────────
        {
            id: "navigation:arrowKeys",
            category: "navigation",
            description: "Arrow key pan / nudge",
            match: (e, ctx) =>
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                    e.key,
                ),
            action: (ctx, api, e) => {
                const step = ctx.snapToGrid ? ctx.gridSize : e.shiftKey ? 10 : 1;

                if (ctx.selectedIds.size > 0) {
                    const selectedShapes = ctx.existingShapes
                        .filter((s) => s.id && ctx.selectedIds.has(s.id))
                        .map((s) => structuredClone(s));
                    const prevMap = new Map(
                        selectedShapes.map((s) => [s.id, s]),
                    );
                    const prev = ctx.existingShapes.map((s) => prevMap.get(s.id) ?? s);
                    const dx =
                        e.key === "ArrowLeft"
                            ? -step
                            : e.key === "ArrowRight"
                              ? step
                              : 0;
                    const dy =
                        e.key === "ArrowUp"
                            ? -step
                            : e.key === "ArrowDown"
                              ? step
                              : 0;
                    for (const id of ctx.selectedIds) {
                        const shape =
                            ctx.existingShapes.find((s) => s.id === id) ??
                            ctx.trash.find((s) => s.id === id);
                        if (!shape || shape.locked) continue;
                        translateShape(shape, dx, dy);
                    }
                    for (const id of ctx.selectedIds) {
                        ctx.arrowManager.updateBoundArrows(id);
                    }
                    for (const id of ctx.selectedIds) {
                        ctx.textManager.updateBoundText(id);
                    }
                    ctx.undoManager.push(prev, ctx.existingShapes);
                    api.invalidateCache();
                    api.clearCanvas();
                    api.syncShapes();
                } else {
                    const panStep = e.shiftKey ? 100 : 20;
                    if (e.key === "ArrowLeft") ctx.viewport.panX += panStep;
                    if (e.key === "ArrowRight") ctx.viewport.panX -= panStep;
                    if (e.key === "ArrowUp") ctx.viewport.panY += panStep;
                    if (e.key === "ArrowDown") ctx.viewport.panY -= panStep;
                    api.clearCanvas();
                }
            },
        },
        {
            id: "navigation:pageUp",
            category: "navigation",
            description: "Page Up - pan up",
            match: (e, ctx) => e.key === "PageUp",
            action: (ctx, api, _e) => {
                ctx.viewport.panY += ctx.cssHeight * 0.8;
                api.clearCanvas();
            },
        },
        {
            id: "navigation:pageDown",
            category: "navigation",
            description: "Page Down - pan down",
            match: (e, ctx) => e.key === "PageDown",
            action: (ctx, api, _e) => {
                ctx.viewport.panY -= ctx.cssHeight * 0.8;
                api.clearCanvas();
            },
        },
    ];
}
