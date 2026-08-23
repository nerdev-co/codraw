/**
 * SearchPanel — find shapes by text content, arrow labels, or frame names.
 *
 * Opens with Cmd+F, shows a floating search bar at the top center.
 * Highlights matching shapes and allows navigating between them.
 */

import { useState, useEffect, useCallback } from "react";
import { Game } from "@/draw/Game";
import { Shape } from "@repo/shapes";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { SURFACE, Input } from "./ui";

export function SearchPanel({
    game,
    open,
    onClose,
}: {
    game: Game | undefined;
    open: boolean;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<Shape[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const doSearch = useCallback((q: string) => {
        setQuery(q);
        if (!game) return;
        const results = game.searchShapes(q);
        setMatches(results);
        setCurrentIndex(0);
        if (results.length > 0 && results[0]!.id) {
            game.selectAndZoomTo(results[0]!.id);
        }
    }, [game]);

    const navigate = useCallback((dir: 1 | -1) => {
        if (matches.length === 0) return;
        const next = (currentIndex + dir + matches.length) % matches.length;
        setCurrentIndex(next);
        if (matches[next]!.id && game) {
            game.selectAndZoomTo(matches[next]!.id!);
        }
    }, [matches, currentIndex, game]);

    const handleClose = useCallback(() => {
        setQuery("");
        setMatches([]);
        setCurrentIndex(0);
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
            if (e.key === "Enter") {
                e.preventDefault();
                navigate(e.shiftKey ? -1 : 1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, handleClose, navigate]);

    if (!open) return null;

    return (
        <div role="search" className={`fixed top-24 left-1/2 -translate-x-1/2 z-30 ${SURFACE} p-2 flex items-center gap-2 animate-popover motion-reduce:animate-none`}>
            <Input
                autoFocus
                aria-label="Search shapes"
                value={query}
                onChange={doSearch}
                placeholder="Search shapes..."
                size="lg"
                className="w-64"
            />
            {matches.length > 0 && (
                <span className="text-xs text-muted-foreground dark:text-muted-foreground-dark whitespace-nowrap">
                    {currentIndex + 1}/{matches.length}
                </span>
            )}
            <button
                onClick={() => navigate(-1)}
                disabled={matches.length === 0}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
                aria-label="Previous match"
            >
                <ChevronUp size={16} />
            </button>
            <button
                onClick={() => navigate(1)}
                disabled={matches.length === 0}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
                aria-label="Next match"
            >
                <ChevronDown size={16} />
            </button>
            <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark active:bg-active dark:active:bg-active-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
                aria-label="Close search"
            >
                <X size={16} />
            </button>
        </div>
    );
}
