export type AdvancedSearchEntityType = 'traffic' | 'override' | 'breakpoint' | 'saved'

export type AdvancedSearchMatch = {
  entityType: AdvancedSearchEntityType
  id: string
  title: string
  field: string
  snippet: string
}

export type AdvancedSearchGroup = {
  entityType: AdvancedSearchEntityType
  label: AdvancedSearchEntityType
  matches: AdvancedSearchMatch[]
}

export type AdvancedSearchResponse = {
  query: string
  groups: AdvancedSearchGroup[]
  total: number
}

export type AdvancedSearchTarget = {
  entityType: AdvancedSearchEntityType
  id: string
}

export type AdvancedSearchOpenOptions = {
  query?: string
  submit?: boolean
}

export type AdvancedSearchOpenHandler = (target: AdvancedSearchTarget) => void
