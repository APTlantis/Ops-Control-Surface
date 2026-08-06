import { create } from "zustand";
import { BoardId, ProjectStatus } from "./types";

interface UiState {
  selectedProjectId: string | null;
  compareProjectId: string | null;
  activeBoardId: BoardId;
  search: string;
  statusFilter: ProjectStatus | "all";
  tagFilter: string | "all";
  activeTab: "overview" | "tasks" | "files" | "evidence" | "receipt" | "releases" | "requirements" | "setup" | "tags" | "activity";
  setSelectedProjectId: (projectId: string | null) => void;
  setCompareProjectId: (projectId: string | null) => void;
  setActiveBoardId: (boardId: BoardId) => void;
  setSearch: (search: string) => void;
  setStatusFilter: (status: ProjectStatus | "all") => void;
  setTagFilter: (tag: string | "all") => void;
  setActiveTab: (tab: UiState["activeTab"]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedProjectId: "filecabinet",
  compareProjectId: null,
  activeBoardId: "primary",
  search: "",
  statusFilter: "all",
  tagFilter: "all",
  activeTab: "overview",
  setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
  setCompareProjectId: (compareProjectId) => set({ compareProjectId }),
  setActiveBoardId: (activeBoardId) => set({ activeBoardId }),
  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
