import { Shape, getShapeBounds } from "@repo/shapes";
import { ImageCache } from "../imageCache";
import type { GameContext } from "../gameContext";

/** Capabilities the ImageManager needs from the owning Game instance. */
export interface ImageManagerApi {
    imageCache: ImageCache;
    clearCanvas(): void;
    invalidateCache(): void;
    syncShapes(): void;
    commitShape(shape: Shape, autoSwitchToSelect?: boolean): void;
}

/**
 * Image-specific behavior: inserting image shapes from files, preloading
 * cached image data, and the image crop mode lifecycle.
 *
 * The crop rectangle overlay rendering and crop-corner dragging stay in
 * the render/interaction layers; only the mode transitions, accessors,
 * and the actual crop re-encode live here.
 */
export class ImageManager {
    constructor(
        private context: GameContext,
        private api: ImageManagerApi,
    ) {}

    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    /**
     * Preload images from IndexedDB for any image shapes on the canvas.
     *
     * Scans the current shape array for image types and loads them from
     * IndexedDB into the in-memory cache so they render immediately.
     */
    preloadImages() {
        for (const shape of this.context.existingShapes) {
            if (shape.type !== "image" || !shape.imageData) continue;
            if (!this.api.imageCache.has(shape.imageData)) {
                this.api.imageCache.getAsync(shape.imageData).then(img => {
                    if (img?.complete) {
                        this.api.invalidateCache();
                        this.api.clearCanvas();
                    }
                }).catch((err) => {
                    console.warn("Failed to preload image; will show placeholder", {
                        imageData: shape.imageData.slice(0, 64),
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            }
        }
    }

    /**
     * Enter image crop mode for the currently selected image.
     * Initializes the crop rectangle to the full image bounds.
     */
    startImageCrop() {
        if (this.context.selectedIds.size !== 1) return;
        const id = [...this.context.selectedIds][0];
        if (!id) return;
        const shape = this.shapeById(id);
        if (!shape || shape.type !== "image") return;
        const bounds = getShapeBounds(shape);
        if (!bounds) return;
        this.context.cropMode = true;
        this.context.cropShapeId = id;
        this.context.cropRect = { ...bounds };
        this.context.cropDragCorner = null;
        this.context.cropStartRect = null;
        this.api.clearCanvas();
    }

    /**
     * Exit image crop mode without applying changes.
     */
    cancelImageCrop() {
        this.context.cropMode = false;
        this.context.cropShapeId = null;
        this.context.cropRect = null;
        this.context.cropDragCorner = null;
        this.context.cropStartRect = null;
        this.api.clearCanvas();
    }

    /**
     * Apply the current crop rectangle to the selected image.
     * Re-encodes the cropped region as a new data URL and updates the shape.
     */
    applyImageCrop() {
        if (!this.context.cropMode || !this.context.cropShapeId || !this.context.cropRect) return;
        const shape = this.shapeById(this.context.cropShapeId);
        if (!shape || shape.type !== "image") return;
        const img = this.api.imageCache.get(shape.imageData);
        if (!img || !img.complete) return;

        const bounds = getShapeBounds(shape);
        if (!bounds) return;

        const scaleX = img.naturalWidth / bounds.w;
        const scaleY = img.naturalHeight / bounds.h;
        const sx = Math.max(0, (this.context.cropRect.x - bounds.x) * scaleX);
        const sy = Math.max(0, (this.context.cropRect.y - bounds.y) * scaleY);
        const sw = Math.min(img.naturalWidth - sx, this.context.cropRect.w * scaleX);
        const sh = Math.min(img.naturalHeight - sy, this.context.cropRect.h * scaleY);

        if (sw <= 0 || sh <= 0) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = Math.max(1, Math.round(sw));
        tempCanvas.height = Math.max(1, Math.round(sh));
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height);
        const newDataUrl = tempCanvas.toDataURL("image/png");

        const prev = structuredClone(this.context.existingShapes);
        shape.imageData = newDataUrl;
        shape.x = this.context.cropRect.x;
        shape.y = this.context.cropRect.y;
        shape.width = this.context.cropRect.w;
        shape.height = this.context.cropRect.h;
        this.api.imageCache.set(newDataUrl, img);

        this.context.undoManager.push(prev, this.context.existingShapes);
        this.api.syncShapes();
        this.cancelImageCrop();
    }

    /**
     * Check whether the game is currently in image crop mode.
     */
    isInCropMode(): boolean {
        return this.context.cropMode;
    }

    /**
     * Get the current crop rectangle (canvas coordinates) for rendering.
     */
    getCropRect(): { x: number; y: number; w: number; h: number } | null {
        return this.context.cropRect;
    }

    /**
     * Open the file picker and insert an image centered on the viewport.
     * Bound to the `9` shortcut (Excalidraw parity).
     */
    insertImage() {
        const [cx, cy] = this.context.viewport.getCanvasCoords(
            this.context.cssWidth / 2,
            this.context.cssHeight / 2,
        );
        this.pickAndCommitImage(cx, cy, true);
    }

    /**
     * Open the file picker and insert an image at the given canvas
     * coordinates. Used by the image tool drag-to-place flow.
     */
    openImagePicker(coords: [number, number]) {
        this.pickAndCommitImage(coords[0], coords[1], false);
    }

    /** Open a file picker and commit the chosen image as a new shape. */
    private pickAndCommitImage(x: number, y: number, center: boolean) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => console.error("Failed to read image file");
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const img = new Image();
                img.onload = () => {
                    const w = img.naturalWidth;
                    const h = img.naturalHeight;
                    const maxDim = 400;
                    const scale = Math.min(1, maxDim / Math.max(w, h));
                    const offX = center ? x - (w * scale) / 2 : x;
                    const offY = center ? y - (h * scale) / 2 : y;
                    this.api.imageCache.set(dataUrl, img);
                    this.api.commitShape({
                        type: "image",
                        x: offX,
                        y: offY,
                        width: w * scale,
                        height: h * scale,
                        imageData: dataUrl,
                    });
                };
                img.onerror = () => console.error("Failed to load image from data URL");
                img.src = dataUrl;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }
}