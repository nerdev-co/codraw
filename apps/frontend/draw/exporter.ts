/**
 * Canvas export utilities — PNG, SVG, and JSON.
 *
 * All export functions compute a bounding box around all shapes,
 * render to an offscreen surface at 1:1 scale, and trigger a browser
 * download.
 *
 * @module exporter
 */

import rough from "roughjs";
import { Shape, defaultStyle, getShapeBounds, resolveStrokeColor } from "@repo/shapes";
import { renderShape, buildRoughOpts } from "./renderer";
import { ImageCache } from "./imageCache";
import { EXPORT_BG, FRAME_LABEL_BG, FRAME_LABEL_TEXT, FRAME_LABEL_TEXT_ON_COLOR, SELECTION_OUTLINE, STICKY_SHADOW, STICKY_TEXT, pick } from "./colorSystem";

/**
 * Trigger a browser download for a URL.
 *
 * Creates a temporary anchor element, sets the `download` attribute,
 * and revokes the object URL after the click.
 *
 * @param url - Object URL or data URL to download
 * @param filename - Suggested filename for the download
 */
function download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Compute the bounding box that encloses all shapes, with padding.
 *
 * Used by export functions to determine the output canvas/SVG dimensions.
 *
 * @param shapes - All shapes to measure
 * @returns Bounding box with 20px padding, or `null` if no shapes exist
 */
function computeBounds(shapes: Shape[]) {
    const allX: number[] = [];
    const allY: number[] = [];
    for (const s of shapes) {
        const bounds = getShapeBounds(s);
        if (bounds) {
            allX.push(bounds.x, bounds.x + bounds.w);
            allY.push(bounds.y, bounds.y + bounds.h);
        }
    }
    if (allX.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < allX.length; i++) {
        if (allX[i]! < minX) minX = allX[i]!;
        if (allX[i]! > maxX) maxX = allX[i]!;
        if (allY[i]! < minY) minY = allY[i]!;
        if (allY[i]! > maxY) maxY = allY[i]!;
    }
    const pad = 20;
    return {
        x: minX - pad,
        y: minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
    };
}

/**
 * Export all shapes to a PNG image file.
 *
 * Renders shapes onto an offscreen canvas at 1:1 scale (no zoom),
 * then triggers a browser download of the resulting PNG.
 *
 * @param shapes - All shapes to export
 * @param isDark - Current theme (determines background color)
 * @param imageCache - LRU cache for loaded image elements
 */
export function exportToPng(shapes: Shape[], isDark: boolean, imageCache: ImageCache) {
    const bounds = computeBounds(shapes);
    if (!bounds) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = bounds.w;
    offscreen.height = bounds.h;
    const ctx = offscreen.getContext("2d")!;
    ctx.fillStyle = pick(EXPORT_BG, isDark);
    ctx.fillRect(0, 0, bounds.w, bounds.h);
    ctx.translate(-bounds.x, -bounds.y);

    const rc = rough.canvas(offscreen);

    for (const shape of shapes) {
        renderShape(shape, ctx, rc, 1, isDark, imageCache);
    }
    download(offscreen.toDataURL("image/png"), "drawing.png");
}

/**
 * Export all shapes to an SVG vector file.
 *
 * Builds an SVG DOM, renders each shape via Rough.js SVG primitives,
 * then serializes and triggers a browser download.
 *
 * Arrow heads are rendered as SVG `<polygon>` elements with native
 * canvas coordinates (no Rough.js for the triangle fill).
 *
 * @param shapes - All shapes to export
 * @param isDark - Current theme (determines background fill)
 */
export function exportToSvg(shapes: Shape[], isDark: boolean) {
    const bounds = computeBounds(shapes);
    if (!bounds) return;

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", String(bounds.w));
    svgEl.setAttribute("height", String(bounds.h));
    svgEl.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", pick(EXPORT_BG, isDark));
    svgEl.appendChild(bg);

    const rs = rough.svg(svgEl);

    for (const shape of shapes) {
        const st = shape.style ?? defaultStyle(isDark);
        const opts = buildRoughOpts(st.strokeWidth, st, isDark);

        if (shape.type === "rect") {
            const x = Math.min(shape.x, shape.x + shape.width);
            const y = Math.min(shape.y, shape.y + shape.height);
            svgEl.appendChild(
                rs.rectangle(x, y, Math.abs(shape.width), Math.abs(shape.height), opts),
            );
        } else if (shape.type === "circle") {
            svgEl.appendChild(
                rs.circle(shape.centerX, shape.centerY, Math.abs(shape.radius) * 2, opts),
            );
        } else if (shape.type === "ellipsisArc") {
            const rx = Math.abs(shape.width) / 2;
            const ry = Math.abs(shape.height) / 2;
            if (rx > 0 && ry > 0) {
                const cx = shape.centerX;
                const cy = shape.centerY;
                const sx = cx + rx * Math.cos(shape.startAngle);
                const sy = cy + ry * Math.sin(shape.startAngle);
                const ex = cx + rx * Math.cos(shape.endAngle);
                const ey = cy + ry * Math.sin(shape.endAngle);
                const largeArc = shape.endAngle - shape.startAngle > Math.PI ? 1 : 0;
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", `M ${sx} ${sy} A ${rx} ${ry} 0 ${largeArc} 1 ${ex} ${ey}`);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", resolveStrokeColor(st, isDark));
                path.setAttribute("stroke-width", String(st.strokeWidth));
                path.setAttribute("opacity", String(st.opacity));
                svgEl.appendChild(path);
            }
        } else if (shape.type === "diamond") {
            const cx = shape.centerX;
            const cy = shape.centerY;
            const hw = shape.width / 2;
            const hh = shape.height / 2;
            svgEl.appendChild(
                rs.polygon([[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], opts),
            );
        } else if (shape.type === "pencil" && shape.points.length > 1) {
            svgEl.appendChild(rs.linearPath(shape.points, opts));
        } else if (shape.type === "arrow") {
            svgEl.appendChild(
                rs.line(shape.startX, shape.startY, shape.endX, shape.endY, opts),
            );
            const dx = shape.endX - shape.startX;
            const dy = shape.endY - shape.startY;
            const angle = Math.atan2(dy, dx);
            const hl = shape.arrowHeadSize;
            const a1 = angle - Math.PI / 6;
            const a2 = angle + Math.PI / 6;
            const pts = [
                [shape.endX, shape.endY],
                [shape.endX - hl * Math.cos(a1), shape.endY - hl * Math.sin(a1)],
                [shape.endX - hl * Math.cos(a2), shape.endY - hl * Math.sin(a2)],
            ];
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute(
                "points",
                pts.map((p) => p.join(",")).join(" "),
            );
            poly.setAttribute("fill", resolveStrokeColor(st, isDark));
            svgEl.appendChild(poly);
        } else if (shape.type === "line") {
            if (shape.points && shape.points.length > 2) {
                const pts = shape.points.map((p: [number, number]) => `${p[0]},${p[1]}`).join(" ");
                const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
                poly.setAttribute("points", pts);
                poly.setAttribute("fill", "none");
                poly.setAttribute("stroke", resolveStrokeColor(st, isDark));
                poly.setAttribute("stroke-width", String(st.strokeWidth));
                poly.setAttribute("opacity", String(st.opacity));
                svgEl.appendChild(poly);
            } else {
                svgEl.appendChild(
                    rs.line(shape.startX, shape.startY, shape.endX, shape.endY, opts),
                );
            }
        } else if (shape.type === "text") {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
            el.setAttribute("x", String(shape.x));
            el.setAttribute("y", String(shape.y));
            el.setAttribute("font-family", shape.fontFamily || "Arial");
            el.setAttribute("font-size", String(shape.fontSize));
            el.setAttribute("font-weight", shape.bold ? "bold" : "normal");
            el.setAttribute("font-style", shape.italic ? "italic" : "normal");
            el.setAttribute("fill", resolveStrokeColor(st, isDark));
            el.setAttribute("opacity", String(st.opacity));
            const lines = shape.text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                tspan.setAttribute("x", String(shape.x));
                tspan.setAttribute("dy", i === 0 ? "0" : String(shape.fontSize * 1.25));
                tspan.textContent = lines[i]!;
                el.appendChild(tspan);
            }
            svgEl.appendChild(el);
        } else if (shape.type === "stickyNote") {
            const filterId = `shadow-${shape.id ?? Math.random().toString(36).slice(2)}`;
            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
            filter.setAttribute("id", filterId);
            filter.setAttribute("x", "-20%");
            filter.setAttribute("y", "-20%");
            filter.setAttribute("width", "140%");
            filter.setAttribute("height", "140%");
            const feDropShadow = document.createElementNS("http://www.w3.org/2000/svg", "feDropShadow");
            feDropShadow.setAttribute("dx", "2");
            feDropShadow.setAttribute("dy", "2");
            feDropShadow.setAttribute("stdDeviation", "4");
            feDropShadow.setAttribute("flood-color", STICKY_SHADOW);
            filter.appendChild(feDropShadow);
            defs.appendChild(filter);
            svgEl.appendChild(defs);

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", String(shape.x));
            rect.setAttribute("y", String(shape.y));
            rect.setAttribute("width", String(shape.width));
            rect.setAttribute("height", String(shape.height));
            rect.setAttribute("fill", shape.noteColor);
            rect.setAttribute("filter", `url(#${filterId})`);
            svgEl.appendChild(rect);

            const lines = shape.text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
                el.setAttribute("x", String(shape.x + 10));
                el.setAttribute("y", String(shape.y + 24 + i * 18));
                el.setAttribute("font-family", "Arial");
                el.setAttribute("font-size", "14");
                el.setAttribute("fill", STICKY_TEXT);
                el.textContent = lines[i]!;
                svgEl.appendChild(el);
            }
        } else if (shape.type === "frame") {
            // Draw frame rectangle
            const resolvedStroke = resolveStrokeColor(st, isDark);
            const isLightStroke = resolvedStroke === "#ffffff" || resolvedStroke === "#e5e7eb";
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", String(shape.x));
            rect.setAttribute("y", String(shape.y));
            rect.setAttribute("width", String(shape.width));
            rect.setAttribute("height", String(shape.height));
            rect.setAttribute("fill", "none");
            rect.setAttribute("stroke", isLightStroke ? pick(SELECTION_OUTLINE, isDark) : resolvedStroke);
            rect.setAttribute("stroke-width", "2");
            svgEl.appendChild(rect);
            // Draw label background
            const labelBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            labelBg.setAttribute("x", String(shape.x));
            labelBg.setAttribute("y", String(shape.y - 24));
            labelBg.setAttribute("width", String(shape.width));
            labelBg.setAttribute("height", "24");
            labelBg.setAttribute("fill", isLightStroke ? pick(FRAME_LABEL_BG, isDark) : resolvedStroke);
            svgEl.appendChild(labelBg);
            // Draw label text
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", String(shape.x + 8));
            label.setAttribute("y", String(shape.y - 8));
            label.setAttribute("font-family", "Arial");
            label.setAttribute("font-size", "12");
            label.setAttribute("font-weight", "bold");
            label.setAttribute("fill", isLightStroke ? pick(FRAME_LABEL_TEXT, isDark) : FRAME_LABEL_TEXT_ON_COLOR);
            label.textContent = shape.name;
            svgEl.appendChild(label);
        } else if (shape.type === "eraser") {
            // skip
        } else if (shape.type === "image") {
            const el = document.createElementNS("http://www.w3.org/2000/svg", "image");
            el.setAttribute("x", String(shape.x));
            el.setAttribute("y", String(shape.y));
            el.setAttribute("width", String(shape.width));
            el.setAttribute("height", String(shape.height));
            el.setAttribute("href", shape.imageData);
            el.setAttribute("opacity", String(st.opacity));
            svgEl.appendChild(el);
        }
    }

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    download(URL.createObjectURL(blob), "drawing.svg");
}

/**
 * Export all shapes to a JSON file.
 *
 * Serializes the shape array as pretty-printed JSON and triggers
 * a browser download. The JSON format is the same as the import format
 * used by {@link Game.importFromJson}.
 *
 * @param shapes - All shapes to export
 */
export function exportToJson(shapes: Shape[]) {
    const data = JSON.stringify({ shapes }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    download(URL.createObjectURL(blob), "drawing.json");
}
