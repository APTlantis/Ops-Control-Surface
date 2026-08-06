import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { BoardColumn, Project, TagDefinition } from "../types";
import { ProjectCard } from "./ProjectCard";

export function BoardColumnView({
  column,
  projects,
  selectedProjectId,
  onSelectProject,
  hasActiveFilters,
  tagDefinitions,
}: {
  column: BoardColumn;
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  hasActiveFilters: boolean;
  tagDefinitions: TagDefinition[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className={`board-column ${isOver ? "is-over" : ""}`} ref={setNodeRef}>
      <header>
        <div>
          <h2>{column.title}</h2>
          <span>{projects.length}</span>
        </div>
        <button title={`Add project to ${column.title}`}>
          <Plus size={16} />
        </button>
      </header>
      <div className="column-cards">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            tagDefinitions={tagDefinitions}
            selected={project.id === selectedProjectId}
            onSelect={() => onSelectProject(project.id)}
          />
        ))}
        {projects.length === 0 && (
          <div className="empty-column">
            <strong>{hasActiveFilters ? "No matches" : "No projects"}</strong>
            <span>{hasActiveFilters ? "Try clearing filters or search." : "Drop a project here when it is ready."}</span>
          </div>
        )}
      </div>
    </div>
  );
}
