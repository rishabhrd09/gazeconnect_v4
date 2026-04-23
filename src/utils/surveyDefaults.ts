import { SurveyQuestion, CompletenessReport } from '../types/SurveyTypes';
import { SURVEY_PHASES_V2 } from '../data/surveyQuestions';

/**
 * Compute smart defaults based on existing answers.
 * E.g. if ICU=Yes, suggest caregiver=Yes; if vastu, suggest kitchen=SE.
 */
export function computeDefaults(
    answers: Record<string, any>,
    questions: SurveyQuestion[]
): Record<string, any> {
    const defaults: Record<string, any> = {};

    // ICU -> caregiver
    if (answers['gf_req_home_icu'] === 'Yes' && !answers['gf_req_caregiver']) {
        defaults['gf_req_caregiver'] = 'Yes';
    }

    // Vastu kitchen zone default
    if (answers['vastu_level'] && answers['vastu_level'] !== 'Skip Vastu' && !answers['zone_kitchen']) {
        defaults['zone_kitchen'] = 'SE';
    }

    // Question-level defaultValue
    for (const q of questions) {
        const key = q.dataKey || q.id;
        if (q.defaultValue && !answers[key] && !defaults[key]) {
            defaults[key] = q.defaultValue;
        }
    }

    return defaults;
}

/**
 * Compute completeness stats for the survey.
 */
export function computeCompleteness(
    answers: Record<string, any>,
    questions: SurveyQuestion[]
): CompletenessReport {
    const byPhase: Record<string, { total: number; answered: number }> = {};

    for (const phase of SURVEY_PHASES_V2) {
        byPhase[phase.id] = { total: 0, answered: 0 };
    }

    let total = 0;
    let answered = 0;

    for (const q of questions) {
        // Skip conditional questions that are filtered out
        if (q.condition && !q.condition(answers)) continue;

        const key = q.dataKey || q.id;
        total++;
        if (byPhase[q.phase]) {
            byPhase[q.phase].total++;
        }

        if (answers[key] !== undefined && answers[key] !== '' && answers[key] !== 'SKIPPED') {
            answered++;
            if (byPhase[q.phase]) {
                byPhase[q.phase].answered++;
            }
        }
    }

    return {
        total,
        answered,
        percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
        byPhase,
    };
}

/**
 * Format answers into a human-readable grouped summary for the NotepadPanel.
 */
export function formatNotepadSummary(
    answers: Record<string, any>,
    questions: SurveyQuestion[]
): { phase: string; icon: string; items: { label: string; value: string }[] }[] {
    const groups: { phase: string; icon: string; items: { label: string; value: string }[] }[] = [];

    for (const phase of SURVEY_PHASES_V2) {
        const items: { label: string; value: string }[] = [];

        for (const qId of phase.questions) {
            const q = questions.find(qq => qq.id === qId);
            if (!q) continue;

            const key = q.dataKey || q.id;
            const raw = answers[key];
            if (raw === undefined || raw === '') continue;

            const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
            // Use question text as label, cleaned up
            const label = q.text.replace(/\?$/, '').replace(/\(Ground\)/, '').trim();
            items.push({ label, value });
        }

        if (items.length > 0) {
            groups.push({ phase: phase.label, icon: phase.icon, items });
        }
    }

    return groups;
}

/**
 * Client-side preview of compiled survey output.
 */
export function compileSurveyOutput(answers: Record<string, any>): Record<string, any> {
    return {
        meta: {
            timestamp: new Date().toISOString(),
            version: 2,
            confidence: answers['confidence'] || 'Unknown',
        },
        site: filterKeys(answers, k => k.startsWith('plot_') || k.startsWith('road_') || k === 'second_road_direction'),
        ground_floor: filterKeys(answers, k => k.startsWith('gf_')),
        upper_floors: filterKeys(answers, k => k.startsWith('ff_')),
        dimensions: filterKeys(answers, k => k.startsWith('dim_')),
        layout: filterKeys(answers, k => k.startsWith('loc_') || k.startsWith('zone_') || k.startsWith('coord_')),
        connections: filterKeys(answers, k => k.endsWith('_access') || k.endsWith('_into') || k === 'corridor_width_ft'),
        preferences: filterKeys(answers, k => ['vastu_level', 'design_style', 'special_requests', 'final_notes'].includes(k)),
    };
}

function filterKeys(obj: Record<string, any>, pred: (key: string) => boolean): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (pred(k)) result[k] = v;
    }
    return result;
}
