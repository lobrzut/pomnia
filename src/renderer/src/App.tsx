import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Aurora from './components/Aurora'
import { Sidebar, TitleBar } from './components/Shell'
import { Toasts } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useStore } from './store/useStore'
import { api } from './lib/api'
import Dashboard from './pages/Dashboard'
import Browse from './pages/Browse'
import ImportPage from './pages/Import'
import Brain from './pages/Brain'
import Connect from './pages/Connect'
import Settings from './pages/Settings'
import VaultGate from './pages/VaultGate'
import Onboarding from './pages/Onboarding'
import HowItWorks from './pages/HowItWorks'

const PAGES = { dashboard: Dashboard, browse: Browse, import: ImportPage, brain: Brain, connect: Connect, settings: Settings, guide: HowItWorks } as const

export default function App() {
  const { route, scan, refreshVault, vault, toast, onboarded, loadAppSettings, initGlobalActivity } = useStore()

  useEffect(() => {
    void scan()
    void refreshVault()
    void loadAppSettings().then(() => {
      const url = useStore.getState().ollamaUrl
      if (url) void api.appSettingsSet({ ollamaUrl: url }).catch(() => {})
    })
    const offActivity = initGlobalActivity()
    // Surface otherwise-silent async failures as toasts (diagnostics).
    const onErr = (e: ErrorEvent) => toast({ kind: 'error', title: 'Unexpected error', detail: e.message })
    const onRej = (e: PromiseRejectionEvent) =>
      toast({ kind: 'error', title: 'Unexpected error', detail: String((e.reason as Error)?.message ?? e.reason) })
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      offActivity()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Page = PAGES[route]

  return (
    <div className="grain relative flex h-full flex-col overflow-hidden">
      <Aurora />
      <TitleBar />
      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-y-auto px-9 pb-12 pt-3">
          <AnimatePresence initial={false}>
            <motion.div
              key={route}
              initial={{ y: 12 }}
              animate={{ y: 0 }}
              exit={{ y: -8, pointerEvents: 'none' }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
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
