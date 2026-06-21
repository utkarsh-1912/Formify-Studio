"use client";

import React, { use, useState, useEffect } from "react";
import { useP2PSync } from "../../../../utils/p2pSync";
import { themeMap, GlobalThemeMode } from "../../../../utils/appTheme";
import { ThemeSettings } from "../../../../utils/codeGenerators";
import FormGenerator from "../../../../components/FormGenerator";
import { Radio } from "lucide-react";

interface ViewPageProps {
  params: Promise<{ id: string }>;
}

const defaultTheme: ThemeSettings = {
  primaryColor: "indigo",
  borderRadius: "md",
  layout: "1-col",
  shadow: "md"
};

export default function EmbeddedFormViewPage({ params }: ViewPageProps) {
  const resolvedParams = use(params);
  const workspaceId = resolvedParams.id;

  // Storage keys for guest cache
  const cacheSchemaKey = `formify_guest_schema_${workspaceId}`;
  const cacheThemeKey = `formify_guest_theme_${workspaceId}`;
  const cacheFontKey = `formify_guest_font_fam_${workspaceId}`;
  const cacheScaleKey = `formify_guest_font_scale_${workspaceId}`;
  const cacheGlobalThemeKey = `formify_guest_global_theme_${workspaceId}`;

  // Local state initialized from cache or defaults
  const [schema, setSchema] = useState<any>(null);
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(defaultTheme);
  const [fontFamily, setFontFamily] = useState<"sans" | "mono" | "serif">("sans");
  const [fontScale, setFontScale] = useState<number>(1.0);
  const [globalTheme, setGlobalTheme] = useState<GlobalThemeMode>("light");

  // Load from local cache on mount
  useEffect(() => {
    try {
      const cachedSchema = localStorage.getItem(cacheSchemaKey);
      if (cachedSchema) setSchema(JSON.parse(cachedSchema));

      const cachedTheme = localStorage.getItem(cacheThemeKey);
      if (cachedTheme) setThemeSettings(JSON.parse(cachedTheme));

      const cachedFont = localStorage.getItem(cacheFontKey);
      if (cachedFont) setFontFamily(cachedFont as any);

      const cachedScale = localStorage.getItem(cacheScaleKey);
      if (cachedScale) setFontScale(parseFloat(cachedScale));

      const cachedGlobalTheme = localStorage.getItem(cacheGlobalThemeKey);
      if (cachedGlobalTheme) setGlobalTheme(cachedGlobalTheme as GlobalThemeMode);
    } catch (e) {
      console.error("Failed to load guest cache settings", e);
    }
  }, [workspaceId]);

  // Global Text Resizing Scale Effect
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [fontScale]);

  // Setup P2P connection as guest
  const {
    status: p2pStatus,
    initPeerJS,
    disconnect,
    submitForm
  } = useP2PSync(
    workspaceId,
    {}, // guest has no local schema to broadcast
    (remoteState) => {
      // Sync all editor state properties from host
      if (remoteState.schema) {
        setSchema(remoteState.schema);
        localStorage.setItem(cacheSchemaKey, JSON.stringify(remoteState.schema));
      }
      if (remoteState.theme) {
        setThemeSettings(remoteState.theme);
        localStorage.setItem(cacheThemeKey, JSON.stringify(remoteState.theme));
      }
      if (remoteState.fontFamily) {
        setFontFamily(remoteState.fontFamily);
        localStorage.setItem(cacheFontKey, remoteState.fontFamily);
      }
      if (remoteState.fontScale) {
        setFontScale(remoteState.fontScale);
        localStorage.setItem(cacheScaleKey, remoteState.fontScale.toString());
      }
      if (remoteState.globalTheme) {
        setGlobalTheme(remoteState.globalTheme);
        localStorage.setItem(cacheGlobalThemeKey, remoteState.globalTheme);
      }
    },
    undefined,
    true // isGuest = true
  );

  // Initialize P2P connection on mount
  useEffect(() => {
    initPeerJS();
    return () => {
      disconnect();
    };
  }, [workspaceId]);

  const themeTokens = themeMap[globalTheme] || themeMap.light;
  const fontFamClass =
    fontFamily === "mono" ? "font-mono" : fontFamily === "serif" ? "font-serif" : "font-sans";

  const handleFormSubmit = (data: Record<string, any>) => {
    // Broadcast the submission back to the host via WebRTC
    submitForm(data);
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-all duration-300 ${themeTokens.bg} ${fontFamClass}`}>
      {/* Content Box */}
      <div className="flex-1 flex flex-col justify-center items-center w-full max-w-2xl mx-auto p-2 sm:p-4">
        {schema ? (
          <FormGenerator
            schema={schema}
            theme={themeSettings}
            themeTokens={themeTokens}
            fontFamily={fontFamily}
            fontScale={fontScale}
            onSubmitSubmission={handleFormSubmit}
          />
        ) : (
          <div className="flex flex-col items-center space-y-3 py-12">
            <Radio className="h-8 w-8 text-blue-500 animate-pulse" />
            <span className={`text-xs ${themeTokens.textSecondary}`}>Loading embed form viewport...</span>
          </div>
        )}
      </div>
    </div>
  );
}
