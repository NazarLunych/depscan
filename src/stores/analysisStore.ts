import type { AnalysisSummary, PackageAnalysis, PackageState } from '@/types'
import { create } from 'zustand'

interface AnalysisStore {
  packages: Record<string, PackageState>
  order: string[]
  isRunning: boolean
  fatalError: string | null
  getSummary: () => AnalysisSummary
  initPackages: (entries: Array<{ name: string; versionRange: string }>) => void
  markAnalyzing: (name: string) => void
  markDone: (name: string, analysis: PackageAnalysis) => void
  markError: (name: string, message: string) => void
  setFatalError: (message: string) => void
  finish: () => void
  cancel: () => void
  reset: () => void
}

const initialState = {
  packages: {},
  order: [],
  isRunning: false,
  fatalError: null,
} satisfies Pick<AnalysisStore, 'packages' | 'order' | 'isRunning' | 'fatalError'>

// summary (total/done/failed/critical) is fully derivable from packages+order,
// so it's computed on read instead of hand-tracked in parallel — a status
// transition can't drift out of sync with its own count.
function deriveSummary(state: Pick<AnalysisStore, 'packages' | 'order'>): AnalysisSummary {
  let done = 0
  let failed = 0
  let critical = 0

  for (const name of state.order) {
    const pkg = state.packages[name]

    if (!pkg) continue

    if (pkg.status === 'done') {
      done++

      if (pkg.analysis?.highlight === 'red') critical++
    } else if (pkg.status === 'error') {
      failed++
    }
  }

  return { total: state.order.length, done, failed, critical }
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  ...initialState,

  getSummary: () => deriveSummary(get()),

  initPackages: (entries) => {
    const packages: Record<string, PackageState> = {}
    const order: string[] = []

    for (const { name, versionRange } of entries) {
      packages[name] = {
        name,
        currentVersion: versionRange,
        status: 'pending',
        analysis: null,
        error: null,
      }
      order.push(name)
    }

    set({
      packages,
      order,
      isRunning: true,
      fatalError: null,
    })
  },

  markAnalyzing: (name) => {
    set((state) => {
      const pkg = state.packages[name]

      if (!pkg) {
        return state
      }

      return {
        packages: { ...state.packages, [name]: { ...pkg, status: 'analyzing' } },
      }
    })
  },

  markDone: (name, analysis) => {
    set((state) => {
      const pkg = state.packages[name]

      if (!pkg) {
        return state
      }

      return {
        packages: {
          ...state.packages,
          [name]: {
            ...pkg,
            currentVersion: analysis.current_version,
            status: 'done',
            analysis,
            error: null,
          },
        },
      }
    })
  },

  markError: (name, message) => {
    set((state) => {
      const pkg = state.packages[name]

      if (!pkg) {
        return state
      }

      return {
        packages: {
          ...state.packages,
          [name]: { ...pkg, status: 'error', analysis: null, error: message },
        },
      }
    })
  },

  setFatalError: (message) => {
    set((state) => {
      const packages = { ...state.packages }

      for (const name of state.order) {
        const pkg = packages[name]

        if (pkg && (pkg.status === 'pending' || pkg.status === 'analyzing')) {
          packages[name] = { ...pkg, status: 'error', analysis: null, error: message }
        }
      }

      return {
        packages,
        fatalError: message,
        isRunning: false,
      }
    })
  },

  finish: () => {
    set({ isRunning: false })
  },

  cancel: () => {
    set((state) => {
      const packages = { ...state.packages }

      for (const name of state.order) {
        const pkg = packages[name]

        if (pkg && (pkg.status === 'pending' || pkg.status === 'analyzing')) {
          packages[name] = { ...pkg, status: 'error', analysis: null, error: 'Cancelled' }
        }
      }

      return {
        packages,
        isRunning: false,
      }
    })
  },

  reset: () => {
    set(initialState)
  },
}))
