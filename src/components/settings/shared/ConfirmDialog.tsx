import React from 'react';
import { darkColors, lightColors, layout, typography, spacing } from '../../../utils/design';
import GazeButton from '../../core/GazeButton';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDarkMode: boolean;
  variant?: 'emergency' | 'warning';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDarkMode,
  variant = 'emergency',
}) => {
  const colors = isDarkMode ? darkColors : lightColors;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: colors.background.elevated,
        borderRadius: layout.borderRadius.xl,
        border: `1px solid ${colors.border.main}`,
        padding: spacing[6],
        maxWidth: 420,
        width: '90%',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing[4],
      }}>
        <div style={{
          fontSize: typography.fontSize['2xl'],
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: typography.fontSize.base,
          color: colors.text.secondary,
          lineHeight: typography.lineHeight.relaxed,
        }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: spacing[3], justifyContent: 'flex-end' }}>
          <GazeButton
            id="confirm-cancel"
            size="sm"
            variant="default"
            onClick={onCancel}
            isDarkMode={isDarkMode}
            gazeEnabled={false}
            gazeEnabledTimestamp={0}
            style={{ minWidth: 100 }}
          >
            {cancelLabel}
          </GazeButton>
          <GazeButton
            id="confirm-ok"
            size="sm"
            variant={variant}
            onClick={onConfirm}
            isDarkMode={isDarkMode}
            gazeEnabled={false}
            gazeEnabledTimestamp={0}
            style={{ minWidth: 100 }}
          >
            {confirmLabel}
          </GazeButton>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
