import { useEffect, useSyncExternalStore } from 'react'
import { getBranding, logoUrl } from '../services/api'

// Branding shared with EMIS (Settings > System Settings). Loaded once per page load and shared,
// so the sidebar and login page update as soon as Settings saves a change.
export const brandingDefaults = {
  agency_name: 'DOH-MTRC',
  center_name: 'Malinao Treatment and Rehabilitation Center',
  logos: {
    login_left: '/doh_logo.png',
    login_right: '/mtrc_new.png',
    login_background: '/background.jpg',
  },
}

const EMPTY = { logos: {}, texts: {} }
let branding = null
let loading = null
const listeners = new Set()

export function setBranding(next) {
  branding = next
  listeners.forEach((listener) => listener())
}

function load() {
  loading ??= getBranding().then(setBranding, () => setBranding(EMPTY))
  return loading
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Returns null while loading, then { logos, texts } as the server sends them (null = default).
export function useBranding() {
  useEffect(() => {
    load()
  }, [])
  return useSyncExternalStore(subscribe, () => branding)
}

// The logo URL for a slot: the uploaded one, else the built-in default (null if the slot has none).
export function brandingLogo(branding, slot) {
  const version = branding?.logos?.[slot]
  return version ? logoUrl(slot, version) : (brandingDefaults.logos[slot] ?? null)
}

export const brandingText = (branding, name) => branding?.texts?.[name] || brandingDefaults[name]
