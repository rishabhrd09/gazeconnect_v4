export interface VisualOption {
    label: string;
    icon?: string;
    description?: string;
}

export interface SurveyQuestion {
    id: string;
    phase: string;
    text: string;
    subtext?: string;
    helpText?: string;
    defaultValue?: string;
    type: 'grid' | 'compass' | 'multi' | 'coordinate-input' | 'display' | 'action' | 'text' | 'scrollable-display' | 'slider' | 'visual-grid';
    options?: string[];
    dynamicOptions?: (answers: Record<string, any>) => string[];
    visualOptions?: VisualOption[];
    sliderRange?: { min: number; max: number; step: number };
    condition?: (answers: Record<string, any>) => boolean;
    dataKey?: string;
    visual?: 'grid-highlight' | 'none';
    step?: number;
}

export type PhaseStatus = 'locked' | 'current' | 'complete' | 'skipped';

export interface SurveyPhase {
    id: string;
    label: string;
    icon: string;
    questions: string[];
}

export interface SurveyState {
    answers: Record<string, any>;
    qIndex: number;
    currentPhase: string;
    startTime: number;
    lastSaveTime: number;
    version: number;
}

export interface CompiledSurvey {
    meta: { timestamp: string; version: number; confidence?: string };
    site: Record<string, any>;
    ground_floor: Record<string, any>;
    upper_floors?: Record<string, any>;
    dimensions: Record<string, any>;
    layout: Record<string, any>;
    connections: Record<string, any>;
    preferences: Record<string, any>;
    raw_answers: Record<string, any>;
}

export interface CompletenessReport {
    total: number;
    answered: number;
    percentage: number;
    byPhase: Record<string, { total: number; answered: number }>;
}
