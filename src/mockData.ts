import { boardLanes, objectRegistry } from "./objectRegistry";
import { BoardData, BoardId, OperationalObject, ObjectType, TagDefinition } from "./types";

const now = "2026-08-10T09:54:00";

const tagColors: Record<string, string> = {
  CityHall: "#9d7dff",
  Governance: "#43a7ff",
  Operator: "#20d4db",
  Project: "#82d158",
  Reference: "#d3a72d",
  Standard: "#25d5c9",
  Workspace: "#8b5cf6",
};

function seedBase(type: ObjectType, id: string, name: string, summary: string, board: BoardId, lane: string, order: number): OperationalObject {
  const draft = objectRegistry[type].createEmpty({ board, lane });
  return {
    ...draft,
    id,
    identity: {
      ...draft.identity,
      id,
      name,
      summary,
    },
    metadata: {
      ...draft.metadata,
      tags: [objectRegistry[type].shortLabel],
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
    cardOrder: order,
  };
}

function project(id: string, name: string, lane: string, order: number, summary: string, lifecycle: string, attention: string): OperationalObject {
  const item = seedBase("project", id, name, summary, "primary", lane, order);
  if (item.objectType !== "project") return item;
  return {
    ...item,
    metadata: { ...item.metadata, tags: ["Project", "Workspace"] },
    payload: {
      ...item.payload,
      classification: {
        ...item.payload.classification,
        kind: "desktop app",
        lifecycle,
        attention,
        availability: "active",
      },
      location: {
        root: `K:\\Aptlantis\\Workspace\\${name.replaceAll(" ", "")}`,
        repository: "",
      },
      governance: {
        cityHallStatus: "unreviewed",
      },
    },
  };
}

function operator(id: string, name: string, order: number, summary: string, script: string, mutation = "read-only"): OperationalObject {
  const item = seedBase("powershell-operator", id, name, summary, "primary", "powershell", order);
  if (item.objectType !== "powershell-operator") return item;
  return {
    ...item,
    metadata: { ...item.metadata, tags: ["Operator", "Workspace"] },
    payload: {
      ...item.payload,
      source: { script },
      execution: {
        ...item.payload.execution,
        scope: "workspace",
        workingDirectory: "K:\\Aptlantis\\Workspace",
        mutation,
      },
    },
  };
}

function cityHall(id: string, name: string, acronym: string, order: number, summary: string, path: string): OperationalObject {
  const item = seedBase("city-hall", id, name, summary, "primary", "city-hall", order);
  if (item.objectType !== "city-hall") return item;
  return {
    ...item,
    identity: { ...item.identity, acronym },
    metadata: { ...item.metadata, tags: ["CityHall", "Governance", "Standard"] },
    payload: {
      ...item.payload,
      document: {
        path,
        version: "0.1",
        status: "draft",
      },
      governance: {
        domain: "workspace governance",
        maturity: "usable",
        adoption: "partial",
        standardized: false,
      },
      operation: {
        attention: "current",
      },
    },
  };
}

function secondaryProject(id: string, name: string, lane: string, order: number, summary: string): OperationalObject {
  const item = seedBase("project", id, name, summary, "secondary", lane, order);
  if (item.objectType !== "project") return item;
  return {
    ...item,
    metadata: { ...item.metadata, tags: ["Project", "Reference"] },
    payload: {
      ...item.payload,
      classification: {
        ...item.payload.classification,
        kind: "tool",
        lifecycle: "parked",
        attention: "",
        availability: "",
      },
    },
  };
}

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
      name: "Operations Control",
      description: "Typed operational objects surfaced for current control work.",
    },
    {
      id: "secondary",
      name: "Broader Work Board",
      description: "Unfinished, internal, experimental, paused, or otherwise non-primary work.",
    },
  ],
  lanes: boardLanes,
  tagDefinitions: Object.entries(tagColors)
    .map(([tag, color]): TagDefinition => ({ tag, color, description: null }))
    .sort((a, b) => a.tag.localeCompare(b.tag)),
  objects: [
    cityHall(
      "workspace-governance-standard",
      "Workspace Governance Standard",
      "WGS",
      1,
      "Governs workspace structure, provenance, and operating rules.",
      "D:\\.library\\aptlantis_core\\WGS\\Workspace Governance Standard.md",
    ),
    cityHall(
      "project-proposal-standard",
      "Project Proposal Standard",
      "PPS",
      2,
      "Defines how project proposals become governable work.",
      "D:\\.library\\aptlantis_core\\PPS\\Project Proposal Standard.md",
    ),
    operator(
      "workspace-inventory",
      "Workspace Inventory",
      1,
      "Read-only inventory of local workspace roots and manifests.",
      "K:\\Aptlantis\\Operators\\workspace-inventory.ps1",
    ),
    operator(
      "artifact-packager",
      "Artifact Packager",
      2,
      "Packages generated workspace artifacts into an output directory.",
      "K:\\Aptlantis\\Operators\\artifact-packager.ps1",
      "generates-output",
    ),
    project("filecabinet", "FileCabinet", "project-1", 1, "Personal vault and artifact manager for curated archives.", "in progress", "next"),
    project("structa", "Structa", "project-2", 1, "Structured data builder for JSON, XML, TOML, and YAML.", "in progress", "current"),
    project("aegis", "Aegis", "project-3", 1, "Key manager and security operations surface.", "draft", "watch"),
    secondaryProject("asset-forge", "Asset Forge", "work-1", 1, "Logo, icon, and app asset normalization utilities."),
    secondaryProject("schema-garden", "Schema Garden", "work-2", 1, "Reusable schema catalog and validation playground."),
    secondaryProject("release-radar", "Release Radar", "work-3", 1, "Low-friction release candidate watchlist."),
  ],
};
