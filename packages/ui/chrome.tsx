/**
 * Shared UI primitives for the canvas chrome.
 *
 * Small, single-purpose components that keep the design system coherent:
 * a compact slider row (thin track + circular thumb with an accent active
 * portion), a consistent button family, menu items, section labels, and
 * keyboard-hint chips. Everything is plain Tailwind utility classes (light
 * + `dark:` variants) — no custom CSS.
 *
 * Surface grammar: light mode is opaque paper; dark mode ("night studio")
 * floats translucent glass over the canvas. Every interactive element has
 * hover, pressed (`active:`), focus-visible, and disabled states.
 *
 * MenuRow lives in the app package (it needs `next/link`). Everything
 * else is platform-neutral and shared from here.
 */

"use client";

import { ReactNode, useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { motion } from "framer-motion";

/**
 * Floating cluster surface — small chrome (toolbars, zoom, history).
 * Opaque in light mode; glass in dark mode over the canvas. The border
 * is the defined `border-border` step, not the near-invisible subtle
 * one, so islands read as solid against the canvas.
 */
export const SURFACE =
    "rounded-xl border border-border dark:border-border-dark bg-elevated dark:bg-elevated-dark/90 dark:backdrop-blur-xl shadow-soft dark:shadow-soft-dark";

/**
 * Floating panel surface — larger surfaces (popovers, side panels, menus).
 * Same grammar as SURFACE with deeper elevation.
 */
export const PANEL =
    "rounded-xl border border-border dark:border-border-dark bg-elevated dark:bg-elevated-dark/85 dark:backdrop-blur-xl shadow-float dark:shadow-float-dark";

/** Reacts to the `dark` class on `<html>` so canvas-side inline styles stay themed. */
export function useIsDark() {
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        const el = document.documentElement;
        const sync = () => setIsDark(el.classList.contains("dark"));
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(el, { attributes: true, attributeFilter: ["class"] });
        return () => mo.disconnect();
    }, []);
    return isDark;
}

/** Unified keyboard-hint chip used in tooltips, menus, and shortcut lists. */
export function Kbd({ children }: { children: ReactNode }) {
    return (
        <kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-sm border border-border dark:border-border-dark bg-muted dark:bg-muted-dark font-mono text-10 leading-none text-text-secondary dark:text-text-secondary-dark shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_rgba(255,255,255,0.07)]">
            {children}
        </kbd>
    );
}

/**
 * Slider row with a label on the left and the value aligned right.
 *
 * The active portion of the track is accent-colored, the inactive portion
 * muted. The thumb is a small circle with an accent ring, sized via
 * Tailwind arbitrary variants (no custom CSS).
 */
export function Slider({
    label,
    valueText,
    min,
    max,
    step,
    value,
    onChange,
}: {
    label: string;
    valueText: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
}) {
    const isDark = useIsDark();
    const accent = isDark ? "#60a5fa" : "#2563eb";
    const track = isDark ? "rgba(255,255,255,0.16)" : "rgba(128,128,128,0.18)";
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
    return (
        <div className="px-3 mb-3">
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-11 text-text-secondary dark:text-text-secondary-dark">{label}</span>
                <span className="text-11 tabular-nums text-muted-foreground dark:text-muted-foreground-dark">{valueText}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="appearance-none bg-transparent w-full h-4 cursor-pointer
                    [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-highlight dark:[&::-webkit-slider-thumb]:border-highlight-dark
                    [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:mt-[-4.5px]
                    [&::-webkit-slider-thumb]:transition-[transform] [&::-webkit-slider-thumb]:duration-fast [&::-webkit-slider-thumb]:ease-skid
                    hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-125
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-elevated dark:focus-visible:ring-offset-elevated-dark
                    [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent
                    [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-highlight dark:[&::-moz-range-thumb]:border-highlight-dark
                    [&::-moz-range-thumb]:shadow-sm"
                style={{
                    background: `linear-gradient(to right, ${accent} 0%, ${accent} ${pct}%, ${track} ${pct}%, ${track} 100%) no-repeat 50% 50% / 100% 3px`,
                }}
            />
        </div>
    );
}

/**
 * Consistent button family.
 *
 * - `primary` — filled accent (the one prominent action on a surface)
 * - `secondary` — subtle surface with border (secondary actions)
 * - `ghost` — transparent until hover (menu-style actions)
 * - `danger` — destructive action, red text on hover
 */
export function Button({
    variant = "secondary",
    className = "",
    onClick,
    disabled,
    children,
    ...rest
}: {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    className?: string;
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
} & Record<string, unknown>) {
    const base =
        "inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-[transform,background-color,color,border-color,opacity] duration-fast ease-spring cursor-pointer active:scale-[0.97] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed";
    const variantClass =
        variant === "primary"
            ? "bg-primary text-primary-foreground hover:bg-accent-hover dark:hover:bg-accent-hover-dark"
            : variant === "danger"
                ? "text-danger dark:text-danger-dark hover:bg-danger/10 dark:hover:bg-danger-dark/10"
                : variant === "secondary"
                    ? "text-text-secondary dark:text-text-secondary-dark border border-border dark:border-border-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark"
                    : "text-text-secondary dark:text-text-secondary-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark";

    return (
        <motion.button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${base} ${variantClass} ${className}`}
            whileHover={disabled ? {} : { scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            {...rest}
        >
            {children}
        </motion.button>
    );
}

/** Canonical section label used inside inspectors and panels. */
export function SectionLabel({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
    return (
        <div id={id} className={`mb-1.5 text-11 font-normal text-text-secondary dark:text-text-secondary-dark ${className}`}>
            {children}
        </div>
    );
}

/** A subtle divider for separating sections within panels. */
export function Divider() {
    return (
        <div className="my-1.5 mx-3 border-t border-border dark:border-border-dark" />
    );
}

/**
 * Close-on-Escape hook for overlays, dialogs, and panels.
 *
 * Same pattern SearchPanel/ShortcutsPanel used inline: a window keydown
 * listener gated on `enabled` (typically the panel's `open` prop). The
 * callback is kept in a ref so new inline closures per render don't
 * re-register the listener.
 */
export function useEscapeToClose(onClose: () => void, enabled: boolean) {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!enabled) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCloseRef.current();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [enabled]);
}

/**
 * Focus trap for true modals (dialogs that cover the whole app).
 *
 * On activation: remembers the previously focused element, moves focus
 * to the first focusable inside `ref`, and wraps Tab within the modal.
 * On deactivation (or unmount): restores focus to the remembered
 * element — unless it was removed, in which case the caller's own
 * focus-return logic (e.g. Phase 5's canvas-wrapper return) takes over.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
    const restoreRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!active) return;
        const root = ref.current;
        if (!root) return;
        restoreRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const focusables = () =>
            Array.from(
                root.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => el.offsetParent !== null);

        focusables()[0]?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const items = focusables();
            if (items.length === 0) return;
            const first = items[0]!;
            const last = items[items.length - 1]!;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            restoreRef.current?.focus();
        };
    }, [active, ref]);
}

/** A circular color swatch with a restrained selected state. */
export function ColorSwatch({
    color,
    selected,
    onClick,
    label,
}: {
    color: string;
    selected: boolean;
    onClick: () => void;
    label?: string;
}) {
    const isTransparent = color === "transparent";
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label ?? `Color ${color}`}
            aria-pressed={selected}
            className={`w-5 h-5 rounded-full shrink-0 transition-[transform,box-shadow] duration-fast ease-skid cursor-pointer active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected
                ? "ring-1 ring-highlight dark:ring-highlight-dark ring-offset-1 ring-offset-elevated dark:ring-offset-elevated-dark scale-105"
                : "hover:scale-110"
                } ${isTransparent
                    ? "bg-[repeating-conic-gradient(rgba(128,128,128,0.4)_0%_25%,transparent_0%_50%)] bg-[length:6px_6px]"
                    : ""
                }`}
            style={isTransparent ? undefined : { background: color }}
        />
    );
}

/**
 * Compact input used in property panels and forms.
 *
 * Three sizes share the same surface grammar (muted fill, border, focus
 * ring); `sm` is the original panel sizing and the default. Extra native
 * input props (`type`, `autoComplete`, `required`, `minLength`, `ref`,
 * `autoFocus`, …) pass straight through via `...rest`.
 */
export function Input({
    value,
    onChange,
    placeholder,
    size = "sm",
    className = "",
    ...rest
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    size?: "sm" | "md" | "lg";
    className?: string;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "placeholder" | "size" | "className">) {
    return (
        <input
            {...rest}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md text-foreground dark:text-foreground-dark placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-dark focus:outline-none transition-colors duration-fast ${size === "lg"
                ? "px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/50"
                : size === "md"
                    ? "px-3 py-2 text-sm focus:ring-2 focus:ring-primary/40"
                    : "px-2 py-1 text-xs focus:ring-1 focus:ring-primary"
                } ${className}`}
        />
    );
}