import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { analyzeCall, getInsights, listCalls, uploadDocx, type CallInsight, type CallResponse } from './api'

// ---------- configuration ----------
const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'
const SERVER_CHAT_URL = `${API_BASE_URL}/api/calls/search`

// ---------- helper: format date ----------
function formatDate(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

// ---------- format structured search results into Markdown with interactive summary ----------
function formatBotResponse(data: any): string {
  let md = ''

  // Always include the answer if present
  if (data.answer) {
    md += data.answer + '\n\n'
  }

  // If there are results, add a table with the required columns
  if (data.results && Array.isArray(data.results) && data.results.length > 0) {
    md += `**Total results:** ${data.total_results || data.results.length}\n\n`

    // Table header
    md += `| Full Name | Title | Company | Call Type | Seniority | Summary |\n`
    md += `|-----------|-------|---------|-----------|-----------|---------|\n`

    data.results.forEach((item: any) => {
      const name = item.full_name || 'N/A'
      const title = item.current_title || 'N/A'
      const company = item.current_company || '—'
      const callType = item.type || '—'
      const seniority = item.seniority_level || '—'
      
      // Extract summary – clean up newlines and truncate for display
      let fullSummary = item.profile?.summary || ''
      const cleanSummary = fullSummary.replace(/\s+/g, ' ').trim()
      let displaySummary = cleanSummary
      if (displaySummary.length > 100) {
        displaySummary = displaySummary.slice(0, 100) + '…'
      }

      // Make the summary clickable – we embed the item ID as a data attribute
      // We'll use a span with role="button" and a class for event delegation
      md += `| ${name} | ${title} | ${company} | ${callType} | ${seniority} | ` +
            `<span class="summary-clickable" data-profile-id="${item.id}" ` +
            `style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted;">` +
            `${displaySummary}</span> |\n`
    })

    md += '\n'
  }

  // If we have neither answer nor results, return a fallback
  if (!md.trim()) {
    md = 'No results found.'
  }

  return md
}

// ---------- Profile Detail Modal (glassmorphism, centered) ----------
const ProfileModal: React.FC<{
  profile: any;
  onClose: () => void;
}> = ({ profile, onClose }) => {
  if (!profile) return null

  // Helper to render profile fields nicely
  const renderField = (label: string, value: any) => {
    if (!value) return null
    if (typeof value === 'string') {
      return <p><strong>{label}:</strong> {value}</p>
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return null
      return (
        <div>
          <strong>{label}:</strong>
          <ul style={{ marginTop: 4, marginBottom: 8 }}>
            {value.map((v, i) => (
              <li key={i}>{typeof v === 'object' ? JSON.stringify(v) : v}</li>
            ))}
          </ul>
        </div>
      )
    }
    if (typeof value === 'object') {
      return (
        <div>
          <strong>{label}:</strong>
          <pre style={{ background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 8, fontSize: 12 }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      )
    }
    return null
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 600,
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(29, 73, 94, 0.95)',
          backdropFilter: 'blur(12px)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          padding: 24,
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {profile.full_name || 'Profile Details'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 24,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 20,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p><strong>Title:</strong> {profile.current_title || 'N/A'}</p>
          <p><strong>Company:</strong> {profile.current_company || '—'}</p>
          <p><strong>Seniority:</strong> {profile.seniority_level || '—'}</p>
          <p><strong>Call Type:</strong> {profile.type || '—'}</p>
          
          {profile.profile && (
            <>
              <div>
                <strong>Summary:</strong>
                <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8 }}>
                  {profile.profile.summary || 'No summary available.'}
                </div>
              </div>

              {renderField('Industries', profile.profile.industries)}
              {profile.profile.transformation_experience && profile.profile.transformation_experience.length > 0 && (
                <div>
                  <strong>Transformations:</strong>
                  <ul style={{ marginTop: 4 }}>
                    {profile.profile.transformation_experience.map((t: any, i: number) => (
                      <li key={i}>
                        {t.role} – {t.type}: {t.description}
                        {t.quantifiable_impact && ` (impact: ${t.quantifiable_impact})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {renderField('Private Equity Exposure', profile.profile.private_equity_exposure)}
              {profile.profile.leadership_scope && (
                <div>
                  <strong>Leadership Scope:</strong>
                  <ul style={{ marginTop: 4 }}>
                    {profile.profile.leadership_scope.team_size_managed && (
                      <li>Team size: {profile.profile.leadership_scope.team_size_managed}</li>
                    )}
                    {profile.profile.leadership_scope.budget_responsibility && (
                      <li>Budget: {profile.profile.leadership_scope.budget_responsibility}</li>
                    )}
                    {profile.profile.leadership_scope.geographical_scope && (
                      <li>Scope: {profile.profile.leadership_scope.geographical_scope}</li>
                    )}
                  </ul>
                </div>
              )}
              {renderField('Achievements', profile.profile.achievements)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Chat Widget – collapsible right panel with resizing and detail modal ----------
const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Array<{ text: string; sender: 'user' | 'bot' }>>([
    { text: "Hi! I'm your Notch AI assistant. Ask me anything about the calls or insights.", sender: 'bot' }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // For storing the last search response data (to access full profiles on click)
  const [lastSearchData, setLastSearchData] = useState<any>(null)

  // For profile detail modal
  const [selectedProfile, setSelectedProfile] = useState<any>(null)

  // Resizable panel
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth] = useState(380) // initial width
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // Handle drag start on the left edge
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth
  }, [panelWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      const delta = dragStartX.current - e.clientX // moving left increases width
      const newWidth = Math.min(Math.max(dragStartWidth.current + delta, 380), window.innerWidth * 0.8)
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Click handler for summary links (event delegation)
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const clickable = target.closest('.summary-clickable')
      if (clickable) {
        const profileId = clickable.getAttribute('data-profile-id')
        if (profileId && lastSearchData?.results) {
          const profile = lastSearchData.results.find((p: any) => p.id === profileId)
          if (profile) {
            setSelectedProfile(profile)
          }
        }
      }
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [lastSearchData])

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

    try {
      const response = await fetch(SERVER_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      // Store full response for later detail lookup
      setLastSearchData(data)

      const botReply = formatBotResponse(data);
      setMessages(prev => [...prev, { text: botReply, sender: 'bot' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { text: 'Sorry, I encountered an error. Please try again.', sender: 'bot' }]);
    } finally {
      setIsTyping(false);
    }
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
          zIndex: 1100,
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

      {/* collapsible right panel with resizable handle */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          maxWidth: '100%',
          background: 'rgba(29, 73, 94, 0.95)',
          backdropFilter: 'blur(12px)',
          borderLeft: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
          zIndex: 1000,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: isDragging ? 'none' : 'transform 0.3s ease-in-out',
          display: 'flex',
          flexDirection: 'column',
          color: '#fff',
        }}
      >
        {/* Resize handle (left edge) */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '8px',
            cursor: 'ew-resize',
            background: 'transparent',
            zIndex: 1001,
          }}
        />

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
          ref={messagesContainerRef}
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
                {msg.sender === 'bot' ? (
                  <div dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) }} />
                ) : (
                  msg.text
                )}
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

      {/* Profile detail modal */}
      {selectedProfile && (
        <ProfileModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
        />
      )}

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

// ---------- main App component (unchanged except chat widget) ----------
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
