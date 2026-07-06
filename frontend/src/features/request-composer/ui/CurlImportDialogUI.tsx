import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { requestComposerTexts as t } from '../texts'
import s from './CurlImportDialogUI.module.css'

export interface CurlImportDialogUIProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (command: string) => boolean
}

export function CurlImportDialogUI({
  open,
  onOpenChange,
  onImport,
}: CurlImportDialogUIProps) {
  const [command, setCommand] = useState('')

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCommand('')
    }
    onOpenChange(nextOpen)
  }

  const handleImport = () => {
    if (onImport(command)) {
      handleOpenChange(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.content}>
          <div className={s.header}>
            <Dialog.Title className={s.title}>{t.curlImportDialog.title}</Dialog.Title>
            <Dialog.Description className={s.description}>
              {t.curlImportDialog.description}
            </Dialog.Description>
          </div>
          <label className={s.field}>
            <span>{t.curlImportDialog.inputLabel}</span>
            <textarea
              className={s.textarea}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder={t.curlImportDialog.placeholder}
              spellCheck={false}
              autoFocus
            />
          </label>
          <div className={s.footer}>
            <Dialog.Close asChild>
              <Button type="button" variant="outline" size="sm">
                {t.actions.cancel}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              size="sm"
              onClick={handleImport}
              disabled={command.trim().length === 0}
            >
              {t.actions.confirmImportCurl}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
