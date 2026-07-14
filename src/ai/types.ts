import type { KnowledgeResult } from "../knowledge/types.js";

export interface AIMessageInput {
  userMessage: string;
  context: KnowledgeResult[];
  image?: {
    mimeType: string;
    data: Buffer;
  };
  quickReplies?: Array<{ id: string; title: string; text: string }>;
  files?: Array<{ id: string; filename: string; description: string }>;
  customerProfile?: string;
  personas?: Array<{ id: string; name: string; role: string; instruction: string }>;
  activePersona?: string;
}

export interface AIResponse {
  text: string;
  confidence: number;
  usedSourceIds: string[];
}

export interface AIProviderInfo {
  id: string;
  label: string;
  supportsVision: boolean;
}

export interface AIProvider extends AIProviderInfo {
  generate(input: AIMessageInput): Promise<AIResponse>;
}
