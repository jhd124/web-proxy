import type { ReactNode } from 'react'
import { CircleQuestionMark } from 'lucide-react'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { overrideEditorTexts } from '../texts'
import s from './LabelHint.module.css'

const tf = overrideEditorTexts.request

export function LabelHint({ hint }: { hint: ReactNode }) {
  return (
    <SimpleTooltip label={hint} contentClassName={s.hintContent}>
      <button
        type="button"
        className={s.hintBtn}
        aria-label={tf.fieldHintAria}
        onClick={(e) => e.preventDefault()}
      >
        <CircleQuestionMark size={13} aria-hidden />
      </button>
    </SimpleTooltip>
  )
}
