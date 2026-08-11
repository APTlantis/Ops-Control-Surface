import { Plus } from "lucide-react";
import { useState } from "react";
import { defaultLaneForType, laneAcceptsObject, lanesForBoard, normalizeDraftForSave, objectRegistry, objectTypes } from "../objectRegistry";
import { BoardId, CreateObjectInput, ObjectType, OperationalObject } from "../types";
import { FieldGroupsEditor } from "./ObjectFields";

export function NewObjectPanel({
  activeBoardId,
  initialLaneId,
  onCancel,
  onCreate,
  isCreating,
}: {
  activeBoardId: BoardId;
  initialLaneId: string;
  onCancel: () => void;
  onCreate: (input: CreateObjectInput) => void;
  isCreating: boolean;
}) {
  const firstAllowedType = objectTypes.find((definition) => {
    const lane = lanesForBoard(activeBoardId).find((item) => item.id === initialLaneId);
    return !lane || laneAcceptsObject(lane, definition.type);
  })?.type ?? "project";
  const [draft, setDraft] = useDraft(firstAllowedType, activeBoardId, initialLaneId);
  const definition = objectRegistry[draft.objectType];
  const lanes = lanesForBoard(activeBoardId).filter((lane) => !lane.placeholder && laneAcceptsObject(lane, draft.objectType));

  function changeType(objectType: ObjectType) {
    const lane = defaultLaneForType(objectType, activeBoardId);
    setDraft(objectRegistry[objectType].createEmpty({ board: activeBoardId, lane }));
  }

  function submit() {
    const next = normalizeDraftForSave(draft);
    if (!next.identity.name) return;
    onCreate({
      objectType: next.objectType,
      identity: next.identity,
      board: next.board,
      metadata: {
        tags: next.metadata.tags,
        notes: next.metadata.notes,
      },
      payload: next.payload,
    });
  }

  return (
    <section className="new-card-panel typed-create-panel">
      <label>
        Object Type
        <select value={draft.objectType} onChange={(event) => changeType(event.target.value as ObjectType)}>
          {objectTypes.map((type) => (
            <option key={type.type} value={type.type}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Lane
        <select value={draft.board.lane} onChange={(event) => setDraft({ ...draft, board: { ...draft.board, lane: event.target.value } })}>
          {lanes.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.title}
            </option>
          ))}
        </select>
      </label>
      <FieldGroupsEditor object={draft} groups={definition.creationGroups} onChange={setDraft} />
      <button className="secondary-button" onClick={onCancel}>
        Cancel
      </button>
      <button className="primary-button" onClick={submit} disabled={!draft.identity.name.trim() || isCreating}>
        <Plus size={16} />
        Create {definition.shortLabel}
      </button>
    </section>
  );
}

function useDraft(objectType: ObjectType, boardId: BoardId, laneId: string): [OperationalObject, (draft: OperationalObject) => void] {
  const [draft, setDraft] = useState<OperationalObject>(() => {
    const lane = laneId || defaultLaneForType(objectType, boardId);
    return objectRegistry[objectType].createEmpty({ board: boardId, lane });
  });
  return [draft, setDraft];
}
