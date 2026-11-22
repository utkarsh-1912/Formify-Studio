import { create } from "zustand";
import validateSchema from "../utils/schemaValidation";
import { migrateSchema } from "../utils/formifySchema";
import type { ThemeSettings } from "../utils/codeGenerators";
import type { GlobalThemeMode } from "../utils/appTheme";
import type { SubmissionEntry } from "../components/SubmissionsDashboard";
import {
  FormifyDB,
  KeyValueStorage,
  WorkspacePatch,
  getDb,
  loadWorkspace,
  saveWorkspacePatch
} from "./persistence";

export type FontFamily = "sans" | "mono" | "serif";

// Clean canvas schema as default for new workspaces
export const cleanDefaultSchema: any = {
  formTitle: "New Form",
  formDescription: "Please fill out this form.",
  fields: []
};

export const defaultTheme: ThemeSettings = {
  primaryColor: "indigo",
  borderRadius: "md",
  layout: "1-col",
  shadow: "md"
};

/** Shape of the state broadcast over P2P (kept identical to the pre-store contract). */
export interface RemoteWorkspaceState {
  schema?: any;
  theme?: ThemeSettings;
  fontFamily?: FontFamily;
  fontScale?: number;
  globalTheme?: GlobalThemeMode;
  submissions?: SubmissionEntry[];
}

export interface WorkspaceState {
  workspaceId: string | undefined;
  hydrated: boolean;
  schema: any;
  jsonSchema: string;
  error: string | null;
  roomName: string;
  themeSettings: ThemeSettings;
  globalTheme: GlobalThemeMode;
  fontFamily: FontFamily;
  fontScale: number;
  submissions: SubmissionEntry[];
  isWorkspaceInitialized: boolean;

  hydrate: (workspaceId: string | undefined) => Promise<void>;
  setJson: (value: string) => void;
  setVisual: (schema: any) => void;
  /** Persist the current schema (used by the "workspace not initialized" save button). */
  saveCurrentSchema: () => void;
  setThemeSettings: (settings: ThemeSettings) => void;
  setGlobalTheme: (mode: GlobalThemeMode) => void;
  setRoomName: (name: string) => void;
  applyAppearance: (a: { globalTheme: GlobalThemeMode; fontFamily: FontFamily; fontScale: number }) => void;
  addSubmission: (data: Record<string, any>) => void;
  deleteSubmission: (id: string) => void;
  clearSubmissions: () => void;
  applyRemoteState: (remote: RemoteWorkspaceState) => void;
  addRemoteSubmission: (remote: any) => void;
}

export interface StoreDeps {
  getDb: () => FormifyDB;
  getStorage: () => KeyValueStorage;
}

const browserDeps: StoreDeps = {
  getDb,
  getStorage: () => window.localStorage
};

const newSubmissionId = () => "sub_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);

/** Factory (injectable deps) so the store is unit-testable without a browser. */
export function createWorkspaceStore(deps: StoreDeps = browserDeps) {
  return create<WorkspaceState>()((set, get) => {
    const persist = (patch: WorkspacePatch) => {
      const id = get().workspaceId;
      saveWorkspacePatch(id, patch, deps.getDb(), deps.getStorage()).catch((e) =>
        console.error("Formify: failed to persist workspace", e)
      );
    };

    const validationError = (schema: any): string | null => {
      try {
        validateSchema(schema);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    };

    return {
      workspaceId: undefined,
      hydrated: false,
      schema: cleanDefaultSchema,
      jsonSchema: JSON.stringify(cleanDefaultSchema, null, 2),
      error: null,
      roomName: "My Form Workspace",
      themeSettings: defaultTheme,
      globalTheme: "light",
      fontFamily: "sans",
      fontScale: 1.0,
      submissions: [],
      isWorkspaceInitialized: true,

      hydrate: async (workspaceId) => {
        // Reset to defaults for the new workspace, then load persisted data.
        set({
          workspaceId,
          hydrated: false,
          schema: cleanDefaultSchema,
          jsonSchema: JSON.stringify(cleanDefaultSchema, null, 2),
          error: null,
          roomName: "My Form Workspace",
          themeSettings: defaultTheme,
          globalTheme: "light",
          fontFamily: "sans",
          fontScale: 1.0,
          submissions: [],
          isWorkspaceInitialized: true
        });

        let record;
        try {
          record = await loadWorkspace(workspaceId, deps.getDb(), deps.getStorage());
        } catch (e) {
          console.error("Failed to load workspace", e);
        }
        // Ignore stale results if another workspace was hydrated meanwhile.
        if (get().workspaceId !== workspaceId) return;

        const next: Partial<WorkspaceState> = { hydrated: true };

        // 1. Schema (fallback to clean default if not found)
        if (record?.schemaJson) {
          try {
            const parsed = migrateSchema(JSON.parse(record.schemaJson));
            validateSchema(parsed);
            next.schema = parsed;
            next.jsonSchema = record.schemaJson;
            next.isWorkspaceInitialized = true;
          } catch (e) {
            console.error("Failed to load schema", e);
          }
        } else {
          next.isWorkspaceInitialized = false;
        }

        // 2. Submissions
        if (Array.isArray(record?.submissions)) next.submissions = record!.submissions as SubmissionEntry[];

        // 3. Theme & typography
        if (record?.theme) next.themeSettings = record.theme;
        if (record?.globalTheme) next.globalTheme = record.globalTheme as GlobalThemeMode;
        if (record?.roomName) next.roomName = record.roomName;
        if (record?.fontFamily) next.fontFamily = record.fontFamily as FontFamily;
        if (record?.fontScale) next.fontScale = record.fontScale;

        set(next);
      },

      setJson: (value) => {
        set({ jsonSchema: value });
        if (value.trim() === "") {
          set({ error: "Schema cannot be empty." });
          return;
        }
        try {
          const parsed = JSON.parse(value);
          validateSchema(parsed);
          set({ schema: parsed, error: null, isWorkspaceInitialized: true });
          persist({ schemaJson: value });
        } catch (e) {
          set({ error: (e as Error).message });
        }
      },

      setVisual: (schema) => {
        const jsonStr = JSON.stringify(schema, null, 2);
        set({ schema, jsonSchema: jsonStr, error: validationError(schema), isWorkspaceInitialized: true });
        persist({ schemaJson: jsonStr });
      },

      saveCurrentSchema: () => {
        set({ isWorkspaceInitialized: true });
        persist({ schemaJson: JSON.stringify(get().schema) });
      },

      setThemeSettings: (themeSettings) => {
        set({ themeSettings });
        persist({ theme: themeSettings });
      },

      setGlobalTheme: (globalTheme) => {
        set({ globalTheme });
        persist({ globalTheme });
      },

      setRoomName: (roomName) => {
        set({ roomName });
        persist({ roomName });
      },

      applyAppearance: ({ globalTheme, fontFamily, fontScale }) => {
        set({ globalTheme, fontFamily, fontScale });
        persist({ globalTheme, fontFamily, fontScale });
      },

      addSubmission: (data) => {
        const entry: SubmissionEntry = {
          id: newSubmissionId(),
          timestamp: new Date().toISOString(),
          ip: "Local Preview",
          data
        };
        const submissions = [entry, ...get().submissions];
        set({ submissions });
        persist({ submissions });
      },

      deleteSubmission: (id) => {
        const submissions = get().submissions.filter((s) => s.id !== id);
        set({ submissions });
        persist({ submissions });
      },

      clearSubmissions: () => {
        set({ submissions: [] });
        persist({ submissions: [] });
      },

      applyRemoteState: (remote) => {
        const patch: WorkspacePatch = {};
        const next: Partial<WorkspaceState> = {};
        if (remote.schema) {
          let schema = remote.schema;
          try {
            schema = migrateSchema(remote.schema);
          } catch (e) {
            // Newer-than-supported schema: keep it visible but flag the error below.
            console.error("Remote schema migration failed", e);
          }
          next.schema = schema;
          next.jsonSchema = JSON.stringify(remote.schema, null, 2);
          next.error = validationError(schema);
        }
        if (remote.theme) {
          next.themeSettings = remote.theme;
          patch.theme = remote.theme;
        }
        if (remote.fontFamily) {
          next.fontFamily = remote.fontFamily;
          patch.fontFamily = remote.fontFamily;
        }
        if (remote.fontScale) {
          next.fontScale = remote.fontScale;
          patch.fontScale = remote.fontScale;
        }
        if (remote.globalTheme) {
          next.globalTheme = remote.globalTheme;
          patch.globalTheme = remote.globalTheme;
        }
        if (remote.submissions) {
          next.submissions = remote.submissions;
          patch.submissions = remote.submissions;
        }
        set(next);
        if (Object.keys(patch).length) persist(patch);
      },

      addRemoteSubmission: (remote) => {
        const entry: SubmissionEntry = {
          id: remote.id || newSubmissionId(),
          timestamp: remote.timestamp || new Date().toISOString(),
          data: remote.data || remote
        };
        const submissions = [entry, ...get().submissions];
        set({ submissions });
        persist({ submissions });
      }
    };
  });
}

/** App-wide store instance bound to the browser's IndexedDB + localStorage. */
export const useWorkspaceStore = createWorkspaceStore();
