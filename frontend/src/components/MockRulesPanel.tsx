import type { Dispatch, SetStateAction } from 'react'
import type { MockRule } from '../types'

type MockForm = {
  name: string
  matchMethod: string
  matchHost: string
  matchPathRegex: string
  status: number
  body: string
  headerKey: string
  headerVal: string
}

type SetMockForm = Dispatch<SetStateAction<MockForm>>

type Props = {
  mockForm: MockForm
  setMockForm: SetMockForm
  mocks: MockRule[]
  addMock: () => void
  removeMock: (id: string) => void
}

export function MockRulesPanel({
  mockForm,
  setMockForm,
  mocks,
  addMock,
  removeMock,
}: Props) {
  return (
    <div className="mocks">
      <p className="muted intro">
        Rules are checked in order. A rule matches when it is enabled and every non-empty
        field matches (method exact, host substring, path regex). First match wins and
        returns your status, headers, and body — no upstream call for plain HTTP.
      </p>

      <div className="mock-form">
        <label>
          Name
          <input
            value={mockForm.name}
            onChange={(e) => setMockForm((f) => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label>
          Method (optional)
          <input
            placeholder="GET"
            value={mockForm.matchMethod}
            onChange={(e) =>
              setMockForm((f) => ({ ...f, matchMethod: e.target.value }))
            }
          />
        </label>
        <label>
          Host contains (optional)
          <input
            placeholder="example.com"
            value={mockForm.matchHost}
            onChange={(e) =>
              setMockForm((f) => ({ ...f, matchHost: e.target.value }))
            }
          />
        </label>
        <label>
          Path regex (optional)
          <input
            placeholder="^/api/"
            value={mockForm.matchPathRegex}
            onChange={(e) =>
              setMockForm((f) => ({ ...f, matchPathRegex: e.target.value }))
            }
          />
        </label>
        <label>
          Status
          <input
            type="number"
            value={mockForm.status}
            onChange={(e) =>
              setMockForm((f) => ({
                ...f,
                status: Number(e.target.value) || 200,
              }))
            }
          />
        </label>
        <label>
          Header (optional)
          <div className="pair">
            <input
              placeholder="name"
              value={mockForm.headerKey}
              onChange={(e) =>
                setMockForm((f) => ({ ...f, headerKey: e.target.value }))
              }
            />
            <input
              placeholder="value"
              value={mockForm.headerVal}
              onChange={(e) =>
                setMockForm((f) => ({ ...f, headerVal: e.target.value }))
              }
            />
          </div>
        </label>
        <label className="wide">
          Body
          <textarea
            rows={6}
            value={mockForm.body}
            onChange={(e) =>
              setMockForm((f) => ({ ...f, body: e.target.value }))
            }
          />
        </label>
        <button type="button" className="primary" onClick={addMock}>
          Add mock rule
        </button>
      </div>

      <ul className="mock-list">
        {mocks.map((m) => (
          <li key={m.id} className="mock-card">
            <div className="mock-head">
              <strong>{m.name}</strong>
              <button
                type="button"
                className="ghost danger"
                onClick={() => removeMock(m.id)}
              >
                Delete
              </button>
            </div>
            <p className="small mono">
              {m.matchMethod ?? '∗'} · {m.matchHost ?? '∗'} · {m.matchPathRegex ?? '∗'} →{' '}
              {m.status}
            </p>
            <pre className="pre tiny">{m.body}</pre>
          </li>
        ))}
      </ul>
    </div>
  )
}
