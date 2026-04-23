import React from 'react';

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
}) => {
  const isOccupied = !!roomId;

  const isExtTop = row === totalRows;
  const isExtBottom = row === 1;
  const isExtLeft = col === 1;
  const isExtRight = col === totalCols;

  const extWall = '3px solid #2F4A38';
  const intWall = '1.5px solid rgba(255,255,255,0.95)';

  const wallBreakN = isOccupied && neighborN !== roomId;
  const wallBreakS = isOccupied && neighborS !== roomId;
  const wallBreakE = isOccupied && neighborE !== roomId;
  const wallBreakW = isOccupied && neighborW !== roomId;

  const borderTop = isExtTop ? extWall : (!wallBreakN && isOccupied ? 'none' : intWall);
  const borderBottom = isExtBottom ? extWall : (!wallBreakS && isOccupied ? 'none' : intWall);
  const borderLeft = isExtLeft ? extWall : (!wallBreakW && isOccupied ? 'none' : intWall);
  const borderRight = isExtRight ? extWall : (!wallBreakE && isOccupied ? 'none' : intWall);

  const roomFill = isOccupied
    ? `${roomColor}C8`
    : isExpTarget
      ? `${pendingRoomColor || '#FBBF24'}70`
      : '#F9F6EC';

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
        background: 'linear-gradient(180deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.08) 100%)',
        ...(stairsOnLeft ? { borderRight: '2px solid rgba(18,33,44,0.25)' } : {}),
        ...(stairsOnRight ? { borderLeft: '2px solid rgba(18,33,44,0.25)' } : {}),
        ...(stairsOnTop ? { borderBottom: '2px solid rgba(18,33,44,0.25)' } : {}),
        ...(stairsOnBottom ? { borderTop: '2px solid rgba(18,33,44,0.25)' } : {}),
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '10% 16%',
          border: '1.5px solid rgba(18,33,44,0.28)',
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
            background: 'rgba(18,33,44,0.45)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          ...(isVerticalStairs ? { top: '8%', left: '50%', transform: 'translateX(-50%)' } : { right: '8%', top: '50%', transform: 'translateY(-50%)' }),
          fontSize: 'clamp(10px, 1.2vh, 14px)',
          fontWeight: 900,
          color: '#12212C',
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
            fontSize: 'clamp(8px, 0.9vh, 11px)',
            fontWeight: 900,
            color: '#12212C',
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
            fontSize: 'clamp(8px, 0.9vh, 11px)',
            fontWeight: 900,
            color: '#12212C',
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
          lineHeight: 1.02,
          fontSize: 'clamp(12px, 1.7vh, 22px)',
          fontWeight: 900,
          letterSpacing: '0.3px',
          color: '#12212C',
          textShadow: '0 1px 0 rgba(255,255,255,0.55)',
        }}
      >
        {comboMainLabel}
      </span>
      <span
        style={{
          marginTop: '2px',
          fontSize: 'clamp(9px, 1.05vh, 12px)',
          fontWeight: 700,
          color: '#25394A',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }}
      >
        {cellWidthFt}x{cellDepthFt} ft
      </span>
    </div>
  );

  return (
    <div
      style={{
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
                lineHeight: 1.02,
                fontSize: 'clamp(13px, 1.95vh, 24px)',
                fontWeight: 900,
                letterSpacing: '0.35px',
                color: '#12212C',
                textShadow: '0 1px 0 rgba(255,255,255,0.55)',
              }}
            >
              {labelText}
            </span>
            <span
              style={{
                marginTop: '2px',
                fontSize: 'clamp(9px, 1.1vh, 12px)',
                fontWeight: 700,
                color: '#25394A',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              {cellWidthFt}x{cellDepthFt} ft
            </span>
          </>
        )
      ) : isExpTarget ? (
        <span style={{ fontSize: 'clamp(20px, 2.3vh, 30px)', fontWeight: 900, color: pendingRoomColor || '#FBBF24' }}>
          {expDirection === 'right' ? '->' : 'v'}
        </span>
      ) : (
        <>
          <span
            style={{
              fontSize: 'clamp(10px, 1.2vh, 14px)',
              fontWeight: 700,
              color: '#5A6D66',
              textAlign: 'center',
              lineHeight: 1.1,
              whiteSpace: 'pre-line',
              letterSpacing: '0.2px',
            }}
          >
            {zoneLabel}
            {sideLabel ? `\n${sideLabel}` : ''}
          </span>
          <span
            style={{
              position: 'absolute',
              right: '4px',
              bottom: '3px',
              fontSize: '8px',
              color: '#7E8F8A',
              fontWeight: 600,
            }}
          >
            {cellKey}
          </span>
        </>
      )}
    </div>
  );
};

export default React.memo(ArchitecturalCell);
