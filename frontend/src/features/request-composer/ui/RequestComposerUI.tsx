import { useEffect, useRef } from 'react'
import { Send, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SimpleTooltip } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HeadersTable } from '@/components/headers-table/HeadersTable'
import { PanelHeader, panelHeaderStyles as ph } from '@/components/panel-header'
import { requestComposerTexts as t } from '../texts'
import type { RequestComposerViewModel } from '../types'
import s from './RequestComposerUI.module.css'

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export function RequestComposerUI(viewModel: RequestComposerViewModel) {
  const {
    form,
    setFormField,
    hostSuggestions,
    pathSuggestions,
    methodSuggestions,
    response,
    isSending,
    isRequestTargetReady,
    sendRequest,
    history,
    selectedHistory,
    selectedHistoryId,
    historyQuery,
    setHistoryQuery,
    selectHistory,
    reuseSelectedHistory,
    deleteSelectedHistory,
    clearHistory,
    loadMoreHistory,
    hasMoreHistory,
    historyLoading,
  } = viewModel

  const methods = Array.from(
    new Set([...methodSuggestions.map((suggestion) => suggestion.value), ...METHOD_OPTIONS]),
  )

  return (
    <section className={s.panel}>
      <PanelHeader
        id="request-composer-title"
        title={t.title}
        actions={
          <SimpleTooltip label={isSending ? t.actions.sending : t.actions.send}>
            <Button
              type="button"
              className={ph.iconBtn}
              size="icon"
              onClick={() => void sendRequest()}
              disabled={isSending || !isRequestTargetReady}
              aria-label={isSending ? t.actions.sending : t.actions.send}
            >
              <Send size={16} aria-hidden />
            </Button>
          </SimpleTooltip>
        }
      />
      <div className={s.body}>
        <ScrollArea className={s.editorScroll}>
          <div className={s.editor}>
            <section className={s.group}>
              <label className={s.field}>
                <span>{t.fields.url}</span>
                <Input
                  value={form.url}
                  onChange={(event) => setFormField('url', event.target.value)}
                  list="request-composer-urls"
                  placeholder={t.placeholders.url}
                  autoComplete="off"
                  spellCheck={false}
                />
                <datalist id="request-composer-urls">
                  {getUrlSuggestions(form.url, hostSuggestions, pathSuggestions).map(
                    (suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ),
                  )}
                </datalist>
              </label>
            </section>

            <section className={s.group}>
              <div className={s.methodRow}>
                <label className={s.field}>
                  <span>{t.fields.method}</span>
                  <Select
                    value={form.method}
                    onValueChange={(value) => setFormField('method', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label className={s.field}>
                <span>{t.fields.searchParams}</span>
                <AutoGrowTextarea
                  className={s.textarea}
                  value={form.searchParamsText}
                  onValueChange={(value) => setFormField('searchParamsText', value)}
                  placeholder={t.placeholders.keyValueLines}
                  spellCheck={false}
                />
              </label>
              {form.method !== 'GET' && (
                <label className={s.field}>
                  <span>{t.fields.body}</span>
                  <AutoGrowTextarea
                    className={`${s.textarea} ${s.bodyText}`}
                    value={form.body}
                    onValueChange={(value) => setFormField('body', value)}
                    placeholder={t.placeholders.body}
                    spellCheck={false}
                  />
                </label>
              )}
            </section>

            <section className={s.group}>
              <label className={s.field}>
                <span>{t.fields.headers}</span>
                <AutoGrowTextarea
                  className={s.textarea}
                  value={form.headersText}
                  onValueChange={(value) => setFormField('headersText', value)}
                  placeholder={t.placeholders.headers}
                  spellCheck={false}
                />
              </label>
            </section>
          </div>
        </ScrollArea>

        <aside className={s.side}>
          <section className={s.historyCard}>
            <div className={s.cardHead}>
              <h3>{t.sections.history}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void clearHistory()}
                disabled={history.length === 0}
              >
                <Trash2 size={14} aria-hidden />
                {t.actions.clearHistory}
              </Button>
            </div>
            <Input
              type="search"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder={t.placeholders.historySearch}
            />
            <ScrollArea className={s.historyList}>
              {history.length === 0 ? (
                <p className={`muted ${s.empty}`}>{t.emptyHistory}</p>
              ) : (
                <div className={s.historyItems}>
                  {history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${s.historyItem} ${
                        selectedHistoryId === item.id ? s.historyItemActive : ''
                      }`}
                      onClick={() => void selectHistory(item.id)}
                    >
                      <span className={s.historyPath}>
                        {item.method} {formatUrlPath(item.url)}
                      </span>
                      <span className={s.historyMeta}>
                        {item.responseStatus ?? item.error ?? '—'} ·{' '}
                        {formatDateTime(item.sentAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
            {hasMoreHistory && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadMoreHistory()}
                disabled={historyLoading}
              >
                {t.actions.loadMore}
              </Button>
            )}
          </section>

          <section className={s.responseCard}>
            <div className={s.cardHead}>
              <h3>{t.sections.response}</h3>
              <div className={s.responseActions}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reuseSelectedHistory}
                  disabled={!selectedHistory}
                >
                  <RotateCcw size={14} aria-hidden />
                  {t.actions.reuse}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteSelectedHistory()}
                  disabled={!selectedHistoryId}
                >
                  <Trash2 size={14} aria-hidden />
                  {t.actions.delete}
                </Button>
              </div>
            </div>
            {selectedHistory && (
              <p className={`mono small ${s.selectedUrl}`}>{selectedHistory.url}</p>
            )}
            {response ? (
              <div className={s.responseBody}>
                <p className={s.statusLine}>
                  {response.error ??
                    `${response.status ?? '—'} · ${response.durationMs} ms`}
                </p>
                {hasVisibleHeaders(response.headers) && (
                  <HeadersTable headers={response.headers} />
                )}
                {hasBodyPreview(response.bodyPreview) && (
                  <pre className={s.pre}>
                    {formatResponseBodyPreview(response.bodyPreview)}
                  </pre>
                )}
              </div>
            ) : (
              <p className={`muted ${s.empty}`}>{t.noResponse}</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatUrlPath(value: string): string {
  try {
    const url = new URL(value)
    return `${url.pathname}${url.search}` || '/'
  } catch {
    return value
  }
}

function getUrlSuggestions(
  currentUrl: string,
  hostSuggestions: { value: string }[],
  pathSuggestions: { value: string }[],
): string[] {
  const target = parseTargetParts(currentUrl)
  const hosts = hostSuggestions.map((suggestion) => `${target.scheme}://${suggestion.value}`)
  const paths = target.host
    ? pathSuggestions.map((suggestion) => `${target.scheme}://${target.host}${suggestion.value}`)
    : []
  return Array.from(new Set([...paths, ...hosts]))
}

function parseTargetParts(value: string): { scheme: string; host: string } {
  const trimmed = value.trim()
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return {
      scheme: url.protocol.replace(':', '') || 'https',
      host: url.host.toLowerCase(),
    }
  } catch {
    return { scheme: 'https', host: '' }
  }
}

function hasVisibleHeaders(headers: [string, string][]): boolean {
  return headers.some(([key, value]) => key.trim().length > 0 || value.trim().length > 0)
}

function hasBodyPreview(bodyPreview: string | null | undefined): boolean {
  return (bodyPreview ?? '').trim().length > 0
}

function formatResponseBodyPreview(bodyPreview: string | null | undefined): string {
  const source = (bodyPreview ?? '').trim()
  if (!source) return ''
  try {
    return JSON.stringify(JSON.parse(source), null, 2)
  } catch {
    return bodyPreview ?? ''
  }
}

type AutoGrowTextareaProps = {
  className: string
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  spellCheck: boolean
}

function AutoGrowTextarea({
  className,
  value,
  onValueChange,
  placeholder,
  spellCheck,
}: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const syncHeight = () => {
    const textareaElement = textareaRef.current
    if (!textareaElement) return
    textareaElement.style.height = 'auto'
    textareaElement.style.height = `${textareaElement.scrollHeight}px`
  }

  useEffect(() => {
    syncHeight()
  }, [value])

  return (
    <textarea
      ref={textareaRef}
      className={className}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onInput={syncHeight}
      placeholder={placeholder}
      spellCheck={spellCheck}
    />
  )
}
