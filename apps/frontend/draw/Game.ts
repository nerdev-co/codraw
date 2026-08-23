import { ImageCache } from "./imageCache";
import { getExistingShapes, saveShapes } from "./http";
import { EXPORT_BG, pick } from "./colorSystem";
import rough from "roughjs";
import {
    Tool,
    Shape,
    ShapeStyle,
    Point,
    defaultStyle,
    CanvasBackground,
    Library,
    LibraryItem,
    getShapeBounds,
    getShapeCenter,
    ensureShapesHaveStyle,
} from "@repo/shapes";
import { GameContext } from "./gameContext";
import { LibraryManager } from "./managers/libraryManager";
import { HistoryManager } from "./managers/historyManager";
import { ExportManager } from "./managers/exportManager";
import { MermaidManager } from "./managers/mermaidManager";
import { PluginManager } from "./managers/pluginManager";
import { LaserManager } from "./managers/laserManager";
import { StyleManager } from "./managers/styleManager";
import { ArrowManager } from "./managers/arrowManager";
import { ImageManager } from "./managers/imageManager";
import { TextManager } from "./managers/textManager";
import { RenderManager } from "./managers/renderManager";
import { ShapeManager } from "./managers/shapeManager";
import { CursorManager, PresencePeer } from "./managers/cursorManager";
import { AutoSaveManager } from "./managers/autoSaveManager";
import { ClipboardManager } from "./managers/clipboardManager";
import { KeyboardManager } from "./managers/keyboardManager";
import { WebSocketSyncManager } from "./managers/webSocketSyncManager";
import { PointerInteractionManager } from "./managers/pointerInteractionManager";
import { MouseManager } from "./managers/mouseManager";
import { TouchManager } from "./managers/touchManager";
import { NavigationManager } from "./managers/navigationManager";
import { ToolManager } from "./managers/toolManager";
import { enterEditAction as runEnterEditAction } from "./managers/shapeEdit";
import { renderShape } from "./renderer";
import { exportToPng, exportToSvg, exportToJson } from "./exporter";
import {
    TextStyleOptions,
    TextEditCallbacks,
} from "./inputHandler";
import { Plugin, CustomToolDefinition } from "./pluginSystem";

/**
 * Core drawing engine.
 *
 * Composes focused modules for viewport, undo, rendering, export, and input.
 * Manages the HTML Canvas, shape state, selection, grouping, pan/zoom,
 * WebSocket sync, and auto-save persistence.
 */
export class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private context = new GameContext();
    private roomId: string;
    private selectionChangeCallback: ((shapes: Shape[]) => void) | null = null;
    private styleChangeCallback: (() => void) | null = null;
    private shortcutsCallback: (() => void) | null = null;
    private searchCallback: (() => void) | null = null;
    private imageCache = new ImageCache();
    /** Device pixel ratio, capped at 2 for performance */
    private zenModeCallback: ((zen: boolean) => void) | null = null;
    private viewModeCallback: ((view: boolean) => void) | null = null;

    /** Whether dark mode is active (public accessor for UI components) */
    get isDark(): boolean { return this.context.isDark; }
    set isDark(v: boolean) { this.context.isDark = v; }

    /** The current drawing style (public accessor for UI components) */
    get currentStyle(): ShapeStyle { return this.context.currentStyle; }
    set currentStyle(v: ShapeStyle) { this.context.currentStyle = v; }

    /** The current canvas background style */
    get background(): CanvasBackground {
        return this.context._background;
    }

    /** The active tool (public accessor for UI components) */
    get selectedTool(): Tool | string { return this.context.selectedTool; }

    /** Whether new text will be bold */
    get textBold(): boolean { return this.context.textManager.textBold; }
    set textBold(v: boolean) { this.context.textManager.textBold = v; }

    /** Whether new text will be italic */
    get textItalic(): boolean { return this.context.textManager.textItalic; }
    set textItalic(v: boolean) { this.context.textManager.textItalic = v; }

    /** Font family for new text shapes */
    get textFontFamily(): string { return this.context.textManager.textFontFamily; }
    set textFontFamily(v: string) { this.context.textManager.textFontFamily = v; }

    /** Font size for new text shapes */
    get textFontSize(): number { return this.context.textManager.textFontSize; }
    set textFontSize(v: number) { this.context.textManager.textFontSize = v; }

    /** Text alignment for new text shapes */
    get textAlign(): "left" | "center" | "right" { return this.context.textManager.textAlign; }
    set textAlign(v: "left" | "center" | "right") { this.context.textManager.textAlign = v; }

    /** Get the current text formatting state */
    getTextStyle(): TextStyleOptions {
        return this.context.textManager.getTextStyle();
    }

    /** The WebSocket connection for real-time collaboration */
    socket: WebSocket;

    private destroyed = false;

    // Library storage key
    /** Get all saved libraries from localStorage */
    getLibraries(): Library[] {
        return this.context.libraryManager.getLibraries();
    }

    /** Create a new library */
    createLibrary(name: string): Library {
        return this.context.libraryManager.createLibrary(name);
    }

    /** Delete a library by ID */
    deleteLibrary(id: string) {
        this.context.libraryManager.deleteLibrary(id);
    }

    /** Rename a library */
    renameLibrary(id: string, name: string) {
        this.context.libraryManager.renameLibrary(id, name);
    }

    /** Save selected shapes as a library item */
    saveToLibrary(libraryId: string, itemName: string): LibraryItem | null {
        return this.context.libraryManager.saveToLibrary(libraryId, itemName);
    }

    /** Delete a library item */
    deleteLibraryItem(libraryId: string, itemId: string) {
        this.context.libraryManager.deleteLibraryItem(libraryId, itemId);
    }

    /** Load a library item onto the canvas at the given position */
    loadLibraryItem(libraryId: string, itemId: string, x?: number, y?: number) {
        this.context.libraryManager.loadLibraryItem(libraryId, itemId, x, y);
    }

    /** Export a library as JSON for sharing */
    exportLibrary(libraryId: string): string | null {
        return this.context.libraryManager.exportLibrary(libraryId);
    }

    /** Import a library from JSON */
    importLibrary(json: string): Library | null {
        return this.context.libraryManager.importLibrary(json);
    }

    /** Get all visible shapes for the minimap */
    getShapesForMinimap(): Shape[] {
        return this.context.navigationManager.getShapesForMinimap();
    }

    /** Get the current viewport state for the minimap */
    getViewportState() {
        return this.context.navigationManager.getViewportState();
    }

    /** Navigate the viewport to center on a canvas coordinate */
    navigateTo(canvasX: number, canvasY: number) {
        this.context.navigationManager.navigateTo(canvasX, canvasY);
    }

    /** Search shapes by text content, arrow labels, or frame names */
    searchShapes(query: string): Shape[] {
        return this.context.navigationManager.searchShapes(query);
    }

    /** Select and zoom to a specific shape */
    selectAndZoomTo(shapeId: string) {
        this.context.navigationManager.selectAndZoomTo(shapeId);
    }

    /** Import a Mermaid diagram and add shapes to the canvas */
    importFromMermaid(text: string, x = 200, y = 200): Shape[] {
        return this.context.mermaidManager.importFromMermaid(text, x, y);
    }

    /** Get all frames sorted by position (top-to-bottom, left-to-right) as slides */
    getSlides(): Shape[] {
        return this.context.navigationManager.getSlides();
    }

    /** Get the viewport state needed to show a frame full-screen */
    getSlideViewport(frame: Shape, canvasWidth: number, canvasHeight: number): { panX: number; panY: number; zoom: number } {
        return this.context.navigationManager.getSlideViewport(frame, canvasWidth, canvasHeight);
    }

    /** Convert screen/client coordinates to canvas/world coordinates */
    screenToCanvas(clientX: number, clientY: number): Point {
        return this.context.navigationManager.screenToCanvas(clientX, clientY);
    }

    /**
     * Create a new drawing engine.
     * @param canvas - The HTML canvas element to draw on
     * @param roomId - The collaboration room ID for sync
     * @param socket - WebSocket connection for real-time collaboration
     */
    constructor(canvas: HTMLCanvasElement, roomId: string, socket: WebSocket) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.roomId = roomId;
        this.socket = socket;
        this.context = this.createGameContext();
        this.init().then(() => {
            if (this.destroyed) return;
            this.context.mouseManager.init(this.canvas);
            this.context.keyboardManager.init();
            this.context.webSocketSyncManager.init();
            this.context.touchManager = new TouchManager(this.context, {
                pointerInteractionManager: this.context.pointerInteractionManager,
                startTextEdit: (x, y, text, index, style, onCommit) => this.startTextEdit(x, y, text, index, style, onCommit),
                syncShapes: () => this.syncShapes(),
                notifySelection: () => this.notifySelection(),
                invalidateCache: () => this.invalidateCache(),
                clearCanvas: () => this.clearCanvas(),
            });
            this.initTouchHandlers();
            this.context.clipboardManager.initPasteHandler(this.canvas);
            this.context.clipboardManager.initClipboardChannel();
            this.context.cursorManager.startCursorCleanup();
        });
    }

    private createGameContext(): GameContext {
        const context = new GameContext();
        context.viewport.updateCanvasRect(this.canvas);
        context.existingShapes = [];
        context.isDark = document.documentElement.classList.contains("dark");
        context.currentStyle = defaultStyle(context.isDark);

        context.styleManager = new StyleManager(context, {
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        context._background = { type: "solid", color: context.styleManager.canvasBackgroundColor() };

        context.shapeManager = new ShapeManager(context, {
            syncShapes: () => this.syncShapes(),
            notifySelection: () => this.notifySelection(),
            flushAutoSave: () => context.autoSaveManager.flushAutoSave(),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            setTool: (tool) => this.setTool(tool),
        });
        context.libraryManager = new LibraryManager(context, {
            getSelectedShapes: () => this.getSelectedShapes(),
            getMultipleBounds: (shapes) => context.shapeManager.getMultipleBounds(shapes),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            syncShapes: () => this.syncShapes(),
        });
        context.toolManager = new ToolManager(context, {
            notifySelection: () => this.notifySelection(),
            clearCanvas: () => this.clearCanvas(),
        });
        context.navigationManager = new NavigationManager(context, {
            notifySelection: () => this.notifySelection(),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        context.historyManager = new HistoryManager(context, {
            removeTextOverlay: () => context.textManager.removeTextOverlay(),
            notifySelection: () => this.notifySelection(),
            syncShapes: () => this.syncShapes(),
        });
        context.exportManager = new ExportManager(context, {
            notifySelection: () => this.notifySelection(),
            syncShapes: () => this.syncShapes(),
            imageCache: this.imageCache,
        });
        context.mermaidManager = new MermaidManager(context, {
            getMultipleBounds: (shapes) => context.shapeManager.getMultipleBounds(shapes),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            syncShapes: () => this.syncShapes(),
        });
        context.pointerInteractionManager = new PointerInteractionManager(context, {
            ctx: this.ctx,
            rc: rough.canvas(this.canvas),
            setTool: (tool) => this.setTool(tool),
            setHandPanning: (active) => this.setHandPanning(active),
            startTextEdit: (x, y, text, index, style) => this.startTextEdit(x, y, text, index, style),
            copySelectionAsPng: () => this.copySelectionAsPng(),
            setLaserPosition: (x, y) => this.setLaserPosition(x, y),
            toggleTheme: () => this.toggleTheme(),
            toggleSnapToGrid: () => this.toggleSnapToGrid(),
            toggleLock: () => this.toggleLock(),
            selectAll: () => this.selectAll(),
            zoomIn: () => this.zoomIn(),
            zoomOut: () => this.zoomOut(),
            zoomToFit: () => this.zoomToFit(),
            zoomToSelection: () => this.zoomToSelection(),
            resetZoom: () => this.resetZoom(),
            insertImage: () => this.insertImage(),
            openImagePicker: (coords) => context.imageManager.openImagePicker(coords),
            notifySelection: () => this.notifySelection(),
            syncShapes: () => this.syncShapes(),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            pushUndo: (prev, current) => context.undoManager.push(prev, current),
            broadcastCursor: (x, y) => context.cursorManager.broadcastCursor(x, y),
            get styleChangeCallback() { return this.styleChangeCallback; },
            get toolChangeCallback() { return context.toolManager.toolChangeCallback; },
        });
        context.cursorManager = new CursorManager(context, {
            roomId: this.roomId,
            socket: this.socket,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        context.autoSaveManager = new AutoSaveManager(context, {
            roomId: this.roomId,
            socket: this.socket,
            existingShapes: context.existingShapes,
            selectedIds: context.selectedIds,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            notifySelection: () => this.notifySelection(),
        });
        context.clipboardManager = new ClipboardManager(context, {
            roomId: this.roomId,
            imageCache: this.imageCache,
        });
        context.keyboardManager = new KeyboardManager(context, {
            selectedTool: context.selectedTool,
            setTool: (tool) => this.setTool(tool),
            setHandPanning: (active) => this.setHandPanning(active),
            enterEditAction: () => this.enterEditAction(),
            insertImage: () => this.insertImage(),
            copySelectionAsPng: () => this.copySelectionAsPng(),
            toggleLock: () => this.toggleLock(),
            cancelPolyline: () => context.pointerInteractionManager.cancelPolyline(),
            cancelImageCrop: () => this.cancelImageCrop(),
            searchCallback: this.searchCallback,
            shortcutsCallback: this.shortcutsCallback,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            syncShapes: () => this.syncShapes(),
            notifySelection: () => this.notifySelection(),
            setSpacePressed: (v) => { context.pointerInteractionManager.spacePressed = v; },
        });
        context.webSocketSyncManager = new WebSocketSyncManager(context, {
            roomId: this.roomId,
            socket: this.socket,
            existingShapes: context.existingShapes,
            lastSyncedShapes: context.lastSyncedShapes,
            selectedIds: context.selectedIds,
            undoManager: context.undoManager,
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            notifySelection: () => this.notifySelection(),
            cursorManager: context.cursorManager,
        });
        context.renderManager = new RenderManager(context, {
            canvas: this.canvas,
            ctx: this.ctx,
            imageCache: this.imageCache,
            getSelectedShape: () => this.getSelectedShape(),
            drawRemoteCursors: (ctx) => context.cursorManager.drawRemoteCursors(ctx),
        });
        context.pluginManager = new PluginManager(context);
        context.pluginManager.initialize(this, this.canvas);
        context.laserManager = new LaserManager(context, {
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
        });
        context.arrowManager = new ArrowManager(context, {
            syncShapes: () => this.syncShapes(),
        });
        context.imageManager = new ImageManager(context, {
            imageCache: this.imageCache,
            clearCanvas: () => this.clearCanvas(),
            invalidateCache: () => this.invalidateCache(),
            syncShapes: () => this.syncShapes(),
            commitShape: (shape, autoSwitchToSelect) => context.shapeManager.commitShape(shape, autoSwitchToSelect),
        });
        context.textManager = new TextManager(context, {
            syncShapes: () => this.syncShapes(),
            commitShape: (shape, autoSwitchToSelect) => context.shapeManager.commitShape(shape, autoSwitchToSelect),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            setClicked: (v) => (context.pointerInteractionManager.clicked = v),
        });
        context.mouseManager = new MouseManager(context, {
            ctx: this.ctx,
            pointerInteractionManager: context.pointerInteractionManager,
            startTextEdit: (x, y, text, index, style, onCommit) => this.startTextEdit(x, y, text, index, style, onCommit),
            syncShapes: () => this.syncShapes(),
            notifySelection: () => this.notifySelection(),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            setLaserPosition: (x, y) => this.setLaserPosition(x, y),
            clearLaser: () => this.clearLaser(),
        });
        return context;
    }

    /** Tear down all event listeners and cancel pending auto-saves */
    destroy() {
        this.destroyed = true;
        this.context.textManager.removeTextOverlay();
        this.context.autoSaveManager.disableAutoSave();
        this.context.webSocketSyncManager.destroy();
        this.context.mouseManager.destroy(this.canvas);
        this.context.touchManager?.destroy(this.canvas);
        this.context.keyboardManager.destroy();
        this.context.cursorManager.destroy();
        this.context.clipboardManager.destroy(this.canvas);
    }

    /**
     * Register a callback fired when the selection changes.
     * @param cb - Called with all currently selected shapes (empty when nothing is selected)
     */
    setSelectionChangeCallback(cb: (shapes: Shape[]) => void) {
        this.selectionChangeCallback = cb;
    }

    /**
     * Register a callback fired when the current drawing style changes
     * internally (e.g. via the eyedropper tool).
     * @param cb - Called with no arguments; use getStyle() to read the new style
     */
    setStyleChangeCallback(cb: (() => void) | null) {
        this.styleChangeCallback = cb;
    }

    /**
     * Register a callback fired when the theme changes.
     * @param cb - Called with `true` for dark mode, `false` for light
     */
    setThemeChangeCallback(cb: (isDark: boolean) => void) {
        this.context.styleManager.setThemeChangeCallback(cb);
    }

/**
     * Register a callback fired when the active tool changes.
     * @param cb - Called with the new tool name
     */
    setToolChangeCallback(cb: ((tool: string) => void) | null) {
        this.context.toolManager.setToolChangeCallback(cb);
    }

    /**
     * Register a callback fired when the trash contents change.
     * @param cb - Called after any trash mutation, or `null` to clear
     */
    setTrashChangeCallback(cb: (() => void) | null) {
        this.context.historyManager.setTrashChangeCallback(cb);
    }

    /**
      * Register a callback fired when the keyboard shortcuts panel
      * should be toggled.
      * @param cb - Called to toggle the shortcuts panel visibility
      */
    setShortcutsCallback(cb: () => void) {
        this.shortcutsCallback = cb;
    }

    /**
     * Register a callback fired when Cmd+F search should open.
     * @param cb - Called to toggle the search panel visibility
     */
    setSearchCallback(cb: () => void) {
        this.searchCallback = cb;
    }

    /**
     * Register a callback for when the user right-clicks the canvas.
     * @param cb - Called with the client X/Y coordinates
     */
    setContextMenuCallback(cb: (x: number, y: number) => void) {
        this.context.mouseManager.setContextMenuCallback(cb);
    }

    /** Toggle snap-to-grid mode */
    toggleSnapToGrid() {
        this.context.snapToGrid = !this.context.snapToGrid;
    }

    /**
     * Toggle object snapping (alignment with other shapes while dragging).
     * Off by default: on. Toggled with Alt+S.
     */
    toggleSnapToObjects() {
        this.context.snapToObjects = !this.context.snapToObjects;
    }

    /** Whether object snapping is enabled */
    get isSnapToObjects() {
        return this.context.snapToObjects;
    }

    /**
     * Toggle "keep tool active after drawing".
     *
     * When off, committing a shape switches back to the Select tool.
     * Default is on (tools stay active). Toggled with Q.
     */
    toggleStayAfterDraw() {
        this.context.stayAfterDraw = !this.context.stayAfterDraw;
    }

    /** Whether shape tools stay active after drawing */
    get stayActiveAfterDraw() {
        return this.context.stayAfterDraw;
    }

    /**
     * Toggle zen mode — hides all UI chrome around the canvas.
     * Toggled with Alt+Z.
     */
    toggleZenMode() {
        this.context.zenMode = !this.context.zenMode;
        this.zenModeCallback?.(this.context.zenMode);
        this.clearCanvas();
    }

    /** Whether zen mode (chrome hidden) is active */
    get isZenMode() {
        return this.context.zenMode;
    }

    /** Register a callback fired when zen mode changes */
    setZenModeCallback(cb: (zen: boolean) => void) {
        this.zenModeCallback = cb;
    }

    /**
     * Toggle view mode — hides all UI chrome and blocks editing,
     * leaving only pan/zoom/navigation. Toggled with Alt+R.
     */
    toggleViewMode() {
        this.context.viewMode = !this.context.viewMode;
        if (this.context.viewMode) {
            this.context.selectedIds.clear();
            this.notifySelection();
        }
        this.viewModeCallback?.(this.context.viewMode);
        this.clearCanvas();
    }

    /** Whether view mode (read-only) is active */
    get isViewMode() {
        return this.context.viewMode;
    }

    /** Register a callback fired when view mode changes */
    setViewModeCallback(cb: (view: boolean) => void) {
        this.viewModeCallback = cb;
    }

    /**
     * Get current snap-to-grid state.
     * @returns `true` if snap-to-grid is enabled
     */
    get isSnapToGrid() {
        return this.context.snapToGrid;
    }

    /**
     * Find a shape by its unique ID.
     * @param id - The shape's unique identifier
     * @returns The matching shape, or undefined
     */
    private shapeById(id: string): Shape | undefined {
        return this.context.existingShapes.find((s) => s.id === id) ?? this.context.trash.find((s) => s.id === id);
    }

    /**
     * Get all currently selected shapes.
     * @returns Array of shapes whose IDs are in the selection set
     */
    private selectedShapes(): Shape[] {
        return this.context.existingShapes.filter((s) => s.id && this.context.selectedIds.has(s.id));
    }

    /**
     * Get the first selected shape, or null if nothing is selected.
     * Used by the PropertiesPanel to display/edit the shape's style.
     */
    getSelectedShape(): Shape | null {
        if (this.context.selectedIds.size === 0) return null;
        const first = [...this.context.selectedIds][0];
        return this.shapeById(first) ?? null;
    }

    /** Get all currently selected shapes (multi-select support) */
    getSelectedShapes(): Shape[] {
        return this.selectedShapes();
    }

    /**
     * Apply style updates to all selected shapes and push to undo stack.
     * @param updates - Partial style properties to merge into each shape's style
     */
    updateShapeStyle(updates: Partial<ShapeStyle>) {
        this.context.shapeManager.updateShapeStyle(updates);
    }

    /**
     * Apply font/formatting updates to all selected text shapes and push
     * to the undo stack.
     * @param updates - Partial text formatting to merge into each text shape
     */
    updateSelectedTextShapes(updates: {
        bold?: boolean;
        italic?: boolean;
        fontFamily?: string;
        fontSize?: number;
        textAlign?: "left" | "center" | "right";
    }) {
        this.context.shapeManager.updateTextShapes(updates);
    }

    /**
     * Set the active drawing tool.
     * Clears selection when switching away from the select tool.
     * @param tool - The tool to activate
     */
    setTool(tool: string) {
        this.context.toolManager.setTool(tool);
    }

    /** Whether hand (pan) mode is currently active */
    get handMode(): boolean {
        return this.context.toolManager.handMode;
    }

    /** Whether the canvas is locked (no selection/drag allowed) */
    get isLocked(): boolean {
        return this.context.toolManager.isLocked;
    }

    /**
     * Toggle the canvas lock state.
     *
     * When locked, selection, dragging, and text editing are suppressed
     * so the active drawing tool keeps working without accidentally
     * switching to Select. The shortcut `Ctrl+L` also calls this when
     * nothing is selected.
     */
    toggleLock() {
        this.context.toolManager.toggleLock();
    }

    /**
      * Enable or disable hand (pan) mode.
      *
      * When active, mouse drags pan the canvas by reusing the same
      * space-bar pan path, so no drawing logic changes.
      */
    setHandPanning(active: boolean) {
        this.context.toolManager.setHandPanning(active);
    }

    loadPlugin(plugin: Plugin): boolean {
        return this.context.pluginManager.loadPlugin(plugin);
    }

    unloadPlugin(pluginId: string): boolean {
        return this.context.pluginManager.unloadPlugin(pluginId);
    }

    getLoadedPlugins(): Plugin[] {
        return this.context.pluginManager.getLoadedPlugins();
    }

    isToolRegistered(toolId: string): boolean {
        return this.context.pluginManager.isToolRegistered(toolId);
    }

    getPluginTools(): CustomToolDefinition[] {
        return this.context.pluginManager.getPluginTools();
    }

    /**
     * Switch between dark and light theme.
     * Updates the default stroke color and canvas background (only when
     * the user has not customized the background) and re-renders.
     * Never modifies existing shapes or collaboration state.
     * @param isDark - `true` for dark mode, `false` for light
     */
    setTheme(isDark: boolean) {
        this.context.styleManager.setTheme(isDark);
    }

    /**
     * Update the current drawing style (applied to newly created shapes).
     * @param style - The new default style
     */
    setCurrentStyle(style: ShapeStyle) {
        this.context.styleManager.setCurrentStyle(style);
    }

    getStyle(): ShapeStyle {
        return this.context.styleManager.getStyle();
    }

    /**
     * Set the canvas background style.
     * Marks the background as user-customized so theme changes stop
     * tracking it (the user's chosen background wins over the theme).
     * @param background - The new background configuration
     */
    setBackground(background: CanvasBackground) {
        this.context.styleManager.setBackground(background);
    }

    /** Zoom in by a factor of 1.2x centered on the viewport */
    zoomIn() {
        this.context.navigationManager.zoomIn();
    }

    /** Zoom out by a factor of 1.2x centered on the viewport */
    zoomOut() {
        this.context.navigationManager.zoomOut();
    }

    /** Zoom and pan to fit all shapes within the viewport */
    zoomToFit() {
        this.context.navigationManager.zoomToFit();
    }

    /** Reset zoom to 100% and center the viewport */
    resetZoom() {
        this.context.navigationManager.resetZoom();
    }

    /** Select all shapes on the canvas */
    selectAll() {
        this.context.navigationManager.selectAll();
    }

    /** Load existing shapes from the server and render the initial canvas */
    async init() {
        try {
            const { shapes, trash, version } = await getExistingShapes(this.roomId);
            this.context.existingShapes = ensureShapesHaveStyle(
                shapes.filter((s) => s.type !== "eraser"),
                this.context.isDark,
            );
            this.context.trash = ensureShapesHaveStyle(
                trash.filter((s) => s.type !== "eraser"),
                this.context.isDark,
            );
            this.context.lastSyncedShapes = this.buildShapeMap(this.context.existingShapes);
            this.context.lastSavedVersion = version;
            this.invalidateCache();
            this.clearCanvas();
            this.context.imageManager.preloadImages();
        } catch (err) {
            console.error("Failed to load shapes:", err);
            this.context.existingShapes = [];
            this.context.trash = [];
            this.clearCanvas();
        }
    }

    /**
     * Notify the selection change callback with the current selection.
     *
     * Fires the callback registered via {@link setSelectionChangeCallback}
     * with all currently selected shapes (empty array when nothing is
     * selected), so multi-select inspectors can show consensus values.
     */
    private notifySelection() {
        this.selectionChangeCallback?.(this.selectedShapes());
    }

    /**
     * Mark the off-screen cache as stale, forcing a rebuild on next render.
     *
     * Call this whenever shapes change, the viewport transforms, or the
     * background style changes.
     */
    private invalidateCache() {
        this.context.renderManager.invalidateCache();
    }

    /**
     * Clear the canvas, rebuild the cache if needed, and draw selection handles.
     *
     * This is the main render method called after any state change. It:
     * 1. Clears the visible canvas
     * 2. Draws the background
     * 3. Copies the cached scene (rebuilding if stale)
     * 4. Draws selection handles and alignment guides
     */
    clearCanvas() {
        this.context.renderManager.clearCanvas();
    }

    /**
     * Rebuild the cache and re-render after a canvas resize.
     *
     * Call this when the canvas element's width or height changes
     * (e.g. on window resize).
     */
    /**
     * Resize the canvas backing store and update the logical coordinate space.
     *
     * Accepts CSS-pixel dimensions plus the device pixel ratio so the engine
     * can keep its internal math in CSS pixels while the browser rasterizes
     * at native resolution.
     *
     * @param cssWidth - Logical canvas width in CSS pixels
     * @param cssHeight - Logical canvas height in CSS pixels
     * @param dpr - Device pixel ratio (capped at 2 for performance)
     */
    resize(cssWidth?: number, cssHeight?: number, dpr?: number) {
        if (cssWidth !== undefined) this.context.cssWidth = cssWidth;
        if (cssHeight !== undefined) this.context.cssHeight = cssHeight;
        if (dpr !== undefined) this.context.dpr = dpr;
        this.ctx.setTransform(this.context.dpr, 0, 0, this.context.dpr, 0, 0);
        this.context.viewport.updateCanvasRect(this.canvas);
        this.context.renderManager.updateDpr(this.context.dpr);
        this.invalidateCache();
        this.clearCanvas();
    }

    /**
     * Compute a shape diff and broadcast it over WebSocket, then schedule auto-save.
     *
     * Compares the current shapes against {@link lastSyncedShapes} to compute
     * added, modified, and removed sets. If any changes exist, sends a
     * `shape-diff` message over the WebSocket and schedules an auto-save.
     */
    private syncShapes() {
        this.context.webSocketSyncManager.syncShapes();
    }

    /** Build the id-keyed sync snapshot map for a shape array (deep clones). */
    private buildShapeMap(shapes: Shape[]): Map<string, Shape> {
        return new Map(
            shapes
                .filter((s) => Boolean(s.id))
                .map((s) => [s.id!, structuredClone(s)]),
        );
    }

    commitShape(shape: Shape, autoSwitchToSelect = false) {
        this.context.shapeManager.commitShape(shape, autoSwitchToSelect);
    }

    /**
     * Undo the last shape change and re-render.
     *
     * Restores the shape array to its previous state via the undo manager,
     * clears the selection, and syncs the changes.
     */
    undo() {
        this.context.historyManager.undo();
    }

    /**
     * Redo the last undone shape change and re-render.
     *
     * Re-applies the most recently undone change via the undo manager,
     * clears the selection, and syncs the changes.
     */
    redo() {
        this.context.historyManager.redo();
    }

    /** Whether an undo step is available (for UI disabled states) */
    get canUndo(): boolean {
        return this.context.historyManager.canUndo;
    }

    /** Whether a redo step is available (for UI disabled states) */
    get canRedo(): boolean {
        return this.context.historyManager.canRedo;
    }

    /**
     * Delete all selected shapes from the canvas.
     *
     * Skips locked shapes — they cannot be deleted. Moves deleted shapes
     * to the trash so they can be restored later. Pushes the change
     * to the undo stack and syncs via WebSocket.
     */
    deleteSelectedShape() {
        this.context.shapeManager.deleteSelectedShape();
    }

    /**
     * Get all shapes currently in the trash.
     * @returns Array of deleted shapes available for restore
     */
    getTrash(): Shape[] {
        return this.context.historyManager.getTrash();
    }

    /**
     * Restore a shape from the trash back to the canvas.
     * @param id - The shape ID to restore
     */
    restoreFromTrash(id: string) {
        this.context.historyManager.restoreFromTrash(id);
    }

    /**
     * Permanently remove all shapes from the trash.
     * This action cannot be undone.
     */
    emptyTrash() {
        this.context.historyManager.emptyTrash();
    }

    /**
     * Copy all selected shapes to the internal clipboard.
     *
     * Deep-clones each selected shape so subsequent edits to the originals
     * do not affect the clipboard contents.
     */
    /**
     * Duplicate selected shapes with a 20px offset.
     *
     * Unlike paste, this immediately commits the copies and selects them,
     * so the user can continue editing without a separate paste step.
     */
    duplicateSelected() {
        this.context.shapeManager.duplicateSelected();
    }

    /**
     * Set the arrowhead size for all selected arrow shapes.
     * @param size - Arrowhead size in pixels
     */
    setArrowHeadSize(size: number) {
        this.context.arrowManager.setArrowHeadSize(size);
    }

    /**
     * Assign a web URL to all selected shapes.
     * @param url - The web URL to attach, or empty string to clear
     */
    setShapeUrl(url: string) {
        this.context.shapeManager.setShapeUrl(url);
    }

    /**
     * Rename the selected frame shape.
     *
     * @param name - New name for the frame
     */
    setFrameName(name: string) {
        this.context.shapeManager.setFrameName(name);
    }

    /**
     * Enter image crop mode for the currently selected image.
     * Initializes the crop rectangle to the full image bounds.
     */
    startImageCrop() {
        this.context.imageManager.startImageCrop();
    }

    /**
     * Exit image crop mode without applying changes.
     */
    cancelImageCrop() {
        this.context.imageManager.cancelImageCrop();
    }

    /**
     * Apply the current crop rectangle to the selected image.
     * Re-encodes the cropped region as a new data URL and updates the shape.
     */
    applyImageCrop() {
        this.context.imageManager.applyImageCrop();
    }

    /**
     * Check whether the game is currently in image crop mode.
     */
    isInCropMode(): boolean {
        return this.context.imageManager.isInCropMode();
    }

    /**
     * Get the current crop rectangle (canvas coordinates) for rendering.
     */
    getCropRect(): { x: number; y: number; w: number; h: number } | null {
        return this.context.imageManager.getCropRect();
    }

    /**
     * Set local user info for collaboration cursors.
     */
    setLocalUser(id: string, name: string, color: string) {
        this.context.cursorManager.setLocalUser(id, name, color);
    }

    /** Register a callback fired whenever the room peer list changes. */
    setPresenceChangeCallback(cb: (() => void) | null) {
        this.context.cursorManager.setPresenceChangeCallback(cb);
    }

    /** Current room members (for the peers UI). */
    getPeers(): PresencePeer[] {
        return this.context.cursorManager.getPeers();
    }

    /**
     * Set the laser pointer position.
     */
    setLaserPosition(x: number, y: number) {
        this.context.laserManager.setLaserPosition(x, y);
    }

    /**
     * Hide the laser pointer.
     */
    clearLaser() {
        this.context.laserManager.clearLaser();
    }

    /**
     * Set the laser pointer color.
     */
    setLaserColor(color: string) {
        this.context.laserManager.setLaserColor(color);
    }

    /**
     * Set the laser pointer size.
     */
    setLaserSize(size: number) {
        this.context.laserManager.setLaserSize(size);
    }

    /**
     * Assign a shared group ID to all selected shapes (minimum 2).
     *
     * Grouped shapes are selected and moved together. The group ID is
     * a random UUID generated at group time.
     */
    group() {
        this.context.shapeManager.group();
    }

    /**
     * Remove the group ID from all selected shapes.
     *
     * After ungrouping, each shape can be selected and moved independently.
     */
    ungroup() {
        this.context.shapeManager.ungroup();
    }

    /**
     * Bring selected shapes forward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately above it
     * (higher index) in the shapes array. Shapes already at the top
     * remain unchanged.
     */
    bringForward() {
        this.context.shapeManager.bringForward();
    }

    /**
     * Send selected shapes backward by one step in the z-order.
     *
     * Swaps each selected shape with the shape immediately below it
     * (lower index) in the shapes array. Shapes already at the bottom
     * remain unchanged.
     */
    sendBackward() {
        this.context.shapeManager.sendBackward();
    }

    /**
     * Bring selected shapes to the front (top of z-order).
     *
     * Moves all selected shapes to the end of the shapes array,
     * so they are rendered last (on top of everything else).
     */
    bringToFront() {
        this.context.shapeManager.bringToFront();
    }

    /**
     * Send selected shapes to the back (bottom of z-order).
     *
     * Moves all selected shapes to the beginning of the shapes array,
     * so they are rendered first (behind everything else).
     */
    sendToBack() {
        this.context.shapeManager.sendToBack();
    }

    /**
     * Align selected shapes to the left edge of the leftmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its left edge matches the minimum left edge across all selections.
     */
    alignLeft() {
        this.context.shapeManager.alignLeft();
    }

    /**
     * Align selected shapes to the right edge of the rightmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its right edge matches the maximum right edge across all selections.
     */
    alignRight() {
        this.context.shapeManager.alignRight();
    }

    /**
     * Align selected shapes to the horizontal center of the selection.
     *
     * Requires at least 2 selected shapes. Each shape is moved horizontally
     * so its center aligns with the average center X of all selections.
     */
    alignCenter() {
        this.context.shapeManager.alignCenter();
    }

    /**
     * Evenly space selected shapes horizontally.
     *
     * Requires at least 3 selected shapes. Sorts by X position, then
     * redistributes the shapes so the gaps between them are equal.
     * The leftmost and rightmost shapes stay in place.
     */
    distributeHorizontal() {
        this.context.shapeManager.distributeHorizontal();
    }

    /**
     * Evenly space selected shapes vertically.
     *
     * Requires at least 3 selected shapes. Sorts by Y position, then
     * redistributes the shapes so the gaps between them are equal.
     * The topmost and bottommost shapes stay in place.
     */
    distributeVertical() {
        this.context.shapeManager.distributeVertical();
    }

    /**
     * Align selected shapes to the top edge of the topmost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its top edge matches the minimum top edge across all selections.
     */
    alignTop() {
        this.context.shapeManager.alignTop();
    }

    /**
     * Align selected shapes to the bottom edge of the bottommost shape.
     *
     * Requires at least 2 selected shapes. Each shape is moved vertically
     * so its bottom edge matches the maximum bottom edge across all selections.
     */
    alignBottom() {
        this.context.shapeManager.alignBottom();
    }

    /**
     * Zoom and pan the viewport to fit the current selection.
     *
     * Computes the union bounds of all selected shapes and fits them
     * with the same padding as {@link zoomToFit}. No-op when nothing
     * is selected.
     */
    zoomToSelection() {
        this.context.navigationManager.zoomToSelection();
    }

    /**
     * Copy all selected shapes to the internal clipboard.
     *
     * Deep-clones each selected shape so subsequent edits to the originals
     * do not affect the clipboard contents.
     */
    copySelectedShape() {
        this.context.clipboardManager.copySelectedShape();
    }

    /**
     * Paste clipboard contents with a 20px offset from originals.
     *
     * Deep-clones each clipboard shape, offsets it by 20px in both
     * directions, removes any group association, and commits it.
     */
    pasteClipboard() {
        this.context.clipboardManager.pasteClipboard();
    }

    /**
     * Cut selected shapes — copy to the clipboard, then delete them.
     * Bound to Ctrl/Cmd+X.
     */
    cutSelectedShape() {
        this.context.clipboardManager.copySelectedShape();
        this.deleteSelectedShape();
    }

    /**
     * Copy the style of the first selected shape for pasting onto others.
     * Bound to Ctrl/Cmd+Alt+C.
     */
    copySelectedStyles() {
        this.context.shapeManager.copySelectedStyles();
    }

    /**
     * Apply the previously copied style to all selected shapes.
     * Bound to Ctrl/Cmd+Alt+V.
     */
    pasteSelectedStyles() {
        this.context.shapeManager.pasteSelectedStyles();
    }

    /**
     * Flip all selected shapes horizontally or vertically in place.
     *
     * Shapes are mirrored around the center of their own bounding box
     * (point-based shapes mirror their points, box-based shapes mirror
     * their origin). Bound to Shift+H / Shift+V.
     *
     * @param horizontal - `true` to flip left-right, `false` top-bottom
     */
    flipSelectedShapes(horizontal: boolean) {
        this.context.shapeManager.flipSelectedShapes(horizontal);
    }

    /**
     * Cycle the active shape tool type (Tab / Shift+Tab).
     *
     * Cycles rectangle → diamond → ellipse; arrow and line toggle
     * between each other. Any other tool switches to rectangle.
     *
     * @param forward - `true` for Tab, `false` for Shift+Tab
     */
    toggleShapeType(forward: boolean) {
        if (this.context.selectedTool === "arrow") {
            this.setTool("line");
            return;
        }
        if (this.context.selectedTool === "line") {
            this.setTool("arrow");
            return;
        }
        const cycle = ["rect", "diamond", "circle"];
        const idx = cycle.indexOf(this.context.selectedTool as string);
        if (idx === -1) {
            this.setTool("rect");
            return;
        }
        this.setTool(cycle[(idx + (forward ? 1 : cycle.length - 1)) % cycle.length]);
    }

    /**
     * Open the file picker and insert an image centered on the viewport.
     * Bound to the `9` shortcut (Excalidraw parity).
     */
    insertImage() {
        this.context.imageManager.insertImage();
    }

    /**
     * Enter-key action: create text at the viewport center with the text
     * tool, or edit the selected text shape / arrow label in select mode.
     */
    enterEditAction() {
        runEnterEditAction(this.context, {
            startTextEdit: (x, y, text, index, style, onCommit) => this.startTextEdit(x, y, text, index, style, onCommit),
            syncShapes: () => this.syncShapes(),
            invalidateCache: () => this.invalidateCache(),
            clearCanvas: () => this.clearCanvas(),
            notifySelection: () => this.notifySelection(),
        });
    }

    /**
     * Toggle between dark and light theme (Alt+Shift+D).
     *
     * Mirrors the TopBar toggle: flips the document class, persists the
     * preference, and re-syncs the engine's style defaults.
     */
    toggleTheme() {
        this.context.styleManager.toggleTheme();
    }

    /**
     * Copy the current selection as a PNG image to the clipboard.
     * Bound to Shift+Alt+C.
     */
    async copySelectionAsPng() {
        const shapes = this.context.existingShapes.filter((s) => s.id && this.context.selectedIds.has(s.id));
        if (shapes.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
            const b = getShapeBounds(s);
            if (!b) continue;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        if (minX === Infinity) return;
        const pad = 20;
        const x = minX - pad, y = minY - pad;
        const w = maxX - minX + pad * 2;
        const h = maxY - minY + pad * 2;
        const offscreen = document.createElement("canvas");
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext("2d")!;
        ctx.fillStyle = pick(EXPORT_BG, this.context.isDark);
        ctx.fillRect(0, 0, w, h);
        ctx.translate(-x, -y);
        const rc = rough.canvas(offscreen);
        for (const shape of shapes) {
            renderShape(shape, ctx, rc, 1, this.context.isDark, this.imageCache);
        }
        try {
            const blob = await new Promise<Blob | null>((resolve) =>
                offscreen.toBlob(resolve, "image/png"),
            );
            if (!blob || typeof ClipboardItem === "undefined") return;
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch {
            // Clipboard may be unavailable (permissions/context); ignore.
        }
    }

    /**
     * Lock selected shapes so they cannot be moved or edited.
     *
     * Locked shapes are skipped by hit-testing, drag operations,
     * and deletion. They remain visible on the canvas.
     */
    lockShapes() {
        this.context.shapeManager.lockShapes();
    }

    /**
     * Unlock selected shapes so they can be moved and edited again.
     *
     * Removes the `locked` flag from each selected shape, making them
     * eligible for hit-testing, dragging, and deletion.
     */
    unlockShapes() {
        this.context.shapeManager.unlockShapes();
    }

    /**
     * Export the canvas as a PNG image download.
     *
     * Renders all shapes to an offscreen canvas at 1:1 scale and
     * triggers a browser download of the resulting PNG file.
     */
    exportToPng() {
        this.context.exportManager.exportToPng();
    }

    /**
     * Export the canvas as an SVG image download.
     *
     * Builds an SVG DOM from all shapes, serializes it, and triggers
     * a browser download of the resulting SVG file.
     */
    exportToSvg() {
        this.context.exportManager.exportToSvg();
    }

    /**
     * Export the canvas shapes as a JSON file download.
     *
     * Serializes the shape array as pretty-printed JSON and triggers
     * a browser download. The JSON can be re-imported via {@link importFromJson}.
     */
    exportToJson() {
        this.context.exportManager.exportToJson();
    }

    /**
     * Import shapes from a JSON string (file or clipboard).
     * Replaces all existing shapes with the imported ones.
     * @param jsonString - JSON string containing shapes
     */
    importFromJson(jsonString: string) {
        this.context.exportManager.importFromJson(jsonString);
    }

    // ─── Input handlers ────────────────────────────────────────────

    /**
     * Create an inline textarea for editing text shapes.
     * @param canvasX - X position in canvas coordinates
     * @param canvasY - Y position in canvas coordinates
     * @param existingText - Pre-filled text for editing, or undefined for new text
     * @param existingIndex - Index in the shapes array if editing, or undefined for new text
     * @param textStyle - Formatting options for new text shapes
     * @param onCommit - Called with the final text instead of the normal commit path (labels, names)
     */
    private startTextEdit(
        canvasX: number,
        canvasY: number,
        existingText?: string,
        existingIndex?: number,
        textStyle?: TextStyleOptions,
        onCommit?: (text: string) => void,
    ) {
        this.context.textManager.startTextEdit(canvasX, canvasY, existingText, existingIndex, textStyle, onCommit);
    }

    // ─── Touch handlers ────────────────────────────────────────────

    /**
     * Register touch event listeners on the canvas.
     *
     * Uses `{ passive: false }` on all touch events to allow
     * `preventDefault()` for pinch-zoom and draw gestures.
     */
    initTouchHandlers() {
        this.canvas.addEventListener("touchstart", this.context.touchManager.touchStartHandler, { passive: false });
        this.canvas.addEventListener("touchmove", this.context.touchManager.touchMoveHandler, { passive: false });
        this.canvas.addEventListener("touchend", this.context.touchManager.touchEndHandler, { passive: false });
        this.canvas.addEventListener("touchcancel", this.context.touchManager.touchEndHandler, { passive: false });
    }
}
