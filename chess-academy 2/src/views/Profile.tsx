import { useState } from 'react'
import { fetchPlayer, fetchRecentGames, openingStats } from '../lib/chesscom'
import type { GameSummary, OpeningStat, PlayerSummary } from '../lib/chesscom'
import { OPENINGS } from '../data/openings'
import type { ProgressApi } from '../lib/storage'

interface Props {
  progress: ProgressApi
  onOpenLesson: (id: string) => void
}

// Связываем названия с chess.com с нашими уроками
const LESSON_KEYWORDS: { id: string; words: string[] }[] = [
  { id: 'italian', words: ['italian', 'giuoco', 'two knights'] },
  { id: 'london', words: ['london'] },
  { id: 'ruy-lopez', words: ['ruy', 'spanish', 'berlin'] },
  { id: 'queens-gambit', words: ["queen's gambit", 'queens gambit'] },
  { id: 'scotch', words: ['scotch'] },
  { id: 'caro-kann', words: ['caro'] },
  { id: 'sicilian', words: ['sicilian'] },
  { id: 'french', words: ['french'] },
  { id: 'scandinavian', words: ['scandinavian', 'center counter'] },
  { id: 'slav', words: ['slav'] },
]

function lessonFor(name: string): string | null {
  const n = name.toLowerCase()
  return LESSON_KEYWORDS.find((k) => k.words.some((w) => n.includes(w)))?.id ?? null
}

export function Profile({ progress, onOpenLesson }: Props) {
  const [input, setInput] = useState(progress.progress.chesscomUser)
  const [player, setPlayer] = useState<PlayerSummary | null>(null)
  const [games, setGames] = useState<GameSummary[]>([])
  const [stats, setStats] = useState<OpeningStat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await fetchPlayer(input)
      const g = await fetchRecentGames(input, 40)
      setPlayer(p)
      setGames(g)
      setStats(openingStats(g))
      progress.update((pr) => ({ ...pr, chesscomUser: p.username }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  const wins = games.filter((g) => g.outcome === 'win').length
  const losses = games.filter((g) => g.outcome === 'loss').length
  const draws = games.length - wins - losses

  // Самый «проблемный» дебют: минимум 3 партии, худший процент очков
  const weak = stats
    .filter((s) => s.games >= 3)
    .map((s) => ({ ...s, score: (s.wins + s.draws * 0.5) / s.games }))
    .sort((a, b) => a.score - b.score)[0]

  const reasons = games.filter((g) => g.outcome === 'loss').reduce<Record<string, number>>((acc, g) => {
    acc[g.endReason] = (acc[g.endReason] ?? 0) + 1
    return acc
  }, {})

  return (
    <>
      <h1 className="page-title">Профиль chess.com</h1>
      <p className="page-sub">Подключи аккаунт, и приложение разберёт твои последние партии и подскажет, что учить.</p>

      <div className="row" style={{ marginBottom: 24 }}>
        <input
          className="input"
          placeholder="Ник на chess.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && void connect()}
        />
        <button className="btn blue" disabled={loading || !input.trim()} onClick={() => void connect()}>
          {loading ? 'Загружаю…' : 'Подключить'}
        </button>
        {loading && <span className="spinner" />}
      </div>
      {error && <div className="feedback bad" style={{ marginBottom: 20 }}>{error}</div>}

      {player && (
        <>
          <div className="card row" style={{ gap: 18, marginBottom: 16 }}>
            {player.avatar && <img src={player.avatar} alt="" width={64} height={64} style={{ borderRadius: 14 }} />}
            <div>
              <h2>{player.username}</h2>
              <p className="hint">Партий в выборке: {games.length}</p>
            </div>
          </div>

          <div className="stat-grid">
            {player.ratings.map((r) => (
              <div key={r.mode} className="card">
                <div className="phase-tag">{r.label}</div>
                <div className="big-num">{r.rating}</div>
              </div>
            ))}
            <div className="card">
              <div className="phase-tag">Результат</div>
              <div className="big-num">
                <span className="win">{wins}</span> / <span className="draw">{draws}</span> / <span className="loss">{losses}</span>
              </div>
              <p className="hint">победы / ничьи / поражения</p>
            </div>
          </div>

          {weak && (
            <div className="feedback warn" style={{ margin: '20px 0 0' }}>
              <b>Зона роста:</b> дебют «{weak.name}» за {weak.color === 'white' ? 'белых' : 'чёрных'}: {weak.wins} побед из{' '}
              {weak.games} партий.
              {lessonFor(weak.name) && (
                <>
                  {' '}
                  <button className="btn sm blue" style={{ marginLeft: 8 }} onClick={() => onOpenLesson(lessonFor(weak.name)!)}>
                    Изучить дебют
                  </button>
                </>
              )}
            </div>
          )}

          {Object.keys(reasons).length > 0 && (
            <div className="section-head"><h2>Как ты проигрываешь</h2><div className="line" /></div>
          )}
          <div className="chips">
            {Object.entries(reasons).map(([k, v]) => (
              <span key={k} className="chip">{k}: {v}</span>
            ))}
          </div>

          <div className="section-head"><h2>Твои дебюты</h2><div className="line" /></div>
          <div className="card">
            <table className="table">
              <thead>
                <tr><th>Дебют</th><th>Цвет</th><th>Партий</th><th>В / Н / П</th><th /></tr>
              </thead>
              <tbody>
                {stats.slice(0, 12).map((s) => {
                  const id = lessonFor(s.name)
                  return (
                    <tr key={`${s.color}:${s.name}`}>
                      <td>{s.name}</td>
                      <td>{s.color === 'white' ? '⬜' : '⬛'}</td>
                      <td>{s.games}</td>
                      <td><span className="win">{s.wins}</span> / {s.draws} / <span className="loss">{s.losses}</span></td>
                      <td>{id && OPENINGS.some((o) => o.id === id) && (
                        <button className="btn sm ghost" onClick={() => onOpenLesson(id)}>Урок</button>
                      )}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="section-head"><h2>Последние партии</h2><div className="line" /></div>
          <div className="card">
            <table className="table">
              <thead>
                <tr><th>Итог</th><th>Соперник</th><th>Дебют</th><th>Контроль</th><th /></tr>
              </thead>
              <tbody>
                {games.slice(0, 15).map((g) => (
                  <tr key={g.url}>
                    <td className={g.outcome}>
                      {g.outcome === 'win' ? 'Победа' : g.outcome === 'loss' ? 'Поражение' : 'Ничья'} · {g.endReason}
                    </td>
                    <td>{g.opponent} ({g.opponentRating})</td>
                    <td>{g.opening}</td>
                    <td>{g.timeClass}</td>
                    <td><a href={g.url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Открыть</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
