import React from 'react';
import { formatSize } from '../utils/feetInches';

interface ArchCellProps {
  cellKey: string;
  row: number;
  col: number;
  totalRows: number;
  totalCols: number;
  roomId: string | null;
  roomLabel: string | null;
  shortLabel: string | null;
  roomColor: string;
  cellWidthFt: number;
  cellDepthFt: number;
  isArmed: boolean;
  isExpTarget: boolean;
  isExpAnchor: boolean;
  expDirection: string | null;
  pendingRoomColor?: string;
  neighborN: string | null;
  neighborS: string | null;
  neighborE: string | null;
  neighborW: string | null;
  cellLayout?: 'left' | 'right' | 'top' | 'bottom';
  hideText?: boolean;
  /** The room's identity (two bedrooms are two rooms); neighbours are compared by identity when given. */
  identity?: string | null;
}

export const ArchitecturalCell: React.FC<ArchCellProps> = ({
  cellKey,
  row,
  col,
  totalRows,
  totalCols,
  roomId,
  roomLabel,
  shortLabel,
  roomColor,
  cellWidthFt,
  cellDepthFt,
  isArmed,
  isExpTarget,
  isExpAnchor,
  expDirection,
  pendingRoomColor,
  neighborN,
  neighborS,
  neighborE,
  neighborW,
  cellLayout,
  hideText,
  identity,
}) => {
  const isOccupied = !!roomId;
  const self = identity ?? roomId;

  const isExtTop = row === totalRows;
  const isExtBottom = row === 1;
  const isExtLeft = col === 1;
  const isExtRight = col === totalCols;

  const extWall = '3px solid var(--ui-border)';
  const intWall = '1.5px solid var(--ui-border)';

  const wallBreakN = isOccupied && neighborN !== self;
  const wallBreakS = isOccupied && neighborS !== self;
  const wallBreakE = isOccupied && neighborE !== self;
  const wallBreakW = isOccupied && neighborW !== self;

  const borderTop = isExtTop ? extWall : (!wallBreakN && isOccupied ? 'none' : intWall);
  const borderBottom = isExtBottom ? extWall : (!wallBreakS && isOccupied ? 'none' : intWall);
  const borderLeft = isExtLeft ? extWall : (!wallBreakW && isOccupied ? 'none' : intWall);
  const borderRight = isExtRight ? extWall : (!wallBreakE && isOccupied ? 'none' : intWall);

  const roomFill = isOccupied
    ? `color-mix(in srgb, ${roomColor} 18%, var(--ui-surface))`
    : isExpTarget
      ? `color-mix(in srgb, ${pendingRoomColor || '#FBBF24'} 22%, var(--ui-surface))`
      : 'var(--ui-surface)';

  const displayLabel = isOccupied && !hideText
    ? (roomLabel && roomLabel.length <= 24 ? roomLabel : (shortLabel || roomId || ''))
    : '';
  const labelText = displayLabel.replace(/\s*\/\s*/g, ' /\n').toUpperCase();

  const zoneLabel = row === totalRows ? 'Back' : row === 1 ? 'Front' : row === totalRows - 1 ? 'Mid' : 'Inner';
  const sideLabel = col === 1 ? 'Left' : col === totalCols ? 'Right' : '';


  const isStairCombo = roomId === 'staircase' || roomId === 'diningStaircase';
  const comboMainLabel = roomId === 'diningStaircase' ? 'DINING HALL' : 'LIVING LOBBY';

  const defaultStairsOnLeft = (col - 1) <= (totalCols - col);
  const layout = cellLayout || (defaultStairsOnLeft ? 'left' : 'right');
  const stairsOnLeft = layout === 'left';
  const stairsOnRight = layout === 'right';
  const stairsOnTop = layout === 'top';
  const stairsOnBottom = layout === 'bottom';
  const isVerticalStairs = stairsOnLeft || stairsOnRight;

  const stairPane = (
    <div
      style={{
        position: 'relative',
        ...(isVerticalStairs ? {
          width: '42%',
          minWidth: '42%',
          height: '100%',
        } : {
          width: '100%',
          height: '42%',
          minHeight: '42%',
        }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ui-inset)',
        ...(stairsOnLeft ? { borderRight: '2px solid var(--ui-border)' } : {}),
        ...(stairsOnRight ? { borderLeft: '2px solid var(--ui-border)' } : {}),
        ...(stairsOnTop ? { borderBottom: '2px solid var(--ui-border)' } : {}),
        ...(stairsOnBottom ? { borderTop: '2px solid var(--ui-border)' } : {}),
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '10% 16%',
          border: '1.5px solid var(--ui-border)',
          borderRadius: '4px',
        }}
      />
      {[16, 28, 40, 52, 64, 76, 88].map((topPct, idx) => (
        <div
          key={`stair-line-${idx}`}
          style={{
            position: 'absolute',
            ...(isVerticalStairs ? {
              left: '20%',
              right: '20%',
              top: `${topPct}%`,
              height: '1.5px',
            } : {
              top: '20%',
              bottom: '20%',
              left: `${topPct}%`,
              width: '1.5px',
            }),
            background: 'var(--ui-muted)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          ...(isVerticalStairs ? { top: '8%', left: '50%', transform: 'translateX(-50%)' } : { right: '8%', top: '50%', transform: 'translateY(-50%)' }),
          fontSize: 'clamp(10px, 1.2vh, 14px)',
          fontWeight: 650,
          color: 'var(--ui-ink)',
        }}
      >
        {isVerticalStairs ? '↑' : '→'}
      </div>
      {!isVerticalStairs && (
        <div
          style={{
            position: 'absolute',
            left: '6%',
            bottom: '6%',
            fontSize: 'clamp(11px, 1.4vh, 15px)',
            fontWeight: 650,
            color: 'var(--ui-ink)',
            letterSpacing: '0.35px',
          }}
        >
          STAIRS
        </div>
      )}
      {isVerticalStairs && (
        <div
          style={{
            position: 'absolute',
            bottom: '6%',
            fontSize: 'clamp(11px, 1.4vh, 15px)',
            fontWeight: 650,
            color: 'var(--ui-ink)',
            letterSpacing: '0.35px',
          }}
        >
          STAIRS
        </div>
      )}
    </div>
  );

  const comboMainPane = (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 clamp(4px, 0.5vw, 10px)',
      }}
    >
      <span
        style={{
          width: '96%',
          textAlign: 'center',
          lineHeight: 1.2,
          fontSize: 'clamp(16px, 2vh, 24px)',
          fontWeight: 650,
          letterSpacing: '0.3px',
          color: 'var(--ui-ink)',
          textShadow: 'none',
        }}
      >
        {comboMainLabel}
      </span>
      <span
        style={{
          marginTop: '2px',
          fontSize: 'clamp(12px, 1.5vh, 16px)',
          fontWeight: 700,
          color: 'var(--ui-muted)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {formatSize(cellWidthFt, cellDepthFt)}
      </span>
    </div>
  );

  return (
    <div
      className="architectural-cell-surface"
      style={{
        fontFamily: 'var(--ui-font)',
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(4px, 0.6vh, 10px)',
        background: roomFill,
        borderTop,
        borderBottom,
        borderLeft,
        borderRight,
        transition: 'background 0.2s ease, box-shadow 0.2s ease',
        ...(isExpAnchor ? { boxShadow: 'inset 0 0 0 3px #2DD4BF' } : {}),
        ...(isArmed && !isOccupied && !isExpTarget ? { boxShadow: 'inset 0 0 0 2px rgba(45,212,191,0.32)' } : {}),
      }}
    >
      {isOccupied && (
        <>
          {wallBreakN && <div style={{ position: 'absolute', top: 0, left: '36%', width: '28%', height: '2px', background: '#EAF7EF', opacity: 0.7 }} />}
          {wallBreakS && <div style={{ position: 'absolute', bottom: 0, left: '36%', width: '28%', height: '2px', background: '#EAF7EF', opacity: 0.7 }} />}
          {wallBreakE && <div style={{ position: 'absolute', right: 0, top: '36%', width: '2px', height: '28%', background: '#EAF7EF', opacity: 0.7 }} />}
          {wallBreakW && <div style={{ position: 'absolute', left: 0, top: '36%', width: '2px', height: '28%', background: '#EAF7EF', opacity: 0.7 }} />}
        </>
      )}

      {isOccupied ? (
        isStairCombo ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: isVerticalStairs ? 'row' : 'column',
              alignItems: 'stretch',
              justifyContent: 'stretch',
              overflow: 'hidden',
              borderRadius: '5px',
            }}
          >
            {(stairsOnLeft || stairsOnTop) && stairPane}
            {comboMainPane}
            {(stairsOnRight || stairsOnBottom) && stairPane}
          </div>
        ) : (
          <>
            <span
              style={{
                width: '96%',
                textAlign: 'center',
                whiteSpace: 'pre-line',
                lineHeight: 1.2,
                fontSize: 'clamp(18px, 2.4vh, 28px)',
                fontWeight: 650,
                letterSpacing: '0.35px',
                color: 'var(--ui-ink)',
                textShadow: 'none',
              }}
            >
              {labelText}
            </span>
            <span
              style={{
                marginTop: '2px',
                fontSize: 'clamp(12px, 1.5vh, 16px)',
                fontWeight: 700,
                color: 'var(--ui-muted)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatSize(cellWidthFt, cellDepthFt)}
            </span>
          </>
        )
      ) : isExpTarget ? (
        <span style={{ fontSize: 'clamp(20px, 2.3vh, 30px)', fontWeight: 650, color: 'var(--ui-accent-ink)' }}>
          {expDirection === 'right' ? '->' : 'v'}
        </span>
      ) : (
        <>
          {/* Readable zone label remains a stable gaze anchor before placement. */}
          <span
            style={{
              fontSize: 'clamp(20px, 2.5vh, 29px)',
              fontWeight: 600,
              fontStyle: 'normal',
              color: 'var(--ui-muted)',
              opacity: 1,
              textAlign: 'center',
              lineHeight: 1.1,
              whiteSpace: 'pre-line',
              letterSpacing: '0.2px',
            }}
          >
            {zoneLabel}
            {sideLabel ? `\n${sideLabel}` : ''}
          </span>
          {/* Cell coordinate marker — architectural grid reference, subtle on purpose */}
          <span
            style={{
              position: 'absolute',
              right: '3px',
              bottom: '2px',
              fontSize: 'clamp(11px, 1.3vh, 14px)',
              color: 'var(--ui-muted)',
              opacity: 1,
              fontWeight: 600,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.2px',
            }}
          >
            {cellKey}
          </span>
        </>
      )}
    </div>
  );
};

export interface SplitHalf {
  identity: string | null;
  label: string | null;
  color: string | null;
  size: string;
  /** Narrower than its room needs: placed with a warning (16 Oct 2026); the focus view gives the numbers. */
  warning?: boolean;
}

/** A divided cell on the map: two halves inside the cell's single gaze target (IMPLEMENTATION_PLAN.md §5.1 step 8). */
export const SplitCellFace: React.FC<{ row: number; col: number; totalRows: number; totalCols: number; left: SplitHalf; right: SplitHalf; direction?: 'left-right' | 'top-bottom' }> = ({
  row, col, totalRows, totalCols, left, right, direction = 'left-right',
}) => {
  const ext = '3px solid var(--ui-border)';
  const int = '1.5px solid var(--ui-border)';
  const same = !!left.identity && left.identity === right.identity;
  const half = (h: SplitHalf) => (
    <div style={{ background: h.color ? `color-mix(in srgb, ${h.color} 18%, var(--ui-surface))` : 'var(--ui-surface)' }}>
      <span>{h.label ? h.label.toUpperCase() : 'EMPTY'}</span>
      <span>{h.size}</span>
      {h.warning && <b className="split-cell-warning">⚠ NARROW</b>}
    </div>
  );
  return (
    <div className="split-cell" data-same={same} data-direction={direction} style={{
      borderTop: row === totalRows ? ext : int, borderBottom: row === 1 ? ext : int,
      borderLeft: col === 1 ? ext : int, borderRight: col === totalCols ? ext : int,
    }}>
      {half(left)}
      {half(right)}
      <i aria-hidden="true" />
    </div>
  );
};

export default React.memo(ArchitecturalCell);
