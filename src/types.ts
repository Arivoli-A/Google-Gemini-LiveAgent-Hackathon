import { Type } from "@google/genai";

export interface Message {
  role: "user" | "model" | "system";
  text: string;
}

export interface BrushSettings {
  size: number;
  color: string;
  type: "crayon" | "paint";
}

export interface ColorMixerState {
  drops: { color: string; count: number }[];
}

export const DEFAULT_PALETTE = [
  "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", 
  "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#8B4513"
];

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
