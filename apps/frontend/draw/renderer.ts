/**
 * Rendering and hit-testing utilities for the canvas drawing engine.
 *
 * All shape drawing goes through {@link renderShape}, which delegates to
 * Rough.js for the hand-drawn aesthetic. Hit-testing is handled by
 * {@link hitTest} (point-in-shape) and {@link hitTestWithRadius}
 * (proximity-based, used by the eraser tool).
 *
 * @module renderer
 */

import rough from "roughjs";
import { Shape, ShapeStyle, Bounds, Point, defaultStyle, getShapeBounds, getShapeCenter, getShapesBounds, rotatePointAround, distToSegment, measureMultilineText, resolveStrokeColor, hitTestRect, hitTestCircle, hitTestEllipsisArc, hitTestDiamond, hitTestArrow, hitTestLine } from "@repo/shapes";
import { Viewport } from "./viewport";
import { ImageCache } from "./imageCache";
import { IMAGE_PLACEHOLDER_BG, IMAGE_PLACEHOLDER_BORDER, IMAGE_PLACEHOLDER_TEXT, STICKY_SHADOW, STICKY_TEXT, SELECTION_OUTLINE, SELECTION_HANDLE, SELECTION_LEVER, SELECTION_GUIDE, SELECTION_BAND_FILL, FRAME_LABEL_TEXT, FRAME_LABEL_TEXT_ON_COLOR, LINK_BADGE_BG, LINK_BADGE_TEXT, pick } from "./colorSystem";

/**
 * Build Rough.js drawing options from a shape's style.
 *
 * Roughness comes from the style (default 1 — the hand-drawn look);
 * 0 keeps a shape crisp. Bowing stays 0 so lines don't curl.
 *
 * @param strokeWidth - Stroke width adjusted for current zoom level
 * @param st - Shape style containing colors, roughness, etc.
 * @returns Options object compatible with Rough.js drawing methods
 */
export function buildRoughOpts(strokeWidth: number, st: ShapeStyle, isDark: boolean) {
    return {
        stroke: resolveStrokeColor(st, isDark),
        strokeWidth,
        roughness: st.roughness ?? 0,
        bowing: 0,
        fill: st.backgroundColor !== "transparent" ? st.backgroundColor : undefined,
        fillStyle: st.backgroundColor !== "transparent" ? (st.fillStyle ?? "solid") : undefined,
        fillWeight: 1,
        hachureGap: 4,
    };
}

/**
 * Render a single shape onto a canvas context.
 *
 * Dispatches to the appropriate Rough.js or native canvas method based on
 * shape type. Handles opacity via `globalAlpha` and delegates image
 * rendering to the {@link ImageCache}.
 *
 * Arrow heads are drawn as filled triangles using native canvas (not Rough.js)
 * so they remain crisp at all zoom levels.
 *
 * @param shape - The shape to render
 * @param ctx - Target canvas 2D context
 * @param roughInstance - Rough.js canvas binding for hand-drawn strokes
 * @param zoom - Current viewport zoom (used to scale stroke width)
 * @param isDark - Current theme (fallback for shapes without a style)
 * @param imageCache - LRU cache for loaded image elements
 */
export function renderShape(
    shape: Shape,
    ctx: CanvasRenderingContext2D,
    roughInstance: ReturnType<typeof rough.canvas>,
    zoom: number,
    isDark: boolean,
    imageCache: ImageCache,
) {
    const st = shape.style ?? defaultStyle(isDark);
    const opts = buildRoughOpts(st.strokeWidth / zoom, st, isDark);
    ctx.globalAlpha = st.opacity;
    const rotated = !!shape.rotation;
    if (rotated) {
        const [cx, cy] = getShapeCenter(shape);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(shape.rotation!);
        ctx.translate(-cx, -cy);
    }
    try {
        if (shape.type === "rect") {
            const x = Math.min(shape.x, shape.x + shape.width);
            const y = Math.min(shape.y, shape.y + shape.height);
            const w = Math.abs(shape.width);
            const h = Math.abs(shape.height);
            roughInstance.rectangle(x, y, w, h, opts);
        } else if (shape.type === "circle") {
            roughInstance.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts);
        } else if (shape.type === "ellipsisArc") {
            const rx = Math.abs(shape.width) / 2;
            const ry = Math.abs(shape.height) / 2;
            if (rx > 0 && ry > 0) {
                ctx.beginPath();
                ctx.ellipse(shape.centerX, shape.centerY, rx, ry, 0, shape.startAngle, shape.endAngle);
                ctx.strokeStyle = resolveStrokeColor(st, isDark);
                ctx.lineWidth = st.strokeWidth / zoom;
                ctx.stroke();
            }
        } else if (shape.type === "diamond") {
            const cx = shape.centerX;
            const cy = shape.centerY;
            const hw = shape.width / 2;
            const hh = shape.height / 2;
            roughInstance.polygon(
                [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
                opts,
            );
        } else if (shape.type === "pencil") {
            if (shape.constantWidth && shape.points.length > 1) {
                ctx.beginPath();
                ctx.moveTo(shape.points[0][0], shape.points[0][1]);
                for (let j = 1; j < shape.points.length; j++) {
                    ctx.lineTo(shape.points[j][0], shape.points[j][1]);
                }
                ctx.strokeStyle = resolveStrokeColor(st, isDark);
                ctx.lineWidth = st.strokeWidth / zoom;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.stroke();
            } else {
                roughInstance.linearPath(shape.points, opts);
            }
        } else if (shape.type === "line") {
            if (shape.points && shape.points.length > 2) {
                roughInstance.linearPath(shape.points, opts);
            } else {
                roughInstance.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
            }
        } else if (shape.type === "arrow") {
            const dx = shape.endX - shape.startX;
            const dy = shape.endY - shape.startY;
            const angle = Math.atan2(dy, dx);
            roughInstance.line(shape.startX, shape.startY, shape.endX, shape.endY, opts);
            const headLen = shape.arrowHeadSize;
            const a1 = angle - Math.PI / 6;
            const a2 = angle + Math.PI / 6;
            ctx.beginPath();
            ctx.moveTo(shape.endX, shape.endY);
            ctx.lineTo(shape.endX - headLen * Math.cos(a1), shape.endY - headLen * Math.sin(a1));
            ctx.lineTo(shape.endX - headLen * Math.cos(a2), shape.endY - headLen * Math.sin(a2));
            ctx.closePath();
            ctx.fillStyle = resolveStrokeColor(st, isDark);
            ctx.fill();
            // Draw label at arrow midpoint
            if (shape.label) {
                const mx = (shape.startX + shape.endX) / 2;
                const my = (shape.startY + shape.endY) / 2;
                ctx.font = "14px Arial";
                ctx.fillStyle = resolveStrokeColor(st, isDark);
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                // Offset label above the arrow line
                const labelOffset = 8;
                const perpX = -Math.sin(angle) * labelOffset;
                const perpY = Math.cos(angle) * labelOffset;
                ctx.fillText(shape.label, mx + perpX, my + perpY);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }
        } else if (shape.type === "text") {
            const weight = shape.bold ? "bold " : "";
            const style = shape.italic ? "italic " : "";
            const family = shape.fontFamily || "Arial";
            ctx.font = `${style}${weight}${shape.fontSize}px ${family}`;
            ctx.fillStyle = resolveStrokeColor(st, isDark);
            ctx.textAlign = shape.textAlign || "left";
            ctx.textBaseline = "top";
            const lines = shape.text.split("\n");
            const lineHeight = shape.fontSize * 1.25;
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], shape.x, shape.y + i * lineHeight);
            }
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        } else if (shape.type === "image") {
            const img = imageCache.get(shape.imageData);
            if (img?.complete) {
                ctx.drawImage(img, shape.x, shape.y, shape.width, shape.height);
            } else {
                ctx.fillStyle = pick(IMAGE_PLACEHOLDER_BG, isDark);
                ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                ctx.strokeStyle = pick(IMAGE_PLACEHOLDER_BORDER, isDark);
                ctx.lineWidth = 1;
                ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
                ctx.fillStyle = pick(IMAGE_PLACEHOLDER_TEXT, isDark);
                ctx.font = "12px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("Loading...", shape.x + shape.width / 2, shape.y + shape.height / 2);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }
        } else if (shape.type === "stickyNote") {
            // Draw note background
            ctx.fillStyle = shape.noteColor;
            ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
            // Draw shadow
            ctx.shadowColor = STICKY_SHADOW;
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            // Draw text
            ctx.fillStyle = STICKY_TEXT;
            ctx.font = "14px Arial";
            const lines = shape.text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], shape.x + 10, shape.y + 24 + i * 18);
            }
        } else if (shape.type === "eraser") {
            // Legacy eraser strokes are no longer rendered
        } else if (shape.type === "frame") {
            // Draw frame border
            const resolvedStroke = resolveStrokeColor(st, isDark);
            const isLightStroke = resolvedStroke === "#ffffff" || resolvedStroke === "#e5e7eb";
            ctx.strokeStyle = isLightStroke ? pick(SELECTION_OUTLINE, isDark) : resolvedStroke;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            // Draw label background
            const labelHeight = 24;
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillRect(shape.x, shape.y - labelHeight, shape.width, labelHeight);
            // Draw label text
            ctx.fillStyle = isLightStroke ? pick(FRAME_LABEL_TEXT, isDark) : FRAME_LABEL_TEXT_ON_COLOR;
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(shape.name, shape.x + 8, shape.y - labelHeight / 2);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
        }

        if (shape.url) {
            const bounds = getShapeBounds(shape);
            if (bounds) {
                const tagW = 40;
                const tagH = 16;
                const tagX = bounds.x + bounds.w - tagW;
                const tagY = bounds.y;
                ctx.fillStyle = pick(LINK_BADGE_BG, isDark);
                ctx.fillRect(tagX, tagY, tagW, tagH);
                ctx.fillStyle = pick(LINK_BADGE_TEXT, isDark);
                ctx.font = "bold 9px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("LINK", tagX + tagW / 2, tagY + tagH / 2);
                ctx.textAlign = "start";
                ctx.textBaseline = "alphabetic";
            }
        }
    } finally {
        ctx.globalAlpha = 1;
        if (rotated) ctx.restore();
    }
}

/**
 * Draw selection indicators (dashed blue rectangles) around all selected shapes.
 *
 * When an `anim` window is supplied, the outline settles in from a slightly
 * inflated frame (springy ease-out) and the handles pop in with a short
 * overshoot — the signature feedback for a selection change. Static when
 * `anim` is null.
 *
 * @param ctx - Target canvas 2D context
 * @param shapes - All shapes on the canvas
 * @param selectedIds - Set of selected shape IDs
 * @param viewport - Current viewport transform
 * @param isDark - Whether the dark theme is active
 * @param anim - Optional selection-change animation window
 */
export function drawSelection(
    ctx: CanvasRenderingContext2D,
    shapes: Shape[],
    selectedIds: Set<string>,
    viewport: Viewport,
    isDark: boolean,
    anim?: { start: number; duration: number } | null,
) {
    let settleScale = 1;
    let handleScale = 1;
    let handleAlpha = 1;
    if (anim) {
        const t = Math.min((performance.now() - anim.start) / anim.duration, 1);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const easeOutBack = (x: number) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        const normalized = (easeOutBack(t) + c1) / (1 + c1);
        settleScale = 1 + 0.1 * (1 - normalized);
        const th = Math.min(Math.max((t - 0.15) / 0.85, 0), 1);
        handleScale = (easeOutBack(th) + c1) / (1 + c1);
        handleAlpha = t < 0.35 ? t / 0.35 : 1;
    }
    ctx.save();
    ctx.translate(viewport.panX, viewport.panY);
    ctx.scale(viewport.zoom, viewport.zoom);
    const shapeMap = new Map(shapes.filter(s => s.id).map(s => [s.id!, s]));
    const handleSize = 6 / viewport.zoom;
    const selectedShapes = [...selectedIds]
        .map((id) => shapeMap.get(id))
        .filter((s): s is Shape => Boolean(s));

    // Multi-select renders one bounding box around the whole selection
    // with shared resize handles — the selection is one transformable
    // entity. Single selection keeps per-shape handles + rotation lever.
    if (selectedShapes.length > 1) {
        const bounds = getShapesBounds(selectedShapes);
        if (!bounds) {
            ctx.restore();
            return;
        }
        if (settleScale !== 1) {
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            ctx.translate(cx, cy);
            ctx.scale(settleScale, settleScale);
            ctx.translate(-cx, -cy);
        }
        ctx.strokeStyle = pick(SELECTION_OUTLINE, isDark);
        ctx.lineWidth = 1 / viewport.zoom;
        ctx.shadowColor = pick(SELECTION_OUTLINE, isDark);
        ctx.shadowBlur = 6 / viewport.zoom;
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.shadowBlur = 0;
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.globalAlpha = handleAlpha;
        ctx.fillStyle = pick(SELECTION_HANDLE, isDark);
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
        for (const h of handles) {
            const hs = (handleSize * handleScale) / 2;
            ctx.fillRect(h.x - hs, h.y - hs, handleSize * handleScale, handleSize * handleScale);
        }
        ctx.restore();
        return;
    }

    for (const id of selectedIds) {
        const shape = shapeMap.get(id);
        if (!shape) continue;
        const bounds = getShapeBounds(shape);
        if (!bounds) continue;
        ctx.save();
        if (settleScale !== 1) {
            const cx = bounds.x + bounds.w / 2;
            const cy = bounds.y + bounds.h / 2;
            ctx.translate(cx, cy);
            ctx.scale(settleScale, settleScale);
            ctx.translate(-cx, -cy);
        }
        ctx.strokeStyle = pick(SELECTION_OUTLINE, isDark);
        ctx.lineWidth = 1 / viewport.zoom;
        ctx.shadowColor = pick(SELECTION_OUTLINE, isDark);
        ctx.shadowBlur = 6 / viewport.zoom;
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.shadowBlur = 0;
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.restore();

        // Draw resize handles
        ctx.save();
        ctx.globalAlpha = handleAlpha;
        ctx.fillStyle = pick(SELECTION_HANDLE, isDark);
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
        for (const h of handles) {
            const hs = (handleSize * handleScale) / 2;
            ctx.fillRect(h.x - hs, h.y - hs, handleSize * handleScale, handleSize * handleScale);
        }

        // Draw rotation handle (only when a single shape is selected)
        if (selectedIds.size === 1) {
            const rotationHandleY = bounds.y - 24 / viewport.zoom;
            const rotationHandleX = bounds.x + bounds.w / 2;
            ctx.beginPath();
            ctx.arc(rotationHandleX, rotationHandleY, (handleSize * handleScale) / 2, 0, Math.PI * 2);
            ctx.fillStyle = pick(SELECTION_HANDLE, isDark);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(bounds.x + bounds.w / 2, bounds.y);
            ctx.lineTo(rotationHandleX, rotationHandleY);
            ctx.strokeStyle = pick(SELECTION_LEVER, isDark);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

/**
 * Draw the rubber-band selection rectangle during drag-select.
 *
 * Renders a translucent blue fill with a dashed border to indicate
 * the area being selected.
 *
 * @param ctx - Target canvas 2D context
 * @param startX - Mouse-down X in canvas coordinates
 * @param startY - Mouse-down Y in canvas coordinates
 * @param currentX - Current mouse X in canvas coordinates
 * @param currentY - Current mouse Y in canvas coordinates
 * @param viewport - Current viewport transform
 */
export function drawDragSelect(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    currentX: number,
    currentY: number,
    viewport: Viewport,
    isDark: boolean,
) {
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);
    ctx.strokeStyle = pick(SELECTION_GUIDE, isDark);
    ctx.lineWidth = 1.5 / viewport.zoom;
    ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = pick(SELECTION_BAND_FILL, isDark);
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([]);
}

/**
  * Test whether a point hits any shape on the canvas.
  *
  * Iterates shapes back-to-front (topmost first) and returns the index
  * of the first shape containing the point. A broad-phase bounding-box
  * check (world AABB of the rotated shape, padded for stroke-based
  * types) culls non-hits before the exact per-type test, so pointer
  * moves stay cheap even on large canvases.
  *
  * Uses shape-specific geometry:
  * - Rectangles, images, diamonds, text: axis-aligned bounding box
  * - Circles: distance from center
  * - Pencil, lines, arrows, erasers: distance to line segments
  *
  * @param point - Test point in canvas coordinates
  * @param shapes - All shapes to test against
  * @param zoom - Current viewport zoom (adjusts hit tolerance)
  * @param lockedIds - Optional set of shape IDs to skip (locked shapes)
  * @returns Index of the hit shape, or `null` if none
  */
export function hitTest(
    point: Point,
    shapes: Shape[],
    zoom: number,
    lockedIds?: Set<string>,
): number | null {
    const index = getSpatialIndex(shapes);
    const candidates = Array.from(index.query(point));
    for (let i = candidates.length - 1; i >= 0; i--) {
        const idx = candidates[i]!;
        const shape = shapes[idx]!;
        if (lockedIds?.has(shape.id!)) continue;

        const aabb = getShapeBounds(shape);
        if (aabb) {
            const strokePad = 10 / zoom;
            const pad =
                shape.type === "pencil" ||
                shape.type === "line" ||
                shape.type === "arrow" ||
                shape.type === "eraser"
                    ? strokePad
                    : 0.5;
            const topPad = shape.type === "frame" ? 24 : 0;
            if (
                point[0] < aabb.x - pad ||
                point[0] > aabb.x + aabb.w + pad ||
                point[1] < aabb.y - topPad - pad ||
                point[1] > aabb.y + aabb.h + pad
            ) {
                continue;
            }
        }

        let p = point;
        if (shape.rotation) {
            const [cx, cy] = getShapeCenter(shape);
            p = rotatePointAround(point, cx, cy, -shape.rotation);
        }
        if (shape.type === "rect") {
            if (hitTestRect(p, shape)) return idx;
        } else if (shape.type === "circle") {
            if (hitTestCircle(p, shape)) return idx;
        } else if (shape.type === "ellipsisArc") {
            if (hitTestEllipsisArc(p, shape)) return idx;
        } else if (shape.type === "pencil") {
            for (let j = 1; j < shape.points.length; j++) {
                const dist = distToSegment(p, shape.points[j - 1], shape.points[j]);
                if (dist < 10 / zoom) return idx;
            }
        } else if (shape.type === "text") {
            let textWidth: number;
            const lines = shape.text.split("\n");
            try {
                const measured = measureMultilineText(
                    shape.text,
                    shape.fontSize,
                    shape.fontFamily || "Arial",
                    shape.bold,
                    shape.italic,
                );
                textWidth = measured.width;
            } catch {
                const boldFactor = shape.bold ? 1.15 : 1;
                textWidth = lines.reduce((max, l) => Math.max(max, l.length), 0) * (shape.fontSize * 0.6) * boldFactor;
            }
            const textHeight = lines.length * shape.fontSize * 1.25;
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + textWidth &&
                p[1] >= shape.y &&
                p[1] <= shape.y + textHeight
            ) {
                return idx;
            }
        } else if (shape.type === "image") {
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + shape.width &&
                p[1] >= shape.y &&
                p[1] <= shape.y + shape.height
            ) {
                return idx;
            }
        } else if (shape.type === "stickyNote") {
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + shape.width &&
                p[1] >= shape.y &&
                p[1] <= shape.y + shape.height
            ) {
                return idx;
            }
        } else if (shape.type === "frame") {
            if (
                p[0] >= shape.x &&
                p[0] <= shape.x + shape.width &&
                p[1] >= shape.y - 24 &&
                p[1] <= shape.y + shape.height
            ) {
                return idx;
            }
        } else if (shape.type === "diamond") {
            if (hitTestDiamond(p, shape)) return idx;
        } else if (shape.type === "arrow" || shape.type === "line") {
            if (shape.type === "line" && shape.points && shape.points.length > 2) {
                for (let j = 1; j < shape.points.length; j++) {
                    const dist = distToSegment(p, shape.points[j - 1], shape.points[j]);
                    if (dist < 10 / zoom) return idx;
                }
            } else if (shape.type === "arrow") {
                if (hitTestArrow(p, shape, 10 / zoom)) return idx;
            } else {
                const dist = distToSegment(
                    p,
                    [shape.startX, shape.startY],
                    [shape.endX, shape.endY],
                );
                if (dist < 10 / zoom) return idx;
            }
        } else if (shape.type === "eraser") {
            for (let j = 1; j < shape.points.length; j++) {
                const dist = distToSegment(p, shape.points[j - 1], shape.points[j]);
                if (dist < shape.strokeWidth / 2) return idx;
            }
        }
    }
    return null;
}

/**
 * Proximity-based hit test using shape bounding boxes.
 *
 * Used by the eraser tool: if any point along the eraser path is within
 * `radius` pixels of a shape's bounding box, the shape is considered
 * intersected.
 *
 * @param point - Test point in canvas coordinates
 * @param shapes - All shapes to test against
 * @param radius - Maximum distance from shape bounds to count as a hit
 * @returns Index of the nearest shape within radius, or `null`
 */
export function hitTestWithRadius(
    point: Point,
    shapes: Shape[],
    radius: number,
): number | null {
    const index = getSpatialIndex(shapes);
    const candidates = Array.from(index.query(point));
    for (let i = candidates.length - 1; i >= 0; i--) {
        const idx = candidates[i]!;
        const bounds = getShapeBounds(shapes[idx]!);
        if (!bounds) continue;
        const closestX = Math.max(bounds.x, Math.min(point[0], bounds.x + bounds.w));
        const closestY = Math.max(bounds.y, Math.min(point[1], bounds.y + bounds.h));
        const dx = point[0] - closestX;
        const dy = point[1] - closestY;
        if (dx * dx + dy * dy <= radius * radius) {
            return idx;
        }
    }
    return null;
}

/**
 * Check whether any eraser point falls within the padded bounds of a shape.
 *
 * This is a fast broad-phase check: it only tests whether the eraser
 * path enters the shape's bounding box (expanded by the eraser radius),
 * not whether it overlaps the actual drawn path.
 *
 * @param eraserPoints - Points along the eraser stroke
 * @param shape - The shape to test for intersection
 * @param eraserRadius - Radius of the eraser tool
 * @returns `true` if the eraser intersects the shape's bounds
 */
export function eraserIntersectsShape(
    eraserPoints: Point[],
    shape: Shape,
    eraserRadius: number,
): boolean {
    const bounds = getShapeBounds(shape);
    if (!bounds) return false;
    const pad = eraserRadius;
    const bx = bounds.x - pad;
    const by = bounds.y - pad;
    const bw = bounds.w + pad * 2;
    const bh = bounds.h + pad * 2;

    for (const pt of eraserPoints) {
        if (
            pt[0] >= bx &&
            pt[0] <= bx + bw &&
            pt[1] >= by &&
            pt[1] <= by + bh
        ) {
            return true;
        }
    }
    return false;
}

/** Cell size for the spatial grid (canvas units). */
const SPATIAL_CELL_SIZE = 200;

/**
 * Simple grid-based spatial index for fast point-in-shape queries.
 *
 * Shapes are inserted into grid cells they overlap. A point query
 * returns candidate shapes from the containing cell only, turning
 * O(n) hit testing into O(candidates) for large canvases.
 */
class SpatialIndex {
    private cells = new Map<string, Set<number>>();
    private shapeBounds: Bounds[] = [];

    build(shapes: Shape[]): void {
        this.cells.clear();
        this.shapeBounds = new Array(shapes.length);
        for (let i = 0; i < shapes.length; i++) {
            const b = getShapeBounds(shapes[i]);
            this.shapeBounds[i] = b ?? { x: 0, y: 0, w: 0, h: 0 };
            const bounds = this.shapeBounds[i]!;
            const minCX = Math.floor(bounds.x / SPATIAL_CELL_SIZE);
            const maxCX = Math.floor((bounds.x + bounds.w) / SPATIAL_CELL_SIZE);
            const minCY = Math.floor(bounds.y / SPATIAL_CELL_SIZE);
            const maxCY = Math.floor((bounds.y + bounds.h) / SPATIAL_CELL_SIZE);
            for (let cx = minCX; cx <= maxCX; cx++) {
                for (let cy = minCY; cy <= maxCY; cy++) {
                    const key = `${cx},${cy}`;
                    let cell = this.cells.get(key);
                    if (!cell) {
                        cell = new Set<number>();
                        this.cells.set(key, cell);
                    }
                    cell.add(i);
                }
            }
        }
    }

    /** Get candidate shape indices that might contain the given point. */
    query(point: Point): Set<number> {
        const cx = Math.floor(point[0] / SPATIAL_CELL_SIZE);
        const cy = Math.floor(point[1] / SPATIAL_CELL_SIZE);
        const key = `${cx},${cy}`;
        return this.cells.get(key) ?? new Set<number>();
    }
}

/** Module-level spatial index cache keyed by shapes array reference + length. */
let spatialIndexCache: { shapes: Shape[]; length: number; index: SpatialIndex } | null = null;

function getSpatialIndex(shapes: Shape[]): SpatialIndex {
    if (
        spatialIndexCache === null ||
        spatialIndexCache.shapes !== shapes ||
        spatialIndexCache.length !== shapes.length
    ) {
        const index = new SpatialIndex();
        index.build(shapes);
        spatialIndexCache = { shapes, length: shapes.length, index };
    }
    return spatialIndexCache.index;
}
