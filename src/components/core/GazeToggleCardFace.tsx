/**
 * The gaze toggle's face, the same wherever the toggle is (maintainer's choice, 24 Sep 2026:
 * the Zone Board's gaze card). Off: an eye over "Enable gaze". On: a pause sign over
 * "Pause gaze". Colours and sizes come from `.gaze-switch-card` in src/refinement.css; the
 * label shrinks with the card's width. Inner class names must not contain "gaze-toggle",
 * "gaze-card" or "gaze-button": GazeCursor reads those as a toggle or a separate target.
 */

import React from 'react';
import { EyeIcon, PauseIcon } from '../icons/Icons';

export const GazeToggleCardFace: React.FC<{ on: boolean }> = ({ on }) => (
  <span className="gaze-switch-face" aria-hidden="true">
    {on ? <PauseIcon /> : <EyeIcon />}
    <span className="gaze-switch-label">{on ? 'Pause gaze' : 'Enable gaze'}</span>
  </span>
);

export default GazeToggleCardFace;
