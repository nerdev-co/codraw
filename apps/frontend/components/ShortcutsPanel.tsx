import { useRef } from "react";
import { X } from "lucide-react";
import { useEscapeToClose, useFocusTrap } from "./ui";

/**
 * A single shortcut entry.
 *
 * @property combos - One or more alternative key combinations; each combo is
 *   a list of key names rendered as separate adjacent badges (e.g. `["Ctrl","Z"]`).
 * @property label - Human-readable description of what the shortcut does
 */
interface ShortcutEntry {
    combos: string[][];
    label: string;
}

/** A named group of shortcuts shown under a section header */
interface ShortcutSection {
    title: string;
    entries: ShortcutEntry[];
}

/** Excalidraw-style tool shortcuts */
const TOOLS: ShortcutEntry[] = [
    { combos: [["H"]], label: "Hand" },
    { combos: [["V"], ["1"]], label: "Selection" },
    { combos: [["R"], ["2"]], label: "Rectangle" },
    { combos: [["D"], ["3"]], label: "Diamond" },
    { combos: [["O"], ["4"]], label: "Ellipse" },
    { combos: [["A"], ["5"]], label: "Arrow" },
    { combos: [["L"], ["6"]], label: "Line" },
    { combos: [["P"], ["7"]], label: "Draw (pen)" },
    { combos: [["T"], ["8"]], label: "Text" },
    { combos: [["9"]], label: "Insert image" },
    { combos: [["E"], ["0"]], label: "Eraser" },
    { combos: [["F"]], label: "Frame" },
    { combos: [["K"]], label: "Laser pointer" },
    { combos: [["I"]], label: "Pick color" },
    { combos: [["B"]], label: "Cycle canvas background" },
    { combos: [["Q"]], label: "Keep tool active after drawing" },
    { combos: [["Tab"], ["Shift", "Tab"]], label: "Toggle shape type" },
    { combos: [["Space", "drag"]], label: "Pan the canvas" },
    { combos: [["Esc"]], label: "Cancel / deselect" },
];

/** Excalidraw-style editor shortcuts */
const EDITOR: ShortcutEntry[] = [
    { combos: [["Ctrl", "A"]], label: "Select all" },
    { combos: [["Ctrl", "Z"]], label: "Undo" },
    { combos: [["Ctrl", "Shift", "Z"]], label: "Redo" },
    { combos: [["Ctrl", "C"]], label: "Copy" },
    { combos: [["Ctrl", "X"]], label: "Cut" },
    { combos: [["Ctrl", "V"]], label: "Paste" },
    { combos: [["Ctrl", "D"]], label: "Duplicate" },
    { combos: [["Ctrl", "G"]], label: "Group" },
    { combos: [["Ctrl", "Shift", "G"]], label: "Ungroup" },
    { combos: [["Del"]], label: "Delete" },
    { combos: [["Ctrl", "B"]], label: "Bold text" },
    { combos: [["Ctrl", "I"]], label: "Italic text" },
    { combos: [["Shift", "click"]], label: "Add to selection" },
    { combos: [["Ctrl", "click"]], label: "Deep select" },
    { combos: [["Enter"]], label: "Edit text / add label" },
    { combos: [["Arrow", "keys"]], label: "Nudge selection" },
    { combos: [["Shift", "Arrow", "keys"]], label: "Nudge faster" },
    { combos: [["Shift", "Alt", "C"]], label: "Copy as PNG" },
    { combos: [["Ctrl", "Alt", "C"]], label: "Copy styles" },
    { combos: [["Ctrl", "Alt", "V"]], label: "Paste styles" },
    { combos: [["Ctrl", "["]], label: "Send backward" },
    { combos: [["Ctrl", "Shift", "["]], label: "Send to back" },
    { combos: [["Ctrl", "]"]], label: "Bring forward" },
    { combos: [["Ctrl", "Shift", "]"]], label: "Bring to front" },
    { combos: [["Ctrl", "Shift", "L"]], label: "Align left" },
    { combos: [["Ctrl", "Shift", "R"]], label: "Align right" },
    { combos: [["Ctrl", "Shift", "T"]], label: "Align top" },
    { combos: [["Ctrl", "Shift", "B"]], label: "Align bottom" },
    { combos: [["Ctrl", "Shift", "C"]], label: "Align center" },
    { combos: [["Ctrl", "Shift", "H"]], label: "Distribute horizontally" },
    { combos: [["Ctrl", "Shift", "V"]], label: "Distribute vertically" },
    { combos: [["Ctrl", "L"]], label: "Lock / unlock selection" },
    { combos: [["Shift", "H"]], label: "Flip horizontal" },
    { combos: [["Shift", "V"]], label: "Flip vertical" },
];

/** Excalidraw-style view shortcuts */
const VIEW: ShortcutEntry[] = [
    { combos: [["Ctrl", "="]], label: "Zoom in" },
    { combos: [["Ctrl", "-"]], label: "Zoom out" },
    { combos: [["Ctrl", "0"]], label: "Reset zoom" },
    { combos: [["Shift", "1"]], label: "Zoom to fit" },
    { combos: [["Shift", "2"]], label: "Zoom to selection" },
    { combos: [["PgUp"]], label: "Move page up" },
    { combos: [["PgDn"]], label: "Move page down" },
    { combos: [["Alt", "Z"]], label: "Zen mode" },
    { combos: [["Alt", "R"]], label: "View mode" },
    { combos: [["Alt", "S"]], label: "Snap to objects" },
    { combos: [["G"], ["Ctrl", "'"]], label: "Toggle snap to grid" },
    { combos: [["Arrow", "keys"]], label: "Pan canvas" },
    { combos: [["Alt", "Shift", "D"]], label: "Toggle theme" },
    { combos: [["Ctrl", "F"]], label: "Find on canvas" },
];

const SECTIONS: ShortcutSection[] = [
    { title: "Tools", entries: TOOLS },
    { title: "Editor", entries: EDITOR },
    { title: "View", entries: VIEW },
];

/**
 * A key badge — a single rounded-rectangle chip for one key name.
 */
function KeyBadge({ label }: { label: string }) {
    return (
        <kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-2 py-0.5 rounded-sm border border-white/10 bg-white/10 font-mono text-[11px] leading-none text-gray-300">
            {label}
        </kbd>
    );
}

/**
 * Render one shortcut row: description on the left, key badges on the right.
 */
function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5">
            <span className="text-sm text-gray-200">
                {entry.label}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
                {entry.combos.map((combo, i) => (
                    <span key={i} className="flex items-center gap-1">
                        {i > 0 && (
                            <span className="text-[10px] text-gray-500 mr-0.5">
                                /
                            </span>
                        )}
                        {combo.map((key) => (
                            <KeyBadge key={key} label={key} />
                        ))}
                    </span>
                ))}
            </div>
        </div>
    );
}

/**
 * One column (or the full-width View section): header + rows.
 */
function ShortcutSectionBlock({ section, className = "" }: { section: ShortcutSection; className?: string }) {
    return (
        <section className={className}>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">{section.title}</h3>
            <div className="divide-y divide-white/5">
                {section.entries.map((entry, i) => (
                    <ShortcutRow key={i} entry={entry} />
                ))}
            </div>
        </section>
    );
}

/**
 * Modal panel listing all keyboard shortcuts, structured like Excalidraw:
 * a fixed header, a scrollable body with Tools (left) and Editor (right)
 * columns, and a full-width View section below them.
 *
 * Dismissed with Escape or by clicking the close button / backdrop.
 *
 * @param isOpen - Whether the panel is currently visible
 * @param onClose - Callback fired when the panel should be dismissed
 */
export function ShortcutsPanel({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    useEscapeToClose(onClose, isOpen);

    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, isOpen);

    if (!isOpen) return null;

    return (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in motion-reduce:animate-none"
            onClick={onClose}
        >
            <div
                className="flex flex-col bg-[#1e1e1e] text-white rounded-xl shadow-2xl max-w-[800px] w-full mx-4 max-h-[78vh] animate-modal-in motion-reduce:animate-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                    <h2 id="shortcuts-title" className="text-sm font-medium text-white">
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 transition-[color,background-color] duration-fast cursor-pointer hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        aria-label="Close shortcuts panel"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                        <ShortcutSectionBlock section={SECTIONS[0]} />
                        <ShortcutSectionBlock section={SECTIONS[1]} />
                    </div>
                    <div className="mt-8 pt-6 border-t border-white/10">
                        <ShortcutSectionBlock section={SECTIONS[2]} />
                    </div>
                </div>
            </div>
        </div>
    );
}
