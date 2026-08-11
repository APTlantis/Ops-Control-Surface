import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Database,
  Filter,
  FolderKanban,
  Layers3,
  Pin,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { createObject, getBoardData, moveObject, updateObject } from "./api";
import { BoardColumnView } from "./components/BoardColumnView";
import { NewObjectPanel } from "./components/NewObjectPanel";
import { ObjectInspector } from "./components/ObjectInspector";
import { lanesForBoard, objectRegistry, objectTypes } from "./objectRegistry";
import { useUiStore } from "./store";
import { BoardData, BoardId, BoardMetrics, ObjectType, OperationalObject } from "./types";

function computeMetrics(data: BoardData, objects = data.objects): BoardMetrics {
  return {
    total: objects.length,
    projects: objects.filter((object) => object.objectType === "project").length,
    operators: objects.filter((object) => object.objectType === "powershell-operator").length,
    cityHall: objects.filter((object) => object.objectType === "city-hall").length,
    pinned: objects.filter((object) => object.board.pinned).length,
    attention: objects.filter((object) => {
      if (object.objectType === "project") return Boolean(object.payload.classification.attention.trim());
      if (object.objectType === "city-hall") return Boolean(object.payload.operation.attention.trim());
      return Boolean(object.payload.state.lastResult.trim());
    }).length,
    storageUsedGb: data.workspace.storageUsedGb,
  };
}

function searchableText(object: OperationalObject) {
  return [
    object.id,
    object.objectType,
    object.schema,
    object.identity.id,
    object.identity.name,
    object.identity.acronym,
    object.identity.summary,
    ...object.metadata.tags,
    object.metadata.notes,
    JSON.stringify(object.payload),
  ]
    .join(" ")
    .toLowerCase();
}

function filterObjects(objects: OperationalObject[], search: string, typeFilter: ObjectType | "all", tagFilter: string | "all") {
  const query = search.trim().toLowerCase();
  return objects.filter((object) => {
    const matchesSearch = !query || searchableText(object).includes(query);
    const matchesType = typeFilter === "all" || object.objectType === typeFilter;
    const matchesTag = tagFilter === "all" || object.metadata.tags.includes(tagFilter);
    return matchesSearch && matchesType && matchesTag;
  });
}

export function App() {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [showNewObject, setShowNewObject] = useState(false);
  const [newObjectLane, setNewObjectLane] = useState<string | null>(null);
  const {
    selectedObjectId,
    setSelectedObjectId,
    compareObjectId,
    setCompareObjectId,
    activeBoardId,
    setActiveBoardId,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    tagFilter,
    setTagFilter,
  } = useUiStore();

  const boardQuery = useQuery({
    queryKey: ["board"],
    queryFn: getBoardData,
  });

  const moveMutation = useMutation({
    mutationFn: moveObject,
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const createMutation = useMutation({
    mutationFn: createObject,
    onSuccess: (nextData) => {
      queryClient.setQueryData(["board"], nextData);
      const newest = [...nextData.objects].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (newest) {
        setActiveBoardId(newest.board.board);
        setSelectedObjectId(newest.id);
      }
      setShowNewObject(false);
      setNewObjectLane(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateObject,
    onSuccess: (nextData) => queryClient.setQueryData(["board"], nextData),
  });

  const data = boardQuery.data;
  const boards = data?.boards.length ? data.boards : [{ id: "primary" as BoardId, name: "Operations Control", description: "Typed operational objects." }];
  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? boards[0];
  const activeBoardIndex = Math.max(0, boards.findIndex((board) => board.id === activeBoard.id));
  const boardObjects = data?.objects.filter((object) => object.board.board === activeBoard.id) ?? [];
  const objects = data ? filterObjects(boardObjects, search, typeFilter, tagFilter) : [];
  const lanes = data?.lanes.filter((lane) => lane.boardId === activeBoard.id) ?? lanesForBoard(activeBoard.id);
  const selectedObject = boardObjects.find((object) => object.id === selectedObjectId) ?? boardObjects[0] ?? null;
  const compareObject =
    compareObjectId && compareObjectId !== selectedObject?.id ? data?.objects.find((object) => object.id === compareObjectId) ?? null : null;
  const metrics = data ? computeMetrics(data, boardObjects) : null;
  const allTags = Array.from(new Set([...(data?.tagDefinitions.map((tag) => tag.tag) ?? []), ...(data?.objects.flatMap((object) => object.metadata.tags) ?? [])])).sort();
  const hasFilters = Boolean(search.trim()) || typeFilter !== "all" || tagFilter !== "all";
  const filterSummary = hasFilters ? `${objects.length} of ${boardObjects.length} objects` : `${boardObjects.length} objects`;

  function cycleBoard(direction: 1 | -1) {
    const nextIndex = (activeBoardIndex + direction + boards.length) % boards.length;
    const nextBoard = boards[nextIndex];
    setActiveBoardId(nextBoard.id);
    const nextObject = data?.objects.find((object) => object.board.board === nextBoard.id) ?? null;
    setSelectedObjectId(nextObject?.id ?? null);
    setCompareObjectId(null);
  }

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setTagFilter("all");
  }

  function openNewObject(laneId?: string) {
    setNewObjectLane(laneId ?? lanes.find((lane) => !lane.placeholder)?.id ?? objectRegistry.project.defaultLane);
    setShowNewObject(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    const objectId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || !data) return;

    const destination = lanes.find((lane) => lane.id === overId);
    if (!destination || destination.placeholder) return;

    const object = data.objects.find((candidate) => candidate.id === objectId);
    if (!object || (object.board.board === activeBoard.id && object.board.lane === destination.id)) return;

    const nextOrder =
      Math.max(0, ...data.objects.filter((candidate) => candidate.board.board === activeBoard.id && candidate.board.lane === destination.id).map((candidate) => candidate.cardOrder)) + 1;

    queryClient.setQueryData<BoardData>(["board"], {
      ...data,
      objects: data.objects.map((candidate) =>
        candidate.id === objectId
          ? {
              ...candidate,
              board: { ...candidate.board, board: activeBoard.id, lane: destination.id },
              cardOrder: nextOrder,
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      ),
    });

    moveMutation.mutate({ objectId, boardId: activeBoard.id, laneId: destination.id, cardOrder: nextOrder });
  }

  if (boardQuery.isLoading || !data || !metrics) {
    return <div className="loading">Loading Aptlantis workspace...</div>;
  }

  return (
    <div className="app-shell">
      <main className="workspace">
        <header className="top-bar">
          <div className="brand top-brand">
            <div className="brand-mark">
              <Layers3 size={19} />
            </div>
            <div>
              <div className="eyebrow">Aptlantis Ops</div>
              <h1>
                {data.workspace.name} <ChevronDown size={18} />
              </h1>
            </div>
          </div>

          <div className="toolbar">
            <div className="board-cycler" title={activeBoard.description}>
              <button className="icon-button" onClick={() => cycleBoard(-1)}>
                <ChevronLeft size={16} />
              </button>
              <div>
                <span>
                  Board {activeBoardIndex + 1} of {boards.length}
                </span>
                <strong>{activeBoard.name}</strong>
              </div>
              <button className="icon-button" onClick={() => cycleBoard(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <details className="toolbar-menu">
              <summary>Types</summary>
              <div>
                <button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>
                  All Objects
                  <small>{boardObjects.length}</small>
                </button>
                {objectTypes.map((type) => (
                  <button className={typeFilter === type.type ? "active" : ""} key={type.type} onClick={() => setTypeFilter(type.type)}>
                    {type.label}
                    <small>{boardObjects.filter((object) => object.objectType === type.type).length}</small>
                  </button>
                ))}
              </div>
            </details>
            <details className="toolbar-menu">
              <summary>Labels</summary>
              <div>
                {allTags.map((tag) => {
                  const color = data.tagDefinitions.find((definition) => definition.tag === tag)?.color ?? "#6b7cff";
                  return (
                    <button className={tagFilter === tag ? "active" : ""} key={tag} onClick={() => setTagFilter(tag)}>
                      <span className="dot" style={{ background: color }} />
                      {tag}
                      <small>{boardObjects.filter((object) => object.metadata.tags.includes(tag)).length}</small>
                    </button>
                  );
                })}
              </div>
            </details>
            <label className="search-box">
              <Search size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search objects, schemas, tags..." />
            </label>
            <details className="toolbar-menu">
              <summary>
                <Filter size={16} />
              </summary>
              <div>
                <label>
                  Object Type
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ObjectType | "all")}>
                    <option value="all">All Types</option>
                    {objectTypes.map((type) => (
                      <option value={type.type} key={type.type}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tag
                  <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                    <option value="all">All Tags</option>
                    {allTags.map((tag) => (
                      <option value={tag} key={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
            <button className="icon-button" title="View settings">
              <SlidersHorizontal size={17} />
            </button>
            <button className="primary-button" onClick={() => openNewObject()}>
              <Plus size={16} />
              New Object
            </button>
          </div>
        </header>

        <section className="metrics-strip">
          <Metric icon={<Database size={24} />} label="Total Objects" value={metrics.total} tone="violet" />
          <Metric icon={<FolderKanban size={24} />} label="Projects" value={metrics.projects} tone="green" />
          <Metric icon={<Power size={24} />} label="PowerShell Operators" value={metrics.operators} tone="cyan" />
          <Metric icon={<Building2 size={24} />} label="City Hall Objects" value={metrics.cityHall} tone="blue" />
          <Metric icon={<Pin size={24} />} label="Pinned" value={metrics.pinned} tone="orange" />
          <Metric icon={<Layers3 size={24} />} label="Attention Signals" value={metrics.attention} tone="blue" />
        </section>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="board-status">
            <span>{filterSummary}</span>
            {hasFilters && (
              <button onClick={clearFilters}>
                <CircleX size={15} />
                Clear filters
              </button>
            )}
          </div>
          <section className="board">
            {lanes.map((lane) => {
              const laneObjects = objects.filter((object) => object.board.lane === lane.id).sort((a, b) => a.cardOrder - b.cardOrder);
              return (
                <SortableContext items={laneObjects.map((object) => object.id)} strategy={verticalListSortingStrategy} key={lane.id}>
                  <BoardColumnView
                    lane={lane}
                    objects={laneObjects}
                    selectedObjectId={selectedObject?.id ?? null}
                    onSelectObject={setSelectedObjectId}
                    onNewObject={openNewObject}
                    hasActiveFilters={hasFilters}
                    tagDefinitions={data.tagDefinitions}
                  />
                </SortableContext>
              );
            })}
          </section>
        </DndContext>

        <footer className="workspace-footer">
          <span>Database is the system of record</span>
          <span>Board placement is projection only</span>
          <span>Showing: {filterSummary}</span>
          <span>{activeBoard.name}</span>
          <button onClick={() => openNewObject()}>
            <Plus size={15} />
            New Object
          </button>
        </footer>
        {showNewObject && (
          <NewObjectPanel
            activeBoardId={activeBoard.id}
            initialLaneId={newObjectLane ?? lanes.find((lane) => !lane.placeholder)?.id ?? "project-1"}
            onCancel={() => setShowNewObject(false)}
            onCreate={(input) => createMutation.mutate(input)}
            isCreating={createMutation.isPending}
          />
        )}
      </main>

      <aside className={`right-panel ${compareObject ? "has-comparison" : ""}`}>
        {selectedObject && (
          <ObjectInspector
            object={selectedObject}
            boards={boards}
            tagDefinitions={data.tagDefinitions}
            onUpdateObject={(update) => {
              updateMutation.mutate(update);
              if (update.board.board !== activeBoardId) {
                setActiveBoardId(update.board.board);
                setCompareObjectId(null);
              }
            }}
            isPinnedForCompare={compareObjectId === selectedObject.id}
            onPinCompare={setCompareObjectId}
            onClearCompare={() => setCompareObjectId(null)}
          />
        )}
        {compareObject && (
          <ObjectInspector
            object={compareObject}
            boards={boards}
            tagDefinitions={data.tagDefinitions}
            onUpdateObject={(update) => updateMutation.mutate(update)}
            compareMode
            isPinnedForCompare
            onPinCompare={setCompareObjectId}
            onClearCompare={() => setCompareObjectId(null)}
          />
        )}
      </aside>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon tone-${tone}`}>{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}
