import { createContext, useContext } from 'react'

export type TextContextActions = {
  openPageSearch: (text: string) => void
  openGlobalSearch: (text: string) => void
  openDecodeFormat: (text: string) => void
  openBrowserSearch: (text: string) => void
}

export const TextActionsContext = createContext<TextContextActions | null>(null)

export function useTextActionsContext(): TextContextActions {
  const context = useContext(TextActionsContext)
  if (!context) {
    throw new Error('useTextActionsContext must be used within TextActionsProvider')
  }
  return context
}
