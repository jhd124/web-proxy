import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { OverrideFormState, OverrideRule } from '../../../types'
import { buildPathGroups, overrideListLabel } from '../overrideFileTree'
import {
  getResponseContentType,
  isImageContentType,
} from '../overrideResponseLanguage'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import s from './OverrideFilesUI.module.css'

const tf = overrideEditorTexts.files

type Props = {
  overrideFileInputRef: React.RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  overrideEditingId: string | null
  openOverrideEditorForKey: (override: OverrideRule) => void
}

function RuleItem({
  override,
  isSelected,
  openOverrideEditorForKey,
}: {
  override: OverrideRule
  isSelected: boolean
  openOverrideEditorForKey: (o: OverrideRule) => void
}) {
  return (
    <div className={s.itemWrap}>
      <button
        type="button"
        className={`${s.card} ${s.cardButton} ${
          !override.enabled ? s.cardDisabled : ''
        } ${isSelected ? s.cardSelected : ''}`}
        onClick={() => openOverrideEditorForKey(override)}
        aria-label={tf.openRule(overrideListLabel(override))}
        aria-current={isSelected ? 'true' : undefined}
      >
        <div className={s.head}>
          <strong>{overrideListLabel(override)}</strong>
        </div>
      </button>
    </div>
  )
}

export function OverrideFilesUI({
  overrideFileInputRef,
  overrideForm,
  setOverrideForm,
  overrideEntries,
  overrideEditingId,
  openOverrideEditorForKey,
}: Props) {
  const pathGroups = useMemo(
    () => buildPathGroups(overrideEntries),
    [overrideEntries],
  )

  return (
    <div className={`${s.fileManager} ${s.fileManagerEmbed}`}>
      <input
        ref={overrideFileInputRef}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const reader = new FileReader()
          reader.onload = () => {
            setOverrideForm((x) => ({
              ...x,
              body: String(reader.result ?? ''),
            }))
          }
          const ct = getResponseContentType(overrideForm.headersText)
          if (isImageContentType(ct) || f.type.startsWith('image/')) {
            reader.readAsDataURL(f)
          } else {
            reader.readAsText(f)
          }
          e.target.value = ''
        }}
      />

      {overrideEntries.length === 0 ? (
        <p className="small muted" style={{ margin: '0.15rem 0' }}>
          {tf.noRulesLead} <strong>{tf.newRule}</strong> {tf.noRulesTail}
        </p>
      ) : (
        <>
          {pathGroups.length > 0 ? (
            <div className={s.originGroupList}>
              {pathGroups.map((group) => {
                const hostId = `ov-origin-${String(group.host).replace(/\s+/g, '_')}`
                const contentId = `${hostId}-rules`
                const hasEnabledRule = group.rules.some((rule) => rule.enabled)
                return (
                  <section
                    key={group.host}
                    className={s.originSection}
                    aria-label={group.host}
                  >
                    <Collapsible defaultOpen className={s.originCollapsible}>
                      <h3
                        className={s.originHeading}
                        id={hostId}
                      >
                        <CollapsibleTrigger
                          className={s.originTrigger}
                          type="button"
                          aria-label={tf.toggleHostGroup(group.host)}
                          aria-controls={contentId}
                        >
                          <ChevronDown
                            className={`${s.originChevron} ${
                              hasEnabledRule ? s.originChevronActive : ''
                            }`}
                            data-icon="inline-start"
                            aria-hidden
                          />
                          <span className={`mono ${s.originHostLabel}`}>
                            {group.host}
                          </span>
                          <span
                            className={`small muted ${s.originRuleCount}`}
                            aria-hidden
                          >
                            ({group.rules.length})
                          </span>
                        </CollapsibleTrigger>
                      </h3>
                      <CollapsibleContent
                        id={contentId}
                        className={s.originCollapsibleContent}
                        role="region"
                        aria-labelledby={hostId}
                      >
                        <div className={s.originTree}>
                          <ul className={s.ruleGroup}>
                            {group.rules.map((override) => (
                              <li key={override.id}>
                                <RuleItem
                                  override={override}
                                  isSelected={overrideEditingId === override.id}
                                  openOverrideEditorForKey={
                                    openOverrideEditorForKey
                                  }
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </section>
                )
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
