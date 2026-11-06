import { Chess } from 'chess.js'
import type { Engine } from './engine'
import { classifyLoss, formatScore, scoreToCp } from './engine'
import type { Quality, Score } from './engine'

export interface MoveEvaluation {
  /** Потеря в сантипешках относительно лучшего хода (≥ 0) */
  loss: number
  quality: Quality
  bestUci: string
  bestSan: string
  /** Оценка лучшей линии «для белых», готовая к показу */
  bestEvalText: string
  /** Оценка позиции после сыгранного хода «для белых» */
  playedEvalText: string
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined }
}

function uciToSan(fen: string, uci: string): string {
  try {
    const c = new Chess(fen)
    return c.move(uciToMove(uci))?.san ?? uci
  } catch {
    return uci
  }
}

/** Сравнивает сыгранный ход с лучшим ходом движка в той же позиции. */
export async function evaluateMove(
  engine: Engine,
  fenBefore: string,
  uci: string,
  depth = 12,
): Promise<MoveEvaluation> {
  const before = await engine.analyse(fenBefore, { depth })
  const best = before[0]
  const bestCp = scoreToCp(best.score)
  const whiteBefore = fenBefore.split(' ')[1] === 'w'

  const c = new Chess(fenBefore)
  c.move(uciToMove(uci))
  const fenAfter = c.fen()

  let playedCp: number
  let playedScore: Score
  if (c.isCheckmate()) {
    playedCp = 1500
    playedScore = { mate: 0 }
  } else if (c.isGameOver()) {
    playedCp = 0
    playedScore = { cp: 0 }
  } else {
    const after = await engine.analyse(fenAfter, { depth })
    // оценка после хода дана с точки зрения соперника — переворачиваем
    const opp = after[0].score
    playedScore = opp.mate !== undefined ? { mate: -opp.mate } : { cp: -(opp.cp ?? 0) }
    playedCp = -scoreToCp(opp)
  }

  const loss = uci === best.pv[0] ? 0 : Math.max(0, bestCp - playedCp)
  return {
    loss,
    quality: classifyLoss(loss),
    bestUci: best.pv[0],
    bestSan: uciToSan(fenBefore, best.pv[0]),
    bestEvalText: formatScore(best.score, whiteBefore),
    playedEvalText:
      playedScore.mate === 0
        ? 'мат'
        : formatScore(playedScore, whiteBefore),
  }
}
