import { lessonKey } from '../data/openings'
import type { Opening } from '../data/openings'
import type { ProgressApi } from '../lib/storage'

interface Props {
  opening: Opening
  progress: ProgressApi
  onBack: () => void
  onStart: (variationId: string) => void
}

export function OpeningDetail({ opening, progress, onBack, onStart }: Props) {
  const lessons = progress.progress.lessons
  return (
    <>
      <button className="back-link" onClick={onBack}>← Все дебюты</button>
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <span className="tile-emoji">{opening.emoji}</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span className={`badge ${opening.side}`}>{opening.side === 'white' ? 'За белых' : 'За чёрных'}</span>
            <h1 className="page-title" style={{ margin: '8px 0 6px' }}>{opening.title}</h1>
            <p className="explain">{opening.pitch}</p>
            <h3 style={{ margin: '14px 0 6px', fontSize: 15 }}>Цели</h3>
            <ul className="goals">
              {opening.goals.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </div>
        </div>
      </div>

      <div className="section-head"><h2>Варианты · {opening.variations.length}</h2><div className="line" /></div>
      <p className="hint" style={{ marginBottom: 14 }}>
        Соперник может пойти по-разному. Выбери вариант, который хочешь разобрать.
      </p>
      <div className="grid">
        {opening.variations.map((v) => {
          const stars = lessons[lessonKey(opening.id, v.id)] ?? 0
          return (
            <button key={v.id} className="card tile" onClick={() => onStart(v.id)}>
              <h3>{v.title}</h3>
              <span className="badge">{v.tagline}</span>
              <p>{v.keyIdea}</p>
              <span className="stars">{stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆'}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
