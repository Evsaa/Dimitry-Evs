import { DAILY_GOAL, levelOf, streakOf, todayKey } from '../lib/storage'
import type { Progress } from '../lib/storage'

/** Серия, уровень и дневная цель: карточка для главной страницы. */
export function Stats({ progress }: { progress: Progress }) {
  const streak = streakOf(progress.days)
  const { level, into, need } = levelOf(progress.xp)
  const today = progress.days[todayKey()] ?? 0
  const goalDone = today >= DAILY_GOAL
  return (
    <div className="stats">
      <div className="stat">
        <span className="stat-ico">{streak > 0 ? '🔥' : '💤'}</span>
        <div>
          <b>{streak}</b>
          <span>{streak === 1 ? 'день подряд' : 'дней подряд'}</span>
        </div>
      </div>
      <div className="stat stat-wide">
        <div className="stat-row">
          <span>Уровень {level}</span>
          <span>{into} / {need} XP</span>
        </div>
        <div className="meter"><div style={{ width: `${(into / need) * 100}%` }} /></div>
      </div>
      <div className="stat stat-wide">
        <div className="stat-row">
          <span>{goalDone ? 'Цель на сегодня выполнена ✓' : 'Цель на сегодня'}</span>
          <span>{Math.min(today, DAILY_GOAL)} / {DAILY_GOAL} XP</span>
        </div>
        <div className="meter"><div className={goalDone ? 'gold' : ''} style={{ width: `${Math.min(100, (today / DAILY_GOAL) * 100)}%` }} /></div>
      </div>
    </div>
  )
}
