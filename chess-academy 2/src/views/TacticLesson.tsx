import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, HL_YELLOW } from '../components/Board'
import { Engine } from '../engine/engine'
import { evaluateMove } from '../engine/evaluate'
import type { TacticTopic } from '../data/types'
import type { ProgressApi } from '../lib/storage'

type Phase = 'intro' | 'puzzles' | 'done'
type Status = 'solving' | 'solved' | 'revealed'

interface Props {
  topic: TacticTopic
  kind?: 'tactic' | 'endgame'
  progress: ProgressApi
  onExit: () => void
}

function sideOf(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black'
}

function moveSquares(fen: string, san: string): { from: string; to: string } | null {
  try {
    const m = new Chess(fen).move(san)
    return { from: m.from, to: m.to }
  } catch {
    return null
  }
}

export function TacticLesson({ topic, kind = 'tactic', progress, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>('intro')

  // ---- вступление: демонстрация ----
  const [demoStep, setDemoStep] = useState(0)
  const demoFen = useMemo(() => {
    const c = new Chess(topic.demo.fen)
    for (const m of topic.demo.moves.slice(0, demoStep)) c.move(m)
    return c.fen()
  }, [topic, demoStep])

  // ---- задачи ----
  const [idx, setIdx] = useState(0)
  const [step, setStep] = useState(0)
  const [fen, setFen] = useState(topic.puzzles[0].fen)
  const [status, setStatus] = useState<Status>('solving')
  const [hint, setHint] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [failed, setFailed] = useState(0)
  const [attempted, setAttempted] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'bad'; text: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)

  const puzzle = topic.puzzles[idx]
  const engineRef = useRef<Engine | null>(null)
  useEffect(() => {
    const e = new Engine()
    engineRef.current = e
    return () => {
      e.destroy()
      engineRef.current = null
    }
  }, [])

  const total = 1 + topic.puzzles.length
  const pct = Math.round(((phase === 'intro' ? 0 : phase === 'done' ? total : 1 + idx + (status === 'solving' ? 0 : 1)) / total) * 100)

  const loadPuzzle = (i: number) => {
    setIdx(i)
    setStep(0)
    setFen(topic.puzzles[i].fen)
    setStatus('solving')
    setHint(0)
    setAttempted(false)
    setMsg(null)
  }

  const markFailedOnce = () => {
    if (!attempted) {
      setAttempted(true)
      setFailed((f) => f + 1)
    }
  }

  const onMove = (from: string, to: string): boolean => {
    if (status !== 'solving' || checking || busy) return false
    const c = new Chess(fen)
    let move
    try {
      move = c.move({ from, to, promotion: 'q' })
    } catch {
      return false
    }
    const expected = puzzle.solution[step]
    if (move.san === expected) {
      setHint(0)
      const next = step + 1
      if (next >= puzzle.solution.length) {
        setFen(c.fen())
        setStatus('solved')
        setMsg({ kind: 'ok', text: 'Верно! ' + puzzle.idea })
        return true
      }
      // ответ соперника
      setFen(c.fen())
      setBusy(true)
      setMsg({ kind: 'ok', text: 'Верно! Соперник отвечает…' })
      setTimeout(() => {
        const r = new Chess(c.fen())
        r.move(puzzle.solution[next])
        setFen(r.fen())
        setStep(next + 1)
        setBusy(false)
        setMsg({ kind: 'ok', text: 'Продолжай: найди следующий сильный ход.' })
      }, 650)
      return true
    }
    // не совпало с решением: даём движку решить, нет ли равноценной альтернативы
    const engine = engineRef.current
    if (!engine) return false
    markFailedOnce()
    setMistakes((m) => m + 1)
    setChecking(true)
    setMsg({ kind: 'warn', text: 'Проверяю ход движком…' })
    const uci = from + to + (move.promotion ?? '')
    const before = fen
    evaluateMove(engine, before, uci, 12)
      .then((ev) => {
        if (ev.loss <= 40) {
          const c2 = new Chess(before)
          c2.move({ from, to, promotion: 'q' })
          setFen(c2.fen())
          setStatus('solved')
          setMsg({
            kind: 'ok',
            text: `Тоже сильный ход! Задуманное решение: ${expected}. ${puzzle.idea}`,
          })
        } else {
          setMsg({
            kind: 'bad',
            text: `${move.san} не подходит: оценка падает почти на ${Math.round(ev.loss / 10) / 10} пешки. Подумай ещё: какую цель можно атаковать двумя способами сразу? Можно взять подсказку.`,
          })
        }
      })
      .catch(() => setMsg({ kind: 'bad', text: `${move.san} не подходит. Попробуй ещё.` }))
      .finally(() => setChecking(false))
    return false
  }

  const showHint = () => {
    markFailedOnce()
    setHint((h) => Math.min(2, h + 1))
  }

  const reveal = () => {
    markFailedOnce()
    setStatus('revealed')
    setMsg({ kind: 'warn', text: `Решение: ${puzzle.solution[step]}. ${puzzle.idea}` })
  }

  const nextPuzzle = () => {
    if (idx + 1 >= topic.puzzles.length) {
      finish()
    } else {
      loadPuzzle(idx + 1)
    }
  }

  const stars = failed === 0 ? 3 : failed <= 2 ? 2 : 1
  const finish = () => {
    setPhase('done')
    progress.finishLesson(`${kind}:${topic.id}`, stars, 15 + stars * 10)
  }

  const restart = () => {
    setPhase('intro')
    setDemoStep(0)
    setMistakes(0)
    setFailed(0)
    loadPuzzle(0)
  }

  const header = (
    <div className="topbar">
      <button className="x-btn" onClick={onExit} aria-label="Закрыть">✕</button>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <span className="chip header-chip">{topic.emoji} {topic.title}</span>
    </div>
  )

  if (phase === 'done') {
    return (
      <>
        {header}
        <div className="card done">
          <div className="stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
          <h2>Тема пройдена!</h2>
          <p className="hint">
            Задач с первой попытки: {topic.puzzles.length - failed} из {topic.puzzles.length}. Заработано +{15 + stars * 10} XP.
          </p>
          <div className="row">
            <button className="btn ghost" onClick={restart}>Пройти ещё раз</button>
            <button className="btn" onClick={onExit}>К темам</button>
          </div>
        </div>
      </>
    )
  }

  if (phase === 'intro') {
    const demoDone = demoStep >= topic.demo.moves.length
    return (
      <>
        {header}
        <div className="stage">
          <Board fen={demoFen} orientation={sideOf(topic.demo.fen)} disabled />
          <div className="side">
            <div className="card">
              <div className="phase-tag">Шаг 1 · Как это работает</div>
              <h2 style={{ margin: '8px 0 10px' }}>{topic.title}</h2>
              <p className="explain">{topic.summary}</p>
              <p className="hint" style={{ marginTop: 12 }}>
                {demoDone ? topic.demo.caption : 'Нажми «Показать приём», чтобы увидеть его на доске.'}
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="btn blue sm"
                  onClick={() => setDemoStep(demoDone ? 0 : demoStep + 1)}
                >
                  {demoDone ? 'Ещё раз' : demoStep === 0 ? 'Показать приём' : 'Дальше'}
                </button>
              </div>
            </div>
            <div className="card">
              <div className="phase-tag">Как заметить</div>
              <ul className="goals" style={{ marginTop: 8 }}>
                {topic.signs.map((s) => <li key={s}>{s}</li>)}
              </ul>
              <div className="feedback warn" style={{ marginTop: 14 }}>
                <b>Типичная ошибка:</b> {topic.pitfall}
              </div>
            </div>
            <button className="btn" onClick={() => { loadPuzzle(0); setPhase('puzzles') }}>К задачам</button>
          </div>
        </div>
      </>
    )
  }

  // задачи
  const sol = status === 'solving' ? puzzle.solution[step] : null
  const solSq = sol ? moveSquares(fen, sol) : null
  const squareStyles = solSq && hint >= 1 ? { [solSq.from]: HL_YELLOW } : undefined
  const arrows = solSq && hint >= 2 ? [{ startSquare: solSq.from, endSquare: solSq.to, color: '#5bd25c' }]
    : status === 'revealed' ? (() => {
      const s = moveSquares(puzzle.fen, puzzle.solution[0])
      return s ? [{ startSquare: s.from, endSquare: s.to, color: '#5bd25c' }] : []
    })() : []
  const side = sideOf(puzzle.fen)

  return (
    <>
      {header}
      <div className="stage">
        <Board
          fen={fen}
          orientation={side}
          onMove={onMove}
          disabled={status !== 'solving' || checking || busy}
          squareStyles={squareStyles}
          arrows={arrows}
        />
        <div className="side">
          <div className="card">
            <div className="phase-tag">Шаг 2 · Задача {idx + 1} из {topic.puzzles.length}</div>
            <h2 style={{ margin: '8px 0 10px' }}>{puzzle.prompt}</h2>
            <p className="hint">
              Ходят {side === 'white' ? 'белые' : 'чёрные'}.
              {puzzle.solution.length > 1 && ` Решение в ${Math.ceil(puzzle.solution.length / 2)} хода.`}
            </p>
          </div>
          {msg && <div className={`feedback ${msg.kind}`}>{checking && <span className="spinner" />} {msg.text}</div>}
          {status === 'solving' ? (
            <div className="row">
              <button className="btn ghost sm" disabled={checking || busy || hint >= 2} onClick={showHint}>
                💡 {hint === 0 ? 'Подсказка' : 'Ещё подсказка'}
              </button>
              <button className="btn ghost sm" disabled={checking || busy} onClick={reveal}>Показать решение</button>
              {mistakes > 0 && <span className="chip">Ошибок: {mistakes}</span>}
            </div>
          ) : (
            <button className="btn" onClick={nextPuzzle}>
              {idx + 1 < topic.puzzles.length ? 'Следующая задача' : 'Завершить тему'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
