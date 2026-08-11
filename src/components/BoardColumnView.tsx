import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { BoardLane, OperationalObject, TagDefinition } from "../types";
import { ObjectCard } from "./ObjectCard";

export function BoardColumnView({
  lane,
  objects,
  selectedObjectId,
  onSelectObject,
  onNewObject,
  hasActiveFilters,
  tagDefinitions,
}: {
  lane: BoardLane;
  objects: OperationalObject[];
  selectedObjectId: string | null;
  onSelectObject: (objectId: string) => void;
  onNewObject: (laneId: string) => void;
  hasActiveFilters: boolean;
  tagDefinitions: TagDefinition[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });

  return (
    <div className={`board-column ${isOver ? "is-over" : ""} ${lane.placeholder ? "placeholder-lane" : ""}`} ref={setNodeRef}>
      <header>
        <div>
          <h2>{lane.title}</h2>
          <span>{objects.length}</span>
        </div>
        {!lane.placeholder && (
          <button title={`Add object to ${lane.title}`} onClick={() => onNewObject(lane.id)}>
            <Plus size={16} />
          </button>
        )}
      </header>
      <div className="column-cards">
        {objects.map((object) => (
          <ObjectCard
            key={object.id}
            object={object}
            tagDefinitions={tagDefinitions}
            selected={object.id === selectedObjectId}
            onSelect={() => onSelectObject(object.id)}
          />
        ))}
        {objects.length === 0 && (
          <div className="empty-column">
            <strong>{lane.placeholder ? "Stock area scaffolded" : hasActiveFilters ? "No matches" : "No objects"}</strong>
            <span>
              {lane.placeholder
                ? "Reference material gets a lane now; its dedicated object type comes later."
                : hasActiveFilters
                  ? "Try clearing filters or search."
                  : "Drop an object here when it belongs in this lane."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
