import { Chess } from 'chess.js'
import type { Color, PieceSymbol, Square } from 'chess.js'

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

export interface Threat {
  square: Square
  piece: PieceSymbol
  /** Чем именно угрожают */
  reason: 'undefended' | 'cheaper-attacker'
}

/**
 * Какие фигуры стороны `me` (кроме короля) сейчас под реальной угрозой:
 * их атакует соперник, и они либо не защищены, либо атакованы более дешёвой фигурой.
 */
export function findThreats(chess: Chess, me: Color): Threat[] {
  const opp: Color = me === 'w' ? 'b' : 'w'
  const threats: Threat[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== me || cell.type === 'k') continue
      const attackers = chess.attackers(cell.square, opp)
      if (attackers.length === 0) continue
      const defenders = chess.attackers(cell.square, me)
      const cheapest = Math.min(
        ...attackers.map((s) => VALUE[chess.get(s)!.type]),
      )
      if (defenders.length === 0) {
        threats.push({ square: cell.square, piece: cell.type, reason: 'undefended' })
      } else if (cheapest < VALUE[cell.type]) {
        threats.push({ square: cell.square, piece: cell.type, reason: 'cheaper-attacker' })
      }
    }
  }
  return threats
}

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'пешка',
  n: 'конь',
  b: 'слон',
  r: 'ладья',
  q: 'ферзь',
  k: 'король',
}
