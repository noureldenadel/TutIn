import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { courses, type Course } from "@/lib/courses";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RoadmapNode {
  id: string;
  courseId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoadmapConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface Roadmap {
  id: string;
  title: string;
  nodes: RoadmapNode[];
  connections: RoadmapConnection[];
  pan: { x: number; y: number };
  zoom: number;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_ROADMAP: Roadmap = {
  id: "roadmap_product_architecture",
  title: "Product Design & Architecture",
  pan: { x: 50, y: 40 },
  zoom: 0.9,
  nodes: [
    { id: "node_1", courseId: 1, x: 50, y: 70, width: 280, height: 250 },
    { id: "node_5", courseId: 5, x: 420, y: 70, width: 280, height: 250 },
    { id: "node_17", courseId: 17, x: 790, y: 70, width: 280, height: 250 },
    { id: "node_10", courseId: 10, x: 790, y: 380, width: 280, height: 250 },
  ],
  connections: [
    { id: "conn_1_5", fromNodeId: "node_1", toNodeId: "node_5" },
    { id: "conn_5_17", fromNodeId: "node_5", toNodeId: "node_17" },
    { id: "conn_17_10", fromNodeId: "node_17", toNodeId: "node_10" },
  ],
};

const STORAGE_KEY = "tutin_roadmaps_v2";
const LAST_ROADMAP_KEY = "tutin_last_roadmap_id_v2";

const generateId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function getNodeEdgePoint(fromNode: RoadmapNode, toNode: RoadmapNode) {
  const fromCenter = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 };
  const toCenter = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 };

  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const angle = Math.atan2(dy, dx);

  const getEdge = (node: RoadmapNode, isSource: boolean) => {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const hw = node.width / 2;
    const hh = node.height / 2;
    const a = isSource ? angle : angle + Math.PI;

    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const tanA = Math.tan(a);

    let px: number;
    let py: number;

    if (Math.abs(cosA) * hh > Math.abs(sinA) * hw) {
      px = cosA > 0 ? cx + hw : cx - hw;
      py = cy + (px - cx) * tanA;
    } else {
      py = sinA > 0 ? cy + hh : cy - hh;
      px = cx + (py - cy) / tanA;
    }

    return { x: px, y: py };
  };

  return {
    from: getEdge(fromNode, true),
    to: getEdge(toNode, false),
  };
}

function getBezierControlPoints(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const offset = Math.min(distance * 0.45, 130);

  const isHorizontal = Math.abs(dx) > Math.abs(dy);
  if (isHorizontal) {
    return {
      cp1: { x: from.x + (dx > 0 ? offset : -offset), y: from.y },
      cp2: { x: to.x - (dx > 0 ? offset : -offset), y: to.y },
    };
  }
  return {
    cp1: { x: from.x, y: from.y + (dy > 0 ? offset : -offset) },
    cp2: { x: to.x, y: to.y - (dy > 0 ? offset : -offset) },
  };
}

export function RoadmapPage() {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [courseQuery, setCourseQuery] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Dragging & canvas panning
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize and load saved roadmaps
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Roadmap[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRoadmaps(parsed);
          const lastId = window.localStorage.getItem(LAST_ROADMAP_KEY);
          const active = parsed.find((r) => r.id === lastId) || parsed[0];
          if (active) {
            setCurrentId(active.id);
            return;
          }
        }
      }
    } catch {
      // Fallback to default
    }
    setRoadmaps([DEFAULT_ROADMAP]);
    setCurrentId(DEFAULT_ROADMAP.id);
  }, []);

  const currentRoadmap = useMemo(
    () => roadmaps.find((r) => r.id === currentId) || roadmaps[0] || null,
    [roadmaps, currentId]
  );

  const saveRoadmaps = useCallback((updated: Roadmap[]) => {
    setRoadmaps(updated);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }, []);

  const updateCurrentRoadmap = useCallback(
    (updater: (prev: Roadmap) => Roadmap) => {
      if (!currentRoadmap) return;
      const next = updater(currentRoadmap);
      const nextList = roadmaps.map((r) => (r.id === next.id ? next : r));
      saveRoadmaps(nextList);
    },
    [currentRoadmap, roadmaps, saveRoadmaps]
  );

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const startEditingTitle = useCallback(() => {
    if (!currentRoadmap) return;
    setTitleDraft(currentRoadmap.title);
    setIsEditingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 20);
  }, [currentRoadmap]);

  const saveTitleEdit = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed && currentRoadmap && trimmed !== currentRoadmap.title) {
      updateCurrentRoadmap((prev) => ({
        ...prev,
        title: trimmed,
        updatedAt: new Date().toISOString(),
      }));
    }
    setIsEditingTitle(false);
  }, [titleDraft, currentRoadmap, updateCurrentRoadmap]);

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  const handleSelectRoadmap = (id: string) => {
    setCurrentId(id);
    setConnectingFrom(null);
    setSelectedNodeId(null);
    try {
      window.localStorage.setItem(LAST_ROADMAP_KEY, id);
    } catch {
      // ignore
    }
  };

  const handleCreateRoadmap = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const newRoadmap: Roadmap = {
      id: generateId("roadmap"),
      title: trimmed,
      nodes: [],
      connections: [],
      pan: { x: 40, y: 40 },
      zoom: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextList = [...roadmaps, newRoadmap];
    saveRoadmaps(nextList);
    handleSelectRoadmap(newRoadmap.id);
    setNewTitle("");
    setCreateModalOpen(false);
  };

  const handleDeleteRoadmap = (id: string) => {
    if (roadmaps.length <= 1) return;
    const nextList = roadmaps.filter((r) => r.id !== id);
    saveRoadmaps(nextList);
    if (currentId === id && nextList[0]) {
      handleSelectRoadmap(nextList[0].id);
    }
  };

  // Add course to canvas
  const handleAddCourse = (course: Course) => {
    if (!currentRoadmap) return;
    const isAlreadyOnCanvas = currentRoadmap.nodes.some((n) => n.courseId === course.id);
    if (isAlreadyOnCanvas) return;

    const container = containerRef.current;
    const rect = container?.getBoundingClientRect() || { width: 900, height: 600 };

    const centerX = (rect.width / 2 - currentRoadmap.pan.x) / currentRoadmap.zoom;
    const centerY = (rect.height / 2 - currentRoadmap.pan.y) / currentRoadmap.zoom;
    const offset = (currentRoadmap.nodes.length % 5) * 30;

    const newNode: RoadmapNode = {
      id: generateId("node"),
      courseId: course.id,
      x: Math.max(20, Math.round(centerX - 140 + offset)),
      y: Math.max(20, Math.round(centerY - 120 + offset)),
      width: 280,
      height: 250,
    };

    updateCurrentRoadmap((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));
  };

  const handleRemoveNode = (nodeId: string) => {
    updateCurrentRoadmap((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      connections: prev.connections.filter(
        (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
      ),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (connectingFrom === nodeId) setConnectingFrom(null);
  };

  // Connect two nodes
  const handleConnectClick = (nodeId: string) => {
    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
      return;
    }
    if (connectingFrom) {
      if (connectingFrom !== nodeId) {
        const exists = currentRoadmap?.connections.some(
          (c) => c.fromNodeId === connectingFrom && c.toNodeId === nodeId
        );
        if (!exists) {
          const newConn: RoadmapConnection = {
            id: generateId("conn"),
            fromNodeId: connectingFrom,
            toNodeId: nodeId,
          };
          updateCurrentRoadmap((prev) => ({
            ...prev,
            connections: [...prev.connections, newConn],
          }));
        }
      }
      setConnectingFrom(null);
    } else {
      setConnectingFrom(nodeId);
    }
  };

  const handleRemoveConnection = (connId: string) => {
    updateCurrentRoadmap((prev) => ({
      ...prev,
      connections: prev.connections.filter((c) => c.id !== connId),
    }));
  };

  // Zoom controls
  const handleZoom = (delta: number) => {
    updateCurrentRoadmap((prev) => ({
      ...prev,
      zoom: Math.min(2.0, Math.max(0.35, Math.round((prev.zoom + delta) * 100) / 100)),
    }));
  };

  const handleResetView = () => {
    updateCurrentRoadmap((prev) => ({
      ...prev,
      zoom: 1,
      pan: { x: 40, y: 40 },
    }));
  };

  // Dragging logic
  const handleNodeMouseDown = (e: React.MouseEvent, node: RoadmapNode) => {
    e.stopPropagation();
    if (!currentRoadmap) return;
    setDraggedNodeId(node.id);
    setSelectedNodeId(node.id);
    setDragOffset({
      x: e.clientX - node.x * currentRoadmap.zoom,
      y: e.clientY - node.y * currentRoadmap.zoom,
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (draggedNodeId) return;
    setIsPanning(true);
    setPanStart({
      x: e.clientX - (currentRoadmap?.pan.x || 0),
      y: e.clientY - (currentRoadmap?.pan.y || 0),
    });
    setSelectedNodeId(null);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!currentRoadmap) return;
      if (draggedNodeId) {
        const newX = Math.round((e.clientX - dragOffset.x) / currentRoadmap.zoom);
        const newY = Math.round((e.clientY - dragOffset.y) / currentRoadmap.zoom);
        setRoadmaps((prevList) =>
          prevList.map((r) =>
            r.id === currentRoadmap.id
              ? {
                  ...r,
                  nodes: r.nodes.map((n) =>
                    n.id === draggedNodeId ? { ...n, x: newX, y: newY } : n
                  ),
                }
              : r
          )
        );
      } else if (isPanning) {
        const nextPan = {
          x: Math.round(e.clientX - panStart.x),
          y: Math.round(e.clientY - panStart.y),
        };
        setRoadmaps((prevList) =>
          prevList.map((r) => (r.id === currentRoadmap.id ? { ...r, pan: nextPan } : r))
        );
      }
    },
    [currentRoadmap, draggedNodeId, dragOffset, isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    if (draggedNodeId || isPanning) {
      setDraggedNodeId(null);
      setIsPanning(false);
      // Persist to local storage
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roadmaps));
      } catch {
        // ignore
      }
    }
  }, [draggedNodeId, isPanning, roadmaps]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Trackpad/wheel zooming
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      handleZoom(delta);
    }
  };

  const filteredDrawerCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) => c.title.toLowerCase().includes(q) || c.instructor.toLowerCase().includes(q)
    );
  }, [courseQuery]);

  const courseMap = useMemo(() => {
    const map = new Map<number, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, []);

  if (!currentRoadmap) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <Compass className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">No roadmaps found</h2>
        <Button onClick={() => setCreateModalOpen(true)} className="mt-4 rounded-md">
          Create roadmap
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col p-4 sm:p-6 lg:p-8">
      {/* Top Header Toolbar */}
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTitleEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTitleEdit();
                }
              }}
              onBlur={saveTitleEdit}
              className="h-9 min-w-[200px] max-w-md rounded-md bg-secondary/75 px-2.5 text-xl font-bold text-foreground outline-none ring-2 ring-primary sm:text-2xl"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-1">
              <h1
                onDoubleClick={(e) => {
                  e.preventDefault();
                  startEditingTitle();
                }}
                className="cursor-pointer select-none rounded-md px-1 py-0.5 text-xl font-bold text-foreground transition-colors hover:bg-secondary/60 sm:text-2xl"
                title="Double-click to rename"
              >
                {currentRoadmap.title}
              </h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                    aria-label="Switch roadmap"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 rounded-lg p-1.5 shadow-workspace">
                  {roadmaps.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={() => handleSelectRoadmap(r.id)}
                      className="rounded-md"
                    >
                      <span className="truncate">{r.title}</span>
                      {r.id === currentRoadmap.id && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={startEditingTitle}
                    className="gap-2 rounded-md"
                  >
                    <Pencil className="size-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setCreateModalOpen(true)}
                    className="gap-2 rounded-md font-medium text-foreground"
                  >
                    <Plus className="size-4" /> New roadmap
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={cn(
              "rounded-lg bg-card shadow-card hover:bg-secondary",
              drawerOpen && "bg-secondary text-foreground"
            )}
          >
            {drawerOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            <span className="ml-1 hidden sm:inline">Courses</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="rounded-lg bg-card shadow-card hover:bg-secondary"
          >
            <Plus className="size-4" />
            <span className="ml-1 hidden sm:inline">New</span>
          </Button>

          {roadmaps.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteRoadmap(currentRoadmap.id)}
              className="size-9 rounded-lg text-muted-foreground hover:text-destructive"
              title="Delete roadmap"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="relative flex flex-1 overflow-hidden rounded-xl bg-shell/60 shadow-card">
        {/* Left Side: Course Library Drawer */}
        {drawerOpen && (
          <aside className="z-10 flex w-72 shrink-0 flex-col border-r border-border/50 bg-card/95 shadow-workspace backdrop-blur-md sm:w-80">
            <div className="border-b border-border/50 p-3.5 pb-3">
              <div className="flex items-center gap-2 rounded-lg bg-secondary/75 px-2.5 py-1.5 transition-colors focus-within:bg-background focus-within:ring-1 focus-within:ring-ring/40">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={courseQuery}
                  onChange={(e) => setCourseQuery(e.target.value)}
                  placeholder="Search courses..."
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
                {courseQuery && (
                  <button onClick={() => setCourseQuery("")} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar-sm">
              {filteredDrawerCourses.map((course) => {
                const isOnCanvas = currentRoadmap.nodes.some((n) => n.courseId === course.id);
                return (
                  <button
                    key={course.id}
                    onClick={() => handleAddCourse(course)}
                    disabled={isOnCanvas}
                    className={cn(
                      "group w-full flex items-center gap-3 rounded-lg bg-secondary/45 p-2 text-left transition-colors",
                      isOnCanvas
                        ? "opacity-50 cursor-not-allowed bg-secondary/30"
                        : "hover:bg-secondary/85 cursor-pointer"
                    )}
                  >
                    <div className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
                      <CourseThumbnail course={course} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-xs font-medium text-foreground">{course.title}</h4>
                      <p className="truncate text-[11px] text-muted-foreground">{course.instructor}</p>
                    </div>
                    {isOnCanvas ? (
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Added
                      </span>
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* Right Side: Interactive Infinite Canvas */}
        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
          className="relative flex-1 select-none overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: `${22 * currentRoadmap.zoom}px ${22 * currentRoadmap.zoom}px`,
            backgroundPosition: `${currentRoadmap.pan.x}px ${currentRoadmap.pan.y}px`,
          }}
        >
          {/* Zoom & Viewport Floating Controls */}
          <div className="absolute right-4 top-4 z-30 flex flex-col items-center gap-1.5 rounded-lg bg-card/90 p-1 shadow-workspace backdrop-blur-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleZoom(0.2)}
              className="size-8 rounded-md"
              title="Zoom in"
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleZoom(-0.2)}
              className="size-8 rounded-md"
              title="Zoom out"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResetView}
              className="size-8 rounded-md"
              title="Reset view"
            >
              <Maximize2 className="size-4" />
            </Button>
            <span className="px-1 font-mono text-[10px] font-semibold text-muted-foreground">
              {Math.round(currentRoadmap.zoom * 100)}%
            </span>
          </div>

          {/* Connecting Banner Tooltip */}
          {connectingFrom && (
            <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-card/95 px-3.5 py-1.5 text-xs shadow-workspace ring-1 ring-primary/35 backdrop-blur-md">
              <span className="size-2 rounded-full bg-primary animate-pulse" />
              <span>Click another course node to create connection</span>
              <button
                onClick={() => setConnectingFrom(null)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* SVG Connections Layer */}
          <svg
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            style={{
              transform: `translate(${currentRoadmap.pan.x}px, ${currentRoadmap.pan.y}px) scale(${currentRoadmap.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <defs>
              <marker
                id="roadmap-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--foreground)" opacity="0.65" />
              </marker>
            </defs>
            {currentRoadmap.connections.map((conn) => {
              const fromNode = currentRoadmap.nodes.find((n) => n.id === conn.fromNodeId);
              const toNode = currentRoadmap.nodes.find((n) => n.id === conn.toNodeId);
              if (!fromNode || !toNode) return null;

              const points = getNodeEdgePoint(fromNode, toNode);
              const { cp1, cp2 } = getBezierControlPoints(points.from, points.to);
              const midX = (points.from.x + points.to.x) / 2;
              const midY = (points.from.y + points.to.y) / 2;

              return (
                <g key={conn.id} className="group pointer-events-auto cursor-pointer">
                  {/* Invisible broad hit area */}
                  <path
                    d={`M ${points.from.x} ${points.from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${points.to.x} ${points.to.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="24"
                    onClick={() => handleRemoveConnection(conn.id)}
                  />
                  {/* Visual Connection line */}
                  <path
                    d={`M ${points.from.x} ${points.from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${points.to.x} ${points.to.y}`}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeOpacity="0.4"
                    strokeWidth="2"
                    strokeLinecap="round"
                    markerEnd="url(#roadmap-arrow)"
                    className="group-hover:stroke-destructive group-hover:stroke-opacity-90 transition-colors"
                  />
                  {/* Disconnect indicator on hover */}
                  <g
                    transform={`translate(${midX}, ${midY})`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveConnection(conn.id);
                    }}
                  >
                    <circle r="11" fill="var(--card)" stroke="var(--destructive)" strokeWidth="1.5" />
                    <text
                      x="0"
                      y="1"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--destructive)"
                      fontSize="12"
                      fontWeight="bold"
                    >
                      ×
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {/* HTML Canvas Nodes Layer */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${currentRoadmap.pan.x}px, ${currentRoadmap.pan.y}px) scale(${currentRoadmap.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {currentRoadmap.nodes.map((node) => {
              const course = courseMap.get(node.courseId);
              if (!course) return null;

              const completed = Math.round((course.lessons * course.progress) / 100);
              const isSelected = selectedNodeId === node.id;
              const isConnectingSource = connectingFrom === node.id;

              return (
                <div
                  key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectingFrom && connectingFrom !== node.id) {
                      handleConnectClick(node.id);
                    }
                  }}
                  className={cn(
                    "group/node absolute select-none rounded-xl bg-card shadow-card transition-shadow cursor-grab active:cursor-grabbing",
                    isSelected && "ring-2 ring-foreground/30 shadow-workspace",
                    isConnectingSource && "ring-2 ring-primary shadow-workspace",
                    connectingFrom && connectingFrom !== node.id && "hover:ring-2 hover:ring-primary/40"
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    minHeight: node.height,
                  }}
                >
                  {/* Node Thumbnail Banner */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-t-xl border-b border-border/50">
                    <CourseThumbnail course={course} />
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white backdrop-blur-md">
                      {course.duration}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveNode(node.id);
                      }}
                      className="absolute right-2 top-2 rounded-md bg-card/85 p-1 text-muted-foreground opacity-0 backdrop-blur-md transition-opacity hover:text-destructive group-hover/node:opacity-100"
                      title="Remove from roadmap"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* Node Content */}
                  <div className="p-3.5">
                    <h3 className="truncate text-sm font-semibold text-foreground" title={course.title}>
                      {course.title}
                    </h3>

                    <div className="mt-3 h-1 overflow-hidden rounded-sm bg-secondary">
                      <div className="h-full bg-foreground/55" style={{ width: `${course.progress}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{completed}/{course.lessons} lessons</span>
                      <span className="font-semibold text-foreground/75">{course.progress}%</span>
                    </div>

                    {/* Node Actions Bar */}
                    <div className="mt-3.5 flex items-center gap-2 border-t border-border/50 pt-3">
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="h-8 flex-1 rounded-md text-xs font-medium"
                      >
                        <Link to="/learn/$courseId" params={{ courseId: String(course.id) }}>
                          <Play className="size-3.5 fill-current mr-1" />
                          Study
                        </Link>
                      </Button>

                      <Button
                        type="button"
                        variant={isConnectingSource ? "default" : "secondary"}
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnectClick(node.id);
                        }}
                        className={cn("size-8 rounded-md", isConnectingSource && "bg-primary text-primary-foreground")}
                        title={isConnectingSource ? "Connecting... click target node" : "Connect to another course"}
                      >
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty Canvas Notice */}
          {currentRoadmap.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Compass className="size-12 opacity-30" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-foreground">Canvas is ready</p>
              <p className="mt-1 text-xs">Open the course drawer on the left to add courses.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create New Roadmap Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-md rounded-xl border-0 bg-card p-6 shadow-workspace">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">New roadmap</DialogTitle>
            <DialogDescription className="text-sm">Name your learning pathway.</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateRoadmap();
              }}
              placeholder="e.g. Distributed Systems & Reliability"
              className="w-full rounded-lg bg-secondary/75 px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <DialogFooter className="mt-6 gap-2">
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)} className="rounded-md">
              Cancel
            </Button>
            <Button onClick={handleCreateRoadmap} disabled={!newTitle.trim()} className="rounded-md">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
