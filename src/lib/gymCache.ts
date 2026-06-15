import { supabase } from './supabase'

// ─── constants ────────────────────────────────────────────────────────────────

export const LOC_CACHE_KEY = 'forge_gym_location'
export const GYMS_CACHE_KEY = 'forge_gyms_cache'
export const LOC_TTL = 7 * 24 * 60 * 60 * 1000
export const GYMS_TTL = 24 * 60 * 60 * 1000

// ─── types ────────────────────────────────────────────────────────────────────

export interface Coords { lat: number; lng: number }

export interface LocationCache {
  lat: number
  lng: number
  name: string
  source: 'profile' | 'gps' | 'manual'
  timestamp: number
}

export interface GymsCache {
  gyms: unknown[]
  lat: number
  lng: number
  timestamp: number
}

// ─── cache helpers ────────────────────────────────────────────────────────────

export function readLocCache(): LocationCache | null {
  try {
    const raw = localStorage.getItem(LOC_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as LocationCache
    if (Date.now() - cache.timestamp > LOC_TTL) return null
    return cache
  } catch { return null }
}

export function writeLocCache(lat: number, lng: number, name: string, source: LocationCache['source']) {
  localStorage.setItem(LOC_CACHE_KEY, JSON.stringify({ lat, lng, name, source, timestamp: Date.now() }))
}

export function readGymsCache(coords: Coords): unknown[] | null {
  try {
    const raw = localStorage.getItem(GYMS_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as GymsCache
    if (Date.now() - cache.timestamp > GYMS_TTL) return null
    const dist = haversineKm(coords, { lat: cache.lat, lng: cache.lng })
    if (dist >= 0.1) return null
    return cache.gyms
  } catch { return null }
}

export function writeGymsCache(gyms: unknown[], coords: Coords) {
  localStorage.setItem(GYMS_CACHE_KEY, JSON.stringify({ gyms, lat: coords.lat, lng: coords.lng, timestamp: Date.now() }))
}

// ─── geo helpers ──────────────────────────────────────────────────────────────

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(sin2)))
}

export async function geocode(query: string): Promise<Coords | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json() as Array<{ lat: string; lon: string }>
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

// ─── pre-warm ─────────────────────────────────────────────────────────────────

export async function prewarmGymsCache(city: string): Promise<void> {
  // Skip if location cache already exists for this city
  const existing = readLocCache()
  if (existing?.source === 'profile' || existing?.source === 'gps') return

  const coords = await geocode(city)
  if (!coords) return

  writeLocCache(coords.lat, coords.lng, city, 'profile')

  // Skip gym fetch if already cached near this point
  if (readGymsCache(coords)) return

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30000)
    )
    const invoke = supabase.functions.invoke('gyms', { body: { lat: coords.lat, lng: coords.lng } })
    const { data, error } = await Promise.race([invoke, timeout])
    if (error || data?.error || !data?.elements) return
    writeGymsCache(data.elements, coords)
  } catch { /* non-fatal — map will fetch on first open */ }
}
