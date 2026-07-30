export type AppView = 'landing' | 'studio' | 'processing' | 'result';

export type AspectRatioFormat = '9:16' | '1:1' | '16:9';
export type VideoPace = 'explosive' | 'measured' | 'storyteller';
export type VoiceStyle = 'academic' | 'energetic' | 'calm';
export type VisualStyle = '3d_schematic' | 'cyberpunk' | 'minimalist' | 'photoreal';

export interface VideoGenerationInput {
  subject: string;
  knowledgeBase: string;
  format: AspectRatioFormat;
  pace: VideoPace;
  voiceStyle: VoiceStyle;
  visualStyle: VisualStyle;
}

export interface ReasoningPath {
  id: string;
  title: string;
  score: number;
  status: 'evaluating' | 'rejected' | 'optimal';
  description: string;
  activeNodeIds: number[];
  hookStrategy: string;
  informationDensity: string;
}

export interface OperationLogStep {
  id: string;
  timestamp: string;
  category: string;
  title: string;
  detail: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  dataPayload?: any;
}

export interface WordCaption {
  text: string;
  start: number;
  end: number;
}

export interface VideoScene {
  sceneIndex: number;
  timeStart: number;
  timeEnd: number;
  narration: string;
  visualPrompt: string;
  keywords: string[];
  visualType: 'schematic' | 'molecule' | 'diagram' | 'chart' | 'network' | 'astronomy' | 'atom';
  wordCaptions: WordCaption[];
}

export interface GeneratedShort {
  id: string;
  subject: string;
  title: string;
  hookText: string;
  knowledgeSummary: string;
  scenes: VideoScene[];
  totalDuration: number;
  aspectRatio: AspectRatioFormat;
  processingTimeSeconds: number;
  hookScore: number;
  retentionScore: number;
  algorithmicScore: number;
  createdAt: string;
  voiceStyle: VoiceStyle;
  visualStyle: VisualStyle;
  videoUrl?: string;
}

export interface SamplePreset {
  id: string;
  title: string;
  subject: string;
  knowledge: string;
  category: string;
  iconName: string;
}
