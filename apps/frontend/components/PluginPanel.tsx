/**
 * Plugin panel for managing loaded plugins and custom tools.
 *
 * Features:
 * - View loaded plugins
 * - Load/unload plugins
 * - Activate plugin tools
 */

import { useState, useRef } from "react";
import { Game } from "@/draw/Game";
import { Plugin, CustomToolDefinition } from "@/draw/pluginSystem";
import { X, Upload, Download, AlertCircle } from "lucide-react";
import { PANEL, Button, Input, SectionLabel, useEscapeToClose } from "./ui";
import { STICKY_NOTES, CURSOR_PALETTE } from "@/draw/colorSystem";

/**
 * PluginPanel — floating panel for managing plugins.
 *
 * @param game - The Game engine instance
 * @param open - Whether the panel is visible
 * @param onClose - Callback to close the panel
 */
export function PluginPanel({
    game,
    open,
    onClose,
}: {
    game: Game | undefined;
    open: boolean;
    onClose: () => void;
}) {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [pluginName, setPluginName] = useState("");
    const [pluginCode, setPluginCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const refresh = () => setPlugins(game?.getLoadedPlugins() ?? []);

    useEscapeToClose(onClose, open);

    if (!open) return null;

    const handleLoadPlugin = () => {
        if (!pluginName.trim() || !pluginCode.trim()) {
            setError("Plugin name and code are required");
            return;
        }
        try {
            const plugin = createPluginFromCode(pluginName.trim(), pluginCode.trim());
            if (game?.loadPlugin(plugin)) {
                setPluginName("");
                setPluginCode("");
                setError(null);
                refresh();
            } else {
                setError("Failed to load plugin (may already be loaded)");
            }
        } catch (e) {
            setError(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
        }
    };

    const handleUnloadPlugin = (pluginId: string) => {
        game?.unloadPlugin(pluginId);
        refresh();
    };

    const handleActivateTool = (toolId: string) => {
        game?.setTool(toolId);
    };

    const handleImportPlugin = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = reader.result as string;
                const plugin = JSON.parse(json) as Plugin;
                if (game?.loadPlugin(plugin)) {
                    refresh();
                } else {
                    setError("Failed to load plugin");
                }
            } catch (err) {
                setError(`Invalid plugin file: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handleExportPlugin = (plugin: Plugin) => {
        const json = JSON.stringify(plugin, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${plugin.name.replace(/\s+/g, "_").toLowerCase()}.plugin.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div role="dialog" aria-labelledby="plugins-title" className={`fixed right-4 top-14 w-80 ${PANEL} p-4 text-foreground dark:text-foreground-dark select-none z-50 max-h-[80vh] overflow-y-auto origin-top-right animate-edge-in-right motion-reduce:animate-none`}>
            <div className="flex items-center justify-between mb-3">
                <SectionLabel id="plugins-title" className="mb-0">Plugins</SectionLabel>
                <button
                    onClick={onClose}
                    aria-label="Close plugins"
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground dark:text-muted-foreground-dark transition-[color,background-color] duration-fast cursor-pointer active:bg-active dark:active:bg-active-dark hover:text-foreground dark:hover:text-foreground-dark hover:bg-hover dark:hover:bg-hover-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Load plugin from code */}
            <div className="mb-3">
                <SectionLabel>Load from code</SectionLabel>
                <Input
                    autoFocus
                    aria-label="Plugin name"
                    value={pluginName}
                    onChange={setPluginName}
                    placeholder="Plugin name..."
                    className="mb-1"
                />
                <textarea
                    aria-label="Plugin code"
                    value={pluginCode}
                    onChange={e => setPluginCode(e.target.value)}
                    placeholder={`{\n  "id": "my-plugin",\n  "name": "My Plugin",\n  "version": "1.0.0",\n  "tools": [...]\n}`}
                    className="w-full h-24 bg-muted dark:bg-muted-dark border border-border dark:border-border-dark rounded-md px-2 py-1 text-xs text-foreground dark:text-foreground-dark placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-dark font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    spellCheck={false}
                />
                <Button
                    variant="primary"
                    onClick={handleLoadPlugin}
                    disabled={!pluginName.trim() || !pluginCode.trim()}
                    className="w-full mt-1.5"
                >
                    Load Plugin
                </Button>
            </div>

            {/* Import */}
            <div className="flex gap-1.5 mb-3">
                <Button onClick={() => fileInputRef.current?.click()} className="flex-1">
                    <Upload size={13} />
                    Import JSON
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportPlugin}
                    className="hidden"
                />
            </div>

            {error && (
                <div className="flex items-center gap-1.5 mb-3 text-xs text-danger dark:text-danger-dark">
                    <AlertCircle size={13} className="shrink-0" />
                    {error}
                </div>
            )}

            {/* Plugin list */}
            <div className="space-y-2">
                {plugins.length === 0 && (
                    <div className="text-xs text-muted-foreground dark:text-muted-foreground-dark text-center py-2">No plugins loaded</div>
                )}
                {plugins.map(plugin => (
                    <div key={plugin.id} className="bg-muted dark:bg-muted-dark border border-border-subtle dark:border-border-subtle-dark rounded-md p-2">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-medium">{plugin.name}</div>
                            <div className="text-10 text-muted-foreground dark:text-muted-foreground-dark">v{plugin.version}</div>
                        </div>
                        <div className="text-10 text-muted-foreground dark:text-muted-foreground-dark mb-2">{plugin.id}</div>

                        {/* Plugin tools */}
                        {plugin.tools && plugin.tools.length > 0 && (
                            <div className="mb-2">
                                <div className="text-10 text-muted-foreground dark:text-muted-foreground-dark mb-1">Tools:</div>
                                <div className="flex flex-wrap gap-1">
                                    {plugin.tools.map(tool => (
                                        <button
                                            key={tool.id}
                                            onClick={() => handleActivateTool(tool.id)}
                                            aria-pressed={game?.selectedTool === tool.id}
                                            className={`px-2 py-0.5 rounded-md text-10 font-medium cursor-pointer transition-[color,background-color] duration-fast active:bg-active dark:active:bg-active-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none ${
                                                game?.selectedTool === tool.id
                                                    ? "bg-selected dark:bg-selected-dark text-highlight dark:text-highlight-dark"
                                                    : "bg-primary/20 hover:bg-primary/40 text-primary dark:text-highlight-dark dark:hover:bg-primary/30"
                                            }`}
                                            title={tool.name}
                                        >
                                            {tool.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-1">
                            <Button onClick={() => handleExportPlugin(plugin)} className="flex-1 h-6 text-10">
                                <Download size={11} />
                                Export
                            </Button>
                            <Button variant="danger" onClick={() => handleUnloadPlugin(plugin.id)} className="flex-1 h-6 text-10">
                                Unload
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Demo plugins */}
            <div className="mt-3 pt-3 border-t border-border-subtle dark:border-border-subtle-dark">
                <SectionLabel>Demo plugins</SectionLabel>
                <div className="space-y-1">
                    <Button
                        onClick={() => {
                            const plugin = createSprayPaintPlugin();
                            game?.loadPlugin(plugin);
                            refresh();
                        }}
                        className="w-full justify-start"
                    >
                        🎨 Spray Paint
                    </Button>
                    <Button
                        onClick={() => {
                            const plugin = createStickyNotePlugin();
                            game?.loadPlugin(plugin);
                            refresh();
                        }}
                        className="w-full justify-start"
                    >
                        📝 Sticky Note Generator
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * Create a plugin object from inline code (JSON string).
 */
function createPluginFromCode(name: string, code: string): Plugin {
    try {
        const parsed = JSON.parse(code);
        return {
            id: parsed.id || `plugin-${Date.now()}`,
            name: parsed.name || name,
            version: parsed.version || "1.0.0",
            tools: parsed.tools || [],
            onActivate: parsed.onActivate,
            onDeactivate: parsed.onDeactivate,
        };
    } catch {
        throw new Error("Invalid JSON");
    }
}

/**
 * Demo plugin: Spray paint tool that creates random colored dots.
 */
function createSprayPaintPlugin(): Plugin {
    const tool: CustomToolDefinition = {
        id: "sprayPaint",
        name: "Spray Paint",
        cursor: "crosshair",
        onMouseDown: (ctx, x, y) => {
            const game = ctx.game;
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 30;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                const colors = [...CURSOR_PALETTE.slice(0, 8)];
                const color = colors[Math.floor(Math.random() * colors.length)]!;
                game.commitShape({
                    type: "rect",
                    x: px,
                    y: py,
                    width: 2,
                    height: 2,
                    style: { ...game.currentStyle, strokeColor: color, backgroundColor: color },
                });
            }
        },
        onMouseMove: (ctx, x, y) => {
            const tool = ctx.game.getPluginTools().find(t => t.id === "sprayPaint");
            tool?.onMouseDown?.(ctx, x, y, new MouseEvent("mousemove"));
        },
    };

    return {
        id: "spray-paint-plugin",
        name: "Spray Paint",
        version: "1.0.0",
        tools: [tool],
    };
}

/**
 * Demo plugin: Sticky note generator that creates random colored sticky notes.
 */
function createStickyNotePlugin(): Plugin {
    const tool: CustomToolDefinition = {
        id: "stickyGenerator",
        name: "Sticky Generator",
        cursor: "crosshair",
        onMouseDown: (ctx, x, y) => {
            const game = ctx.game;
            const notes = ["TODO", "FIXME", "NOTE", "IDEA", "REVIEW"];
            const colors = [...STICKY_NOTES];
            const note = notes[Math.floor(Math.random() * notes.length)]!;
            const color = colors[Math.floor(Math.random() * colors.length)]!;
            game.commitShape({
                type: "stickyNote",
                x,
                y,
                width: 120,
                height: 120,
                noteColor: color,
                text: note,
            });
        },
    };

    return {
        id: "sticky-generator-plugin",
        name: "Sticky Note Generator",
        version: "1.0.0",
        tools: [tool],
    };
}