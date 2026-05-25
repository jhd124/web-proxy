import { useEffect, useRef, useState } from "react"
import { AlertDialog } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ConfirmCancelledError,
  type ConfirmRequest,
  setConfirmDispatcher,
} from "@/lib/confirm"

type ConfirmDialogProps = {
  request: ConfirmRequest
  onSettled: () => void
}

function ConfirmDialog({
  request: {
    id,
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant,
    className,
    resolve,
    reject,
  },
  onSettled,
}: ConfirmDialogProps) {
  const settledIdRef = useRef<number | null>(null)

  const settle = (status: "confirm" | "cancel") => {
    if (settledIdRef.current === id) return
    settledIdRef.current = id
    if (status === "confirm") {
      resolve()
    } else {
      reject(new ConfirmCancelledError())
    }
    onSettled()
  }

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) settle("cancel")
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[1300] bg-black/65" />
        <AlertDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[1301] flex w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none",
            className,
          )}
        >
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="text-base font-semibold">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground">
              {description}
            </AlertDialog.Description>
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button
                type="button"
                variant="outline"
                onClick={() => settle("cancel")}
              >
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="button"
                variant={variant === "destructive" ? "destructive" : "default"}
                onClick={() => settle("confirm")}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export function ConfirmModalHost() {
  const [requests, setRequests] = useState<ConfirmRequest[]>([])
  const currentRequest = requests[0] ?? null

  useEffect(() => {
    setConfirmDispatcher((request) => {
      setRequests((prev) => [...prev, request])
    })
    return () => {
      setConfirmDispatcher(null)
    }
  }, [])

  if (!currentRequest) return null

  return (
    <ConfirmDialog
      request={currentRequest}
      onSettled={() => {
        setRequests((prev) => prev.slice(1))
      }}
    />
  )
}
