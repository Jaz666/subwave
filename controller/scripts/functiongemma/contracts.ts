export type EvaluationStage = 'route' | 'recover' | 'commit';

export interface ToolContract {
  name: string;
  required?: readonly string[];
  enums?: Readonly<Record<string, readonly (string | null)[]>>;
}

export interface ExpectedRoute {
  firstCallOneOf: readonly string[];
  arguments?: Readonly<Record<string, unknown>>;
}

export interface ExpectedRecovery {
  emptyTool: string;
  nextCallOneOf: readonly string[];
}

export interface ExpectedCommit {
  surfacedIds: readonly string[];
  acceptableIds: readonly string[];
  preferredIds?: readonly string[];
  forbiddenIds?: readonly string[];
}

/** A controller-owned discovery call that precedes FunctionGemma decisions. */
export interface ControllerInitialCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface FunctionGemmaScenario {
  id: string;
  stage: EvaluationStage;
  split: 'validation';
  description: string;
  prompt: string;
  tools: readonly ToolContract[];
  /** Exact offered tools at each controller decision. */
  decisionTools?: readonly (readonly ToolContract[])[];
  /** A deterministic, already-classified lookup executed before the model. */
  controllerInitial?: ControllerInitialCall;
  /** Controller instruction that follows a controller-owned initial result. */
  controllerInitialFollowup?: string;
  mockResults?: Readonly<Record<string, unknown>>;
  route?: ExpectedRoute;
  recovery?: ExpectedRecovery;
  /** Exact controller instruction sent after the preceding decision. */
  followup?: string;
  /** Limit a controller-shaped scenario to its real decision count. */
  maxRounds?: number;
  commit?: ExpectedCommit;
}

export interface PredictedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface FunctionGemmaPrediction {
  scenario: string;
  calls: PredictedToolCall[];
  latencyMs?: number;
  iteration?: number;
  responseText?: string;
  finishReasons?: string[];
  /** Number of native/OpenAI calls emitted in each model response. */
  callsPerRound?: number[];
}

export type ScoreDimension =
  | 'protocol'
  | 'routing'
  | 'recovery'
  | 'grounding'
  | 'editorial';

export interface DimensionScore {
  passed: boolean;
  violations: string[];
}

export interface ScenarioScore {
  scenario: string;
  stage: EvaluationStage;
  dimensions: Partial<Record<ScoreDimension, DimensionScore>>;
  passed: boolean;
  latencyMs: number | null;
}
