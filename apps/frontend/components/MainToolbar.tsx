/**
 * Main tool bar — compact horizontal strip floating at the top center.
 *
 * Answers "what am I doing?" — the primary drawing tools live here with
 * icons only (tooltips carry the label + keyboard shortcut). Secondary
 * tools, arrange actions, and the render-mode toggle sit behind a
 * "More" popover so the bar stays small.
 *
 * On small screens this bar is hidden; the {@link MobileToolDock} takes
 * over instead.
 */

"use client";

import { useState } from "react";
import {
    AlignLeft,
    AlignHorizontalJustifyCenter,
    AlignRight,
    ArrowLeftRight,
    ArrowUpDown,
    BringToFront,
    Lock,
    MoreHorizontal,
    SendToBack,
    Unlock,
    ArrowUp,
    ArrowDown,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";
import { PopoverPanel } from "./PopoverPanel";
import { SURFACE, Divider, SectionLabel, MenuRow, Kbd } from "./ui";
import { ChromeSlots } from "./chromeSlots";
import { CORE_TOOLS, MORE_TOOLS } from "./canvasTools";
import type { Game } from "@/draw/Game";

export function MainToolbar({
    selectedTool,
    handMode,
    isLocked,
    onSelectTool,
    onToggleHand,
    onToggleLock,
    game,
}: {
    selectedTool: string;
    handMode: boolean;
    isLocked: boolean;
    onSelectTool: (tool: string) => void;
    onToggleHand: () => void;
    onToggleLock: () => void;
    game: Game | undefined;
}) {
    const [moreOpen, setMoreOpen] = useState(false);

    const isActive = (tool: string) =>
        tool === "hand" ? handMode : selectedTool === tool;

    const handleTool = (tool: string) => {
        if (tool === "hand") {
            onToggleHand();
        } else {
            onSelectTool(tool);
        }
        setMoreOpen(false);
    };

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 hidden md:block">
            <div className={`flex items-center gap-1 px-3 py-2 ${SURFACE} shadow-[0_2px_8px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.15)] animate-panel-in`}>
                <Tooltip label={isLocked ? "Unlock canvas (Ctrl+L)" : "Lock canvas (Ctrl+L)"} side="bottom">
                    <IconButton
                        onClick={onToggleLock}
                        activated={isLocked}
                        icon={isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                        label={isLocked ? "Locked" : "Unlocked"}
                    />
                </Tooltip>
                {CORE_TOOLS.map((tool) => (
                    <Tooltip
                        key={tool.id}
                        label={
                            tool.shortcut
                                ? `${tool.label} (${tool.shortcut})`
                                : tool.label
                        }
                        side="bottom"
                    >
                        <IconButton
                            onClick={() => handleTool(tool.id)}
                            activated={isActive(tool.id)}
                            icon={tool.icon}
                            label={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                        />
                    </Tooltip>
                ))}

                <span className="w-px h-5 bg-border dark:bg-border-dark mx-1" />

                <Tooltip label="Bring forward (Ctrl+])" side="bottom">
                    <IconButton
                        onClick={() => game?.bringForward()}
                        activated={false}
                        icon={<ArrowUp size={16} />}
                        label="Bring forward"
                    />
                </Tooltip>
                <Tooltip label="Send backward (Ctrl+[)" side="bottom">
                    <IconButton
                        onClick={() => game?.sendBackward()}
                        activated={false}
                        icon={<ArrowDown size={16} />}
                        label="Send backward"
                    />
                </Tooltip>

                <span className="w-px h-5 bg-border dark:bg-border-dark mx-1" />

                <Tooltip label="Bring to front (Ctrl+Shift+])" side="bottom">
                    <IconButton
                        onClick={() => game?.bringToFront()}
                        activated={false}
                        icon={<BringToFront size={16} />}
                        label="Bring to front"
                    />
                </Tooltip>
                <Tooltip label="Send to back (Ctrl+Shift+[)" side="bottom">
                    <IconButton
                        onClick={() => game?.sendToBack()}
                        activated={false}
                        icon={<SendToBack size={16} />}
                        label="Send to back"
                    />
                </Tooltip>

                <span className="w-px h-5 bg-border dark:bg-border-dark mx-1" />

                <Tooltip label="More tools" side="bottom">
                    <IconButton
                        onClick={() => setMoreOpen((o) => !o)}
                        activated={moreOpen}
                        icon={<MoreHorizontal size={16} />}
                        label="More tools"
                    />
                </Tooltip>
            </div>

            {moreOpen && (
                <PopoverPanel
                    onClose={() => setMoreOpen(false)}
                    className="left-1/2 -translate-x-1/2 top-[calc(100%+0.5rem)] w-56 py-1 origin-top"
                >
                    <SectionLabel className="px-3 pt-2 pb-1 mb-0">shapes</SectionLabel>
                    {MORE_TOOLS.map((tool) => (
                        <MenuRow
                            key={tool.id}
                            icon={tool.icon}
                            onClick={() => handleTool(tool.id)}
                            active={isActive(tool.id)}
                            hint={tool.shortcut && <Kbd>{tool.shortcut}</Kbd>}
                            aria-pressed={isActive(tool.id)}
                        >
                            {tool.label}
                        </MenuRow>
                    ))}

                    <Divider />

                    <SectionLabel className="px-3 pt-2 pb-1 mb-0">arrange</SectionLabel>
                    <div className="flex flex-col px-2 gap-1">
                        {[
                            { label: "Align left (Ctrl+Shift+L)", icon: <AlignLeft size={14} />, action: () => game?.alignLeft() },
                            { label: "Align center (Ctrl+Shift+C)", icon: <AlignHorizontalJustifyCenter size={14} />, action: () => game?.alignCenter() },
                            { label: "Align right (Ctrl+Shift+R)", icon: <AlignRight size={14} />, action: () => game?.alignRight() },
                            { label: "Distribute horizontal (Ctrl+Shift+H)", icon: <ArrowLeftRight size={14} />, action: () => game?.distributeHorizontal() },
                            { label: "Distribute vertical (Ctrl+Shift+V)", icon: <ArrowUpDown size={14} />, action: () => game?.distributeVertical() },
                            {
                                label: isLocked ? "Unlock canvas (Ctrl+L)" : "Lock canvas (Ctrl+L)",
                                icon: isLocked ? <Lock size={14} /> : <Unlock size={14} />,
                                action: () => game?.toggleLock(),
                            },
                        ].map((item) => (
                            <Tooltip key={item.label} label={item.label} side="bottom">
                                <IconButton onClick={item.action} activated={false} icon={item.icon} label={item.label} />
                            </Tooltip>
                        ))}
                    </div>
                </PopoverPanel>
            )}
        </div>
    );
}
