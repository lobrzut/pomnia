// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, type ReactNode } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import Aurora from './components/Aurora'
import { Sidebar, TitleBar } from './components/Shell'
import { Toasts } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useStore } from './store/useStore'
import { api } from './lib/api'
import { applyColorScheme, isColorScheme } from './lib/theme'
import { invalidateUiLabelsCache } from './lib/labels'
import { isUiLocale, setUiLocaleCache } from './lib/uiLocale'
import Dashboard from './pages/Dashboard'
import Browse from './pages/Browse'
import ImportPage from './pages/Import'
import Brain from './pages/Brain'
import Connect from './pages/Connect'
import Settings from './pages/Settings'
import VaultGate from './pages/VaultGate'
import Onboarding from './pages/Onboarding'
import HowItWorks from './pages/HowItWorks'
import FloatingMonitor from './pages/FloatingMonitor'
import ProfilePreview from './pages/ProfilePreview'

const PAGES = { dashboard: Dashboard, browse: Browse, import: ImportPage, brain: Brain, connect: Connect, settings: Settings, guide: HowItWorks } as const

function isFloatingMonitorRoute(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  return hash === '/floating-monitor' || hash === 'floating-monitor'
}

function isProfilePreviewRoute(): boolean {
  const hash = window.location.hash.replace(/^#/, '')
  return hash === '/profile-preview' || hash === 'profile-preview'
}

/** Load persisted theme + locale; live-sync across main / PiP windows. */
function useThemeSync() {
  const loadAppSettings = useStore((s) => s.loadAppSettings)
  useEffect(() => {
    void loadAppSettings()
    const offScheme = api.onColorScheme((scheme) => {
      const next = isColorScheme(scheme) ? scheme : 'mint'
      applyColorScheme(next)
      useStore.setState({ colorScheme: next })
    })
    const offLocale = api.onUiLocale((locale) => {
      const next = isUiLocale(locale) ? locale : 'pl'
      setUiLocaleCache(next)
      invalidateUiLabelsCache()
      useStore.setState({ uiLocale: next })
    })
    return () => {
      offScheme()
      offLocale()
    }
  }, [loadAppSettings])
}

function FloatingShell({ children, dense }: { children: ReactNode; dense?: boolean }) {
  useThemeSync()
  return (
    <div
      className={clsx(
        'floating-pip-root flex h-screen w-screen flex-col overflow-hidden bg-transparent',
        dense ? 'px-1.5 py-1' : 'p-2',
      )}
    >
      {children}
      <Toasts />
    </div>
  )
}

export default function App() {
  if (isFloatingMonitorRoute()) {
    return (
      <FloatingShell dense>
        <FloatingMonitor />
      </FloatingShell>
    )
  }

  if (isProfilePreviewRoute()) {
    return (
      <FloatingShell>
        <ProfilePreview />
      </FloatingShell>
    )
  }

  const { route, setRoute, scan, refreshVault, vault, toast, onboarded, loadAppSettings, initGlobalActivity, uiLocale } = useStore()

  useEffect(() => {
    void scan()
    void refreshVault()
    void loadAppSettings().then(() => {
      const s = useStore.getState()
      void api.appSettingsSet({
        ollamaUrl: s.ollamaUrl || undefined,
        brainMcpUrl: s.remoteBrainUrl || undefined,
        brainDeployUrl: s.brainDeployUrl || undefined,
        brainTarget: s.brainTarget,
        connectToken: s.connectToken || undefined,
        ...(s.onboarded ? { onboarded: true } : {}),
      }).catch(() => {})
    })
    const offScheme = api.onColorScheme((scheme) => {
      const next = isColorScheme(scheme) ? scheme : 'mint'
      applyColorScheme(next)
      useStore.setState({ colorScheme: next })
    })
    const offLocale = api.onUiLocale((locale) => {
      const next = isUiLocale(locale) ? locale : 'pl'
      setUiLocaleCache(next)
      invalidateUiLabelsCache()
      useStore.setState({ uiLocale: next })
    })
    const offActivity = initGlobalActivity()
    const offNavigate = api.onAppNavigate((r) => {
      if (r === 'guide' || r === 'dashboard' || r === 'browse' || r === 'import' || r === 'brain' || r === 'connect' || r === 'settings') {
        setRoute(r)
      }
    })
    const offAppToast = api.onAppToast((t) => {
      toast(t)
    })
    // Surface otherwise-silent async failures as toasts (diagnostics).
    const onErr = (e: ErrorEvent) => toast({ kind: 'error', title: 'Unexpected error', detail: e.message })
    const onRej = (e: PromiseRejectionEvent) =>
      toast({ kind: 'error', title: 'Unexpected error', detail: String((e.reason as Error)?.message ?? e.reason) })
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      offScheme()
      offLocale()
      offActivity()
      offNavigate()
      offAppToast()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Page = PAGES[route]

  return (
    <div className="grain relative flex h-full flex-col overflow-hidden" key={uiLocale}>
      <Aurora />
      <TitleBar />
      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-9 pb-3 pt-3">
          {/* Absolute stack keeps main height stable while pages crossfade — avoids flex collapse / scroll thrash. */}
          <AnimatePresence initial={false}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, pointerEvents: 'none' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex min-h-0 flex-col overflow-y-auto"
            >
              <ErrorBoundary>
                <Page />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {/* First run: full setup wizard. After that: plain lock gate when the vault is closed. */}
      {/* No exit animation on full-screen gates — AnimatePresence left a z-40 overlay at opacity 0 that still captured clicks. */}
      {!onboarded ? <Onboarding /> : !vault.open ? <VaultGate /> : null}
      <Toasts />
    </div>
  )
}
