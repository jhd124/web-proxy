import type * as React from "react"

export class ConfirmCancelledError extends Error {
  constructor() {
    super("Confirmation cancelled")
    this.name = "ConfirmCancelledError"
  }
}

export type ConfirmVariant = "default" | "destructive"

export type ConfirmRequest = {
  id: number
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel: React.ReactNode
  variant: ConfirmVariant
  className?: string
  resolve: () => void
  reject: (reason: ConfirmCancelledError) => void
}

export type ConfirmOptions = {
  title?: React.ReactNode
  description: React.ReactNode
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  variant?: ConfirmVariant
  className?: string
}

let nextConfirmId = 1
let confirmDispatcher: ((request: ConfirmRequest) => void) | null = null

function normalizeConfirmOptions(input: React.ReactNode | ConfirmOptions) {
  if (
    typeof input === "object" &&
    input !== null &&
    "description" in input
  ) {
    return input
  }
  return { description: input }
}

export function setConfirmDispatcher(
  dispatcher: ((request: ConfirmRequest) => void) | null,
) {
  confirmDispatcher = dispatcher
}

export function confirm(input: React.ReactNode | ConfirmOptions): Promise<void> {
  const options = normalizeConfirmOptions(input)

  return new Promise<void>((resolve, reject) => {
    if (!confirmDispatcher) {
      reject(new ConfirmCancelledError())
      return
    }

    confirmDispatcher({
      id: nextConfirmId,
      title: options.title ?? "Confirm",
      description: options.description,
      confirmLabel: options.confirmLabel ?? "Confirm",
      cancelLabel: options.cancelLabel ?? "Cancel",
      variant: options.variant ?? "destructive",
      className: options.className,
      resolve,
      reject,
    })
    nextConfirmId += 1
  })
}
