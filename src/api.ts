import { invoke } from "@tauri-apps/api/core";
import { mockBoardData } from "./mockData";
import { objectRegistry, slugify } from "./objectRegistry";
import { BoardData, CreateObjectInput, MoveObjectInput, OperationalObject, TagDefinition, UpdateObjectInput } from "./types";

const isTauri = "__TAURI_INTERNALS__" in window;

let browserData: BoardData = structuredClone(mockBoardData);

function uniqueId(candidate: string, existingObjects: OperationalObject[]) {
  const base = slugify(candidate) || `object-${existingObjects.length + 1}`;
  if (!existingObjects.some((object) => object.id === base)) return base;
  let suffix = 2;
  while (existingObjects.some((object) => object.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function withTagDefinitions(data: BoardData, tags: string[]) {
  const tagDefinitions = [...data.tagDefinitions];
  for (const tag of tags) {
    if (!tagDefinitions.some((definition) => definition.tag === tag)) {
      tagDefinitions.push({ tag, color: "#8b5cf6", description: null });
    }
  }
  return tagDefinitions.sort((a, b) => a.tag.localeCompare(b.tag));
}

function objectFromInput(input: CreateObjectInput, existingObjects: OperationalObject[]): OperationalObject {
  const definition = objectRegistry[input.objectType];
  const now = new Date().toISOString();
  const id = uniqueId(input.identity.id || input.identity.name, existingObjects);
  const cardOrder =
    Math.max(
      0,
      ...existingObjects
        .filter((object) => object.board.board === input.board.board && object.board.lane === input.board.lane)
        .map((object) => object.cardOrder),
    ) + 1;

  return {
    id,
    objectType: input.objectType,
    schema: definition.schema,
    schemaVersion: definition.schemaVersion,
    identity: {
      ...input.identity,
      id: input.identity.id || id,
      name: input.identity.name,
      summary: input.identity.summary,
    },
    board: input.board,
    metadata: {
      ...input.metadata,
      createdAt: now,
      updatedAt: now,
    },
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    cardOrder,
  } as OperationalObject;
}

export async function getBoardData(): Promise<BoardData> {
  if (!isTauri) return browserData;
  return invoke<BoardData>("get_board_data");
}

export async function createObject(input: CreateObjectInput): Promise<BoardData> {
  if (!isTauri) {
    const object = objectFromInput(input, browserData.objects);
    browserData = {
      ...browserData,
      tagDefinitions: withTagDefinitions(browserData, object.metadata.tags),
      objects: [...browserData.objects, object],
    };
    return browserData;
  }

  return invoke<BoardData>("create_object", { input });
}

export async function updateObject(update: UpdateObjectInput): Promise<BoardData> {
  if (!isTauri) {
    const now = new Date().toISOString();
    browserData = {
      ...browserData,
      tagDefinitions: withTagDefinitions(browserData, update.metadata.tags),
      objects: browserData.objects.map((object) =>
        object.id === update.id
          ? {
              ...object,
              identity: update.identity,
              board: update.board,
              metadata: {
                ...update.metadata,
                createdAt: object.metadata.createdAt,
                updatedAt: now,
              },
              payload: update.payload,
              updatedAt: now,
            } as OperationalObject
          : object,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("update_object", { update });
}

export async function moveObject(input: MoveObjectInput): Promise<BoardData> {
  if (!isTauri) {
    const now = new Date().toISOString();
    browserData = {
      ...browserData,
      objects: browserData.objects.map((object) =>
        object.id === input.objectId
          ? {
              ...object,
              board: {
                ...object.board,
                board: input.boardId,
                lane: input.laneId,
              },
              cardOrder: input.cardOrder,
              updatedAt: now,
              metadata: {
                ...object.metadata,
                updatedAt: now,
              },
            }
          : object,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("move_object", { input });
}

export async function updateTagDefinition(tagDefinition: TagDefinition): Promise<BoardData> {
  if (!isTauri) {
    const existing = browserData.tagDefinitions.some((item) => item.tag === tagDefinition.tag);
    browserData = {
      ...browserData,
      tagDefinitions: existing
        ? browserData.tagDefinitions.map((item) => (item.tag === tagDefinition.tag ? tagDefinition : item))
        : [...browserData.tagDefinitions, tagDefinition].sort((a, b) => a.tag.localeCompare(b.tag)),
    };
    return browserData;
  }

  return invoke<BoardData>("update_tag_definition", { tagDefinition });
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri) {
    console.info("Open path requested:", path);
    return;
  }

  await invoke("open_path", { path });
}
