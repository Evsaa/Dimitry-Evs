import { Stats } from '../components/Stats'
import type { ProgressApi } from '../lib/storage'
import type { Route } from '../App'
import { OPENINGS } from '../data/openings'

interface Props {
  progress: ProgressApi
  go: (r: Route) => void
}

interface Section {
  emoji: string
  title: string
  desc: string
  route?: Route
  tag: string
}

export function Home({ progress, go }: Props) {
  const done = Object.keys(progress.progress.lessons).length
  const totalLessons = OPENINGS.reduce((n, o) => n + o.variations.length, 0)
  const sections: Section[] = [
    {
      emoji: '📘',
      title: 'Фундаментальная теория',
      desc: 'Ценность фигур, принципы дебюта, безопасность короля, структура пешек.',
      tag: 'Скоро',
    },
    {
      emoji: '🎓',
      title: 'Дебюты',
      desc: `Идеи, а не зубрёжка: теория, повтор по памяти и поиск сильнейшего хода с проверкой Stockfish. Дебютов: ${OPENINGS.length}, вариантов: ${totalLessons}, пройдено: ${done}.`,
      route: { name: 'openings' },
      tag: 'Доступно',
    },
    {
      emoji: '⚔️',
      title: 'Практика: дуэль с ботом',
      desc: 'Перед каждым ходом оцени угрозы. После хода получишь оценку от Stockfish.',
      route: { name: 'duel' },
      tag: 'Доступно',
    },
    {
      emoji: '👤',
      title: 'Мой профиль chess.com',
      desc: 'Подтяни свои партии, посмотри статистику по дебютам и найди зоны роста.',
      route: { name: 'profile' },
      tag: 'Доступно',
    },
    {
      emoji: '♟️',
      title: 'Эндшпиль',
      desc: 'Правило квадрата, оппозиция, мост Лусены, защита Филидора, маты ферзём и ладьёй.',
      route: { name: 'endgames' },
      tag: 'Доступно',
    },
    {
      emoji: '🧩',
      title: 'Тактика с объяснением',
      desc: 'Вилки, связки, сквозной удар и другие приёмы: сначала идея и признаки, потом задачи на реальных позициях.',
      route: { name: 'tactics' },
      tag: 'Доступно',
    },
  ]
  return (
    <>
      <h1 className="page-title">Твой путь в шахматах</h1>
      <p className="page-sub">Выбирай раздел и учись шаг за шагом. Всё сразу проверяется на доске.</p>
      <Stats progress={progress.progress} />
      <div className="grid">
        {sections.map((s) => (
          <button
            key={s.title}
            className={`card tile ${s.route ? '' : 'locked'}`}
            onClick={() => s.route && go(s.route)}
          >
            <span className="tile-emoji">{s.emoji}</span>
            <span className={`badge ${s.route ? 'green' : ''}`}>{s.tag}</span>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </button>
        ))}
      </div>
    </>
  )
}
