import { TACTICS } from '../data/tactics'
import { ENDGAMES } from '../data/endgames'
import type { TacticTopic } from '../data/types'
import type { ProgressApi } from '../lib/storage'

export type TopicKind = 'tactic' | 'endgame'

interface Props {
  kind: TopicKind
  progress: ProgressApi
  onOpen: (id: string) => void
}

const COPY: Record<TopicKind, { title: string; sub: string; topics: TacticTopic[] }> = {
  tactic: {
    title: 'Тактика',
    sub: 'Тактический приём это не заученный ход, а узнаваемая картинка на доске. Сначала разбираем, как приём работает и по каким признакам его найти, потом тренируемся на реальных позициях.',
    topics: TACTICS,
  },
  endgame: {
    title: 'Эндшпиль',
    sub: 'Выигранное окончание нужно уметь выиграть, а проигрываемое — спасти. Разбираем самые важные схемы: правило квадрата, оппозицию, мост Лусены, защиту Филидора и маты ферзём и ладьёй.',
    topics: ENDGAMES,
  },
}

export function Tactics({ kind, progress, onOpen }: Props) {
  const { title, sub, topics } = COPY[kind]
  return (
    <>
      <h1 className="page-title">{title}</h1>
      <p className="page-sub">{sub}</p>
      <div className="grid">
        {topics.map((t) => {
          const stars = progress.progress.lessons[`${kind}:${t.id}`] ?? 0
          return (
            <button key={t.id} className="card tile" onClick={() => onOpen(t.id)}>
              <span className="tile-emoji">{t.emoji}</span>
              <h3>{t.title}</h3>
              <p>{t.summary}</p>
              <span className="hint">{t.puzzles.length} задач</span>
              <span className="stars">{stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆'}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
