import { getShapeBounds, TextShape } from "@repo/shapes";
import type { GameContext } from "../gameContext";

/** Callbacks the shared shape editor needs from the owning manager. */
export interface ShapeEditApi {
    startTextEdit(x: number, y: number, text: string | undefined, index: number | undefined, style: any, onCommit?: (text: string) => void): void;
    syncShapes(): void;
    invalidateCache(): void;
    clearCanvas(): void;
    notifySelection(): void;
}

/**
 * Open the editor appropriate for a shape that was double-clicked/tapped.
 *
 * Text shapes open the inline text editor; arrow/frame shapes open inline
 * label/name editors; container shapes open the editor for their bound text
 * (or create one at the center); URL shapes open the link. Shared by mouse
 * double-click and touch double-tap so the behavior stays in one place.
 */
export function openShapeEditor(context: GameContext, hit: number, api: ShapeEditApi): void {
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

    if (shape.type === "arrow") {
        editArrowLabel(context, shape, api);
        return;
    }

    if (shape.type === "frame") {
        editFrameName(context, shape, api);
        return;
    }

    if (["rect", "circle", "diamond", "ellipsisArc", "stickyNote"].includes(shape.type)) {
        const bounds = getShapeBounds(shape);
        if (!bounds) return;
        const centerX = bounds.x + bounds.w / 2;
        const centerY = bounds.y + bounds.h / 2;
        if (shape.boundTextId) {
            const textShape = context.existingShapes.find(s => s.id === shape.boundTextId && s.type === "text");
            if (textShape) {
                const ts = textShape as TextShape;
                const idx = context.existingShapes.indexOf(textShape);
                api.startTextEdit(ts.x, ts.y, ts.text, idx, {
                    bold: ts.bold,
                    italic: ts.italic,
                    fontFamily: ts.fontFamily,
                    fontSize: ts.fontSize,
                    textAlign: ts.textAlign || "left",
                });
                return;
            }
            delete shape.boundTextId;
        }
        context.textManager.pendingBoundTextContainerId = shape.id!;
        api.startTextEdit(centerX, centerY, undefined, undefined, {
            fontSize: 20,
            textAlign: "center",
        });
        return;
    }

    if (shape.url) {
        window.open(shape.url, "_blank", "noopener,noreferrer");
    }
}

/**
 * Open an inline editor over the arrow's label position and commit the
 * result to the arrow's `label`, pushing to the undo stack.
 */
function editArrowLabel(context: GameContext, shape: any, api: ShapeEditApi): void {
    const mx = (shape.startX + shape.endX) / 2;
    const my = (shape.startY + shape.endY) / 2;
    const angle = Math.atan2(shape.endY - shape.startY, shape.endX - shape.startX);
    const labelOffset = 8;
    const perpX = -Math.sin(angle) * labelOffset;
    const perpY = Math.cos(angle) * labelOffset;
    api.startTextEdit(
        mx + perpX,
        my + perpY - 14,
        shape.label ?? "",
        undefined,
        { fontSize: 14, textAlign: "center" },
        (text) => {
            const prev = structuredClone(context.existingShapes);
            shape.label = text || undefined;
            context.undoManager.push(prev, context.existingShapes);
            api.invalidateCache();
            api.clearCanvas();
            api.syncShapes();
        },
    );
}

/**
 * Open an inline editor over the frame's label bar and commit the result
 * to the frame's `name`, pushing to the undo stack.
 */
function editFrameName(context: GameContext, shape: any, api: ShapeEditApi): void {
    const labelHeight = 24;
    api.startTextEdit(
        shape.x + 8,
        shape.y - labelHeight,
        shape.name ?? "",
        undefined,
        { fontSize: 12 },
        (text) => {
            const prev = structuredClone(context.existingShapes);
            shape.name = text || `Frame ${context.existingShapes.filter(s => s.type === "frame").length + 1}`;
            context.undoManager.push(prev, context.existingShapes);
            api.invalidateCache();
            api.clearCanvas();
            api.syncShapes();
            api.notifySelection();
        },
    );
}

/**
 * Enter-key action: create text at the viewport center with the text
 * tool, or edit the selected text shape / arrow label in select mode.
 */
export function enterEditAction(context: GameContext, api: ShapeEditApi): void {
    if (context.selectedTool === "text" && !context.textManager.hasTextEditOverlay) {
        const [cx, cy] = context.viewport.getCanvasCoords(
            context.cssWidth / 2,
            context.cssHeight / 2,
        );
        api.startTextEdit(cx, cy, undefined, undefined, {
            bold: context.textManager.textBold,
            italic: context.textManager.textItalic,
            fontFamily: context.textManager.textFontFamily,
            fontSize: context.textManager.textFontSize,
            textAlign: context.textManager.textAlign,
        });
        return;
    }
    if (context.selectedIds.size === 0) return;
    const shape = context.existingShapes.find(s => s.id && context.selectedIds.has(s.id));
    if (!shape) return;
    if (shape.type === "text") {
        api.startTextEdit(shape.x, shape.y, shape.text, context.existingShapes.indexOf(shape), {
            bold: shape.bold,
            italic: shape.italic,
            fontFamily: shape.fontFamily,
            fontSize: shape.fontSize,
            textAlign: shape.textAlign || "left",
        });
    } else if (shape.type === "arrow") {
        editArrowLabel(context, shape, api);
    }
}