import { WHITE_OPENINGS } from './openings-white'
import { BLACK_OPENINGS } from './openings-black'
import type { Opening, Variation } from './types'

export type { Opening, Variation, BookMove, Drill, Side } from './types'

export const OPENINGS: Opening[] = [...WHITE_OPENINGS, ...BLACK_OPENINGS]

export function getOpening(id: string): Opening | undefined {
  return OPENINGS.find((o) => o.id === id)
}

export function getVariation(opening: Opening, variationId: string): Variation | undefined {
  return opening.variations.find((v) => v.id === variationId)
}

export function lessonKey(openingId: string, variationId: string): string {
  return `${openingId}/${variationId}`
}

/** Всего вариантов и сколько из них пройдено (≥1 звезда) */
export function openingProgress(opening: Opening, lessons: Record<string, number>) {
  const done = opening.variations.filter((v) => (lessons[lessonKey(opening.id, v.id)] ?? 0) > 0).length
  const stars = opening.variations.reduce((sum, v) => sum + (lessons[lessonKey(opening.id, v.id)] ?? 0), 0)
  return { done, total: opening.variations.length, stars, maxStars: opening.variations.length * 3 }
}
