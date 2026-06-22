import {
  useEffect,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

export type ResizeEdge = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

type FloatingPanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Interaction = "drag" | "resize" | null;
type BoundsSetter = Dispatch<SetStateAction<FloatingPanelBounds>>;
type InteractionSetter = Dispatch<SetStateAction<Interaction>>;

const PANEL_MIN_WIDTH = 560;
const PANEL_NARROW_WIDTH = 320;
const PANEL_MIN_HEIGHT = 340;
const PANEL_NARROW_HEIGHT = 280;
const PANEL_DEFAULT_X = 560;
const PANEL_DEFAULT_Y = 78;
const PANEL_DEFAULT_WIDTH = 860;
const PANEL_DEFAULT_HEIGHT = 600;
const PANEL_MAX_HEIGHT = 680;
const PANEL_MARGIN = 14;
const PANEL_TOP_GUARD = 64;
const PANEL_RIGHT_OFFSET = 24;
const PANEL_TOP_OFFSET = 14;

export const RESIZE_EDGES: ResizeEdge[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

export function useFramePanel(open: boolean) {
  const [bounds, setBounds] = useState(createFramePanelBounds);
  const [interaction, setInteraction] = useState<Interaction>(null);
  useEffect(() => {
    if (open) setBounds((current) => clampFramePanelBounds(current));
  }, [open]);
  useEffect(() => {
    const handleResize = () => setBounds((current) => clampFramePanelBounds(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return {
    bounds,
    interaction,
    startDrag: (event: ReactPointerEvent<HTMLElement>) => beginPanelDrag({ event, bounds, setBounds, setInteraction }),
    startResize: (edge: ResizeEdge, event: ReactPointerEvent<HTMLElement>) => beginPanelResize({ edge, event, bounds, setBounds, setInteraction }),
  };
}

export function frameDrawerClass(open: boolean, interaction: Interaction) {
  return `global-frame-drawer global-frame-float ${open ? "open" : ""} ${interaction ? `is-${interaction}` : ""}`;
}

export function panelStyle(bounds: FloatingPanelBounds) {
  return {
    "--frame-panel-x": `${bounds.x}px`,
    "--frame-panel-y": `${bounds.y}px`,
    "--frame-panel-width": `${bounds.width}px`,
    "--frame-panel-height": `${bounds.height}px`,
  } as CSSProperties;
}

function beginPanelDrag(input: {
  event: ReactPointerEvent<HTMLElement>;
  bounds: FloatingPanelBounds;
  setBounds: BoundsSetter;
  setInteraction: InteractionSetter;
}) {
  if (shouldIgnorePanelDrag(input.event)) return;
  const start = { x: input.event.clientX, y: input.event.clientY, bounds: input.bounds };
  input.event.preventDefault();
  input.setInteraction("drag");
  const handleMove = (event: PointerEvent) => input.setBounds(clampFramePanelBounds({
    ...start.bounds,
    x: start.bounds.x + event.clientX - start.x,
    y: start.bounds.y + event.clientY - start.y,
  }));
  const handleEnd = () => endPointerInteraction(handleMove, handleEnd, input.setInteraction);
  bindPointerInteraction(handleMove, handleEnd);
}

function beginPanelResize(input: {
  edge: ResizeEdge;
  event: ReactPointerEvent<HTMLElement>;
  bounds: FloatingPanelBounds;
  setBounds: BoundsSetter;
  setInteraction: InteractionSetter;
}) {
  if (input.event.button !== 0) return;
  const start = { x: input.event.clientX, y: input.event.clientY, bounds: input.bounds };
  input.event.preventDefault();
  input.event.stopPropagation();
  input.setInteraction("resize");
  const handleMove = (event: PointerEvent) => input.setBounds(resizeFramePanelBounds(start.bounds, input.edge, event.clientX - start.x, event.clientY - start.y));
  const handleEnd = () => endPointerInteraction(handleMove, handleEnd, input.setInteraction);
  bindPointerInteraction(handleMove, handleEnd);
}

function createFramePanelBounds(): FloatingPanelBounds {
  if (typeof window === "undefined") return { x: PANEL_DEFAULT_X, y: PANEL_DEFAULT_Y, width: PANEL_DEFAULT_WIDTH, height: PANEL_DEFAULT_HEIGHT };
  const width = Math.min(PANEL_DEFAULT_WIDTH, availablePanelWidth());
  const height = Math.min(PANEL_MAX_HEIGHT, availablePanelHeight());
  return clampFramePanelBounds({
    x: window.innerWidth - width - PANEL_RIGHT_OFFSET,
    y: PANEL_TOP_GUARD + PANEL_TOP_OFFSET,
    width,
    height,
  });
}

function clampFramePanelBounds(bounds: FloatingPanelBounds): FloatingPanelBounds {
  if (typeof window === "undefined") return bounds;
  const maxWidth = availablePanelWidth();
  const maxHeight = availablePanelHeight();
  const width = Math.min(Math.max(bounds.width, Math.min(PANEL_MIN_WIDTH, maxWidth)), maxWidth);
  const height = Math.min(Math.max(bounds.height, Math.min(PANEL_MIN_HEIGHT, maxHeight)), maxHeight);
  return {
    width,
    height,
    x: clampValue(bounds.x, PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN),
    y: clampValue(bounds.y, PANEL_TOP_GUARD, window.innerHeight - height - PANEL_MARGIN),
  };
}

function resizeFramePanelBounds(bounds: FloatingPanelBounds, edge: ResizeEdge, deltaX: number, deltaY: number) {
  if (typeof window === "undefined") return bounds;
  const horizontal = resizeHorizontalBounds(bounds, edge, deltaX);
  const vertical = resizeVerticalBounds(bounds, edge, deltaY);
  return { x: horizontal.left, y: vertical.top, width: horizontal.right - horizontal.left, height: vertical.bottom - vertical.top };
}

function resizeHorizontalBounds(bounds: FloatingPanelBounds, edge: ResizeEdge, deltaX: number) {
  const right = bounds.x + bounds.width;
  const nextRight = edge.includes("e") ? clampValue(right + deltaX, bounds.x + PANEL_MIN_WIDTH, window.innerWidth - PANEL_MARGIN) : right;
  const nextLeft = edge.includes("w") ? clampValue(bounds.x + deltaX, PANEL_MARGIN, nextRight - PANEL_MIN_WIDTH) : bounds.x;
  return { left: nextLeft, right: nextRight };
}

function resizeVerticalBounds(bounds: FloatingPanelBounds, edge: ResizeEdge, deltaY: number) {
  const bottom = bounds.y + bounds.height;
  const nextBottom = edge.includes("s") ? clampValue(bottom + deltaY, bounds.y + PANEL_MIN_HEIGHT, window.innerHeight - PANEL_MARGIN) : bottom;
  const nextTop = edge.includes("n") ? clampValue(bounds.y + deltaY, PANEL_TOP_GUARD, nextBottom - PANEL_MIN_HEIGHT) : bounds.y;
  return { top: nextTop, bottom: nextBottom };
}

function availablePanelWidth() {
  return Math.max(PANEL_NARROW_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
}

function availablePanelHeight() {
  return Math.max(PANEL_NARROW_HEIGHT, window.innerHeight - PANEL_TOP_GUARD - PANEL_MARGIN * 2);
}

function shouldIgnorePanelDrag(event: ReactPointerEvent<HTMLElement>) {
  return event.button !== 0 || (event.target instanceof HTMLElement && Boolean(event.target.closest("button, input")));
}

function bindPointerInteraction(move: (event: PointerEvent) => void, end: () => void) {
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function endPointerInteraction(move: (event: PointerEvent) => void, end: () => void, setInteraction: InteractionSetter) {
  setInteraction(null);
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", end);
  window.removeEventListener("pointercancel", end);
}

function clampValue(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
