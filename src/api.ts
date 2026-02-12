export type CallResponse = {
  id: string
  title: string
  description?: string | null
  transcript: string
  status: string
  call_date: string
  created_at?: string
  updated_at?: string
}

export type CallInsight = {
  call_id: string
  summary: string
  tags: string[]
  actionItems: { description: string; owner?: string | null; urgency?: string | null }[]
  peopleMentioned: { name: string; role?: string | null; company?: string | null }[]
  keyDecisions: string[]
  created_at?: string
}

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'

async function handle(res: Response) {
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${txt}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export async function listCalls() {
  const res = await fetch(`${API_BASE_URL}/api/calls?limit=200&offset=0`)
  return handle(res) as Promise<CallResponse[]>
}

export async function uploadDocx(args: {
  file: File
  title?: string
  description?: string
  call_date?: string
}) {
  const fd = new FormData()
  fd.append('file', args.file)
  if (args.title) fd.append('title', args.title)
  if (args.description) fd.append('description', args.description)
  if (args.call_date) fd.append('call_date', args.call_date)

  const res = await fetch(`${API_BASE_URL}/api/calls/upload-docx`, {
    method: 'POST',
    body: fd
  })
  return handle(res) as Promise<CallResponse>
}

export async function analyzeCall(callId: string) {
  const res = await fetch(`${API_BASE_URL}/api/calls/${callId}/analyze`, { method: 'POST' })
  return handle(res)
}

export async function getInsights(callId: string) {
  const res = await fetch(`${API_BASE_URL}/api/calls/${callId}/insights`)

  const jsonData = await res.json()
  

  return jsonData.insights as Promise<CallInsight>
}
