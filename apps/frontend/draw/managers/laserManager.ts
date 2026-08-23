import { LASER_RING } from "../colorSystem";
import type { GameContext } from "../gameContext";

/** Capabilities the LaserManager needs from the owning Game instance. */
export interface LaserManagerApi {
    invalidateCache(): void;
    clearCanvas(): void;
}

/**
 * Laser pointer tool state and rendering.
 *
 * Tracks the laser dot position, color, and size in the shared context
 * and draws the pointer glow overlay on top of the rendered scene.
 */
export class LaserManager {
    constructor(
        private context: GameContext,
        private api: LaserManagerApi,
    ) {}

    /**
     * Set the laser pointer position.
     */
    setLaserPosition(x: number, y: number) {
        this.context.laserPosition = { x, y };
        this.api.clearCanvas();
    }

    /**
     * Hide the laser pointer.
     */
    clearLaser() {
        this.context.laserPosition = null;
        this.api.clearCanvas();
    }

    /**
     * Set the laser pointer color.
     */
    setLaserColor(color: string) {
        this.context.laserColor = color;
        if (this.context.laserPosition) this.api.clearCanvas();
    }

    /**
     * Set the laser pointer size.
     */
    setLaserSize(size: number) {
        this.context.laserSize = size;
        if (this.context.laserPosition) this.api.clearCanvas();
    }

    /**
     * Draw the laser pointer overlay.
     */
    drawLaserPointer(ctx: CanvasRenderingContext2D) {
        if (!this.context.laserPosition) return;
        ctx.save();
        // Correct transform order: scale by zoom FIRST, then translate by pan
        ctx.scale(this.context.viewport.zoom, this.context.viewport.zoom);
        ctx.translate(this.context.viewport.panX, this.context.viewport.panY);
        const { x, y } = this.context.laserPosition;
        const size = this.context.laserSize;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = this.context.laserColor;
        ctx.fill();
        ctx.strokeStyle = LASER_RING;
        ctx.lineWidth = 2 / this.context.viewport.zoom;
        ctx.stroke();

        const glow = ctx.createRadialGradient(x, y, size * 0.5, x, y, size * 2.5);
        glow.addColorStop(0, this.context.laserColor + "80");
        glow.addColorStop(1, this.context.laserColor + "00");
        ctx.beginPath();
        ctx.arc(x, y, size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.restore();
    }
}
