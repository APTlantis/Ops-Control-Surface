import { BoardColumn, BoardData, BoardId, CardField, CardType, Project, RequirementSeverity } from "./types";

export const columns: BoardColumn[] = [
  { id: "backlog", title: "Backlog", tone: "violet" },
  { id: "planned", title: "Planned", tone: "blue" },
  { id: "in-progress", title: "In Progress", tone: "cyan" },
  { id: "review", title: "Review / Evidence", tone: "amber" },
  { id: "released", title: "Released", tone: "green" },
  { id: "blocked", title: "Blocked", tone: "rose" },
];

const now = "2026-08-06T09:54:00";

const tagColors: Record<string, string> = {
  Archival: "#20d4db",
  Browser: "#f0657f",
  Cleanup: "#82d158",
  CLI: "#43a7ff",
  Docs: "#9d7dff",
  Evidence: "#25d5c9",
  Hashing: "#d3a72d",
  Ingestion: "#e765c7",
  Metadata: "#31c9f4",
  Mirroring: "#8b5cf6",
  Plugin: "#ff8c32",
  Released: "#82d158",
  Security: "#e8ad2d",
  Tauri: "#43a7ff",
  Tooling: "#8b5cf6",
  UI: "#21b7c6",
  Website: "#d3a72d",
  WPF: "#20d4db",
  WSL: "#86c861",
};

const typeForTags = (tags: string[]): CardType => {
  if (tags.includes("Released")) return "release";
  if (tags.includes("Evidence")) return "evidence";
  if (tags.includes("Security")) return "requirement";
  return "project";
};

const fieldsForType = (cardType: CardType): CardField[] => {
  if (cardType === "release") return ["release", "requirements", "evidence", "tags"];
  if (cardType === "requirement") return ["requirements", "priority", "owner", "tags"];
  if (cardType === "evidence") return ["evidence", "requirements", "release", "tags"];
  if (cardType === "task") return ["tasks", "priority", "owner", "tags"];
  return ["description", "tags", "tasks", "release", "requirements"];
};

const severityForPriority = (priority: Project["priority"]): RequirementSeverity => {
  if (priority === "P1") return "critical";
  if (priority === "P2") return "high";
  if (priority === "P3") return "medium";
  return "low";
};

const project = (
  id: string,
  name: string,
  boardId: BoardId,
  status: Project["status"],
  priority: Project["priority"],
  description: string,
  tags: string[],
  order: number,
  accent = "cyan",
): Project => ({
  id,
  boardId,
  dbId: "active",
  availability: "available",
  name,
  cardType: typeForTags(tags),
  displayConfig: {
    cardType: typeForTags(tags),
    visibleFields: fieldsForType(typeForTags(tags)),
  },
  status,
  priority,
  description,
  tags,
  category: tags[0] ?? "Tooling",
  stack: tags.slice(0, 3),
  rootPath: `K:\\Aptlantis\\Workspace\\${name.replaceAll(" ", "")}`,
  createdAt: "2026-03-01T09:12:00",
  updatedAt: now,
  cardOrder: order,
  owner: "aptlantis",
  accent,
  blockedReason: status === "blocked" ? "Dependency or API change needs attention." : null,
  customFields: [
    {
      id: `${id}-field-source`,
      projectId: id,
      label: "Canonical Source",
      value: "project manifest",
      fieldType: "text",
      showOnCard: false,
      position: 1,
    },
  ],
  requirements: [
    {
      id: `${id}-req-manifest`,
      projectId: id,
      title: "Project manifest is current",
      status: status === "backlog" ? "open" : "satisfied",
      severity: severityForPriority(priority),
      blocking: priority === "P1" || status === "blocked",
      source: "project manifest",
      evidencePath: `project/${id}.manifest.toml`,
      notes: "Required for release readiness and card metadata provenance.",
      updatedAt: now,
    },
    {
      id: `${id}-req-evidence`,
      projectId: id,
      title: "Release evidence is captured",
      status: ["review", "released"].includes(status) ? "satisfied" : "open",
      severity: status === "blocked" ? "critical" : "medium",
      blocking: status === "blocked",
      source: "evidence/release",
      evidencePath: "evidence/release",
      notes: status === "blocked" ? "Missing or stale evidence is blocking the next release." : "Evidence should be linked before release.",
      updatedAt: now,
    },
  ],
  documents: [
    {
      id: `${id}-manifest`,
      projectId: id,
      kind: "manifest",
      title: `${name}.manifest.toml`,
      path: `project/${id}.manifest.toml`,
      updatedAt: "2026-07-15",
      exists: true,
    },
    {
      id: `${id}-readme`,
      projectId: id,
      kind: "readme",
      title: "README.md",
      path: "README.md",
      updatedAt: "2026-07-10",
      exists: true,
    },
    {
      id: `${id}-evidence`,
      projectId: id,
      kind: "evidence",
      title: "Release Evidence",
      path: "evidence/release",
      updatedAt: "2026-06-30",
      exists: status !== "backlog",
    },
  ],
  tasks: [
    {
      id: `${id}-task-1`,
      projectId: id,
      title: tags.includes("Archival") ? "Ingestion pipeline" : "Define project manifest",
      completed: status !== "backlog",
      source: "project/tasks.toml",
      position: 1,
    },
    {
      id: `${id}-task-2`,
      projectId: id,
      title: tags.includes("Evidence") ? "Evidence manifest" : "Document operator workflow",
      completed: ["review", "released"].includes(status),
      source: "project/tasks.toml",
      position: 2,
    },
    {
      id: `${id}-task-3`,
      projectId: id,
      title: "Package release notes",
      completed: status === "released",
      source: "project/releases.toml",
      position: 3,
    },
  ],
  releases: [
    {
      id: `${id}-release`,
      projectId: id,
      version: status === "released" ? "v1.0.0" : "v0.9.0",
      status: status === "released" ? "Released" : "Target",
      targetDate: status === "released" ? "2026-06-30" : "2026-08-30",
      readiness: status === "released" ? 100 : status === "review" ? 72 : status === "in-progress" ? 58 : 24,
      notes: "Focus this cycle on project metadata, evidence capture, and release readiness.",
    },
  ],
  receipts: [],
  activity: [
    {
      id: `${id}-activity-1`,
      projectId: id,
      message: "Indexed project documents and task metadata.",
      createdAt: "2026-08-06T03:41:00",
    },
  ],
});

export const mockBoardData: BoardData = {
  workspace: {
    id: "aptlantis",
    name: "Aptlantis Workspace",
    rootPath: "K:\\Aptlantis\\Workspace",
    storageUsedGb: 121.3,
  },
  boards: [
    {
      id: "primary",
      name: "Primary Board",
      description: "Mainline projects and current release-critical work.",
    },
    {
      id: "secondary",
      name: "Secondary Board",
      description: "Satellite, exploratory, parked, or lower-pressure projects.",
    },
  ],
  projectDbs: [
    {
      id: "active",
      name: "Active DB",
      description: "Reachable projects currently participating in normal workspace operations.",
    },
    {
      id: "archive",
      name: "Archive DB",
      description: "Historical or reference projects kept for lookup.",
    },
    {
      id: "holding",
      name: "Holding DB",
      description: "Unreachable or parked projects retained until they come back.",
    },
  ],
  tagDefinitions: Object.entries(tagColors)
    .map(([tag, color]) => ({ tag, color, description: null }))
    .sort((a, b) => a.tag.localeCompare(b.tag)),
  projects: [
    project("archivehasher", "ArchiveHasher", "primary", "backlog", "P3", "AAMHS v2.0 publication tooling", ["Tooling", "Hashing"], 1, "violet"),
    project("clonecrates", "CloneCrates", "primary", "backlog", "P3", "Rust crates mirror and analytics", ["Tooling", "Mirroring"], 2, "violet"),
    project("chat-archive", "Chat Archive", "primary", "backlog", "P3", "Import/export and viewer for AI chat archives", ["Tooling", "Ingestion"], 3, "violet"),
    project("squashfs", "SquashfsBasedWSL", "primary", "backlog", "P4", "Multiple squashfs distros converted to WSL", ["Tooling", "WSL"], 4, "green"),
    project("disk-planner", "Disk Planner", "primary", "planned", "P2", "Plan first, execute second, record everything.", ["Tooling", "UI"], 1, "amber"),
    project("wintrim", "Wintrim", "primary", "planned", "P2", "Evidence-backed Windows 11 ISO customization", ["Tooling", "Cleanup"], 2, "green"),
    project("aptconsole", "AptConsole", "primary", "planned", "P2", "Operations dashboard for local dev and infrastructure", ["Tooling", "CLI"], 3, "blue"),
    project("command-wizard", "Command Wizard", "primary", "planned", "P3", "Schema-driven command builder", ["Tooling", "UI"], 4, "amber"),
    project("filecabinet", "FileCabinet", "primary", "in-progress", "P1", "Personal vault and artifact manager for curated archives.", ["WPF", "Archival", "Metadata"], 1, "cyan"),
    project("structa", "Structa", "primary", "in-progress", "P1", "Structured data builder for JSON, XML, TOML, YAML", ["WPF", "Metadata", "UI"], 2, "cyan"),
    project("aegis", "Aegis", "primary", "in-progress", "P1", "PGP and post-quantum key manager", ["Tauri", "Security"], 3, "amber"),
    project("city-hall", "City Hall Website", "primary", "review", "P2", "Workspace governance and agent standards", ["Website", "WPF"], 1, "green"),
    project("docs-hub", "Aptlantis Docs Hub", "primary", "review", "P2", "Project documentation hub and publishing flow", ["Docs", "Website"], 2, "violet"),
    project("evidence-pipeline", "Evidence Pipeline", "primary", "review", "P1", "Tamper-evident release evidence capture", ["Archival", "Evidence"], 3, "cyan"),
    project("aptconsole-release", "AptConsole v1.1.0", "primary", "released", "P2", "Plugin system and profiles", ["Tooling", "Released"], 1, "green"),
    project("filecabinet-release", "FileCabinet v0.9.0", "primary", "released", "P2", "Ingestion and metadata foundation", ["WPF", "Archival", "Released"], 2, "green"),
    project("chrome-plugin", "Chrome Archival Plugin", "primary", "blocked", "P2", "Browser capture extension integration", ["Browser", "Plugin"], 1, "rose"),
    project("city-mobile", "City Hall Mobile View", "primary", "blocked", "P3", "Responsive layout and touch navigation", ["Website", "UI"], 2, "rose"),
    project("asset-forge", "Asset Forge", "secondary", "backlog", "P4", "Logo, icon, and app asset normalization utilities", ["Tooling", "UI"], 1, "cyan"),
    project("note-loom", "Note Loom", "secondary", "backlog", "P4", "Structured scratch notes and research capture", ["Docs", "Metadata"], 2, "violet"),
    project("schema-garden", "Schema Garden", "secondary", "backlog", "P3", "Reusable schema catalog and validation playground", ["Metadata", "Tooling"], 3, "green"),
    project("clip-vault", "Clip Vault", "secondary", "planned", "P3", "Clipboard artifact capture and deduplication", ["Archival", "Ingestion"], 1, "amber"),
    project("prompt-ledger", "Prompt Ledger", "secondary", "planned", "P3", "Prompt version tracking and evaluation notes", ["Docs", "Evidence"], 2, "violet"),
    project("sandbox-watch", "Sandbox Watch", "secondary", "planned", "P4", "Local environment and permissions inventory", ["Security", "Tooling"], 3, "rose"),
    project("release-radar", "Release Radar", "secondary", "in-progress", "P3", "Low-friction release candidate watchlist", ["Released", "Evidence"], 1, "green"),
    project("archive-ui-lab", "Archive UI Lab", "secondary", "in-progress", "P4", "Experimental views for archive-heavy workflows", ["UI", "Archival"], 2, "cyan"),
    project("docs-cleanroom", "Docs Cleanroom", "secondary", "review", "P3", "Documentation cleanup and duplicate reference checks", ["Docs", "Cleanup"], 1, "blue"),
    project("mirror-audit", "Mirror Audit", "secondary", "review", "P3", "Repository mirror consistency and hash sampling", ["Mirroring", "Hashing"], 2, "amber"),
    project("old-builds", "Old Build Inventory", "secondary", "released", "P4", "Historical package and installer inventory", ["Released", "Archival"], 1, "green"),
    project("extension-spike", "Extension Spike", "secondary", "blocked", "P4", "Experimental browser extension capture paths", ["Browser", "Plugin"], 1, "rose"),
  ],
};
