export enum UserRole {
  USER = 'USER', // Evaluates Usability
  EXPERT = 'EXPERT' // Evaluates Consistency
}

export enum EvaluationModel {
  ETS = 'ETS',
  HEART = 'HEART',
  SUS_LITE = 'SUS_LITE',
  UEQ_LITE = 'UEQ_LITE',
  CUSTOM = 'CUSTOM'
}

export type PersonaAttributes = Record<string, string>;

export interface Persona {
  id: string;
  name: string;
  role: UserRole;
  description: string;
  attributes: PersonaAttributes;
}

export type FrameworkSource = 'builtin' | 'custom';
export type FrameworkChartType = 'radar' | 'bar' | 'mixed' | 'cards';

export interface FrameworkDimension {
  id: string;
  name: string;
  definition: string;
  weight?: number;
}

export interface ChecklistItemDefinition {
  id: string;
  category: string;
  checkpoint: string;
  item: string;
  description: string;
  scope: '交互' | '视觉' | '交互/视觉';
}

export type ChecklistStatus = 'pass' | 'fail';

export interface ChecklistResult {
  itemId: string;
  status: ChecklistStatus;
  reason: string;
  category?: string;
  checkpoint?: string;
  item?: string;
  description?: string;
  scope?: ChecklistItemDefinition['scope'];
}

export interface FrameworkSectionTemplate {
  id: string;
  title: string;
  type: 'text' | 'list' | 'tags';
  description?: string;
}

export interface EvaluationFramework {
  id: string;
  name: string;
  source: FrameworkSource;
  description: string;
  modelType: EvaluationModel;
  scoreRange: {
    min: number;
    max: number;
  };
  dimensions: FrameworkDimension[];
  visualization: {
    primaryChart: FrameworkChartType;
  };
  promptGuidelines: string;
  reportSections?: FrameworkSectionTemplate[];
  checklistItems?: ChecklistItemDefinition[];
}

export interface EvaluationScenario {
  industry: string;
  productType: string;
  businessGoal: string;
  targetUsers: string;
  keyTasks: string;
  painPoints: string;
  successCriteria: string;
  constraints: string;
  source: 'manual' | 'ai_inferred' | 'mixed';
}

export interface DimensionScore {
  dimension: string; // e.g., "易用性", "一致性"
  score: number; // 0-100
  comment: string;
}

export interface Issue {
  severity: string; // '一级问题' | '二级问题' | '三级问题'
  location: string;
  description: string;
  recommendation: string;
}

export interface ReportSectionData {
  id: string;
  title: string;
  type: 'text' | 'list' | 'tags';
  content: string | string[];
}

export interface FrameworkReport {
  frameworkId: string;
  frameworkName: string;
  modelType: EvaluationModel;
  overallScore: number;
  dimensionScores: DimensionScore[];
  executiveSummary: string;
  personaPerspective: string; // How the specific persona feels
  issues: Issue[];
  optimizationSuggestions: string[]; // High level strategic suggestions
  scenarioSummary?: string;
  evidenceNotes?: string[];
  confidence?: number; // 0-100
  dynamicSections?: ReportSectionData[];
  checklistResults?: ChecklistResult[];
}

export type ABComparisonWinner = 'A' | 'B' | 'TIE';

export interface ABComparisonDimension {
  dimension: string;
  scoreA: number;
  scoreB: number;
  diff: number;
  winner: ABComparisonWinner;
  insight: string;
}

export interface ABComparisonReport {
  personaId: string;
  frameworkId: string;
  frameworkName: string;
  winner: ABComparisonWinner;
  overallScoreA: number;
  overallScoreB: number;
  comparabilityNote?: string;
  summary: string;
  betterOptionAnswer: string;
  dimensionComparisons: ABComparisonDimension[];
  reportA: FrameworkReport;
  reportB: FrameworkReport;
}

// Backward compatibility
export type ETSReport = FrameworkReport;

export interface PersonaRecommendation {
  id: string;
  existingPersonaId?: string;
  personaDraft?: Omit<Persona, 'id'>;
  matchScore: number; // 0-100
  reasoning: string;
}

export type ApiProvider = 'google' | 'openrouter';

export interface ApiConfig {
  provider: ApiProvider;
  googleModel?: string;
  openRouterModel?: string;
  imageModel?: string;
  googleApiKey?: string;
  openRouterApiKey?: string;
}

export interface ProcessStep {
  id: string;
  image: string; // Base64
  description: string; // User action description
  fileName?: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}