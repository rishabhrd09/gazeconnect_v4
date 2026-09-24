/**
 * The app's look, one switch for the whole redesign.
 *
 * 'gazespell' is the 24 Sep 2026 redesign: Warm follows the GazeSpell tokens (warm off-white
 * surfaces, true-black type, olive accents, condensed type); both themes get flat cards with
 * 20 px corners and hairline borders; Settings is reorganised. Layouts and gaze targets of the
 * other screens are unchanged.
 * 'classic' is the look before it.
 *
 * Every redesign rule is scoped to :root[data-look='gazespell'] (src/styles/gazespell-look.css)
 * and every redesign branch in the code reads isGazeSpellLook, so changing this one line brings
 * the classic look back. A full revert of the redesign's code: the git ref
 * refs/snapshots/pre-redesign-2026-09-24 (see AGENTS.md).
 */
export type AppLook = 'gazespell' | 'classic';

export const APP_LOOK = 'gazespell' as AppLook;

export const isGazeSpellLook = APP_LOOK === 'gazespell';
