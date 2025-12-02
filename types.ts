
export enum UserRole {
  USER = 'USER', // Evaluates Usability
  EXPERT = 'EXPERT' // Evaluates Consistency
}

export enum EvaluationModel {
  UES = 'UES', // 5 Dimensions
  ETS = 'ETS'  // 8 Dimensions
}

export interface PersonaAttributes {
  age: string;
  techSavviness: string; // e.g., 'Low', 'Medium', 'High' or Chinese equivalents
  domainKnowledge: string; // e.g., 'Novice', 'Intermediate', 'Expert'
  goals: string;
  environment: string; // e.g., "Noisy office", "Quiet home"
  frustrationTolerance: string; // e.g., 'Low', 'Medium', 'High'
  deviceHabits: string; // e.g., "Mobile first", "Mouse heavy"
}

export interface Persona {
  id: string;
  name: string;
  role: UserRole;
  description: string;
  attributes: PersonaAttributes;
}

export interface DimensionScore {
  dimension: string; // e.g., "易用性", "一致性"
  score: number; // 0-100
  comment: string;
}

export interface Issue {
  severity: string; // '严重' | '高' | '中' | '低'
  location: string;
  description: string;
  recommendation: string;
}

export interface UESReport {
  modelType: EvaluationModel; // Track which model was used
  overallScore: number;
  dimensionScores: DimensionScore[];
  executiveSummary: string;
  personaPerspective: string; // How the specific persona feels
  issues: Issue[];
  optimizationSuggestions: string[]; // High level strategic suggestions
}

export type ApiProvider = 'google' | 'openrouter';

export interface ApiConfig {
  provider: ApiProvider;
  openRouterKey?: string;
  openRouterModel?: string;
  imageModel?: string; // New field for image generation model
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}