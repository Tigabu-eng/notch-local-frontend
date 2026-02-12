import React, { useEffect, useMemo, useState } from 'react'
import { analyzeCall, getInsights, listCalls, uploadDocx, type CallInsight, type CallResponse } from './api'

function formatDate(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export default function App() {
  const [calls, setCalls] = useState<CallResponse[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => calls.find(c => c.id === selectedId) || null, [calls, selectedId])

  const [insights, setInsights] = useState<CallInsight | null>(null)
  const [loadingCalls, setLoadingCalls] = useState(false)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [busyAnalyzeId, setBusyAnalyzeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)

  async function refreshCalls() {
    setLoadingCalls(true)
    setError(null)
    try {
      const data = await listCalls()
      data.sort((a, b) => (b.call_date || '').localeCompare(a.call_date || ''))
      setCalls(data)
      if (!selectedId && data.length) setSelectedId(data[0].id)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoadingCalls(false)
    }
  }

  async function refreshInsights(callId: string) {
    setLoadingInsights(true)
    setInsights(null)
    setError(null)
    try {
      const data = await getInsights(callId)
      console.log('Got insights:', data)
      setInsights(data)
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (msg.includes('404')) {
        setInsights(null)
      } else {
        setError(msg)
      }
    } finally {
      setLoadingInsights(false)
    }
  }

  useEffect(() => {
    refreshCalls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedId) refreshInsights(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Please choose a .docx file first.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const created = await uploadDocx({
        file,
        title: title.trim() || undefined,
        description: description.trim() || undefined
      })
      await refreshCalls()
      setSelectedId(created.id)
      setFile(null)
      setTitle('')
      setDescription('')
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setUploading(false)
    }
  }

  async function onAnalyze(callId: string) {
    setBusyAnalyzeId(callId)
    setError(null)
    try {
      await analyzeCall(callId)
      await refreshCalls()
      await refreshInsights(callId)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusyAnalyzeId(null)
    }
  }

  return (
    <div className="container">
      <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Notch Calls</div>
          <div className="muted">Upload .docx • Analyze • Browse insights</div>
        </div>
      </div>

      <div className="grid">
        <div className="vstack">
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Create call (upload .docx)</div>
            <form className="vstack" onSubmit={onUpload}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Title</div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Customer discovery - ACME" />
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Description</div>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes for the UI..." />
              </div>

              <div>
                <div className="muted" style={{ marginBottom: 6 }}>DOCX file</div>
                <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <div className="muted" style={{ marginTop: 6 }}>Tip: large transcripts may take longer to analyze.</div>
              </div>
              <button type="submit" disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload & Create Call'}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>Calls</div>
              <button className="secondary" onClick={() => refreshCalls()} disabled={loadingCalls}>
                {loadingCalls ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            <div className="muted" style={{ marginTop: 6, marginBottom: 10 }}>Click a call to view insights.</div>

            <div className="list">
              {calls.map(c => (
                <div
                  key={c.id}
                  className={`list-item ${c.id === selectedId ? 'active' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hstack" style={{ justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </div>
                    <span className="badge">{c.status}</span>
                  </div>
                  {c.description ? <div className="muted" style={{ marginTop: 4 }}>{c.description}</div> : null}
                  <div className="muted" style={{ marginTop: 4 }}>{formatDate(c.call_date)}</div>
                  <div className="hstack" style={{ marginTop: 10 }}>
                    <button onClick={(e) => { e.stopPropagation(); onAnalyze(c.id) }} disabled={!!busyAnalyzeId}>
                      {busyAnalyzeId === c.id ? 'Analyzing…' : 'Analyze'}
                    </button>
                    <button className="secondary" onClick={(e) => { e.stopPropagation(); refreshInsights(c.id) }}>
                      Load insights
                    </button>
                  </div>
                </div>
              ))}
              {calls.length === 0 && !loadingCalls ? <div className="muted">No calls yet. Upload a .docx to create one.</div> : null}
            </div>
          </div>
        </div>

        <div className="vstack">
          <div className="card">
            <div style={{ fontWeight: 700 }}>Call details</div>
            {selected ? (
              <>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 750 }}>{selected.title}</div>
                  {selected.description ? <div className="muted" style={{ marginTop: 6 }}>{selected.description}</div> : null}
                  <div className="muted" style={{ marginTop: 6 }}>
                    Date: {formatDate(selected.call_date)} • Status: {selected.status}
                  </div>
                </div>

                <hr />

                <div style={{ fontWeight: 700, marginBottom: 6 }}>Insights</div>
                {loadingInsights ? (
                  <div className="muted">Loading insights…</div>
                ) : insights ? (
                  <div className="vstack">
                    <div>
                      <div className="muted" style={{ marginBottom: 6 }}>Summary</div>
                      <div>{insights.summary}</div>
                    </div>

                    <div className="hstack" style={{ flexWrap: 'wrap' }}>
                      {insights.tags?.map((t, i) => <span key={i} className="badge">{t}</span>)}
                    </div>

                    <div>
                      <div className="muted" style={{ marginBottom: 6 }}>Action items</div>
                      <ul style={{ marginTop: 0 }}>
                        {insights.actionItems?.map((a, i) => (
                          <li key={i}>
                            {a.description}
                            {(a.owner || a.urgency) ? (
                              <span className="muted"> — {a.owner ? `owner: ${a.owner}` : ''}{a.owner && a.urgency ? ', ' : ''}{a.urgency ? `urgency: ${a.urgency}` : ''}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="muted" style={{ marginBottom: 6 }}>People mentioned</div>
                      <ul style={{ marginTop: 0 }}>
                        {insights.peopleMentioned?.map((p, i) => (
                          <li key={i}>
                            {p.name}
                            {(p.role || p.company) ? <span className="muted"> — {p.role || ''}{p.role && p.company ? ', ' : ''}{p.company || ''}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="muted" style={{ marginBottom: 6 }}>Key decisions</div>
                      <ul style={{ marginTop: 0 }}>
                        {insights.keyDecisions?.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="muted">No insights yet. Click <b>Analyze</b> to generate them.</div>
                )}

                <hr />
                <details>
                  <summary className="muted" style={{ cursor: 'pointer' }}>Transcript (raw)</summary>
                  <pre style={{ marginTop: 10 }}>{selected.transcript}</pre>
                </details>
              </>
            ) : (
              <div className="muted" style={{ marginTop: 10 }}>Select a call from the left.</div>
            )}
          </div>

          {error ? (
            <div className="card" style={{ borderColor: '#fecaca', background: '#fff1f2' }}>
              <div style={{ fontWeight: 700, color: '#b91c1c' }}>Error</div>
              <div className="muted" style={{ color: '#b91c1c', marginTop: 6 }}>{error}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
