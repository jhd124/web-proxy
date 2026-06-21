import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type {
  AdvancedSearchGroup,
  AdvancedSearchOpenHandler,
  AdvancedSearchOpenOptions,
  AdvancedSearchResponse,
  AdvancedSearchTarget,
} from '../types'

const EMPTY_GROUPS: AdvancedSearchGroup[] = [
  { entityType: 'traffic', label: 'traffic', matches: [] },
  { entityType: 'override', label: 'override', matches: [] },
  { entityType: 'breakpoint', label: 'breakpoint', matches: [] },
  { entityType: 'saved', label: 'saved', matches: [] },
]

export type AdvancedSearchViewModel = {
  isOpen: boolean
  isMinimized: boolean
  query: string
  setQuery: (query: string) => void
  groups: AdvancedSearchGroup[]
  total: number
  isLoading: boolean
  error: string | null
  keywords: string[]
  hasSearched: boolean
  inputRef: RefObject<HTMLInputElement | null>
  openAdvancedSearch: (options?: AdvancedSearchOpenOptions) => void
  closeAdvancedSearch: () => void
  minimizeAdvancedSearch: () => void
  restoreAdvancedSearch: () => void
  submitSearch: () => void
  openTarget: (target: AdvancedSearchTarget) => void
  registerOpenHandler: (handler: AdvancedSearchOpenHandler) => () => void
}

export function useAdvancedSearch(config?: { onOpen?: () => void }): AdvancedSearchViewModel {
  const inputRef = useRef<HTMLInputElement>(null)
  const openHandlerRef = useRef<AdvancedSearchOpenHandler | null>(null)
  const searchControllerRef = useRef<AbortController | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [groups, setGroups] = useState<AdvancedSearchGroup[]>(EMPTY_GROUPS)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizedSearchedQuery = searchedQuery.trim()
  const hasSearched = normalizedSearchedQuery.length > 0
  const keywords = useMemo(
    () =>
      normalizedSearchedQuery
        .split(/\s+/)
        .filter((keyword) => keyword.length > 0),
    [normalizedSearchedQuery],
  )

  const resetResults = useCallback(() => {
    searchControllerRef.current?.abort()
    searchControllerRef.current = null
    setSearchedQuery('')
    setGroups(EMPTY_GROUPS)
    setTotal(0)
    setIsLoading(false)
    setError(null)
  }, [])

  const setQueryAndReset = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery)
      resetResults()
    },
    [resetResults],
  )

  const runSearch = useCallback(
    (searchQuery: string) => {
      searchControllerRef.current?.abort()
      if (!searchQuery) {
        resetResults()
        return
      }

      const controller = new AbortController()
      searchControllerRef.current = controller
      setIsLoading(true)
      setError(null)
      setSearchedQuery(searchQuery)

      void fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          return (await response.json()) as AdvancedSearchResponse
        })
        .then((payload) => {
          setGroups(payload.groups)
          setTotal(payload.total)
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted) return
          setGroups(EMPTY_GROUPS)
          setTotal(0)
          setError(searchError instanceof Error ? searchError.message : String(searchError))
        })
        .finally(() => {
          if (searchControllerRef.current === controller) {
            searchControllerRef.current = null
          }
          if (!controller.signal.aborted) {
            setIsLoading(false)
          }
        })
    },
    [resetResults],
  )

  const openAdvancedSearch = useCallback((options?: AdvancedSearchOpenOptions) => {
    config?.onOpen?.()
    searchControllerRef.current?.abort()
    searchControllerRef.current = null
    const nextQuery = options?.query?.trim() ?? ''
    if (nextQuery.length > 0) {
      setQuery(nextQuery)
    }
    setSearchedQuery('')
    setGroups(EMPTY_GROUPS)
    setTotal(0)
    setIsLoading(false)
    setError(null)
    setIsOpen(true)
    setIsMinimized(false)
    if (options?.submit && nextQuery.length > 0) {
      runSearch(nextQuery)
    }
  }, [config, runSearch])

  const closeAdvancedSearch = useCallback(() => {
    searchControllerRef.current?.abort()
    setIsOpen(false)
    setIsMinimized(false)
    setIsLoading(false)
  }, [])

  const minimizeAdvancedSearch = useCallback(() => {
    setIsMinimized(true)
  }, [])

  const restoreAdvancedSearch = useCallback(() => {
    setIsOpen(true)
    setIsMinimized(false)
  }, [])

  const submitSearch = useCallback(() => {
    runSearch(query.trim())
  }, [query, runSearch])

  const registerOpenHandler = useCallback((handler: AdvancedSearchOpenHandler) => {
    openHandlerRef.current = handler
    return () => {
      if (openHandlerRef.current === handler) {
        openHandlerRef.current = null
      }
    }
  }, [])

  const openTarget = useCallback((target: AdvancedSearchTarget) => {
    openHandlerRef.current?.(target)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const animationFrameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== 'f') {
        return
      }
      if (event.shiftKey) {
        event.preventDefault()
        openAdvancedSearch()
        return
      }
      searchControllerRef.current?.abort()
      searchControllerRef.current = null
      setIsOpen(false)
      setIsMinimized(false)
      setIsLoading(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openAdvancedSearch])

  useEffect(() => {
    return () => {
      searchControllerRef.current?.abort()
    }
  }, [])

  return {
    isOpen,
    isMinimized,
    query,
    setQuery: setQueryAndReset,
    groups,
    total,
    isLoading,
    error,
    keywords,
    hasSearched,
    inputRef,
    openAdvancedSearch,
    closeAdvancedSearch,
    minimizeAdvancedSearch,
    restoreAdvancedSearch,
    submitSearch,
    openTarget,
    registerOpenHandler,
  }
}
