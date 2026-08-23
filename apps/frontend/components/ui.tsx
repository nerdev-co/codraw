/**
 * App-side UI primitives.
 *
 * Everything platform-neutral lives in `@repo/ui/chrome` (shared design
 * system); this file re-exports it and keeps only the pieces that need
 * the app package: {@link MenuRow} renders `@tanstack/react-router` rows.
 */

"use client";

import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export * from "@repo/ui/chrome";
export * from "@repo/ui/icon-button";

/** Canonical menu item row for popovers, app menus, and context menus. */
export function MenuRow({
    icon,
    children,
    hint,
    onClick,
    disabled,
    danger,
    active,
    href,
    className = "",
    iconClassName = "",
    labelClassName = "",
    chevron,
    ...rest
}: {
    icon?: ReactNode;
    children: ReactNode;
    hint?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    active?: boolean;
    href?: string;
    className?: string;
    iconClassName?: string;
    labelClassName?: string;
    chevron?: ReactNode;
} & Record<string, unknown>) {
    const activeClasses = active
        ? "text-primary-foreground bg-primary shadow-sm"
        : "";
    const rowClass = `${"flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm font-normal text-text-secondary dark:text-text-secondary-dark rounded-md transition-[color,background-color] duration-fast ease-spring cursor-pointer hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed motion-reduce:transition-none"} ${activeClasses} ${className}`;

    const rowContent = (
        <>
            {icon && (
                <span className={`flex items-center justify-center w-4 shrink-0 ${iconClassName}`}>
                    {icon}
                </span>
            )}
            <span className={`flex-1 ${danger ? "text-danger dark:text-danger-dark" : ""} ${labelClassName}`}>
                {children}
            </span>
            {chevron}
            {hint}
        </>
    );

    if (href) {
        return (
            <Link to={href} onClick={onClick} aria-current={active ? "true" : undefined} className={rowClass}>
                {rowContent}
            </Link>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={rowClass}
            {...rest}
        >
            {rowContent}
        </button>
    );
}

export { MenuRow as MenuItem };