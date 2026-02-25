import React, { useEffect, useMemo, useState, useRef } from 'react'
import { analyzeCall, getInsights, listCalls, uploadDocx, type CallInsight, type CallResponse } from './api'

function formatDate(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

// ---------- simple local chatbot (mock) ----------
function getLocalBotReply(userMessage: string): string {
  const msg = userMessage.toLowerCase()
  if (msg.includes('hello') || msg.includes('hi')) {
    return "Hello! I'm your Notch AI assistant. How can I help you with the calls today?"
  }
  if (msg.includes('action') || msg.includes('next step')) {
    return "You can view action items in the insights panel. Would you like me to explain any of them?"
  }
  if (msg.includes('summary')) {
    return "The summary is shown under the Call details. If you need more detail, try asking about a specific part."
  }
  if (msg.includes('thank')) {
    return "You're welcome! Feel free to ask if anything else comes up."
  }
  return "I'm here to help with follow‑up questions about your calls. Try asking about a specific insight or action item."
}


const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Array<{ text: string; sender: 'user' | 'bot' }>>([
    { text: "Hi! I'm your Notch AI assistant. Ask me anything about the calls or insights.", sender: 'bot' }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // optional session ID (stored for future server integration)
  const [sessionId] = useState(() => {
    const stored = localStorage.getItem('chatSessionId')
    if (stored) return stored
    const newId = 'sess-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now()
    localStorage.setItem('chatSessionId', newId)
    return newId
  })

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim()) return
    const userMsg = inputValue.trim()
    setMessages(prev => [...prev, { text: userMsg, sender: 'user' }])
    setInputValue('')
    setIsTyping(true)

    // Simulate network delay, then bot reply
    setTimeout(() => {
      const botReply = getLocalBotReply(userMsg)
      setMessages(prev => [...prev, { text: botReply, sender: 'bot' }])
      setIsTyping(false)
    }, 800)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Speech recognition (optional)
  const [recognition, setRecognition] = useState<any>(null)
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognizer = new Rec()
      recognizer.lang = 'en-US'
      recognizer.continuous = false
      recognizer.interimResults = false
      recognizer.onresult = (evt: any) => {
        const transcript = evt.results[0][0].transcript
        setInputValue(transcript)
        // optionally auto‑send after speech
        setTimeout(() => handleSend(), 100)
      }
      recognizer.onerror = () => {
        setMessages(prev => [...prev, { text: 'Speech recognition failed. Please type.', sender: 'bot' }])
      }
      setRecognition(recognizer)
    }
  }, [])

  const handleMic = () => {
    if (recognition) {
      try {
        recognition.start()
      } catch (e) {
        console.warn('mic error', e)
      }
    }
  }

  return (
    <>
      {/* toggle icon – fixed at bottom right */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: '#eb6209',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
          zIndex: 1100, // above the panel when closed
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <i className="fas fa-comment-dots" style={{ fontSize: '24px' }}></i>
      </button>

      {/* collapsible right panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '380px',
          maxWidth: '100%',
          background: 'rgba(29, 73, 94, 0.95)',
          backdropFilter: 'blur(12px)',
          borderLeft: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
          zIndex: 1000,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease-in-out',
          display: 'flex',
          flexDirection: 'column',
          color: '#fff',
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <i className="fas fa-robot" style={{ color: '#eb6209', fontSize: '24px' }}></i>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600, flex: 1 }}>Notch Chat</h3>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '20px',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            ✕
          </button>
        </div>

        {/* messages area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '18px',
                  background: msg.sender === 'user' ? '#eb6209' : 'rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {msg.sender === 'user' ? <i className="fas fa-user"></i> : <i className="fas fa-robot"></i>}
              </div>
              <div
                style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: '20px',
                  background: msg.sender === 'user' ? '#eb6209' : 'rgba(255,255,255,0.1)',
                  border: msg.sender === 'bot' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                  color: '#fff',
                  wordBreak: 'break-word',
                  lineHeight: '1.5',
                  fontSize: '14px',
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '18px',
                  background: 'rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="fas fa-robot"></i>
              </div>
              <div
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '20px',
                  padding: '12px 16px',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>typing</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.7)',
                    animation: 'bounce 1.4s infinite ease-in-out both',
                  }}></span>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.7)',
                    animation: 'bounce 1.4s infinite ease-in-out both',
                    animationDelay: '-0.16s',
                  }}></span>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.7)',
                    animation: 'bounce 1.4s infinite ease-in-out both',
                    animationDelay: '-0.32s',
                  }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* input area */}
        <div
          style={{
            padding: '16px 24px 24px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Ask a follow‑up..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                padding: '14px 20px',
                borderRadius: '40px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                fontSize: '15px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              style={{
                padding: '14px 20px',
                borderRadius: '40px',
                border: 'none',
                background: '#eb6209',
                color: '#fff',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#ff7a2a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#eb6209')}
            >
              <i className="fas fa-paper-plane"></i>
            </button>
            {recognition && (
              <button
                onClick={handleMic}
                style={{
                  padding: '14px 20px',
                  borderRadius: '40px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                <i className="fas fa-microphone"></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* animation keyframes */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </>
  )
}

// ---------- main App component ----------
export default function App() {
  // ... (keep all existing state and functions exactly as they were) ...
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
  }, [])

  useEffect(() => {
    if (selectedId) refreshInsights(selectedId)
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

      {/* chat widget */}
      <ChatWidget />
    </div>
  )
}
