import { Chessboard } from 'react-chessboard'
import type { CSSProperties } from 'react'

interface Props {
  fen: string
  orientation?: 'white' | 'black'
  /** Вернуть true, если ход принят */
  onMove?: (from: string, to: string) => boolean
  disabled?: boolean
  squareStyles?: Record<string, CSSProperties>
  arrows?: { startSquare: string; endSquare: string; color: string }[]
  onSquareClick?: (square: string) => void
}

export function Board({ fen, orientation = 'white', onMove, disabled, squareStyles, arrows, onSquareClick }: Props) {
  return (
    <div className="board-wrap">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: !disabled,
          animationDurationInMs: 180,
          lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
          darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
          squareStyles: squareStyles ?? {},
          arrows: arrows ?? [],
          allowDrawingArrows: false,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare || !onMove) return false
            return onMove(sourceSquare, targetSquare)
          },
          onSquareClick: onSquareClick ? ({ square }) => onSquareClick(square) : undefined,
        }}
      />
    </div>
  )
}

export const HL_YELLOW: CSSProperties = { boxShadow: 'inset 0 0 0 5px rgba(255,201,74,.9)' }
export const HL_GREEN: CSSProperties = { backgroundColor: 'rgba(91,210,92,.55)' }
export const HL_RED: CSSProperties = { boxShadow: 'inset 0 0 0 5px rgba(255,107,107,.95)', backgroundColor: 'rgba(255,107,107,.25)' }
