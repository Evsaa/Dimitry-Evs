import { useState } from 'react'
import { useProgress } from './lib/storage'
import { getOpening, getVariation } from './data/openings'
import { Home } from './views/Home'
import { Openings } from './views/Openings'
import { OpeningDetail } from './views/OpeningDetail'
import { Lesson } from './views/Lesson'
import { Duel } from './views/Duel'
import { Profile } from './views/Profile'
import { Tactics } from './views/Tactics'
import { TacticLesson } from './views/TacticLesson'
import { getTactic } from './data/tactics'
import { getEndgame } from './data/endgames'

export type Route =
  | { name: 'home' }
  | { name: 'openings' }
  | { name: 'opening'; id: string }
  | { name: 'lesson'; id: string; variation: string }
  | { name: 'tactics' }
  | { name: 'tactic'; id: string }
  | { name: 'endgames' }
  | { name: 'endgame'; id: string }
  | { name: 'duel' }
  | { name: 'profile' }

const NAV: { name: Route['name']; label: string; ico: string }[] = [
  { name: 'home', label: 'Путь', ico: '🏠' },
  { name: 'openings', label: 'Дебюты', ico: '🎓' },
  { name: 'tactics', label: 'Тактика', ico: '🧩' },
  { name: 'endgames', label: 'Эндшпиль', ico: '♟️' },
  { name: 'duel', label: 'Дуэль', ico: '⚔️' },
  { name: 'profile', label: 'Профиль', ico: '👤' },
]

export default function App() {
  const progress = useProgress()
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const opening = route.name === 'lesson' || route.name === 'opening' ? getOpening(route.id) : undefined
  const variation = route.name === 'lesson' && opening ? getVariation(opening, route.variation) : undefined

  // Урок/дуэль открываются в «режиме фокуса» без боковой навигации
  const focus = route.name === 'lesson' || route.name === 'tactic' || route.name === 'endgame'

  return (
    <div className="app" style={focus ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
      {!focus && (
        <nav className="sidebar">
          <div className="logo">
            <span className="logo-mark" aria-hidden="true">♞</span>
            <span className="logo-text">Шахматная<span>академия</span></span>
          </div>
          {NAV.map((n) => (
            <button
              key={n.name}
              className={`nav-item ${route.name === n.name || (n.name === 'openings' && route.name === 'opening') ? 'active' : ''}`}
              onClick={() => setRoute({ name: n.name } as Route)}
            >
              <span className="nav-ico">{n.ico}</span>
              {n.label}
            </button>
          ))}
          <div className="xp-chip"><span>Опыт</span><b>{progress.progress.xp} XP</b></div>
        </nav>
      )}
      <main className="main">
        {route.name === 'home' && <Home progress={progress} go={setRoute} />}
        {route.name === 'openings' && (
          <Openings progress={progress} onOpen={(id) => setRoute({ name: 'opening', id })} />
        )}
        {route.name === 'opening' && opening && (
          <OpeningDetail
            opening={opening}
            progress={progress}
            onBack={() => setRoute({ name: 'openings' })}
            onStart={(v) => setRoute({ name: 'lesson', id: opening.id, variation: v })}
          />
        )}
        {route.name === 'lesson' && opening && variation && (
          <Lesson
            key={`${opening.id}/${variation.id}`}
            opening={opening}
            variation={variation}
            progress={progress}
            onExit={() => setRoute({ name: 'opening', id: opening.id })}
          />
        )}
        {route.name === 'tactics' && (
          <Tactics kind="tactic" progress={progress} onOpen={(id) => setRoute({ name: 'tactic', id })} />
        )}
        {route.name === 'tactic' && getTactic(route.id) && (
          <TacticLesson
            key={route.id}
            topic={getTactic(route.id)!}
            progress={progress}
            onExit={() => setRoute({ name: 'tactics' })}
          />
        )}
        {route.name === 'endgames' && (
          <Tactics kind="endgame" progress={progress} onOpen={(id) => setRoute({ name: 'endgame', id })} />
        )}
        {route.name === 'endgame' && getEndgame(route.id) && (
          <TacticLesson
            key={route.id}
            kind="endgame"
            topic={getEndgame(route.id)!}
            progress={progress}
            onExit={() => setRoute({ name: 'endgames' })}
          />
        )}
        {route.name === 'duel' && <Duel progress={progress} onExit={() => setRoute({ name: 'home' })} />}
        {route.name === 'profile' && (
          <Profile progress={progress} onOpenLesson={(id) => setRoute({ name: 'opening', id })} />
        )}
      </main>
    </div>
  )
}
