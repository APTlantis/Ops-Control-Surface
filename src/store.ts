import { create } from "zustand";
import { BoardId, ObjectType } from "./types";

interface UiState {
  selectedObjectId: string | null;
  compareObjectId: string | null;
  activeBoardId: BoardId;
  search: string;
  typeFilter: ObjectType | "all";
  tagFilter: string | "all";
  activeTab: string;
  setSelectedObjectId: (objectId: string | null) => void;
  setCompareObjectId: (objectId: string | null) => void;
  setActiveBoardId: (boardId: BoardId) => void;
  setSearch: (search: string) => void;
  setTypeFilter: (type: ObjectType | "all") => void;
  setTagFilter: (tag: string | "all") => void;
  setActiveTab: (tab: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedObjectId: "workspace-governance-standard",
  compareObjectId: null,
  activeBoardId: "primary",
  search: "",
  typeFilter: "all",
  tagFilter: "all",
  activeTab: "overview",
  setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
  setCompareObjectId: (compareObjectId) => set({ compareObjectId }),
  setActiveBoardId: (activeBoardId) => set({ activeBoardId }),
  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
  setActiveTab: (activeTab) => set({ activeTab }),
}));
