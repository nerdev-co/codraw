/**
 * Mermaid parser — converts basic Mermaid flowchart syntax to shapes.
 *
 * Supported syntax:
 * - `A[label]` — rectangular node
 * - `A(label)` — rounded rectangle node
 * - `A{label}` — diamond node
 * - `A([label])` — stadium/oval node
 * - `A --> B` — arrow connection
 * - `A --- B` — line connection
 * - `A -->|text| B` — labeled arrow
 * - `A ---|text| B` — labeled line
 * - `subgraph name ... end` — subgraph grouping
 *
 * @module mermaid
 */

import { Shape, Point } from "@repo/shapes";

interface MermaidNode {
    id: string;
    label: string;
    shape: "rect" | "rounded" | "diamond" | "stadium";
    x: number;
    y: number;
}

interface MermaidEdge {
    from: string;
    to: string;
    label?: string;
    type: "arrow" | "line";
}

interface MermaidGraph {
    nodes: MermaidNode[];
    edges: MermaidEdge[];
    direction: "TD" | "LR" | "RL" | "BT";
}

/**
 * Parse the node definition (and optional inline shape) that follows a node
 * id, returning the parsed shape, label, and the remaining text.
 */
function parseNodeDef(
    id: string,
    rest: string,
): { shape: MermaidNode["shape"]; label: string; rest: string } {
    let shape: MermaidNode["shape"] = "rect";
    let label = id;
    let m: RegExpMatchArray | null;

    if ((m = rest.match(/^\(([^()]*)\)/))) {
        const inner = m[1]!;
        if (inner.startsWith("[") && inner.endsWith("]")) {
            shape = "stadium";
            label = inner.slice(1, -1);
        } else {
            shape = "rounded";
            label = inner;
        }
        rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^\[\[([^\]]*)\]\]/))) {
        shape = "stadium";
        label = m[1]!;
        rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^\[([^\]]*)\]/))) {
        shape = "rect";
        label = m[1]!;
        rest = rest.slice(m[0].length);
    } else if ((m = rest.match(/^\{([^}]*)\}/))) {
        shape = "diamond";
        label = m[1]!;
        rest = rest.slice(m[0].length);
    }

    return { shape, label, rest };
}

/**
 * Parse a Mermaid flowchart string into a graph structure.
 *
 * Handles node definitions and edges both as separate lines and combined
 * inline, e.g. `A[Start] --> B{Decision}`.
 */
export function parseMermaid(text: string): MermaidGraph {
    const nodes: MermaidNode[] = [];
    const edges: MermaidEdge[] = [];
    const nodeMap = new Map<string, MermaidNode>();
    let direction: MermaidGraph["direction"] = "TD";

    const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("%%"));

    for (const line of lines) {
        // Skip subgraph/end lines
        if (line.startsWith("subgraph") || line === "end") continue;

        // graph direction header
        const header = line.match(/^(?:graph|flowchart)\s+(TD|LR|RL|BT)\b/i);
        if (header) {
            direction = header[1]!.toUpperCase() as MermaidGraph["direction"];
            continue;
        }

        const nodeMatch = line.match(/^([A-Za-z0-9_]+)/);
        if (!nodeMatch) continue;
        const id = nodeMatch[1]!;
        let rest = line.slice(nodeMatch[0].length).trim();

        const def = parseNodeDef(id, rest);
        rest = def.rest.trim();
        if (!nodeMap.has(id)) {
            const node: MermaidNode = { id, label: def.label, shape: def.shape, x: 0, y: 0 };
            nodeMap.set(id, node);
            nodes.push(node);
        }

        // Edge on the same line: A --> B, A --- B, A -->|label| B, ...
        const edge = rest.match(/^(-->|---)\s*(?:\|([^|]*)\|\s*)?([A-Za-z0-9_]+)/);
        if (edge) {
            const [, type, label, to] = edge;
            edges.push({
                from: id,
                to: to!,
                label: label || undefined,
                type: type === "-->" ? "arrow" : "line",
            });

            // The target may carry an inline shape definition
            const targetDef = parseNodeDef(to!, rest.slice(edge[0]!.length).trim());
            if (!nodeMap.has(to!)) {
                const node: MermaidNode = { id: to!, label: targetDef.label, shape: targetDef.shape, x: 0, y: 0 };
                nodeMap.set(to!, node);
                nodes.push(node);
            }
        }
    }

    // Layout nodes in a grid following the graph direction
    layoutNodes(nodes, edges, direction);

    return { nodes, edges, direction };
}

/**
 * Simple layout: arrange nodes on a grid following the graph direction
 * (LR/RL spread horizontally, TD/BT vertically).
 */
function layoutNodes(nodes: MermaidNode[], edges: MermaidEdge[], direction: MermaidGraph["direction"]) {
    const nodeWidth = 160;
    const nodeHeight = 60;
    const gapX = 80;
    const gapY = 80;
    const startX = 100;
    const startY = 100;

    // Build adjacency for topological ordering
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const n of nodes) {
        adj.set(n.id, []);
        inDegree.set(n.id, 0);
    }
    for (const e of edges) {
        adj.get(e.from)?.push(e.to);
        inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    }

    // Topological sort (BFS)
    const queue: string[] = [];
    const levels = new Map<string, number>();
    for (const n of nodes) {
        if ((inDegree.get(n.id) || 0) === 0) {
            queue.push(n.id);
            levels.set(n.id, 0);
        }
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLevel = levels.get(curr) || 0;
        for (const next of adj.get(curr) || []) {
            const nextLevel = Math.max(levels.get(next) || 0, currLevel + 1);
            levels.set(next, nextLevel);
            inDegree.set(next, (inDegree.get(next) || 0) - 1);
            if ((inDegree.get(next) || 0) === 0) {
                queue.push(next);
            }
        }
    }

    let maxLevel = 0;
    for (const level of levels.values()) maxLevel = Math.max(maxLevel, level);

    const horizontal = direction === "LR" || direction === "RL";

    // Assign positions based on levels
    const levelCounts = new Map<number, number>();
    for (const [id, level] of levels) {
        levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
    }

    const levelIndices = new Map<number, number>();
    for (const node of nodes) {
        const level = levels.get(node.id) || 0;
        const lv = direction === "RL" || direction === "BT" ? maxLevel - level : level;
        const idx = levelIndices.get(lv) || 0;
        const count = levelCounts.get(lv) || 1;

        if (horizontal) {
            node.x = startX + lv * (nodeWidth + gapX);
            node.y = startY + idx * (nodeHeight + gapY) - ((count - 1) * (nodeHeight + gapY)) / 2;
        } else {
            node.y = startY + lv * (nodeHeight + gapY);
            node.x = startX + idx * (nodeWidth + gapX) - ((count - 1) * (nodeWidth + gapX)) / 2;
        }

        levelIndices.set(lv, idx + 1);
    }
}

/**
 * Convert a parsed Mermaid graph to canvas shapes.
 */
export function mermaidToShapes(graph: MermaidGraph, nodeWidth = 160, nodeHeight = 60): Shape[] {
    const shapes: Shape[] = [];
    const nodePositions = new Map<string, { x: number; y: number }>();

    // Create shape for each node
    for (const node of graph.nodes) {
        const x = node.x;
        const y = node.y;

        if (node.shape === "diamond") {
            shapes.push({
                type: "diamond",
                centerX: x + nodeWidth / 2,
                centerY: y + nodeHeight / 2,
                width: nodeWidth,
                height: nodeHeight,
            });
        } else if (node.shape === "rounded") {
            // Use rect with rounded appearance via style
            shapes.push({
                type: "rect",
                x,
                y,
                width: nodeWidth,
                height: nodeHeight,
            });
        } else {
            shapes.push({
                type: "rect",
                x,
                y,
                width: nodeWidth,
                height: nodeHeight,
            });
        }

        // Add text label
        shapes.push({
            type: "text",
            x: x + nodeWidth / 2,
            y: y + nodeHeight / 2 + 5,
            text: node.label,
            fontSize: 14,
        });

        nodePositions.set(node.id, { x, y });
    }

    // Create arrows/lines for edges
    for (const edge of graph.edges) {
        const from = nodePositions.get(edge.from);
        const to = nodePositions.get(edge.to);
        if (!from || !to) continue;

        const fromCenter = { x: from.x + nodeWidth / 2, y: from.y + nodeHeight / 2 };
        const toCenter = { x: to.x + nodeWidth / 2, y: to.y + nodeHeight / 2 };

        // Calculate edge points (connect from edge of shape to edge of shape)
        const angle = Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x);
        const startX = fromCenter.x + Math.cos(angle) * (nodeWidth / 2);
        const startY = fromCenter.y + Math.sin(angle) * (nodeHeight / 2);
        const endX = toCenter.x - Math.cos(angle) * (nodeWidth / 2);
        const endY = toCenter.y - Math.sin(angle) * (nodeHeight / 2);

        if (edge.type === "arrow") {
            shapes.push({
                type: "arrow",
                startX,
                startY,
                endX,
                endY,
                arrowHeadSize: 10,
                label: edge.label,
            });
        } else {
            shapes.push({
                type: "line",
                startX,
                startY,
                endX,
                endY,
            });
        }
    }

    return shapes;
}

/**
 * Parse Mermaid text and generate canvas shapes.
 */
export function generateFromMermaid(text: string): Shape[] {
    const graph = parseMermaid(text);
    return mermaidToShapes(graph);
}
