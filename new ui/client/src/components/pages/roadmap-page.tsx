import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  Loader2,
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
import { toast } from "sonner";

import { apiRequest } from "@/lib/api";
import { generateId, useCoursesList, type Course } from "@/lib/courses";
import { CourseThumbnail } from "@/components/layout/course-thumbnail";
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
  courseId: string;
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
  isActive?: boolean | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

interface RawRoadmapRow {
  id: string;
  name?: string;
  title?: string;
  nodes?: Array<Partial<RoadmapNode> & { courseId?: string | number }>;
  connections?: RoadmapConnection[];
  viewport?: { pan?: { x?: number; y?: number }; zoom?: number };
  is_active?: boolean;
  isActive?: boolean;
  created_at?: string;
  updated_at?: string;
}

function normalizeRoadmapRow(row: RawRoadmapRow): Roadmap {
  const rawPan = row.viewport?.pan;
  const rawZoom = row.viewport?.zoom;
  const nodes: RoadmapNode[] = Array.isArray(row.nodes)
    ? row.nodes.map((node) => ({
        id: String(node.id || generateId("node_")),
        courseId: String(node.courseId ?? ""),
        x: Number(node.x) || 40,
        y: Number(node.y) || 40,
        width: Number(node.width) || 280,
        height: Number(node.height) || 250,
      }))
    : [];

  return {
    id: String(row.id),
    title: String(row.name || row.title || "Untitled Roadmap"),
    nodes,
    connections: Array.isArray(row.connections) ? row.connections : [],
    pan: {
      x: typeof rawPan?.x === "number" && Number.isFinite(rawPan.x) ? rawPan.x : 40,
      y: typeof rawPan?.y === "number" && Number.isFinite(rawPan.y) ? rawPan.y : 40,
    },
    zoom:
      typeof rawZoom === "number" && Number.isFinite(rawZoom)
        ? Math.min(2, Math.max(0.35, rawZoom))
        : 1,
    isActive: Boolean(row.is_active ?? row.isActive),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getNodeEdgePoint(fromNode: RoadmapNode, toNode: RoadmapNode) {
  const fromCenter = {
    x: fromNode.x + fromNode.width / 2,
    y: fromNode.y + fromNode.height / 2,
  };
  const toCenter = {
    x: toNode.x + toNode.width / 2,
    y: toNode.y + toNode.height / 2,
  };

  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const angle = Math.atan2(dy, dx);

  const getEdge = (node: RoadmapNode, isSource: boolean) => {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const w = node.width / 2;
    const h = node.height / 2;
    const dir = isSource ? 1 : -1;
    const tx = dx * dir;
    const ty = dy * dir;

    if (Math.abs(tx) * h > Math.abs(ty) * w) {
      return {
        x: cx + (tx > 0 ? w : -w),
        y: cy + Math.tan(angle) * (tx > 0 ? w : -w) * dir,
      };
    }
    return {
      x: cx + (ty !== 0 ? ((ty > 0 ? h : -h) / Math.tan(angle)) * dir : 0),
      y: cy + (ty > 0 ? h : -h),
    };
  };

  return {
    from: getEdge(fromNode, true),
    to: getEdge(toNode, false),
  };
}

function getBezierControlPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const offset = Math.max(50, Math.min(dx * 0.5, 160), dy * 0.25);

  const isHorizontal = dx > dy * 0.7;
  if (isHorizontal) {
    return {
      cp1: { x: from.x + (to.x > from.x ? offset : -offset), y: from.y },
      cp2: { x: to.x - (to.x > from.x ? offset : -offset), y: to.y },
    };
  }
  return {
    cp1: { x: from.x, y: from.y + (to.y > from.y ? offset : -offset) },
    cp2: { x: to.x, y: to.y - (to.y > from.y ? offset : -offset) },
  };
}

export function RoadmapPage() {
  const { courses } = useCoursesList();
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [courseQuery, setCourseQuery] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const roadmapsRef = useRef<Roadmap[]>([]);
  const saveTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    roadmapsRef.current = roadmaps;
  }, [roadmaps]);

  const flushPersistRoadmap = useCallback(async (roadmap: Roadmap) => {
    await apiRequest(`/api/roadmaps/${encodeURIComponent(roadmap.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: roadmap.title,
        nodes: roadmap.nodes,
        connections: roadmap.connections,
        viewport: { pan: roadmap.pan, zoom: roadmap.zoom },
        isActive: roadmap.isActive,
      }),
    });
  }, []);

  const schedulePersistRoadmap = useCallback(
    (roadmap: Roadmap, delayMs = 200) => {
      const existingTimer = saveTimersRef.current.get(roadmap.id);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      if (delayMs <= 0) {
        saveTimersRef.current.delete(roadmap.id);
        void flushPersistRoadmap(roadmap);
        return;
      }
      const timerId = window.setTimeout(() => {
        saveTimersRef.current.delete(roadmap.id);
        const latest =
          roadmapsRef.current.find((r) => r.id === roadmap.id) ?? roadmap;
        void flushPersistRoadmap(latest);
      }, delayMs);
      saveTimersRef.current.set(roadmap.id, timerId);
    },
    [flushPersistRoadmap],
  );

  useEffect(() => {
    const timersMap = saveTimersRef.current;
    return () => {
      for (const [id, timer] of timersMap.entries()) {
        window.clearTimeout(timer);
        const latest = roadmapsRef.current.find((r) => r.id === id);
        if (latest) {
          void flushPersistRoadmap(latest);
        }
      }
      timersMap.clear();
    };
  }, [flushPersistRoadmap]);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<RawRoadmapRow[]>("/api/roadmaps", {
      signal: controller.signal,
    }).then((res) => {
      if (controller.signal.aborted) return;
      if (res.ok && Array.isArray(res.data)) {
        const loaded = res.data.map(normalizeRoadmapRow);
        setRoadmaps(loaded);
        const active = loaded.find((r) => r.isActive) ?? loaded[0];
        if (active) {
          setCurrentId(active.id);
        }
      }
      setIsLoading(false);
    });

    return () => controller.abort();
  }, []);

  const currentRoadmap = useMemo(
    () => roadmaps.find((r) => r.id === currentId) ?? roadmaps[0] ?? null,
    [roadmaps, currentId],
  );

  const updateCurrentRoadmap = useCallback(
    (updater: (prev: Roadmap) => Roadmap, delayMs = 200) => {
      if (!currentRoadmap) return;
      const next = {
        ...updater(currentRoadmap),
        updatedAt: new Date().toISOString(),
      };
      setRoadmaps((prevList) =>
        prevList.map((r) => (r.id === next.id ? next : r)),
      );
      schedulePersistRoadmap(next, delayMs);
    },
    [currentRoadmap, schedulePersistRoadmap],
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
      updateCurrentRoadmap(
        (prev) => ({
          ...prev,
          title: trimmed,
        }),
        0,
      );
    }
    setIsEditingTitle(false);
  }, [titleDraft, currentRoadmap, updateCurrentRoadmap]);

  const cancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  const handleSelectRoadmap = (id: string) => {
    const prevActive = roadmaps.find((r) => r.id === currentId);
    const nextActive = roadmaps.find((r) => r.id === id);

    setCurrentId(id);
    setConnectingFrom(null);
    setSelectedNodeId(null);

    setRoadmaps((prev) =>
      prev.map((r) => ({ ...r, isActive: r.id === id })),
    );

    if (prevActive && prevActive.id !== id && prevActive.isActive) {
      void apiRequest(`/api/roadmaps/${encodeURIComponent(prevActive.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
    }
    if (nextActive) {
      void apiRequest(`/api/roadmaps/${encodeURIComponent(nextActive.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
    }
  };

  const handleCreateRoadmap = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const newRoadmap: Roadmap = {
      id: generateId("roadmap_"),
      title: trimmed,
      nodes: [],
      connections: [],
      pan: { x: 40, y: 40 },
      zoom: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await apiRequest("/api/roadmaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newRoadmap.id,
        title: newRoadmap.title,
        nodes: newRoadmap.nodes,
        connections: newRoadmap.connections,
        viewport: { pan: newRoadmap.pan, zoom: newRoadmap.zoom },
        isActive: true,
        createdAt: newRoadmap.createdAt,
      }),
    });

    if (!res.ok) {
      toast.error(res.error || "Failed to create roadmap");
      return;
    }

    const previousActive = roadmaps.filter((r) => r.isActive);
    setRoadmaps((prev) => [
      newRoadmap,
      ...prev.map((r) => ({ ...r, isActive: false })),
    ]);
    setCurrentId(newRoadmap.id);
    setConnectingFrom(null);
    setSelectedNodeId(null);
    setNewTitle("");
    setCreateModalOpen(false);

    for (const old of previousActive) {
      void apiRequest(`/api/roadmaps/${encodeURIComponent(old.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
    }
  };

  const handleDeleteRoadmap = async (id: string) => {
    if (roadmaps.length <= 1) return;
    const res = await apiRequest(`/api/roadmaps/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(res.error || "Failed to delete roadmap");
      return;
    }

    const nextList = roadmaps.filter((r) => r.id !== id);
    setRoadmaps(nextList);
    if (currentId === id && nextList[0]) {
      setCurrentId(nextList[0].id);
      setConnectingFrom(null);
      setSelectedNodeId(null);
      void apiRequest(`/api/roadmaps/${encodeURIComponent(nextList[0].id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
    }
  };

  const handleAddCourse = (course: Course) => {
    if (!currentRoadmap) return;
    const isAlreadyOnCanvas = currentRoadmap.nodes.some(
      (n) => n.courseId === course.id,
    );
    if (isAlreadyOnCanvas) return;

    const container = containerRef.current;
    const rect = container?.getBoundingClientRect() || { width: 900, height: 600 };

    const centerX =
      (rect.width / 2 - currentRoadmap.pan.x) / currentRoadmap.zoom;
    const centerY =
      (rect.height / 2 - currentRoadmap.pan.y) / currentRoadmap.zoom;
    const offset = (currentRoadmap.nodes.length % 5) * 30;

    const newNode: RoadmapNode = {
      id: generateId("node_"),
      courseId: course.id,
      x: Math.max(20, Math.round(centerX - 140 + offset)),
      y: Math.max(20, Math.round(centerY - 120 + offset)),
      width: 280,
      height: 250,
    };

    updateCurrentRoadmap(
      (prev) => ({
        ...prev,
        nodes: [...prev.nodes, newNode],
      }),
      0,
    );
  };

  const handleRemoveNode = (nodeId: string) => {
    updateCurrentRoadmap(
      (prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        connections: prev.connections.filter(
          (c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId,
        ),
      }),
      0,
    );
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (connectingFrom === nodeId) setConnectingFrom(null);
  };

  const handleConnectClick = (nodeId: string) => {
    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
      return;
    }
    if (connectingFrom) {
      if (connectingFrom !== nodeId) {
        const exists = currentRoadmap?.connections.some(
          (c) => c.fromNodeId === connectingFrom && c.toNodeId === nodeId,
        );
        if (!exists) {
          const newConn: RoadmapConnection = {
            id: generateId("conn_"),
            fromNodeId: connectingFrom,
            toNodeId: nodeId,
          };
          updateCurrentRoadmap(
            (prev) => ({
              ...prev,
              connections: [...prev.connections, newConn],
            }),
            0,
          );
        }
      }
      setConnectingFrom(null);
    } else {
      setConnectingFrom(nodeId);
    }
  };

  const handleRemoveConnection = (connId: string) => {
    updateCurrentRoadmap(
      (prev) => ({
        ...prev,
        connections: prev.connections.filter((c) => c.id !== connId),
      }),
      0,
    );
  };

  const handleZoom = (delta: number) => {
    updateCurrentRoadmap((prev) => ({
      ...prev,
      zoom: Math.min(
        2.0,
        Math.max(0.35, Math.round((prev.zoom + delta) * 100) / 100),
      ),
    }));
  };

  const handleResetView = () => {
    updateCurrentRoadmap(
      (prev) => ({
        ...prev,
        zoom: 1,
        pan: { x: 40, y: 40 },
      }),
      0,
    );
  };

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
        const newX = Math.round(
          (e.clientX - dragOffset.x) / currentRoadmap.zoom,
        );
        const newY = Math.round(
          (e.clientY - dragOffset.y) / currentRoadmap.zoom,
        );
        setRoadmaps((prevList) =>
          prevList.map((r) =>
            r.id === currentRoadmap.id
              ? {
                  ...r,
                  nodes: r.nodes.map((n) =>
                    n.id === draggedNodeId ? { ...n, x: newX, y: newY } : n,
                  ),
                }
              : r,
          ),
        );
      } else if (isPanning) {
        const nextPan = {
          x: Math.round(e.clientX - panStart.x),
          y: Math.round(e.clientY - panStart.y),
        };
        setRoadmaps((prevList) =>
          prevList.map((r) =>
            r.id === currentRoadmap.id ? { ...r, pan: nextPan } : r,
          ),
        );
      }
    },
    [currentRoadmap, draggedNodeId, dragOffset, isPanning, panStart],
  );

  const handleMouseUp = useCallback(() => {
    if (draggedNodeId || isPanning) {
      setDraggedNodeId(null);
      setIsPanning(false);
      const latest = roadmapsRef.current.find((r) => r.id === currentId);
      if (latest) {
        schedulePersistRoadmap(latest, 150);
      }
    }
  }, [draggedNodeId, isPanning, currentId, schedulePersistRoadmap]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const currentRoadmapId = currentRoadmap?.id ?? "";

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !currentRoadmapId) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();

      const active = roadmapsRef.current.find((r) => r.id === currentRoadmapId);
      if (!active) return;

      const rect = el.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      // Zoom toward the cursor when scrolling anywhere over the roadmap canvas
      const scaleFactor = Math.exp(-e.deltaY * 0.0015);
      const nextZoom = Math.min(
        2.0,
        Math.max(0.35, Math.round(active.zoom * scaleFactor * 1000) / 1000),
      );
      if (nextZoom === active.zoom) return;

      const ratio = nextZoom / active.zoom;
      const nextRoadmap: Roadmap = {
        ...active,
        zoom: nextZoom,
        pan: {
          x: Math.round((pointerX - (pointerX - active.pan.x) * ratio) * 100) / 100,
          y: Math.round((pointerY - (pointerY - active.pan.y) * ratio) * 100) / 100,
        },
        updatedAt: new Date().toISOString(),
      };

      const nextList = roadmapsRef.current.map((r) =>
        r.id === currentRoadmapId ? nextRoadmap : r,
      );
      roadmapsRef.current = nextList;
      setRoadmaps(nextList);
      schedulePersistRoadmap(nextRoadmap, 200);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [currentRoadmapId, schedulePersistRoadmap]);

  const filteredDrawerCourses = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q),
    );
  }, [courses, courseQuery]);

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    for (const c of courses) {
      map.set(c.id, c);
    }
    return map;
  }, [courses]);

  const createDialog = (
    <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
      <DialogContent className="max-w-md rounded-xl border-0 bg-card p-6 shadow-workspace">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New roadmap</DialogTitle>
          <DialogDescription className="text-sm">
            Name your learning pathway.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateRoadmap();
            }}
            placeholder="e.g. Distributed Systems & Reliability"
            className="w-full rounded-lg bg-secondary/75 px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="ghost"
            onClick={() => setCreateModalOpen(false)}
            className="rounded-md"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreateRoadmap()}
            disabled={!newTitle.trim()}
            className="rounded-md"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading roadmaps…
      </div>
    );
  }

  if (!currentRoadmap) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        <Compass className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">No roadmaps yet</h2>
        <Button onClick={() => setCreateModalOpen(true)} className="mt-4 rounded-md">
          Create roadmap
        </Button>
        {createDialog}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col p-4 sm:p-6 lg:p-8">
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
                <DropdownMenuContent
                  align="start"
                  className="w-64 rounded-lg p-1.5 shadow-workspace"
                >
                  {roadmaps.map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={() => handleSelectRoadmap(r.id)}
                      className="rounded-md"
                    >
                      <span className="truncate">{r.title}</span>
                      {r.id === currentRoadmap.id && (
                        <Check className="ml-auto size-4" />
                      )}
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

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={cn(
              "rounded-lg bg-card shadow-card hover:bg-secondary",
              drawerOpen && "bg-secondary text-foreground",
            )}
          >
            {drawerOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
            <span className="ml-1 hidden sm:inline">Courses</span>
          </Button>

          {roadmaps.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleDeleteRoadmap(currentRoadmap.id)}
              className="size-9 rounded-lg text-muted-foreground hover:text-destructive"
              title="Delete roadmap"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden rounded-xl bg-shell/60 shadow-card">
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
                  <button
                    type="button"
                    onClick={() => setCourseQuery("")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5 custom-scrollbar-sm">
              {filteredDrawerCourses.map((course) => {
                const isOnCanvas = currentRoadmap.nodes.some(
                  (n) => n.courseId === course.id,
                );
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => handleAddCourse(course)}
                    disabled={isOnCanvas}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg bg-secondary/45 p-2 text-left transition-colors",
                      isOnCanvas
                        ? "cursor-not-allowed bg-secondary/30 opacity-50"
                        : "cursor-pointer hover:bg-secondary/85",
                    )}
                  >
                    <div className="relative aspect-video w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
                      <CourseThumbnail course={course} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-xs font-medium text-foreground">
                        {course.title}
                      </h4>
                      {course.instructor.trim() ? (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {course.instructor}
                        </p>
                      ) : null}
                    </div>
                    {isOnCanvas ? (
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Added
                      </span>
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        <div
          ref={containerRef}
          onMouseDown={handleCanvasMouseDown}
          className="relative flex-1 cursor-grab select-none overflow-hidden active:cursor-grabbing"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: `${22 * currentRoadmap.zoom}px ${22 * currentRoadmap.zoom}px`,
            backgroundPosition: `${currentRoadmap.pan.x}px ${currentRoadmap.pan.y}px`,
          }}
        >
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

          {connectingFrom && (
            <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-card/95 px-3.5 py-1.5 text-xs shadow-workspace ring-1 ring-primary/35 backdrop-blur-md">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              <span>Click another course node to create connection</span>
              <button
                type="button"
                onClick={() => setConnectingFrom(null)}
                className="ml-2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

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
                <path
                  d="M 0 1 L 10 5 L 0 9 z"
                  fill="var(--foreground)"
                  opacity="0.65"
                />
              </marker>
            </defs>
            {currentRoadmap.connections.map((conn) => {
              const fromNode = currentRoadmap.nodes.find(
                (n) => n.id === conn.fromNodeId,
              );
              const toNode = currentRoadmap.nodes.find(
                (n) => n.id === conn.toNodeId,
              );
              if (!fromNode || !toNode) return null;

              const points = getNodeEdgePoint(fromNode, toNode);
              const { cp1, cp2 } = getBezierControlPoints(
                points.from,
                points.to,
              );
              const midX = (points.from.x + points.to.x) / 2;
              const midY = (points.from.y + points.to.y) / 2;

              return (
                <g
                  key={conn.id}
                  className="group pointer-events-auto cursor-pointer"
                >
                  <path
                    d={`M ${points.from.x} ${points.from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${points.to.x} ${points.to.y}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="24"
                    onClick={() => handleRemoveConnection(conn.id)}
                  />
                  <path
                    d={`M ${points.from.x} ${points.from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${points.to.x} ${points.to.y}`}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeOpacity="0.4"
                    strokeWidth="2"
                    strokeLinecap="round"
                    markerEnd="url(#roadmap-arrow)"
                    className="transition-colors group-hover:stroke-destructive group-hover:stroke-opacity-90"
                  />
                  <g
                    transform={`translate(${midX}, ${midY})`}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveConnection(conn.id);
                    }}
                  >
                    <circle
                      r="11"
                      fill="var(--card)"
                      stroke="var(--destructive)"
                      strokeWidth="1.5"
                    />
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

              const completed = course.completedVideos;
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
                    "group/node absolute cursor-grab select-none rounded-xl bg-card shadow-card transition-shadow active:cursor-grabbing",
                    isSelected && "shadow-workspace ring-2 ring-foreground/30",
                    isConnectingSource && "shadow-workspace ring-2 ring-primary",
                    connectingFrom &&
                      connectingFrom !== node.id &&
                      "hover:ring-2 hover:ring-primary/40",
                  )}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    minHeight: node.height,
                  }}
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-t-xl border-b border-border/50">
                    <CourseThumbnail course={course} />
                    <span className="duration-badge-text absolute bottom-2 right-2 inline-flex h-5 items-center justify-center rounded-sm bg-black/70 px-1.5 font-mono text-[10px] font-medium tabular-nums text-white backdrop-blur-md">
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

                  <div className="p-3.5">
                    <h3
                      className="truncate text-sm font-semibold text-foreground"
                      title={course.title}
                    >
                      {course.title}
                    </h3>

                    <div className="mt-3 h-1 overflow-hidden rounded-sm bg-secondary">
                      <div
                        className="h-full bg-foreground/55"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {completed}/{course.lessons} lessons
                      </span>
                      <span className="font-semibold text-foreground/75">
                        {course.progress}%
                      </span>
                    </div>

                    <div className="mt-3.5 flex items-center gap-2 border-t border-border/50 pt-3">
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="h-8 flex-1 rounded-md text-xs font-medium"
                      >
                        <Link
                          to="/learn/$courseId"
                          params={{ courseId: course.id }}
                        >
                          <Play className="mr-1 size-3.5 fill-current" />
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
                        className={cn(
                          "size-8 rounded-md",
                          isConnectingSource &&
                            "bg-primary text-primary-foreground",
                        )}
                        title={
                          isConnectingSource
                            ? "Connecting... click target node"
                            : "Connect to another course"
                        }
                      >
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {currentRoadmap.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Compass className="size-12 opacity-30" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-foreground">
                Canvas is ready
              </p>
              <p className="mt-1 text-xs">
                Open the course drawer on the left to add courses.
              </p>
            </div>
          )}
        </div>
      </div>

      {createDialog}
    </div>
  );
}
