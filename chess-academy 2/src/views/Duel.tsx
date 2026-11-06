import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, HL_RED } from '../components/Board'
import { Engine, QUALITY_META, classifyLoss, scoreToCp } from '../engine/engine'
import type { EngineLine, Quality } from '../engine/engine'
import { uciToMove } from '../engine/evaluate'
import { findThreats, PIECE_NAME } from '../lib/threats'
import type { Threat } from '../lib/threats'
import type { ProgressApi } from '../lib/storage'

interface Level {
  id: number
  name: string
  emoji: string
  desc: string
  skill: number
  depth: number
}

const LEVELS: Level[] = [
  { id: 1, name: 'Новичок', emoji: '🐣', desc: 'Часто зевает фигуры. Идеально, чтобы набить руку.', skill: 0, depth: 1 },
  { id: 2, name: 'Любитель', emoji: '🎯', desc: 'Видит простые тактики на 1–2 хода.', skill: 4, depth: 3 },
  { id: 3, name: 'Клубный игрок', emoji: '⚔️', desc: 'Играет осмысленно и наказывает за зевки.', skill: 9, depth: 6 },
  { id: 4, name: 'Сильный', emoji: '🔥', desc: 'Почти не ошибается. Проверь, насколько ты внимателен.', skill: 14, depth: 10 },
]

interface MoveLog {
  san: string
  color: 'w' | 'b'
  quality?: Quality
}

interface Props {
  progress: ProgressApi
  onExit: () => void
}

type Stage = 'threat' | 'move' | 'bot' | 'over'

const THREAT_OPTIONS = [0, 1, 2, 3]

export function Duel({ progress, onExit }: Props) {
  const [level, setLevel] = useState<Level | null>(null)
  const [userColor, setUserColor] = useState<'w' | 'b'>('w')
  const [started, setStarted] = useState(false)

  if (!started || !level) {
    return (
      <Setup
        userColor={userColor}
        setUserColor={setUserColor}
        onPick={(l) => {
          setLevel(l)
          setStarted(true)
        }}
        onExit={onExit}
      />
    )
  }
  return (
    <Game
      level={level}
      userColor={userColor}
      progress={progress}
      onExit={() => {
        setStarted(false)
      }}
    />
  )
}

function Setup({
  userColor,
  setUserColor,
  onPick,
  onExit,
}: {
  userColor: 'w' | 'b'
  setUserColor: (c: 'w' | 'b') => void
  onPick: (l: Level) => void
  onExit: () => void
}) {
  return (
    <>
      <div className="topbar">
        <button className="x-btn" onClick={onExit} aria-label="Назад">←</button>
        <h1 className="page-title" style={{ margin: 0 }}>Дуэль с ботом</h1>
      </div>
      <p className="page-sub">
        Правило дуэли: <b>перед каждым ходом ты оцениваешь угрозы</b>. Сколько твоих фигур сейчас под ударом? Только
        после ответа можно ходить. После хода Stockfish сразу скажет, насколько он был силён.
      </p>
      <div className="row" style={{ marginBottom: 20 }}>
        <span className="hint">Играть за:</span>
        <button className={`btn sm ${userColor === 'w' ? '' : 'ghost'}`} onClick={() => setUserColor('w')}>⬜ Белых</button>
        <button className={`btn sm ${userColor === 'b' ? '' : 'ghost'}`} onClick={() => setUserColor('b')}>⬛ Чёрных</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {LEVELS.map((l) => (
          <button key={l.id} className="card tile level" onClick={() => onPick(l)}>
            <span className="tile-emoji">{l.emoji}</span>
            <span>
              <h3>{l.name}</h3>
              <p>{l.desc}</p>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function Game({
  level,
  userColor,
  progress,
  onExit,
}: {
  level: Level
  userColor: 'w' | 'b'
  progress: ProgressApi
  onExit: () => void
}) {
  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState(() => new Chess().fen())
  const [stage, setStage] = useState<Stage>(userColor === 'w' ? 'threat' : 'bot')
  const [log, setLog] = useState<MoveLog[]>([])
  const [threats, setThreats] = useState<Threat[]>([])
  const [answer, setAnswer] = useState<number | null>(null)
  const [threatScore, setThreatScore] = useState({ right: 0, total: 0 })
  const [lastQuality, setLastQuality] = useState<{ q: Quality; best: string; loss: number } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)

  const analyser = useRef<Engine | null>(null)
  const bot = useRef<Engine | null>(null)
  const evalBefore = useRef<Promise<EngineLine[]> | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    analyser.current = new Engine()
    bot.current = new Engine({ 'Skill Level': level.skill })
    return () => {
      alive.current = false
      analyser.current?.destroy()
      bot.current?.destroy()
      analyser.current = null
      bot.current = null
    }
  }, [level.skill])

  const checkEnd = useCallback((): boolean => {
    const c = chessRef.current
    if (!c.isGameOver()) return false
    let text = 'Ничья'
    if (c.isCheckmate()) text = c.turn() === userColor ? 'Мат. Ты проиграл' : 'Мат! Ты победил 🎉'
    else if (c.isStalemate()) text = 'Пат: ничья'
    else if (c.isThreefoldRepetition()) text = 'Ничья повторением позиции'
    else if (c.isInsufficientMaterial()) text = 'Ничья: мало материала'
    setResult(text)
    setStage('over')
    return true
  }, [userColor])

  // Начало хода пользователя: считаем угрозы и запускаем фоновый анализ позиции.
  const beginUserTurn = useCallback(() => {
    const c = chessRef.current
    setThreats(findThreats(c, userColor))
    setAnswer(null)
    const hasOppAttacks = c.history().length > 0
    if (!hasOppAttacks) {
      // самый первый ход белых: проверять нечего
      setStage('move')
    } else {
      setStage('threat')
    }
    const a = analyser.current
    evalBefore.current = a ? a.analyse(c.fen(), { depth: 10 }) : null
  }, [userColor])

  const botMove = useCallback(async () => {
    const b = bot.current
    if (!b) return
    setThinking(true)
    const c = chessRef.current
    const uci = await b.bestMove(c.fen(), { depth: level.depth })
    await new Promise((r) => setTimeout(r, 450))
    if (!alive.current || !uci) return
    const mv = c.move(uciToMove(uci))
    setLog((l) => [...l, { san: mv.san, color: mv.color }])
    setFen(c.fen())
    setThinking(false)
    if (!checkEnd()) beginUserTurn()
  }, [level.depth, checkEnd, beginUserTurn])

  // Старт партии
  useEffect(() => {
    const t = setTimeout(() => {
      if (userColor === 'w') beginUserTurn()
      else void botMove()
    }, 250)
    return () => clearTimeout(t)
    // запускаем один раз при монтировании партии
  }, [])

  const answerThreat = (n: number) => {
    if (answer !== null) return
    const actual = Math.min(threats.length, 3)
    setAnswer(n)
    setThreatScore((s) => ({ right: s.right + (n === actual ? 1 : 0), total: s.total + 1 }))
    if (n === actual) {
      progress.addXp(3)
      setXpEarned((x) => x + 3)
    }
  }

  const onUserMove = (from: string, to: string): boolean => {
    if (stage !== 'move') return false
    const c = chessRef.current
    const fenBefore = c.fen()
    let mv
    try {
      mv = c.move({ from, to, promotion: 'q' })
    } catch {
      return false
    }
    const uci = from + to + (mv.promotion ?? '')
    setFen(c.fen())
    setStage('bot')
    const entryIndex = log.length
    setLog((l) => [...l, { san: mv.san, color: mv.color }])

    // оценка качества хода (фоном)
    const before = evalBefore.current
    const a = analyser.current
    const mateNow = c.isCheckmate()
    void (async () => {
      if (!before || !a) return
      try {
        const lines = await before
        const best = lines[0]
        const bestCp = scoreToCp(best.score)
        let playedCp = 1500
        if (!mateNow) {
          const after = await a.analyse(c.fen(), { depth: 10 })
          playedCp = c.isGameOver() ? 0 : -scoreToCp(after[0].score)
        }
        const loss = uci === best.pv[0] ? 0 : Math.max(0, bestCp - playedCp)
        const q = classifyLoss(loss)
        if (!alive.current) return
        let bestSan = best.pv[0]
        try {
          bestSan = new Chess(fenBefore).move(uciToMove(best.pv[0])).san
        } catch {
          /* оставляем UCI */
        }
        setLastQuality({ q, best: bestSan, loss })
        setLog((l) => l.map((m, i) => (i === entryIndex ? { ...m, quality: q } : m)))
        const gain = q === 'best' ? 4 : q === 'good' ? 2 : 0
        if (gain) {
          progress.addXp(gain)
          setXpEarned((x) => x + gain)
        }
      } catch {
        /* анализ прерван при выходе */
      }
    })()

    if (!checkEnd()) void botMove()
    return true
  }

  const resign = () => {
    setResult('Ты сдался')
    setStage('over')
  }

  const squareStyles = useMemo(() => {
    if (stage !== 'threat' || answer === null) return undefined
    const styles: Record<string, React.CSSProperties> = {}
    for (const t of threats) styles[t.square] = HL_RED
    return styles
  }, [stage, answer, threats])

  const orientation = userColor === 'w' ? 'white' : 'black'
  const actualThreats = Math.min(threats.length, 3)
  const q = lastQuality ? QUALITY_META[lastQuality.q] : null

  // ходы по парам для списка
  const rows: { n: number; w?: MoveLog; b?: MoveLog }[] = []
  // Лог идёт от начала партии: белые всегда первые.
  for (let i = 0; i < log.length; i += 2) rows.push({ n: i / 2 + 1, w: log[i], b: log[i + 1] })

  return (
    <>
      <div className="topbar">
        <button className="x-btn" onClick={onExit} aria-label="Выйти">✕</button>
        <h2 style={{ flex: 1 }}>Дуэль · {level.emoji} {level.name}</h2>
        <span className="chip">Угрозы: {threatScore.right}/{threatScore.total}</span>
        <span className="chip">+{xpEarned} XP</span>
      </div>
      <div className="stage">
        <Board
          fen={fen}
          orientation={orientation}
          onMove={onUserMove}
          disabled={stage !== 'move'}
          squareStyles={squareStyles}
        />
        <div className="side">
          {stage === 'threat' && (
            <div className="card">
              <div className="phase-tag">Проверка перед ходом</div>
              <h2 style={{ margin: '8px 0 10px' }}>Сколько твоих фигур под угрозой?</h2>
              <p className="hint" style={{ marginBottom: 14 }}>
                Считай фигуры, которые соперник может выиграть: они не защищены или их атакует более дешёвая фигура.
                Король не считается.
              </p>
              <div className="choice-grid">
                {THREAT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    className={`choice ${answer !== null ? (n === actualThreats ? 'right' : n === answer ? 'wrong' : '') : ''}`}
                    disabled={answer !== null}
                    onClick={() => answerThreat(n)}
                  >
                    {n === 3 ? '3+' : n}
                  </button>
                ))}
              </div>
              {answer !== null && (
                <div style={{ marginTop: 14 }}>
                  <div className={`feedback ${answer === actualThreats ? 'ok' : 'bad'}`}>
                    <b>{answer === actualThreats ? 'Верно!' : 'Не совсем.'}</b>{' '}
                    {threats.length === 0
                      ? 'Сейчас ничто не висит. Можно спокойно развивать свой план.'
                      : `Под угрозой: ${threats.map((t) => `${PIECE_NAME[t.piece]} на ${t.square}`).join(', ')}. Они подсвечены на доске.`}
                  </div>
                  <button className="btn" style={{ marginTop: 14 }} onClick={() => setStage('move')}>
                    Перейти к ходу
                  </button>
                </div>
              )}
            </div>
          )}

          {stage === 'move' && (
            <div className="card">
              <div className="phase-tag">Твой ход</div>
              <h2 style={{ margin: '8px 0 10px' }}>Ищи сильнейший ход</h2>
              <p className="hint">
                Перебери ходы-кандидаты: шахи, взятия, угрозы. Сначала проверь, не ставит ли твой ход что-то под удар.
              </p>
            </div>
          )}

          {stage === 'bot' && (
            <div className="card">
              <div className="phase-tag">Ход соперника</div>
              <p className="explain" style={{ marginTop: 8 }}>
                {thinking ? <><span className="spinner" /> Бот думает…</> : 'Подожди…'}
              </p>
            </div>
          )}

          {stage === 'over' && result && (
            <div className="card done" style={{ padding: 24 }}>
              <h2>{result}</h2>
              <p className="hint">
                Угрозы определены верно: {threatScore.right} из {threatScore.total}. Заработано +{xpEarned} XP.
              </p>
              <button className="btn" onClick={onExit}>Новая партия</button>
            </div>
          )}

          {lastQuality && q && stage !== 'over' && (
            <div className="feedback" style={{ borderColor: q.color, background: 'var(--panel)' }}>
              Прошлый ход: <b style={{ color: q.color }}>{q.label}</b>
              {lastQuality.loss > 50 && <> · сильнее было <b>{lastQuality.best}</b></>}
            </div>
          )}

          <div className="card">
            <div className="phase-tag" style={{ marginBottom: 8 }}>Ходы</div>
            <div className="moves">
              {rows.map((r) => (
                <MoveRow key={r.n} row={r} />
              ))}
            </div>
          </div>

          {stage !== 'over' && <button className="btn ghost sm" onClick={resign}>Сдаться</button>}
        </div>
      </div>
    </>
  )
}

function MoveRow({ row }: { row: { n: number; w?: MoveLog; b?: MoveLog } }) {
  const cell = (m?: MoveLog) =>
    m ? (
      <span className="m">
        {m.quality && <span className="dot" style={{ background: QUALITY_META[m.quality].color }} />}
        {m.san}
      </span>
    ) : (
      <span />
    )
  return (
    <>
      <span className="n">{row.n}.</span>
      {cell(row.w)}
      {cell(row.b)}
    </>
  )
}

