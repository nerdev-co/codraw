/**
 * Circle shape definition and utilities.
 *
 * A circle is defined by its center point and radius.
 */

import { ShapeStyle, Point, Bounds, defaultStyle } from "./types";

/**
 * Circle shape variant.
 *
 * - `centerX`, `centerY` — center point in canvas coordinates
 * - `radius` — radius in canvas units (used for perfect circles)
 * - `radiusX`, `radiusY` — optional radii for ellipses (when both present, renders as ellipse)
 * - `style?` — optional per-shape visual style
 * - `groupId?` — grouping identifier
 * - `id?` — unique ID assigned on commit
 * - `locked?` — when true, cannot be selected or moved
 * - `rotation?` — rotation in radians (applied to stroke, not geometry)
 * - `url?` — optional web link opened on double-click
 */
export interface CircleShape {
    type: "circle";
    /** Center X coordinate */
    centerX: number;
    /** Center Y coordinate */
    centerY: number;
    /** Radius in canvas units (for perfect circles) */
    radius: number;
    /** Optional X radius for ellipses (when both radiusX and radiusY present, renders as ellipse) */
    radiusX?: number;
    /** Optional Y radius for ellipses (when both radiusX and radiusY present, renders as ellipse) */
    radiusY?: number;
    /** Optional per-shape visual style */
    style?: ShapeStyle;
    /** Grouping identifier for multi-shape groups */
    groupId?: string;
    /** Unique ID assigned on commit */
    id?: string;
    /** When true, the shape cannot be selected or moved */
    locked?: boolean;
    /** Rotation in radians around the shape center */
    rotation?: number;
    /** Optional web link opened on double-click */
    url?: string;
    /** ID of a bound text shape inside this circle */
    boundTextId?: string;
}

/**
 * Create a circle shape with default style applied.
 *
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @param radius - Radius in canvas units
 * @param style - Optional visual style; defaults to {@link defaultStyle}
 * @returns A new {@link CircleShape} instance
 */
export function createCircle(
    centerX: number,
    centerY: number,
    radius: number,
    style?: ShapeStyle,
): CircleShape {
    return {
        type: "circle",
        centerX,
        centerY,
        radius,
        style: style ?? defaultStyle(),
    };
}

/**
 * Compute the bounding box for a circle or ellipse.
 *
 * @param shape - The circle shape (may have radiusX/radiusY for ellipse)
 * @returns Bounding box in canvas coordinates
 */
export function getCircleBounds(shape: CircleShape): Bounds {
    const rx = shape.radiusX !== undefined ? Math.abs(shape.radiusX) : Math.abs(shape.radius);
    const ry = shape.radiusY !== undefined ? Math.abs(shape.radiusY) : Math.abs(shape.radius);
    return {
        x: shape.centerX - rx,
        y: shape.centerY - ry,
        w: rx * 2,
        h: ry * 2,
    };
}

/**
 * Check whether a point lies inside or on the circle or ellipse.
 *
 * @param point - Test point [x, y]
 * @param shape - The circle shape (may have radiusX/radiusY for ellipse)
 * @returns `true` if the point is within the shape
 */
export function hitTestCircle(point: Point, shape: CircleShape): boolean {
    const rx = shape.radiusX !== undefined ? Math.abs(shape.radiusX) : Math.abs(shape.radius);
    const ry = shape.radiusY !== undefined ? Math.abs(shape.radiusY) : Math.abs(shape.radius);
    if (rx === 0 || ry === 0) return false;
    const nx = (point[0] - shape.centerX) / rx;
    const ny = (point[1] - shape.centerY) / ry;
    return nx * nx + ny * ny <= 1;
}
