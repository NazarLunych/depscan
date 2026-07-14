import type { AnalysisSummary, PackageAnalysis, PackageState } from '@/types'
import { create } from 'zustand'

interface AnalysisStore {
  packages: Record<string, PackageState>
  order: string[]
  summary: AnalysisSummary
  isRunning: boolean
  fatalError: string | null
  initPackages: (entries: Array<{ name: string; versionRange: string }>, total: number) => void
  markAnalyzing: (name: string) => void
  markDone: (name: string, analysis: PackageAnalysis) => void
  markError: (name: string, message: string) => void
  setFatalError: (message: string) => void
  finish: (payload: { total: number; failed: number }) => void
  reset: () => void
}

const emptySummary: AnalysisSummary = { total: 0, done: 0, failed: 0, critical: 0 }
const initialState = {
  packages: {},
  order: [],
  summary: emptySummary,
  isRunning: false,
  fatalError: null,
} satisfies Pick<AnalysisStore, 'packages' | 'order' | 'summary' | 'isRunning' | 'fatalError'>

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  ...initialState,

  initPackages: (entries, total) => {
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
      summary: { total, done: 0, failed: 0, critical: 0 },
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
        summary: {
          ...state.summary,
          done: state.summary.done + 1,
          critical: state.summary.critical + (analysis.highlight === 'red' ? 1 : 0),
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
        summary: { ...state.summary, failed: state.summary.failed + 1 },
      }
    })
  },

  setFatalError: (message) => {
    set((state) => {
      const packages = { ...state.packages }
      let newlyFailed = 0

      for (const name of state.order) {
        const pkg = packages[name]

        if (pkg && (pkg.status === 'pending' || pkg.status === 'analyzing')) {
          packages[name] = { ...pkg, status: 'error', analysis: null, error: message }
          newlyFailed++
        }
      }

      return {
        packages,
        fatalError: message,
        isRunning: false,
        summary: { ...state.summary, failed: state.summary.failed + newlyFailed },
      }
    })
  },

  finish: (payload) => {
    set((state) => ({
      summary: { ...state.summary, total: payload.total, failed: payload.failed },
      isRunning: false,
    }))
  },

  reset: () => {
    set(initialState)
  },
}))
