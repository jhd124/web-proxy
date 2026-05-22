import type { ReactElement } from 'react'
import { overrideEditorTexts } from '../texts'
import s from './OverrideBodyImageUI.module.css'

type Props = {
  imageSrc: string
  mimeLabel: string
}

const t = overrideEditorTexts.monaco

export function OverrideBodyImageUI({ imageSrc, mimeLabel }: Props): ReactElement {
  return (
    <div className={s.imagePane}>
      <img
        className={s.image}
        src={imageSrc}
        alt={t.imageAlt(mimeLabel)}
        decoding="async"
      />
    </div>
  )
}
