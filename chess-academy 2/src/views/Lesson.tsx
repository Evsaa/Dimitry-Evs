import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, HL_YELLOW } from '../components/Board'
import { Engine, QUALITY_META } from '../engine/engine'
import { evaluateMove } from '../engine/evaluate'
import type { MoveEvaluation } from '../engine/evaluate'
import type { Opening, Variation } from '../data/openings'
import type { ProgressApi } from '../lib/storage'

const START_FEN = new Chess().fen()

type Phase = 'theory' | 'practice' | 'drills' | 'done'

interface Props {
  opening: Opening
  variation: Variation
  progress: ProgressApi
  onExit: () => void
}

function playMoves(sans: string[]): Chess {
  const c = new Chess()
  for (const m of sans) c.move(m)
  return c
}

function moveLabel(index: number, san: string): string {
  const n = Math.floor(index / 2) + 1
  return index % 2 === 0 ? `${n}. ${san}` : `${n}… ${san}`
}

export function Lesson({ opening, variation, progress, onExit }: Props) {
  const line = variation.moves
  const drills = variation.drills
  const N = line.length
  const userIsWhite = opening.side === 'white'
  const orientation = opening.side

  const [phase, setPhase] = useState<Phase>('theory')
  const [theoryPly, setTheoryPly] = useState(0)
  const [practicePly, setPracticePly] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [hints, setHints] = useState(0)
  const [hintSquare, setHintSquare] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null)
  const [checking, setChecking] = useState(false)

  const [drillIdx, setDrillIdx] = useState(0)
  const [drillFen, setDrillFen] = useState<string | null>(null)
  const [drillResult, setDrillResult] = useState<{ ev: MoveEvaluation; ok: boolean } | null>(null)

  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    const e = new Engine()
    engineRef.current = e
    return () => {
      e.destroy()
      engineRef.current = null
    }
  }, [])

  // ---------- Прогресс ----------
  const total = N + N + drills.length
  const doneCount =
    phase === 'theory'
      ? theoryPly
      : phase === 'practice'
        ? N + practicePly
        : phase === 'drills'
          ? 2 * N + drillIdx
          : total
  const pct = Math.round((doneCount / total) * 100)

  // ---------- Теория ----------
  const theoryFen = useMemo(() => playMoves(line.slice(0, theoryPly).map((m) => m.san)).fen(), [line, theoryPly])
  const theoryMove = theoryPly > 0 ? line[theoryPly - 1] : null

  const nextTheory = () => {
    if (theoryPly < N) setTheoryPly(theoryPly + 1)
    else startPractice()
  }

  const startPractice = () => {
    setPhase('practice')
    setPracticePly(0)
    setFeedback(null)
    setHintSquare(null)
  }

  // ---------- Практика ----------
  const practiceChess = useMemo(
    () => playMoves(line.slice(0, practicePly).map((m) => m.san)),
    [line, practicePly],
  )
  const practiceFen = practiceChess.fen()
  const userTurn = (practicePly % 2 === 0) === userIsWhite

  // Ходы соперника играются автоматически
  useEffect(() => {
    if (phase !== 'practice') return
    if (practicePly >= N) {
      startDrills()
      return
    }
    if (!userTurn) {
      const t = setTimeout(() => setPracticePly((p) => p + 1), 550)
      return () => clearTimeout(t)
    }
  }, [phase, practicePly, userTurn])

  const onPracticeMove = useCallback(
    (from: string, to: string): boolean => {
      if (phase !== 'practice' || !userTurn || checking) return false
      const c = new Chess(practiceFen)
      let move
      try {
        move = c.move({ from, to, promotion: 'q' })
      } catch {
        return false
      }
      setHintSquare(null)
      const expected = line[practicePly]
      if (move.san === expected.san) {
        setFeedback({ kind: 'ok', text: `Верно! ${expected.why}` })
        setPracticePly(practicePly + 1)
        return true
      }
      setMistakes((m) => m + 1)
      setChecking(true)
      setFeedback({ kind: 'warn', text: 'Проверяю ход движком…' })
      const engine = engineRef.current
      const uci = from + to + (move.promotion ?? '')
      if (!engine) {
        setChecking(false)
        return false
      }
      evaluateMove(engine, practiceFen, uci, 10)
        .then((ev) => {
          const q = QUALITY_META[ev.quality]
          const kind = ev.quality === 'best' || ev.quality === 'good' ? 'warn' : 'bad'
          const note =
            kind === 'warn'
              ? 'Ход вполне играбельный, но мы учим основную линию.'
              : 'Такой ход ухудшает позицию.'
          setFeedback({
            kind,
            text: `${move.san} — не по теории. Оценка Stockfish: «${q.label}». ${note} Книжный ход: ${expected.san}.`,
          })
        })
        .catch(() =>
          setFeedback({ kind: 'warn', text: `${move.san} — не по теории. Книжный ход: ${expected.san}.` }),
        )
        .finally(() => setChecking(false))
      return false
    },
    [phase, userTurn, checking, practiceFen, line, practicePly],
  )

  const showHint = () => {
    const c = new Chess(practiceFen)
    const m = c.move(line[practicePly].san)
    setHintSquare(m.from)
    setHints((h) => h + 1)
  }

  // ---------- Тренировка: найди сильнейший ход ----------
  const startDrills = () => {
    if (drills.length === 0) return finish()
    setPhase('drills')
    setDrillIdx(0)
    setDrillFen(playMoves(drills[0].moves).fen())
    setDrillResult(null)
    setFeedback(null)
  }

  const drill = drills[drillIdx]
  const drillBase = useMemo(
    () => (drill ? playMoves(drill.moves).fen() : null),
    [drill],
  )

  const onDrillMove = (from: string, to: string): boolean => {
    if (phase !== 'drills' || !drillBase || drillResult || checking) return false
    const c = new Chess(drillBase)
    let move
    try {
      move = c.move({ from, to, promotion: 'q' })
    } catch {
      return false
    }
    const engine = engineRef.current
    if (!engine) return false
    setDrillFen(c.fen())
    setChecking(true)
    evaluateMove(engine, drillBase, from + to + (move.promotion ?? ''), 12)
      .then((ev) => {
        const ok = ev.loss <= 50
        if (!ok) setMistakes((m) => m + 1)
        setDrillResult({ ev, ok })
      })
      .finally(() => setChecking(false))
    return true
  }

  const nextDrill = () => {
    const next = drillIdx + 1
    if (next >= drills.length) return finish()
    setDrillIdx(next)
    setDrillFen(playMoves(drills[next].moves).fen())
    setDrillResult(null)
  }

  // ---------- Финиш ----------
  const penalty = mistakes + Math.floor(hints / 2)
  const stars = penalty <= 1 ? 3 : penalty <= 4 ? 2 : 1
  const finish = () => {
    setPhase('done')
    progress.finishLesson(`${opening.id}/${variation.id}`, stars, 20 + stars * 10)
  }

  const restart = () => {
    setPhase('theory')
    setTheoryPly(0)
    setPracticePly(0)
    setMistakes(0)
    setHints(0)
    setFeedback(null)
    setDrillResult(null)
  }

  // ---------- Рендер ----------
  const header = (
    <div className="topbar">
      <button className="x-btn" onClick={onExit} aria-label="Закрыть">✕</button>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <span className="chip header-chip">{opening.emoji} {opening.title} · {variation.title}</span>
    </div>
  )

  if (phase === 'done') {
    return (
      <>
        {header}
        <div className="card done">
          <div className="stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
          <h2>Урок пройден!</h2>
          <p className="hint">
            Ошибок: {mistakes} · подсказок: {hints}. Заработано +{20 + stars * 10} XP.
          </p>
          <div className="row">
            <button className="btn ghost" onClick={restart}>Пройти ещё раз</button>
            <button className="btn" onClick={onExit}>К дебютам</button>
          </div>
        </div>
      </>
    )
  }

  if (phase === 'theory') {
    return (
      <>
        {header}
        <div className="stage">
          <Board fen={theoryFen} orientation={orientation} disabled />
          <div className="side">
            <div className="card">
              <div className="phase-tag">Шаг 1 · Теория</div>
              {theoryPly === 0 ? (
                <>
                  <h2 style={{ margin: '8px 0 6px' }}>{variation.title}</h2>
                  <p className="hint" style={{ marginBottom: 12 }}>{opening.title} · {variation.tagline}</p>
                  <p className="explain">{variation.keyIdea}</p>
                  <h3 style={{ margin: '16px 0 6px', fontSize: 16 }}>Цели в дебюте</h3>
                  <ul className="goals">
                    {opening.goals.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </>
              ) : (
                <>
                  <div className="move-big" style={{ margin: '8px 0 10px' }}>
                    {moveLabel(theoryPly - 1, theoryMove!.san)}
                  </div>
                  <p className="explain">{theoryMove!.why}</p>
                </>
              )}
            </div>
            <div className="row">
              <button className="btn ghost" disabled={theoryPly === 0} onClick={() => setTheoryPly(theoryPly - 1)}>Назад</button>
              <button className="btn" onClick={nextTheory}>
                {theoryPly === 0 ? 'Начать' : theoryPly < N ? 'Продолжить' : 'К практике'}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (phase === 'practice') {
    return (
      <>
        {header}
        <div className="stage">
          <Board
            fen={practiceFen}
            orientation={orientation}
            onMove={onPracticeMove}
            disabled={!userTurn || checking}
            squareStyles={hintSquare ? { [hintSquare]: HL_YELLOW } : undefined}
          />
          <div className="side">
            <div className="card">
              <div className="phase-tag">Шаг 2 · Практика</div>
              <h2 style={{ margin: '8px 0 10px' }}>Повтори линию по памяти</h2>
              <p className="explain">
                {userTurn
                  ? `Твой ход за ${userIsWhite ? 'белых' : 'чёрных'}. Сыграй следующий ход дебюта.`
                  : 'Отвечает соперник…'}
              </p>
              <p className="hint" style={{ marginTop: 10 }}>Ход {Math.min(practicePly + 1, N)} из {N}</p>
            </div>
            {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
            <div className="row">
              <button className="btn ghost sm" disabled={!userTurn || checking} onClick={showHint}>💡 Подсказка</button>
              <button className="btn ghost sm" onClick={() => setPhase('theory')}>Вернуться к теории</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // drills
  const best = drillResult?.ev
  return (
    <>
      {header}
      <div className="stage">
        <Board
          fen={drillFen ?? drillBase ?? START_FEN}
          orientation={drillBase?.split(' ')[1] === 'w' ? 'white' : 'black'}
          onMove={onDrillMove}
          disabled={!!drillResult || checking}
          arrows={
            best && !drillResult!.ok
              ? [{ startSquare: best.bestUci.slice(0, 2), endSquare: best.bestUci.slice(2, 4), color: '#5bd25c' }]
              : []
          }
        />
        <div className="side">
          <div className="card">
            <div className="phase-tag">Шаг 3 · Найди сильнейший ход ({drillIdx + 1}/{drills.length})</div>
            <h2 style={{ margin: '8px 0 10px' }}>{drill.prompt}</h2>
            <p className="hint">Подумай о фигурах соперника и своих целях, затем сделай ход. Stockfish проверит.</p>
          </div>
          {checking && !drillResult && (
            <div className="feedback warn"><span className="spinner" /> Stockfish считает…</div>
          )}
          {drillResult && best && (
            <div className={`feedback ${drillResult.ok ? 'ok' : 'bad'}`}>
              <b style={{ color: QUALITY_META[best.quality].color }}>{QUALITY_META[best.quality].label}</b>
              {drillResult.ok
                ? ` — отличный выбор! Сильнейший по мнению движка: ${best.bestSan} (${best.bestEvalText}).`
                : ` — сильнее было ${best.bestSan} (${best.bestEvalText}, после твоего хода ${best.playedEvalText}). Стрелка на доске показывает его.`}
              <p style={{ marginTop: 8 }}>{drill.idea}</p>
            </div>
          )}
          {drillResult && (
            <button className="btn" onClick={nextDrill}>
              {drillIdx + 1 < drills.length ? 'Дальше' : 'Завершить урок'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
