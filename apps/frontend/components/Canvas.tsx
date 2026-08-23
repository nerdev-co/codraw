import { useEffect, useRef, useState } from "react";
import { getOrCreateGuestId, getDisplayName } from "@/lib/identity";
import { PresencePeer } from "@/draw/managers/cursorManager";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { ContextMenu, buildContextMenuItems } from "./ContextMenu";
import { TopBar } from "./TopBar";
import { MainToolbar } from "./MainToolbar";
import { MobileToolDock } from "./MobileToolDock";
import { PropertiesPanel } from "./PropertiesPanel";
import { ZoomControls } from "./ZoomControls";
import { HistoryControls } from "./HistoryControls";
import { TrashPanel } from "./TrashPanel";
import { LibrariesPanel } from "./LibrariesPanel";
import { Minimap } from "./Minimap";
import { SearchPanel } from "./SearchPanel";
import { MermaidPanel } from "./MermaidPanel";
import { PresentMode } from "./PresentMode";
import { PluginPanel } from "./PluginPanel";
import { Game } from "@/draw/Game";
import { Tool, ShapeStyle, CanvasBackground, Shape, TextShape, ArrowShape, FrameShape, DEFAULT_STROKE } from "@repo/shapes";
import { toolHasProperties } from "./canvasTools";
import { CURSOR_PALETTE, CANVAS_BG, pick } from "@/draw/colorSystem";

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Main canvas component — the root of the drawing experience.
 *
 * Responsibilities:
 * - Creates and manages the {@link Game} drawing engine
 * - Tracks the currently selected tool and shape style
 * - Syncs smooth mode (rough ↔ clean rendering) toggle state
 * - Wires the {@link PropertiesPanel} to the selected shape's style
 * - Renders the canvas chrome (header, tool rail, zoom, undo/redo, export)
 *
 * The canvas is full-viewport (`100vw × 100vh`) and handles resize
 * via a `ResizeObserver`.
 */
export function Canvas({
    roomId,
    socket,
}: {
    socket: WebSocket;
    roomId: string;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [game, setGame] = useState<Game | undefined>(undefined);
    const gameRef = useRef<Game | undefined>(undefined);
    const [selectedTool, setSelectedTool] = useState<Tool>("circle");
    const [handMode, setHandMode] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [selectedShapes, setSelectedShapes] = useState<Shape[]>([]);
    const [currentStyle, setCurrentStyle] = useState<ShapeStyle>(() => {
        return {
            strokeColor: DEFAULT_STROKE,
            backgroundColor: "transparent",
            strokeWidth: 1.5,
            roughness: 1,
            opacity: 1,
            fillStyle: "solid",
        };
    });
    const [showMinimap, setShowMinimap] = useState(true);
    const [zenMode, setZenMode] = useState(false);
    const [viewMode, setViewMode] = useState(false);
    type ActivePanel = "shortcuts" | "libraries" | "search" | "mermaid" | "present" | "trash" | "plugin" | null;
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);
    const prevPanel = useRef<ActivePanel>(null);
    const [trashItems, setTrashItems] = useState<Shape[]>([]);
    const [peers, setPeers] = useState<PresencePeer[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [textStyle, setTextStyle] = useState<{ bold?: boolean; italic?: boolean; fontFamily?: string; fontSize?: number; textAlign?: "left" | "center" | "right" }>({});
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        gameRef.current?.setTool(selectedTool);
    }, [selectedTool, game]);

    // Focus return: when any chrome panel closes (Escape, X, or outside
    // click), hand focus back to the canvas wrapper instead of dropping
    // it to <body>. Panels are opened from transient menu buttons, so the
    // opener is gone by the time the panel closes.
    useEffect(() => {
        if (prevPanel.current !== null && activePanel === null) {
            wrapRef.current?.focus();
        }
        prevPanel.current = activePanel;
    }, [activePanel]);

    useEffect(() => {
        if (!game) return;
        const updateTrash = () => {
            setTrashItems(gameRef.current?.getTrash() ?? []);
        };
        updateTrash();
        game.setTrashChangeCallback(updateTrash);
        return () => {
            game.setTrashChangeCallback(null);
        };
    }, [game]);

    // Keep hand-mode and active tool in sync with the Game engine.
    useEffect(() => {
        if (!game) return;
        game.setToolChangeCallback((tool) => {
            setSelectedTool(tool as Tool);
            setHandMode(tool === "hand");
        });
    }, [game]);

    useEffect(() => {
        if (!game) return;
        const updatePeers = () => {
            setPeers(gameRef.current?.getPeers() ?? []);
        };
        updatePeers();
        game.setPresenceChangeCallback(updatePeers);
        return () => {
            game.setPresenceChangeCallback(null);
        };
    }, [game]);

    useEffect(() => {
        let cancelled = false;
        fetch("/auth/me", { credentials: "include" })
            .then((res) => {
                if (!res.ok) throw new Error("Unauthorized");
                return res.json();
            })
            .then((data: { userId?: string; name?: string }) => {
                if (cancelled || !gameRef.current) return;
                const colors = [...CURSOR_PALETTE];
                const colorIndex = data.userId ? hashCode(data.userId) % colors.length : Math.floor(Math.random() * colors.length);
                const color = colors[colorIndex]!;
                gameRef.current.setLocalUser(data.userId ?? getOrCreateGuestId(), data.name ?? getDisplayName() ?? "Anonymous", color);
            })
            .catch(() => {
                if (cancelled || !gameRef.current) return;
                const colors = [...CURSOR_PALETTE];
                gameRef.current.setLocalUser(getOrCreateGuestId(), getDisplayName() ?? "Anonymous", colors[Math.floor(Math.random() * colors.length)]!);
            });
        return () => { cancelled = true; };
    }, [game]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let cssWidth = window.innerWidth;
        let cssHeight = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const resize = () => {
            cssWidth = window.innerWidth;
            cssHeight = window.innerHeight;
            canvas.width = cssWidth * dpr;
            canvas.height = cssHeight * dpr;
            canvas.style.width = cssWidth + "px";
            canvas.style.height = cssHeight + "px";
            gameRef.current?.resize(cssWidth, cssHeight, dpr);
        };
        resize();

        const observer = new ResizeObserver(resize);
        observer.observe(canvas.parentElement!);

        const g = new Game(canvas, roomId, socket);
        g.resize(cssWidth, cssHeight, dpr);
        // The Game is constructed before ThemeProvider's effect applies the
        // stored theme (effects run child-first), so the DOM class still
        // reflects the SSR default. Sync the engine to the effective theme
        // when they disagree so the canvas and chrome never mismatch.
        const storedTheme =
            typeof localStorage !== "undefined"
                ? localStorage.getItem("theme")
                : null;
        const effectiveDark = storedTheme ? storedTheme === "dark" : true;
        if (effectiveDark !== document.documentElement.classList.contains("dark")) {
            g.setTheme(effectiveDark);
        }
        g.setSelectionChangeCallback((shapes) => {
            setSelectedShapes(shapes);
            const first = shapes[0];
            if (first) {
                setCurrentStyle(first.style ?? g.currentStyle);
            } else {
                setCurrentStyle(g.getStyle());
            }
        });
        g.setThemeChangeCallback(() => {
            setCurrentStyle(g.getStyle());
        });
        g.setStyleChangeCallback(() => {
            setCurrentStyle(g.getStyle());
        });
        g.setShortcutsCallback(() => setActivePanel((prev) => prev === "shortcuts" ? null : "shortcuts"));
        g.setSearchCallback(() => setActivePanel((prev) => prev === "search" ? null : "search"));
        g.setContextMenuCallback((x, y) => setContextMenu({ x, y }));
        g.setZenModeCallback((zen) => setZenMode(zen));
        g.setViewModeCallback((view) => setViewMode(view));
        gameRef.current = g;
        setGame(g);

        return () => {
            g.destroy();
            observer.disconnect();
        };
    }, [roomId, socket]);

    useEffect(() => {
        gameRef.current?.setCurrentStyle(currentStyle);
    }, [currentStyle, game]);

    useEffect(() => {
        if (textStyle.bold !== undefined) gameRef.current!.textBold = textStyle.bold;
        if (textStyle.italic !== undefined) gameRef.current!.textItalic = textStyle.italic;
        if (textStyle.fontFamily !== undefined) gameRef.current!.textFontFamily = textStyle.fontFamily;
        if (textStyle.fontSize !== undefined) gameRef.current!.textFontSize = textStyle.fontSize;
        if (textStyle.textAlign !== undefined) gameRef.current!.textAlign = textStyle.textAlign;
    }, [textStyle, game]);

    // ── Multi-select consensus values ────────────────────────────
    // A property shows its value when all selected shapes agree, and is
    // left undefined ("mixed") when they differ. No selection falls back
    // to the current pen style / new-text defaults.
    const styleFallback = currentStyle;
    const selectionConsensus = <T,>(get: (s: Shape) => T | undefined): T | undefined => {
        if (selectedShapes.length === 0) return undefined;
        const first = get(selectedShapes[0]!);
        return selectedShapes.every((s) => get(s) === first) ? first : undefined;
    };

    const allSameType =
        selectedShapes.length > 0 &&
        selectedShapes.every((s) => s.type === selectedShapes[0]!.type);
    const panelShapeType =
        selectedShapes.length === 1
            ? selectedShapes[0]!.type
            : allSameType
                ? selectedShapes[0]!.type
                : "multiple";

    const styleFields: (keyof ShapeStyle)[] = [
        "strokeColor",
        "backgroundColor",
        "strokeWidth",
        "roughness",
        "opacity",
        "fillStyle",
    ];
    const panelStyle: Partial<ShapeStyle> =
        selectedShapes.length === 0
              ? currentStyle
              : (() => {
                    const consensus: Partial<ShapeStyle> = {};
                    for (const field of styleFields) {
                        const value = selectionConsensus(
                            (s) => (s.style ?? styleFallback)[field],
                        );
                        if (value !== undefined) {
                            consensus[field] = value as never;
                        }
                    }
                    return consensus;
                })();

    const allTextSelection =
        selectedShapes.length > 0 &&
        selectedShapes.every((s) => s.type === "text");
    const panelTextStyle =
        allTextSelection && selectedShapes.length > 0
            ? {
                  bold: selectionConsensus((s) => (s as TextShape).bold),
                  italic: selectionConsensus((s) => (s as TextShape).italic),
                  fontFamily: selectionConsensus((s) => (s as TextShape).fontFamily),
                  fontSize: selectionConsensus((s) => (s as TextShape).fontSize),
                  textAlign: selectionConsensus((s) => (s as TextShape).textAlign || "left"),
              }
            : textStyle;

    const panelArrowSize =
        panelShapeType === "arrow"
            ? selectionConsensus((s) => (s as ArrowShape).arrowHeadSize)
            : undefined;

    const panelUrl =
        selectedShapes.length === 0
            ? undefined
            : selectionConsensus((s) => s.url);
    const urlMixed =
        panelUrl === undefined &&
        selectedShapes.length > 1 &&
        selectedShapes.some((s) => s.url !== undefined);

    const panelFrameName =
        panelShapeType === "frame"
            ? selectionConsensus((s) => (s as FrameShape).name)
            : undefined;

    const showPropertiesPanel = selectedShapes.length > 0 || toolHasProperties(selectedTool);
    const hideChrome = zenMode || viewMode;

    const selectTool = (tool: string) => {
        gameRef.current?.setTool(tool);
        setSelectedTool(tool as Tool);
    };

    const toggleHand = () => {
        const g = gameRef.current;
        if (!g) return;
        const next = !g.handMode;
        g.setHandPanning(next);
        setHandMode(next);
    };

    const toggleLock = () => {
        gameRef.current?.toggleLock();
        setIsLocked(gameRef.current?.isLocked ?? false);
    };

    /**
     * Cycle through canvas background styles: solid → dots → crosses → plain → solid.
     */
    const cycleBackground = () => {
        const g = gameRef.current;
        if (!g) return;
        const bg = g.background as CanvasBackground;
        let next: CanvasBackground;
        if (bg.type === "solid") {
            next = { type: "dots", color: bg.color, dotSize: 3, spacing: 20 };
        } else if (bg.type === "dots") {
            next = { type: "crosses", color: bg.color, crossSize: 3, spacing: 20 };
        } else if (bg.type === "crosses") {
            next = { type: "plain" };
        } else {
            next = { type: "solid", color: pick(CANVAS_BG, g.isDark) };
        }
        g.setBackground(next);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const libraryId = e.dataTransfer.getData("application/x-library-id");
        const itemId = e.dataTransfer.getData("application/x-item-id");
        if (!libraryId || !itemId || !gameRef.current) return;
        const [canvasX, canvasY] = gameRef.current.screenToCanvas(e.clientX, e.clientY);
        gameRef.current.loadLibraryItem(libraryId, itemId, canvasX, canvasY);
    };

    return (
        <div
            ref={wrapRef}
            role="main"
            tabIndex={-1}
            className={`h-screen overflow-hidden outline-none ${isDragOver ? "ring-2 ring-primary/30" : ""} ${handMode ? "cursor-grab active:cursor-grabbing" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <canvas ref={canvasRef} role="img" aria-label="Whiteboard canvas — use the toolbar to draw" />

            {!hideChrome && (
                <TopBar
                    roomName={roomId}
                    game={game}
                    peers={peers}
                    onShowShortcuts={() => setActivePanel((prev) => prev === "shortcuts" ? null : "shortcuts")}
                    onShowLibraries={() => setActivePanel((prev) => prev === "libraries" ? null : "libraries")}
                    onShowMermaid={() => setActivePanel((prev) => prev === "mermaid" ? null : "mermaid")}
                    onShowPlugins={() => setActivePanel((prev) => prev === "plugin" ? null : "plugin")}
                    onShowSearch={() => setActivePanel((prev) => prev === "search" ? null : "search")}
                    onShowTrash={() => setActivePanel((prev) => prev === "trash" ? null : "trash")}
                    onPresent={() => setActivePanel((prev) => prev === "present" ? null : "present")}
                    onCycleBackground={cycleBackground}
                    showMinimap={showMinimap}
                    onToggleMinimap={() => setShowMinimap((s) => !s)}
                />
            )}
            {!hideChrome && (
                <MainToolbar
                    selectedTool={selectedTool}
                    handMode={handMode}
                    isLocked={isLocked}
                    onSelectTool={selectTool}
                    onToggleHand={toggleHand}
                    onToggleLock={toggleLock}
                    game={game}
                />
            )}
            {!hideChrome && (
                <MobileToolDock
                    selectedTool={selectedTool}
                    handMode={handMode}
                    onSelectTool={selectTool}
                    onToggleHand={toggleHand}
                />
            )}
            {!hideChrome && showPropertiesPanel && (
                <PropertiesPanel
                key={panelShapeType}
                docked
                shapeType={panelShapeType}
                style={panelStyle}
                onStyleChange={(updates) => {
                    if (selectedShapes.length > 0) {
                        gameRef.current?.updateShapeStyle(updates);
                    }
                    setCurrentStyle((s) => ({ ...s, ...updates }));
                }}
                arrowHeadSize={panelArrowSize}
                onArrowHeadSizeChange={(size) => gameRef.current?.setArrowHeadSize(size)}
                textStyle={panelTextStyle}
                onTextStyleChange={(updates) => {
                    if (selectedShapes.some((s) => s.type === "text")) {
                        gameRef.current?.updateSelectedTextShapes(updates);
                    } else {
                        setTextStyle((s) => ({ ...s, ...updates }));
                    }
                }}
                url={panelUrl}
                urlMixed={urlMixed}
                onUrlChange={(url) => gameRef.current?.setShapeUrl(url)}
                frameName={panelFrameName}
                onFrameNameChange={(name) => gameRef.current?.setFrameName(name)}
                isSelection={selectedShapes.length > 0}
                selectionCount={selectedShapes.length}
                game={game}
            />
            )}
            {!hideChrome && <ZoomControls game={game} canvasRef={wrapRef} />}
            {!hideChrome && <HistoryControls game={game} />}
            <ShortcutsPanel isOpen={activePanel === "shortcuts"} onClose={() => setActivePanel(null)} />
            <LibrariesPanel game={game} open={activePanel === "libraries"} onClose={() => setActivePanel(null)} />
            <SearchPanel game={game} open={activePanel === "search"} onClose={() => setActivePanel(null)} />
            <MermaidPanel game={game} open={activePanel === "mermaid"} onClose={() => setActivePanel(null)} />
            <PresentMode game={game} active={activePanel === "present"} onClose={() => setActivePanel(null)} />
            {!hideChrome && showMinimap && <Minimap game={game} />}
            <TrashPanel
                trash={trashItems}
                onRestore={(id) => gameRef.current?.restoreFromTrash(id)}
                onEmpty={() => gameRef.current?.emptyTrash()}
                onClose={() => setActivePanel(null)}
                open={activePanel === "trash"}
            />
            <PluginPanel game={game} open={activePanel === "plugin"} onClose={() => setActivePanel(null)} />
            {contextMenu && game && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={buildContextMenuItems(game, game.getSelectedShapes().length > 0)}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );
}
