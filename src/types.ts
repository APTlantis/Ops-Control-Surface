export type BoardId = "primary" | "secondary";

export type ObjectType = "project" | "powershell-operator" | "city-hall";

export type FieldKind = "text" | "textarea" | "checkbox" | "tags";

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  storageUsedGb: number;
}

export interface BoardDefinition {
  id: BoardId;
  name: string;
  description: string;
}

export interface BoardLane {
  id: string;
  boardId: BoardId;
  title: string;
  tone: string;
  allowedTypes?: ObjectType[];
  placeholder?: boolean;
}

export interface ObjectIdentity {
  id: string;
  name: string;
  acronym?: string;
  summary: string;
}

export interface ObjectBoardPlacement {
  board: BoardId;
  lane: string;
  pinned: boolean;
}

export interface ObjectMetadata {
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPayload {
  classification: {
    kind: string;
    lifecycle: string;
    attention: string;
    availability: string;
  };
  location: {
    root: string;
    repository: string;
  };
  release: {
    released: boolean;
    version: string;
    targetVersion: string;
  };
  operation: {
    defaultIde: string;
    defaultTerminal: string;
  };
  governance: {
    cityHallStatus: string;
  };
}

export interface PowerShellOperatorPayload {
  source: {
    script: string;
  };
  execution: {
    scope: string;
    workingDirectory: string;
    elevation: string;
    mutation: string;
    shell: string;
  };
  parameters: {
    discovery: string;
  };
  output: {
    kind: string;
    artifactPath: string;
  };
  state: {
    enabled: boolean;
    lastRun: string;
    lastResult: string;
  };
}

export interface CityHallPayload {
  document: {
    path: string;
    version: string;
    status: string;
  };
  governance: {
    domain: string;
    maturity: string;
    adoption: string;
    standardized: boolean;
  };
  operation: {
    attention: string;
  };
}

export type ObjectPayload = ProjectPayload | PowerShellOperatorPayload | CityHallPayload;

export interface OperationalObjectBase<TType extends ObjectType, TPayload extends ObjectPayload> {
  id: string;
  objectType: TType;
  schema: string;
  schemaVersion: string;
  identity: ObjectIdentity;
  board: ObjectBoardPlacement;
  metadata: ObjectMetadata;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  cardOrder: number;
}

export type ProjectObject = OperationalObjectBase<"project", ProjectPayload>;
export type PowerShellOperatorObject = OperationalObjectBase<"powershell-operator", PowerShellOperatorPayload>;
export type CityHallObject = OperationalObjectBase<"city-hall", CityHallPayload>;
export type OperationalObject = ProjectObject | PowerShellOperatorObject | CityHallObject;

export interface FieldDefinition {
  path: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
}

export interface FieldGroup {
  title: string;
  fields: FieldDefinition[];
}

export interface InspectorTabDefinition {
  id: string;
  label: string;
  capability: string;
  groupTitles?: string[];
}

export interface ObjectTypeDefinition {
  type: ObjectType;
  schema: string;
  schemaVersion: string;
  label: string;
  shortLabel: string;
  accent: string;
  defaultLane: string;
  inspectorTabs: InspectorTabDefinition[];
  creationGroups: FieldGroup[];
  inspectorGroups: FieldGroup[];
  createEmpty: (placement: Pick<ObjectBoardPlacement, "board" | "lane">) => OperationalObject;
}

export interface CreateObjectInput {
  objectType: ObjectType;
  identity: ObjectIdentity;
  board: ObjectBoardPlacement;
  metadata: {
    tags: string[];
    notes: string;
  };
  payload: ObjectPayload;
}

export interface UpdateObjectInput {
  id: string;
  identity: ObjectIdentity;
  board: ObjectBoardPlacement;
  metadata: {
    tags: string[];
    notes: string;
  };
  payload: ObjectPayload;
}

export interface MoveObjectInput {
  objectId: string;
  boardId: BoardId;
  laneId: string;
  cardOrder: number;
}

export interface TagDefinition {
  tag: string;
  color: string;
  description?: string | null;
}

export interface BoardData {
  workspace: Workspace;
  boards: BoardDefinition[];
  lanes: BoardLane[];
  objects: OperationalObject[];
  tagDefinitions: TagDefinition[];
}

export interface BoardMetrics {
  total: number;
  projects: number;
  operators: number;
  cityHall: number;
  pinned: number;
  attention: number;
  storageUsedGb: number;
}
