import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Profile } from '../types/supabase'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// ─── types ────────────────────────────────────────────────────────────────────

interface Coords { lat: number; lng: number }

interface Gym {
  id: number
  name: string
  lat: number
  lng: number
  address: string
  distanceKm: number
}

interface LocationCache {
  lat: number
  lng: number
  name: string
  source: 'profile' | 'gps' | 'manual'
  timestamp: number
}

interface GymsCache {
  gyms: Gym[]
  lat: number
  lng: number
  timestamp: number
}

// ─── constants ────────────────────────────────────────────────────────────────

const LOC_CACHE_KEY = 'forge_gym_location'
const GYMS_CACHE_KEY = 'forge_gyms_cache'
const LOC_TTL = 7 * 24 * 60 * 60 * 1000
const GYMS_TTL = 24 * 60 * 60 * 1000
const RADIUS_M = 10000
const MAP_ZOOM = 15

// ─── helpers ─────────────────────────────────────────────────────────────────

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(sin2))
}

function coordsMatch(a: Coords, b: Coords): boolean {
  return haversineKm(a, b) < 0.1
}

function readLocCache(): LocationCache | null {
  try {
    const raw = localStorage.getItem(LOC_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as LocationCache
    if (Date.now() - cache.timestamp > LOC_TTL) return null
    return cache
  } catch { return null }
}

function writeLocCache(lat: number, lng: number, name: string, source: LocationCache['source']) {
  localStorage.setItem(LOC_CACHE_KEY, JSON.stringify({ lat, lng, name, source, timestamp: Date.now() }))
}

function readGymsCache(coords: Coords): Gym[] | null {
  try {
    const raw = localStorage.getItem(GYMS_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as GymsCache
    if (Date.now() - cache.timestamp > GYMS_TTL) return null
    if (!coordsMatch(coords, { lat: cache.lat, lng: cache.lng })) return null
    return cache.gyms
  } catch { return null }
}

function writeGymsCache(gyms: Gym[], coords: Coords) {
  localStorage.setItem(GYMS_CACHE_KEY, JSON.stringify({ gyms, lat: coords.lat, lng: coords.lng, timestamp: Date.now() }))
}

async function geocode(query: string): Promise<Coords | null> {
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

async function reverseGeocode(coords: Coords): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json() as { address?: { suburb?: string; neighbourhood?: string; city?: string; town?: string; state?: string } }
    const a = data.address || {}
    const area = a.suburb || a.neighbourhood || a.town || a.city || a.state
    const city = a.city || a.town || a.state
    return area && city && area !== city ? `${area}, ${city}` : area || city || 'Current location'
  } catch { return 'Current location' }
}

async function fetchGyms(coords: Coords): Promise<Gym[]> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out after 30s')), 30000)
  )

  const invoke = supabase.functions.invoke('gyms', {
    body: { lat: coords.lat, lng: coords.lng },
  })

  const { data, error } = await Promise.race([invoke, timeout])

  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)

  const elements = (data as { elements: Array<{ id: number; lat: number; lon: number; tags?: Record<string, string> }> }).elements
  const seen = new Set<string>()
  return elements
    .map(el => {
      const tags = el.tags || {}
      const name = tags.name || 'Unnamed gym'
      const key = `${name}|${el.lat.toFixed(4)}|${el.lon.toFixed(4)}`
      if (seen.has(key)) return null
      seen.add(key)
      const addrParts = [tags['addr:housename'], tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean)
      const address = addrParts.join(', ')
      const distanceKm = haversineKm(coords, { lat: el.lat, lng: el.lon })
      return { id: el.id, name, lat: el.lat, lng: el.lon, address, distanceKm }
    })
    .filter((g): g is Gym => g !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

// ─── map helpers ──────────────────────────────────────────────────────────────

function MapRecenter({ coords }: { coords: Coords }) {
  const map = useMap()
  useEffect(() => { map.setView([coords.lat, coords.lng], MAP_ZOOM) }, [coords.lat, coords.lng])
  return null
}

const userMarkerIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;background:#3b82f6;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.25)"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const gymMarkerIcon = L.divIcon({
  html: `
    <div style="display:flex;flex-direction:column;align-items:center">
      <div style="
        width:32px;height:32px;
        background:#c8f55a;
        border:2px solid #1a1a1a;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:0 2px 6px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="transform:rotate(45deg);font-size:14px;line-height:1">🏋️</span>
      </div>
    </div>
  `,
  className: '',
  iconSize: [32, 38],
  iconAnchor: [16, 38],
  popupAnchor: [0, -38],
})

// ─── styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px', width: '100%' },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '20px',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  heading: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: '32px',
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  sub: {
    fontSize: '13px',
    color: 'var(--muted)',
    marginBottom: '20px',
  },
  locationBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '16px',
  },
  locationLabel: {
    fontSize: '12px',
    color: 'var(--muted)',
    flexShrink: 0,
  },
  locInput: {
    padding: '7px 12px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    minWidth: 0,
    flex: 1,
  },
  gpsBtn: {
    padding: '7px 14px',
    background: 'transparent',
    border: '1px solid var(--border2)',
    borderRadius: '6px',
    color: 'var(--text)',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  goBtn: {
    padding: '7px 14px',
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    borderRadius: '6px',
    color: 'var(--accent)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  resetLink: {
    fontSize: '11px',
    color: 'var(--dim)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    fontFamily: 'inherit',
    textDecoration: 'underline',
  },
  statusText: {
    fontSize: '13px',
    color: 'var(--muted)',
    padding: '60px 0',
    textAlign: 'center' as const,
  },
  retryBtn: {
    marginTop: '12px',
    padding: '8px 18px',
    background: 'transparent',
    border: '1px solid var(--border2)',
    borderRadius: '6px',
    color: 'var(--text)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  mapCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  gymCount: {
    fontSize: '11px',
    color: 'var(--dim)',
    padding: '10px 14px',
    borderTop: '1px solid var(--border)',
  },
}

// ─── component ────────────────────────────────────────────────────────────────

type Status = 'idle' | 'locating' | 'fetching' | 'done' | 'error'

export default function GymsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [locationName, setLocationName] = useState('')
  const [gyms, setGyms] = useState<Gym[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [showOverride, setShowOverride] = useState(false)
  const didAutoResolve = useRef(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('city').eq('id', user.id).single().then(({ data }) => {
      setProfile(data as Profile | null)
    })
  }, [user])

  useEffect(() => {
    if (didAutoResolve.current) return
    didAutoResolve.current = true
    autoResolve()
  }, [profile])

  async function autoResolve() {
    const cached = readLocCache()
    if (cached) {
      setLocationName(cached.name || '')
      await resolveGyms({ lat: cached.lat, lng: cached.lng })
      return
    }
    if (profile?.city) {
      setStatus('locating')
      const geo = await geocode(profile.city)
      if (geo) {
        writeLocCache(geo.lat, geo.lng, profile.city, 'profile')
        setLocationName(profile.city)
        await resolveGyms(geo)
        return
      }
    }
    setStatus('idle')
  }

  async function resolveGyms(c: Coords) {
    setCoords(c)
    const cached = readGymsCache(c)
    if (cached) {
      setGyms(cached)
      setStatus('done')
      return
    }
    setStatus('fetching')
    try {
      const results = await fetchGyms(c)
      writeGymsCache(results, c)
      setGyms(results)
      setStatus('done')
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : ''
      setErrorMsg(`Could not fetch gyms${detail}. Check your connection and try again.`)
      setStatus('error')
    }
  }

  async function handleGPS() {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.')
      setStatus('error')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const name = await reverseGeocode(c)
        writeLocCache(c.lat, c.lng, name, 'gps')
        setLocationName(name)
        setShowOverride(false)
        await resolveGyms(c)
      },
      () => {
        setErrorMsg('Location access denied. Type your area below or allow location access.')
        setStatus('error')
      }
    )
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!manualInput.trim()) return
    setStatus('locating')
    const geo = await geocode(manualInput.trim())
    if (!geo) {
      setErrorMsg(`Could not find "${manualInput}". Try a more specific area name.`)
      setStatus('error')
      return
    }
    const name = manualInput.trim()
    writeLocCache(geo.lat, geo.lng, name, 'manual')
    setLocationName(name)
    setManualInput('')
    setShowOverride(false)
    await resolveGyms(geo)
  }

  function handleReset() {
    localStorage.removeItem(LOC_CACHE_KEY)
    localStorage.removeItem(GYMS_CACHE_KEY)
    setCoords(null)
    setLocationName('')
    setGyms([])
    setStatus('idle')
    didAutoResolve.current = false
    setShowOverride(false)
  }

  const needsLocationInput = status === 'idle' && !coords
  const mapHeight = isMobile ? 400 : 520

  return (
    <div style={{ ...s.page, padding: isMobile ? '16px 16px 24px' : '28px' }}>
      <button style={s.backBtn} onClick={() => navigate('/dashboard')}>
        ← Back to Dashboard
      </button>

      <div style={s.heading}>Gyms Near You</div>
      <div style={s.sub}>Fitness centres within 10km · OpenStreetMap data</div>

      {/* Location bar */}
      {(needsLocationInput || showOverride) && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '12px' }}>
            {showOverride ? 'Change location' : 'Set your location'}
          </div>
          <button style={{ ...s.gpsBtn, width: '100%', marginBottom: '10px', padding: '11px', textAlign: 'center' as const }} onClick={handleGPS}>
            Use current location (GPS)
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: 'var(--dim)', fontSize: '11px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            or type an area
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ ...s.locInput, flex: 1 }}
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="e.g. Indiranagar, Bangalore"
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button type="submit" style={{ ...s.goBtn, padding: '7px 20px', flexShrink: 0 }}>Go</button>
          </form>
          {showOverride && (
            <button style={{ ...s.resetLink, marginTop: '10px', display: 'block' }} onClick={() => setShowOverride(false)}>Cancel</button>
          )}
        </div>
      )}

      {/* Status: locating */}
      {status === 'locating' && (
        <div style={s.statusText}>Locating…</div>
      )}

      {/* Status: fetching */}
      {status === 'fetching' && (
        <div style={s.statusText}>Finding gyms nearby…</div>
      )}

      {/* Status: error */}
      {status === 'error' && (
        <div style={{ ...s.statusText, color: '#ff5c5c' }}>
          <div>{errorMsg}</div>
          <button style={s.retryBtn} onClick={() => { setStatus('idle'); setShowOverride(false) }}>Retry</button>
        </div>
      )}

      {/* Map */}
      {status === 'done' && coords && (
        <>
          {/* Change / reset controls */}
          {!showOverride && (
            <div style={{ ...s.locationBar, marginBottom: '12px' }}>
              <button style={s.resetLink} onClick={() => setShowOverride(true)}>Change location</button>
              <span style={{ color: 'var(--border)', fontSize: '12px' }}>·</span>
              <button style={s.resetLink} onClick={handleReset}>Reset</button>
            </div>
          )}

          {locationName && (
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--dim)' }}>Showing gyms near </span>
              <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--accent)' }}>{locationName}</span>
            </div>
          )}

          {gyms.length === 0 ? (
            <div style={s.statusText}>No gyms found within 10km of this location.</div>
          ) : (
            <div style={s.mapCard}>
              <MapContainer
                center={[coords.lat, coords.lng]}
                zoom={MAP_ZOOM}
                style={{ height: `${mapHeight}px`, width: '100%' }}
                zoomControl={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <MapRecenter coords={coords} />

                <Circle
                  center={[coords.lat, coords.lng]}
                  radius={RADIUS_M}
                  pathOptions={{ color: 'rgba(200,245,90,0.4)', fillColor: 'rgba(200,245,90,0.05)', weight: 1 }}
                />

                <Marker position={[coords.lat, coords.lng]} icon={userMarkerIcon}>
                  <Popup>You are here</Popup>
                </Marker>

                {gyms.map(gym => (
                  <Marker key={gym.id} position={[gym.lat, gym.lng]} icon={gymMarkerIcon}>
                    <Popup>
                      <div style={{ minWidth: '160px' }}>
                        <strong style={{ fontSize: '13px' }}>{gym.name}</strong>
                        <div style={{ fontSize: '12px', color: '#666', margin: '4px 0' }}>
                          {gym.distanceKm.toFixed(1)} km away
                        </div>
                        {gym.address && (
                          <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>{gym.address}</div>
                        )}
                        <a
                          href={`https://www.google.com/maps/search/${encodeURIComponent(gym.name)}/@${gym.lat},${gym.lng},17z`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '12px', color: '#3b82f6' }}
                        >
                          Open in Maps →
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
              <div style={s.gymCount}>
                {gyms.length} gym{gyms.length !== 1 ? 's' : ''} found within 10km
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
