import { OPENINGS, openingProgress } from '../data/openings'
import type { Opening } from '../data/openings'
import type { ProgressApi } from '../lib/storage'

interface Props {
  progress: ProgressApi
  onOpen: (id: string) => void
}

export function Openings({ progress, onOpen }: Props) {
  const lessons = progress.progress.lessons
  const group = (side: 'white' | 'black') => OPENINGS.filter((o) => o.side === side)
  const card = (o: Opening) => {
    const p = openingProgress(o, lessons)
    return (
      <button key={o.id} className="card tile" onClick={() => onOpen(o.id)}>
        <span className="tile-emoji">{o.emoji}</span>
        <span className={`badge ${o.side}`}>{o.side === 'white' ? 'За белых' : 'За чёрных'}</span>
        <h3>{o.title}</h3>
        <p>{o.subtitle}</p>
        <div className="meter" aria-label={`Пройдено ${p.done} из ${p.total}`}>
          <div style={{ width: `${(p.done / p.total) * 100}%` }} />
        </div>
        <span className="hint">
          {p.done} из {p.total} вариантов · {p.stars}/{p.maxStars} ★
        </span>
      </button>
    )
  }
  return (
    <>
      <h1 className="page-title">Дебюты</h1>
      <p className="page-sub">
        {OPENINGS.length} дебютов. У каждого есть варианты: соперники ходят по-разному, и ты учишься отвечать на разные
        планы. Урок: теория → повтор по памяти → поиск сильнейшего хода.
      </p>
      <div className="section-head"><h2>За белых</h2><div className="line" /></div>
      <div className="grid">{group('white').map(card)}</div>
      <div className="section-head"><h2>За чёрных</h2><div className="line" /></div>
      <div className="grid">{group('black').map(card)}</div>
    </>
  )
}
