import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Archive,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleX,
  ClipboardCheck,
  Database,
  Filter,
  FolderKanban,
  Gauge,
  Inbox,
  LayoutDashboard,
  Lock,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createRequirement,
  createProject,
  deleteRequirement,
  generateReleaseReceipt,
  getBoardData,
  moveProject,
  scanWorkspace,
  updateProjectBasics,
  updateProjectSetup,
  updateRelease,
  updateRequirement,
  updateTagDefinition,
} from "./api";
import { columns } from "./mockData";
import { useUiStore } from "./store";
import { BoardData, BoardId, BoardMetrics, Project, ProjectInput, ProjectStatus } from "./types";
import { BoardColumnView } from "./components/BoardColumnView";
import { ProjectInspector } from "./components/ProjectInspector";

const statusLabels: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  planned: "Planned",
  "in-progress": "In Progress",
  review: "Review",
  released: "Released",
  blocked: "Blocked",
};

const navViews: Array<[string, LucideIcon, (metrics: BoardMetrics, projects: Project[]) => number]> = [
  ["Overview", LayoutDashboard, (metrics) => metrics.total],
  ["Kanban", FolderKanban, (metrics) => metrics.total],
  ["Releases", CalendarCheck, (metrics) => metrics.readyToShip],
  ["Evidence", ClipboardCheck, (_metrics, projects) => projects.filter((project) => project.documents.some((document) => document.kind === "evidence" && document.exists)).length],
  ["Backlog", Inbox, (_metrics, projects) => projects.filter((project) => project.status === "backlog").length],
  ["Blocked", ShieldAlert, (metrics) => metrics.blocked],
  ["Completed", CheckCircle2, (_metrics, projects) => projects.filter((project) => project.status === "released").length],
];

function computeMetrics(data: BoardData, projects = data.projects): BoardMetrics {
  const active = projects.filter((project) => !["released", "blocked"].includes(project.status)).length;
  const releaseCandidates = projects.filter((project) => project.releases.some((release) => release.readiness >= 70));
  return {
    total: projects.length,
    active,
    inProgress: projects.filter((project) => project.status === "in-progress").length,
    blocked: projects.filter((project) => project.status === "blocked").length,
    readyToShip: releaseCandidates.length,
    readyWithReceipt: releaseCandidates.filter((project) =>
      project.receipts.some((receipt) => ["ready", "ready_with_warnings"].includes(receipt.status)),
    ).length,
    releaseBlocked: projects.filter((project) =>
      project.requirements.some((requirement) => requirement.blocking && !["satisfied", "waived"].includes(requirement.status)),
    ).length,
    missingEvidence: projects.filter((project) => !project.documents.some((document) => document.kind === "evidence" && document.exists)).length,
    storageUsedGb: data.workspace.storageUsedGb,
  };
}

function filterProjects(projects: Project[], search: string, statusFilter: ProjectStatus | "all", tagFilter: string | "all", readyOnly: boolean) {
  const query = search.trim().toLowerCase();
  return projects.filter((project) => {
    const matchesSearch =
      !query ||
      [project.name, project.description, project.category, project.priority, ...project.tags, ...project.stack]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const matchesTag = tagFilter === "all" || project.tags.includes(tagFilter);
    const matchesReady = !readyOnly || project.releases.some((release) => release.readiness >= 70);
    return matchesSearch && matchesStatus && matchesTag && matchesReady;
  });
}

export function App() {
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [showNewCard, setShowNewCard] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [newCard, setNewCard] = useState<ProjectInput>({
    boardId: "secondary",
    dbId: "active",
    availability: "available",
    name: "",
    description: "",
    status: "backlog",
    priority: "P3",
    category: "Tooling",
    tags: ["Tooling"],
    stack: ["Tooling"],
  });
  const {
    selectedProjectId,
    setSelectedProjectId,
    compareProjectId,
    setCompareProjectId,
    activeBoardId,
    setActiveBoardId,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    tagFilter,
    setTagFilter,
  } = useUiStore();

  const boardQuery = useQuery({
    queryKey: ["board"],
    queryFn: getBoardData,
  });

  const moveMutation = useMutation({
    mutationFn: ({ projectId, status, cardOrder }: { projectId: string; status: ProjectStatus; cardOrder: number }) =>
      moveProject(projectId, status, cardOrder),
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (nextData) => {
      queryClient.setQueryData(["board"], nextData);
      const created = nextData.projects.find((project) => project.name === newCard.name);
      if (created) {
        setActiveBoardId(created.boardId);
        setSelectedProjectId(created.id);
      }
      setShowNewCard(false);
      setNewCard({
        boardId: activeBoardId,
        dbId: "active",
        availability: "available",
        name: "",
        description: "",
        status: "backlog",
        priority: "P3",
        category: "Tooling",
        tags: ["Tooling"],
        stack: ["Tooling"],
      });
    },
  });

  const basicsMutation = useMutation({
    mutationFn: updateProjectBasics,
    onSuccess: (nextData) => queryClient.setQueryData(["board"], nextData),
  });

  const scanMutation = useMutation({
    mutationFn: () => scanWorkspace(),
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const setupMutation = useMutation({
    mutationFn: ({ projectId, setup }: Parameters<typeof updateProjectSetup> extends [infer A, infer B] ? { projectId: A; setup: B } : never) =>
      updateProjectSetup(projectId as string, setup as Parameters<typeof updateProjectSetup>[1]),
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const releaseMutation = useMutation({
    mutationFn: updateRelease,
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const createRequirementMutation = useMutation({
    mutationFn: createRequirement,
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const updateRequirementMutation = useMutation({
    mutationFn: updateRequirement,
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: ({ projectId, requirementId }: { projectId: string; requirementId: string }) => deleteRequirement(projectId, requirementId),
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const tagDefinitionMutation = useMutation({
    mutationFn: updateTagDefinition,
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const receiptMutation = useMutation({
    mutationFn: ({ projectId, releaseId }: { projectId: string; releaseId?: string }) => generateReleaseReceipt(projectId, releaseId),
    onSuccess: (data) => queryClient.setQueryData(["board"], data),
  });

  const data = boardQuery.data;
  const boards = data?.boards.length ? data.boards : [{ id: "primary" as BoardId, name: "Primary Board", description: "Mainline projects." }];
  const projectDbs = data?.projectDbs.length
    ? data.projectDbs
    : [{ id: "active" as const, name: "Active DB", description: "Reachable projects." }];
  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? boards[0];
  const activeBoardIndex = Math.max(0, boards.findIndex((board) => board.id === activeBoard.id));
  const boardProjects = data?.projects.filter((project) => project.boardId === activeBoard.id) ?? [];
  const projects = data ? filterProjects(boardProjects, search, statusFilter, tagFilter, readyOnly) : [];
  const selectedProject = boardProjects.find((project) => project.id === selectedProjectId) ?? boardProjects[0] ?? null;
  const compareProject =
    compareProjectId && compareProjectId !== selectedProject?.id
      ? data?.projects.find((project) => project.id === compareProjectId) ?? null
      : null;
  const metrics = data ? computeMetrics(data, boardProjects) : null;
  const allTags = Array.from(new Set([...(data?.tagDefinitions.map((tag) => tag.tag) ?? []), ...(data?.projects.flatMap((project) => project.tags) ?? [])])).sort();
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all" || tagFilter !== "all" || readyOnly;
  const filterSummary = hasFilters
    ? `${projects.length} of ${boardProjects.length} projects`
    : `${boardProjects.length} projects`;

  function cycleBoard(direction: 1 | -1) {
    const nextIndex = (activeBoardIndex + direction + boards.length) % boards.length;
    const nextBoard = boards[nextIndex];
    setActiveBoardId(nextBoard.id);
    const nextProject = data?.projects.find((project) => project.boardId === nextBoard.id) ?? null;
    setSelectedProjectId(nextProject?.id ?? null);
    setCompareProjectId(null);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTagFilter("all");
    setReadyOnly(false);
  }

  function submitNewCard() {
    const tags = newCard.tags.map((tag) => tag.trim()).filter(Boolean);
    if (!newCard.name.trim()) return;
    createProjectMutation.mutate({
      ...newCard,
      name: newCard.name.trim(),
      description: newCard.description.trim() || "New project card.",
      category: tags[0] ?? "Tooling",
      tags: tags.length ? tags : ["Tooling"],
      stack: tags.length ? tags.slice(0, 3) : ["Tooling"],
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const projectId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || !data) return;

    const destination = columns.find((column) => column.id === overId)?.id;
    if (!destination) return;

    const project = data.projects.find((candidate) => candidate.id === projectId);
    if (!project || project.status === destination) return;

    const nextOrder =
      Math.max(0, ...data.projects.filter((candidate) => candidate.status === destination).map((candidate) => candidate.cardOrder)) + 1;

    queryClient.setQueryData<BoardData>(["board"], {
      ...data,
      projects: data.projects.map((candidate) =>
        candidate.id === projectId ? { ...candidate, status: destination, cardOrder: nextOrder } : candidate,
      ),
    });

    moveMutation.mutate({ projectId, status: destination, cardOrder: nextOrder });
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
              <FolderKanban size={19} />
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
                <span>Board {activeBoardIndex + 1} of {boards.length}</span>
                <strong>{activeBoard.name}</strong>
              </div>
              <button className="icon-button" onClick={() => cycleBoard(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <details className="toolbar-menu">
              <summary>Workspace</summary>
              <div>
                {["Aptlantis", "Desktop Apps", "Website", "Archives", "Research"].map((name, index) => (
                  <button className={index === 0 ? "active" : ""} key={name}>
                    {name}
                    {index === 0 && <small>{metrics.total}</small>}
                  </button>
                ))}
              </div>
            </details>
            <details className="toolbar-menu">
              <summary>Views</summary>
              <div>
                {navViews.map(([name, Icon, getCount]) => (
                  <button
                    className={name === "Kanban" ? "active" : ""}
                    key={name}
                    onClick={() => {
                      if (name === "Backlog") setStatusFilter("backlog");
                      if (name === "Blocked") setStatusFilter("blocked");
                      if (name === "Completed") setStatusFilter("released");
                      if (name === "Kanban" || name === "Overview") setStatusFilter("all");
                    }}
                  >
                    <Icon size={15} />
                    {name}
                    <small>{getCount(metrics, boardProjects)}</small>
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
                      <small>{boardProjects.filter((project) => project.tags.includes(tag)).length}</small>
                    </button>
                  );
                })}
              </div>
            </details>
            <label className="search-box">
              <Search size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects, tasks, tags..." />
            </label>
            <details className="toolbar-menu">
              <summary>
                <Filter size={16} />
              </summary>
              <div>
                <label>
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "all")}>
                    <option value="all">All Statuses</option>
                    {columns.map((column) => (
                      <option value={column.id} key={column.id}>
                        {statusLabels[column.id]}
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
            <button className="primary-button" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              <RefreshCcw size={16} />
              {scanMutation.isPending ? "Scanning" : "Scan"}
            </button>
          </div>
        </header>

        <section className="metrics-strip">
          <Metric icon={<Database size={24} />} label="Total Projects" value={metrics.total} tone="violet" />
          <Metric icon={<Gauge size={24} />} label="Active" value={metrics.active} tone="blue" />
          <Metric icon={<FolderKanban size={24} />} label="In Progress" value={metrics.inProgress} tone="cyan" />
          <Metric icon={<Lock size={24} />} label="Blocked" value={metrics.blocked} tone="orange" />
          <Metric
            icon={<Sparkles size={24} />}
            label={`Ready to Ship | ${metrics.readyWithReceipt} receipted`}
            value={metrics.readyToShip}
            tone="green"
            active={readyOnly}
            onClick={() => setReadyOnly((value) => !value)}
          />
          <Metric icon={<Archive size={24} />} label="Project Data" value={`${metrics.storageUsedGb.toFixed(1)} GB`} tone="blue" />
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
            {columns.map((column) => {
              const columnProjects = projects
                .filter((project) => project.status === column.id)
                .sort((a, b) => a.cardOrder - b.cardOrder);
              return (
                <SortableContext items={columnProjects.map((project) => project.id)} strategy={verticalListSortingStrategy} key={column.id}>
                  <BoardColumnView
                    column={column}
                    projects={columnProjects}
                    selectedProjectId={selectedProject?.id ?? null}
                    onSelectProject={setSelectedProjectId}
                    hasActiveFilters={hasFilters}
                    tagDefinitions={data.tagDefinitions}
                  />
                </SortableContext>
              );
            })}
          </section>
        </DndContext>

        <footer className="workspace-footer">
          <span>Active Sprint: May 6 - May 19, 2026</span>
          <div className="progress-track">
            <span style={{ width: "48%" }} />
          </div>
          <span>Showing: {filterSummary}</span>
          {readyOnly && <span>{metrics.releaseBlocked} blocked | {metrics.missingEvidence} missing evidence</span>}
          <span>{activeBoard.name}</span>
          <button
            onClick={() => {
              setNewCard((card) => ({ ...card, boardId: activeBoard.id }));
              setShowNewCard((value) => !value);
            }}
          >
            <Plus size={15} />
            New Card
          </button>
        </footer>
        {showNewCard && (
          <section className="new-card-panel">
            <label>
              Name
              <input value={newCard.name} onChange={(event) => setNewCard({ ...newCard, name: event.target.value })} />
            </label>
            <label>
              Board
              <select value={newCard.boardId} onChange={(event) => setNewCard({ ...newCard, boardId: event.target.value as BoardId })}>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              DB
              <select value={newCard.dbId} onChange={(event) => setNewCard({ ...newCard, dbId: event.target.value as ProjectInput["dbId"] })}>
                {projectDbs.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Availability
              <select
                value={newCard.availability ?? "available"}
                onChange={(event) => setNewCard({ ...newCard, availability: event.target.value as ProjectInput["availability"] })}
              >
                <option value="available">Available</option>
                <option value="unreachable">Unreachable</option>
              </select>
            </label>
            <label>
              Status
              <select value={newCard.status} onChange={(event) => setNewCard({ ...newCard, status: event.target.value as ProjectStatus })}>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {statusLabels[column.id]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={newCard.priority} onChange={(event) => setNewCard({ ...newCard, priority: event.target.value as Project["priority"] })}>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
              </select>
            </label>
            <label className="full-field">
              Tags
              <input
                value={newCard.tags.join(", ")}
                onChange={(event) =>
                  setNewCard({
                    ...newCard,
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="full-field">
              Description
              <textarea value={newCard.description} onChange={(event) => setNewCard({ ...newCard, description: event.target.value })} />
            </label>
            <button className="secondary-button" onClick={() => setShowNewCard(false)}>
              Cancel
            </button>
            <button className="primary-button" onClick={submitNewCard} disabled={!newCard.name.trim() || createProjectMutation.isPending}>
              <Plus size={16} />
              Create Card
            </button>
          </section>
        )}
      </main>

      <aside className={`right-panel ${compareProject ? "has-comparison" : ""}`}>
        {selectedProject && (
          <ProjectInspector
            project={selectedProject}
            boards={boards}
            projectDbs={projectDbs}
            tagDefinitions={data.tagDefinitions}
            onUpdateProjectBasics={(update) => {
              basicsMutation.mutate(update);
              if (update.boardId !== activeBoardId) {
                setActiveBoardId(update.boardId);
                setCompareProjectId(null);
              }
            }}
            onUpdateProjectSetup={(projectId, setup) => setupMutation.mutate({ projectId, setup })}
            onUpdateRelease={(release) => releaseMutation.mutate(release)}
            onGenerateReceipt={(projectId, releaseId) => receiptMutation.mutate({ projectId, releaseId })}
            onCreateRequirement={(projectId) => createRequirementMutation.mutate(projectId)}
            onUpdateRequirement={(requirement) => updateRequirementMutation.mutate(requirement)}
            onDeleteRequirement={(projectId, requirementId) => deleteRequirementMutation.mutate({ projectId, requirementId })}
            onUpdateTagDefinition={(tagDefinition) => tagDefinitionMutation.mutate(tagDefinition)}
            isPinnedForCompare={compareProjectId === selectedProject.id}
            onPinCompare={setCompareProjectId}
            onClearCompare={() => setCompareProjectId(null)}
            isGeneratingReceipt={receiptMutation.isPending}
          />
        )}
        {compareProject && (
          <ProjectInspector
            project={compareProject}
            boards={boards}
            projectDbs={projectDbs}
            tagDefinitions={data.tagDefinitions}
            onUpdateProjectBasics={(update) => basicsMutation.mutate(update)}
            onUpdateProjectSetup={(projectId, setup) => setupMutation.mutate({ projectId, setup })}
            onUpdateRelease={(release) => releaseMutation.mutate(release)}
            onGenerateReceipt={(projectId, releaseId) => receiptMutation.mutate({ projectId, releaseId })}
            onCreateRequirement={(projectId) => createRequirementMutation.mutate(projectId)}
            onUpdateRequirement={(requirement) => updateRequirementMutation.mutate(requirement)}
            onDeleteRequirement={(projectId, requirementId) => deleteRequirementMutation.mutate({ projectId, requirementId })}
            onUpdateTagDefinition={(tagDefinition) => tagDefinitionMutation.mutate(tagDefinition)}
            compareMode
            isPinnedForCompare
            onPinCompare={setCompareProjectId}
            onClearCompare={() => setCompareProjectId(null)}
            isGeneratingReceipt={receiptMutation.isPending}
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
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className={`metric-icon tone-${tone}`}>{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button className={`metric-card metric-button ${active ? "active" : ""}`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <article className="metric-card">
      {content}
    </article>
  );
}
