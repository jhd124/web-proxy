import { useMemo, type ReactNode } from 'react'
import type { OverrideFormState, OverrideRule } from '../../../types'
import {
  buildPathGroups,
  formatPathPrefix,
  overrideListLabel,
  type PathNode,
} from '../overrideFileTree'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import s from './OverrideFilesUI.module.css'

const tf = overrideEditorTexts.files

type Props = {
  overrideFileInputRef: React.RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  startNewOverride: () => void
  openOverrideEditorForKey: (override: OverrideRule) => void
}

function RuleItem({
  override,
  openOverrideEditorForKey,
}: {
  override: OverrideRule
  openOverrideEditorForKey: (o: OverrideRule) => void
}) {
  return (
    <div className={s.itemWrap}>
      <button
        type="button"
        className={`${s.card} ${s.cardButton} ${
          !override.enabled ? s.cardDisabled : ''
        }`}
        onClick={() => openOverrideEditorForKey(override)}
        aria-label={tf.openRule(overrideListLabel(override))}
      >
        <div className={s.head}>
          <strong>
            {overrideListLabel(override)}{' '}
          </strong>
        </div>  
      </button>
    </div>
  )
}

function PathTreeList({
  node,
  pathPrefix,
  openOverrideEditorForKey,
}: {
  node: PathNode
  pathPrefix: string[]
  openOverrideEditorForKey: (o: OverrideRule) => void
}): ReactNode {
  if (node.rules.length === 0 && node.children.size === 1) {
    const [seg, child] = node.children.entries().next().value! as [
      string,
      PathNode,
    ]
    return (
      <PathTreeList
        node={child}
        pathPrefix={[...pathPrefix, seg]}
        openOverrideEditorForKey={openOverrideEditorForKey}
      />
    )
  }

  const childKeys = [...node.children.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
  const showChildSegment = childKeys.length > 1 || node.rules.length > 0

  return (
    <>
      {node.rules.length > 0 && (
        <ul className={s.ruleGroup}>
          {node.rules.map((override) => (
            <li key={override.id}>
              <RuleItem
                override={override}
                openOverrideEditorForKey={openOverrideEditorForKey}
              />
            </li>
          ))}
        </ul>
      )}
      {childKeys.length > 0 && (
        <ul className={s.pathBranches}>
          {childKeys.map((k) => (
            <li key={k} className={s.pathBranchItem}>
              {showChildSegment && (
                <div
                  className={s.pathSegRow}
                  title={formatPathPrefix([...pathPrefix, k])}
                >
                  <span className={s.pathSegMono} aria-hidden="true">
                    {k}
                  </span>
                </div>
              )}
              <PathTreeList
                node={node.children.get(k)!}
                pathPrefix={[...pathPrefix, k]}
                openOverrideEditorForKey={openOverrideEditorForKey}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function OverrideFilesUI({
  overrideFileInputRef,
  overrideForm,
  setOverrideForm,
  overrideEntries,
  startNewOverride,
  openOverrideEditorForKey,
}: Props) {
  const pathGroups = useMemo(
    () => buildPathGroups(overrideEntries),
    [overrideEntries],
  )

  return (
    <div className={`${s.fileManager} ${s.fileManagerEmbed}`}>
      <button
        type="button"
        className={`ghost ${s.newOverrideBtn}`}
        onClick={startNewOverride}
      >
        {tf.newRule}
      </button>
      <p className="small muted">{tf.importHint}</p>
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
          reader.readAsText(f)
          e.target.value = ''
        }}
      />
      <div className={s.fileManagerActions}>
        <button
          type="button"
          className="ghost"
          onClick={() => overrideFileInputRef.current?.click()}
        >
          {tf.importToBody}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const blob = new Blob([overrideForm.body], { type: 'text/plain' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'override-response-body.txt'
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          {tf.exportBody}
        </button>
      </div>
      <div className={s.fileManagerSep} aria-hidden="true" />
      <p className={`small muted ${s.fileManagerListIntro}`}>
        {tf.listIntroLead}{' '}
        <strong>Traffic → Override response</strong>
        {tf.listIntroOr} <strong>New rule</strong> {tf.listIntroAbove}{' '}
        <strong>Request</strong> {tf.listIntroTail}
      </p>
      {overrideEntries.length === 0 ? (
        <p className="small muted" style={{ margin: '0.15rem 0' }}>
          {tf.noRulesLead} <strong>{tf.newRule}</strong> {tf.noRulesTail}
        </p>
      ) : (
        <>
          {pathGroups.length > 0 ? (
            <div className={s.originGroupList}>
              {pathGroups.map((group) => (
                <section
                  key={group.host}
                  className={s.originSection}
                  aria-label={group.host}
                >
                  <h3
                    className={s.originHeading}
                    id={`ov-origin-${String(group.host).replace(/\s+/g, '_')}`}
                  >
                    <span className="mono">{group.host}</span>
                  </h3>
                  <div className={s.originTree}>
                    <PathTreeList
                      node={group.root}
                      pathPrefix={[]}
                      openOverrideEditorForKey={openOverrideEditorForKey}
                    />
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
