
export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface VoiceOption {
  id: VoiceName;
  name: string;
  gender: 'Male' | 'Female';
  description: string;
}

export interface CustomVoice {
  id: string;
  name: string;
  baseVoice: VoiceName;
  createdAt: number;
}

export interface HistoryItem {
  id: string;
  text: string;
  voice: VoiceName | string;
  language?: string;
  timestamp: number;
  audioBase64: string; // Storing base64 for simple playback history
}

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyser: AnalyserNode | null;
}

export type AppView = 'studio' | 'menu' | 'history' | 'live' | 'podcast' | 'clone';

export type SupportedLanguage = 
  | 'English' | 'Spanish' | 'French' | 'German' 
  | 'Japanese' | 'Korean' | 'Chinese' | 'Hindi' 
  | 'Italian' | 'Portuguese' | 'Russian' | 'Arabic';

export type ScriptModel = 'gemini-2.5-flash' | 'gemini-3-pro-preview';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  audioUrl?: string;
  voice?: string;
}

export interface PodcastLine {
  speaker: string;
  text: string;
}
