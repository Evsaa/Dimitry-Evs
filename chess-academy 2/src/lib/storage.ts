import { useCallback, useEffect, useState } from 'react'

export interface Progress {
  xp: number
  /** id урока → число звёзд (1–3) */
  lessons: Record<string, number>
  chesscomUser: string
  duelBestLevel: number
  /** дата (ГГГГ-ММ-ДД) → XP, заработанный в этот день */
  days: Record<string, number>
}

export const DAILY_GOAL = 30

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayKey = () => dayKey(new Date())

/** Серия дней подряд с XP. Если сегодня ещё не занимались, серия не сгорает до конца дня. */
export function streakOf(days: Record<string, number>): number {
  const d = new Date()
  if (!(days[dayKey(d)] > 0)) d.setDate(d.getDate() - 1)
  let n = 0
  while (days[dayKey(d)] > 0) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** Уровень растёт всё медленнее: 1→2 за 60 XP, 2→3 за 120 XP и т. д. */
export function levelOf(xp: number) {
  let level = 1
  let need = 60
  let left = xp
  while (left >= need) {
    left -= need
    level++
    need += 60
  }
  return { level, into: left, need }
}

const KEY = 'chess-academy:v1'

const EMPTY: Progress = { xp: 0, lessons: {}, chesscomUser: '', duelBestLevel: 0, days: {} }

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) }
  } catch {
    return EMPTY
  }
}

function bumpDay(days: Record<string, number>, xp: number) {
  const k = todayKey()
  return { ...days, [k]: (days[k] ?? 0) + xp }
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress))
    } catch {
      /* хранилище недоступно, не критично */
    }
  }, [progress])

  const update = useCallback((fn: (p: Progress) => Progress) => setProgress(fn), [])

  const finishLesson = useCallback((id: string, stars: number, xp: number) => {
    setProgress((p) => ({
      ...p,
      xp: p.xp + xp,
      days: bumpDay(p.days, xp),
      lessons: { ...p.lessons, [id]: Math.max(p.lessons[id] ?? 0, stars) },
    }))
  }, [])

  const addXp = useCallback((xp: number) => setProgress((p) => ({ ...p, xp: p.xp + xp, days: bumpDay(p.days, xp) })), [])

  return { progress, update, finishLesson, addXp }
}

export type ProgressApi = ReturnType<typeof useProgress>
