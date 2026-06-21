import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { DecodeFormatResult } from '../decodeFormat'
import { textActionTexts } from '../texts'
import s from './DecodeFormatDialogUI.module.css'

type Props = {
  open: boolean
  result: DecodeFormatResult | null
  onOpenChange: (open: boolean) => void
  onCopyResult: () => void
}

const t = textActionTexts.decodeFormat

export function DecodeFormatDialogUI({
  open,
  result,
  onOpenChange,
  onCopyResult,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.content}>
          <div className={s.header}>
            <div className={s.titleWrap}>
              <Dialog.Title className={s.title}>{t.title}</Dialog.Title>
              <Dialog.Description className={s.description}>
                {t.description}
              </Dialog.Description>
              {result ? (
                <p className={s.detected}>{t.detectedAs(result.label)}</p>
              ) : null}
            </div>
          </div>

          <div className={s.body}>
            <section className={s.panel}>
              <span className={s.label}>{t.result}</span>
              <pre className={s.pre}>{result?.output ?? ''}</pre>
            </section>
          </div>

          <div className={s.footer}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!result?.output}
              onClick={onCopyResult}
            >
              {t.copyResult}
            </Button>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="sm">
                {t.close}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
