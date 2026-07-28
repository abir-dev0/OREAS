import { useState, useRef, useCallback, useEffect } from 'react'
import {
  FileSpreadsheet, Upload, CheckCircle2, AlertTriangle,
  RefreshCw, Clock, Info, X, ChevronDown, ChevronUp,
  Database, ArrowRight, Zap, ShieldCheck, Archive, GitMerge, Link2, Sparkles
} from 'lucide-react'
import Topbar from '../components/Topbar'

const API = import.meta.env.VITE_API_URL || '/api'

// ─── helpers ────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data })
  return data
}

function fmt(n) { return Number(n || 0).toLocaleString('fr-MA') }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-MA', { dateStyle: 'short', timeStyle: 'short' })
}

// ─── sub-components ──────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color = 'var(--accent)', bg = 'var(--accent-light)' }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: 'var(--shadow-sm)', transition: 'box-shadow var(--transition-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 'var(--radius-md)',
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  )
}

function Badge({ status }) {
  const map = {
    imported:   { bg: 'rgba(34,197,94,0.12)',   color: '#16a34a', label: 'Importé' },
    updated:    { bg: 'rgba(59,130,246,0.12)',   color: '#2563eb', label: 'Mis à jour' },
    skipped:    { bg: 'rgba(156,163,175,0.15)',  color: '#6b7280', label: 'Ignoré' },
    conflict:   { bg: 'rgba(245,158,11,0.12)',   color: '#d97706', label: 'Conflit' },
    archived:   { bg: 'rgba(139,92,246,0.12)',   color: '#7c3aed', label: 'Archivé' },
    error:      { bg: 'rgba(239,68,68,0.12)',    color: '#dc2626', label: 'Erreur' },
  }
  const s = map[status] || { bg: 'rgba(156,163,175,0.15)', color: '#6b7280', label: status }
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: 'nowrap'
    }}>{s.label}</span>
  )
}

function ErrorList({ errors }) {
  const [open, setOpen] = useState(false)
  if (!errors?.length) return null
  return (
    <div style={{
      border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)',
      background: 'rgba(245,158,11,0.06)', overflow: 'hidden'
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', background: 'none', border: 'none',
          cursor: 'pointer', color: '#d97706', fontWeight: 700, fontSize: 13
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          {errors.length} erreur(s) de validation (non bloquantes)
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {errors.map((e, i) => (
            <div key={i} style={{
              fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px',
              background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
              borderLeft: '3px solid #f59e0b'
            }}>
              <strong>Ligne {e.row}:</strong> {e.field} — {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SyncResult({ result, onClose }) {
  if (!result) return null
  const success = !result.error
  return (
    <div style={{
      background: success ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
      border: `1px solid ${success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 'var(--radius-lg)', padding: 20,
      animation: 'slideDown 0.3s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {success
            ? <CheckCircle2 size={22} color="#16a34a" />
            : <AlertTriangle size={22} color="#dc2626" />}
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: success ? '#15803d' : '#dc2626' }}>
              {success ? 'Synchronisation réussie !' : 'Erreur de synchronisation'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {result.file_name && `Fichier : ${result.file_name}`}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 4
        }}>
          <X size={18} />
        </button>
      </div>

      {success && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Importés',   value: result.imported,  color: '#16a34a', bg: 'rgba(34,197,94,0.1)' },
              { label: 'Mis à jour', value: result.updated,   color: '#2563eb', bg: 'rgba(59,130,246,0.1)' },
              { label: 'Ignorés',    value: result.skipped,   color: '#6b7280', bg: 'rgba(156,163,175,0.1)' },
              { label: 'Conflits',   value: result.conflicts, color: '#d97706', bg: 'rgba(245,158,11,0.1)' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} style={{
                background: bg, borderRadius: 'var(--radius-md)',
                padding: '12px 10px', textAlign: 'center'
              }}>
                <div style={{ fontSize: 22, fontWeight: 900, color }}>{fmt(value)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <ErrorList errors={result.validation_errors} />
        </>
      )}

      {!success && (
        <div style={{ fontSize: 13, color: '#dc2626', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 'var(--radius-sm)' }}>
          {result.error}
        </div>
      )}
    </div>
  )
}

// ─── Drop Zone ───────────────────────────────────────────────────────────────
function DropZone({ onFileReady, loading }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [staged, setStaged] = useState(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    const valid = file.name.match(/\.(xlsx|xls|csv)$/i)
    if (!valid) return alert('Format non supporté. Utilisez .xlsx, .xls ou .csv')
    setStaged(file)
  }, [])

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const onDragOver = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const handleSync = () => { if (staged && !loading) onFileReady(staged) }
  const clearStaged = () => { setStaged(null); if (inputRef.current) inputRef.current.value = '' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        onClick={() => !staged && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : staged ? '#22c55e' : 'var(--border-color)'}`,
          borderRadius: 'var(--radius-xl)',
          background: dragging
            ? 'var(--accent-light)'
            : staged
            ? 'rgba(34,197,94,0.05)'
            : 'var(--bg-secondary)',
          padding: '36px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
          cursor: staged ? 'default' : 'pointer',
          transition: 'all var(--transition-fast)',
          position: 'relative'
        }}
      >
        {staged ? (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-lg)',
              background: 'rgba(34,197,94,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle2 size={28} color="#16a34a" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>{staged.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {(staged.size / 1024).toFixed(1)} KB — prêt à synchroniser
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); clearStaged() }} style={{
              position: 'absolute', top: 12, right: 12, background: 'none',
              border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4
            }}>
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-xl)',
              background: dragging ? 'var(--accent-light)' : 'var(--bg-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-sm)',
              transition: 'all var(--transition-fast)'
            }}>
              {dragging
                ? <ArrowRight size={24} color="var(--accent)" />
                : <Upload size={24} color="var(--text-muted)" />}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                {dragging ? 'Relâchez pour importer' : 'Glissez votre fichier Excel ici'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                ou <span style={{ color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>parcourir votre ordinateur</span>
              </div>
            </div>
          </>
        )}
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>

      <button
        onClick={handleSync}
        disabled={!staged || loading}
        style={{
          padding: '12px 24px', borderRadius: 'var(--radius-md)',
          background: (!staged || loading) ? 'var(--bg-secondary)' : 'var(--accent-gradient)',
          color: (!staged || loading) ? 'var(--text-muted)' : '#fff',
          border: 'none', cursor: (!staged || loading) ? 'not-allowed' : 'pointer',
          fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 10, transition: 'all var(--transition-fast)',
          boxShadow: (!staged || loading) ? 'none' : 'var(--shadow-glow)',
          fontFamily: 'var(--font-sans)'
        }}
      >
        {loading
          ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Importation...</>
          : <><Zap size={16} /> Synchroniser le fichier</>}
      </button>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ExcelSync() {
  const [loading, setLoading] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState(null)
  const [headers, setHeaders] = useState(null)
  const [inspecting, setInspecting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const inspectRef = useRef(null)

  // Load dashboard status and existing share_url on mount
  useEffect(() => {
    apiFetch('/excel-sync/status/').then(data => {
      setStatus(data)
    }).catch(() => {})

    apiFetch('/excel-sync/settings/').then(settings => {
      if (settings?.share_url) setShareUrl(settings.share_url)
    }).catch(() => {})
  }, [])

  // File Upload & Sync
  const handleSync = useCallback(async (file) => {
    setLoading(true); setResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const data = await apiFetch('/excel-sync/upload-sync/', { method: 'POST', body: fd })
      setResult(data)
      apiFetch('/excel-sync/status/').then(setStatus).catch(() => {})
    } catch (err) {
      setResult({ error: err.message || 'Erreur inconnue' })
    } finally {
      setLoading(false)
    }
  }, [])

  // Live Link Sync (Automated Background Sync)
  const handleLinkSync = useCallback(async (e) => {
    e?.preventDefault()
    if (!shareUrl.trim()) return alert('Veuillez coller le lien de votre fichier Excel Online')
    setLinkLoading(true); setResult(null)
    try {
      const data = await apiFetch('/excel-sync/link-sync/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_url: shareUrl.trim() })
      })
      setResult(data)
      apiFetch('/excel-sync/status/').then(setStatus).catch(() => {})
    } catch (err) {
      setResult({ error: err.message || 'Impossible de lire le lien' })
    } finally {
      setLinkLoading(false)
    }
  }, [shareUrl])

  // Inspect headers
  const inspectHeaders = useCallback(async (file) => {
    setInspecting(true); setHeaders(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const data = await apiFetch('/excel-sync/inspect-headers/', { method: 'POST', body: fd })
      setHeaders(data.headers || [])
    } catch {
      setHeaders([])
    } finally {
      setInspecting(false)
    }
  }, [])

  const totalOrders = status?.total_orders_in_db ?? '—'
  const lastSync    = status?.last_sync_at
  const conflicts   = status?.total_conflicts ?? 0
  const archived    = status?.total_archived ?? 0
  const history     = status?.last_sync_logs ?? []

  return (
    <div className="page-wrapper" style={{ fontFamily: 'var(--font-sans)' }}>
      <Topbar title="Synchronisation Excel" />

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes slideDown {
          from { opacity:0; transform: translateY(-10px) }
          to   { opacity:1; transform: translateY(0) }
        }
        .sync-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
        @media (max-width: 900px) { .sync-grid { grid-template-columns: 1fr; } }
        .stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 28px; }
        @media (max-width: 900px) { .stats-row { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div style={{ padding: '32px 36px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--radius-lg)',
              background: 'var(--accent-gradient)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)'
            }}>
              <FileSpreadsheet size={24} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: 'var(--text-primary)' }}>
                Synchronisation Excel
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                Auto-synchro en direct avec l'Excel de votre équipe (sans Azure)
              </p>
            </div>
          </div>

          {lastSync && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10,
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)',
              padding: '5px 14px', fontSize: 12, color: 'var(--text-secondary)'
            }}>
              <Clock size={13} />
              Dernière auto-sync : <strong style={{ color: 'var(--text-primary)' }}>{fmtDate(lastSync)}</strong>
            </div>
          )}
        </div>

        {/* ── Stats row ── */}
        <div className="stats-row">
          <StatCard icon={Database}    label="Commandes totales"  value={fmt(totalOrders)} />
          <StatCard icon={CheckCircle2} label="Syncs réussies"    value={fmt(history.filter(h=>h.status==='success').length || 1)}
                    color="#16a34a" bg="rgba(34,197,94,0.1)" />
          <StatCard icon={GitMerge}    label="Conflits détectés"  value={fmt(conflicts)}
                    color="#d97706" bg="rgba(245,158,11,0.1)" />
          <StatCard icon={Archive}     label="Commandes archivées" value={fmt(archived)}
                    color="#7c3aed" bg="rgba(139,92,246,0.1)" />
        </div>

        {/* ── Main grid ── */}
        <div className="sync-grid">

          {/* LEFT — Auto Link Sync & Manual Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ⚡ OPTION A: Live Link Auto-Sync */}
            <div style={{
              background: 'var(--bg-card)', border: '2px solid var(--accent)',
              borderRadius: 'var(--radius-xl)', padding: 26,
              boxShadow: 'var(--shadow-glow)', position: 'relative'
            }}>
              <div style={{
                position: 'absolute', top: -12, right: 20,
                background: 'var(--accent-gradient)', color: '#fff',
                fontSize: 11, fontWeight: 900, padding: '3px 12px',
                borderRadius: 'var(--radius-full)', textTransform: 'uppercase',
                letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4
              }}>
                <Sparkles size={12} /> Recommandé — Auto-Sync 24/7
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Link2 size={20} color="var(--accent)" />
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Lien Excel Online (Synchro Automatique)
                </h2>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Collez le lien de partage de l'Excel de votre équipe. OREAS synchronisera automatiquement les modifications de l'équipe <strong>toutes les 10 minutes</strong>.
              </p>

              <form onSubmit={handleLinkSync} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="url"
                  placeholder="https://1drv.ms/x/s!... ou lien de partage OneDrive/Google Sheets"
                  value={shareUrl}
                  onChange={e => setShareUrl(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                    fontSize: 13, color: 'var(--text-primary)', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  disabled={linkLoading || !shareUrl.trim()}
                  style={{
                    padding: '12px 20px', borderRadius: 'var(--radius-md)',
                    background: (linkLoading || !shareUrl.trim()) ? 'var(--bg-secondary)' : 'var(--accent-gradient)',
                    color: (linkLoading || !shareUrl.trim()) ? 'var(--text-muted)' : '#fff',
                    border: 'none', cursor: (linkLoading || !shareUrl.trim()) ? 'not-allowed' : 'pointer',
                    fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8, fontFamily: 'var(--font-sans)'
                  }}
                >
                  {linkLoading
                    ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connexion & Sync en cours...</>
                    : <><Zap size={16} /> Connecter & Synchroniser en Direct</>}
                </button>
              </form>
            </div>

            {/* 📄 OPTION B: Direct File Upload */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xl)', padding: 26,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Upload size={18} color="var(--text-secondary)" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Ou Importer un fichier .xlsx manuellement
                </h2>
              </div>

              <DropZone onFileReady={handleSync} loading={loading} />

              {result && (
                <div style={{ marginTop: 16 }}>
                  <SyncResult result={result} onClose={() => setResult(null)} />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Inspector & History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Column Inspector */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xl)', padding: 24,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <ShieldCheck size={18} color="#7c3aed" />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Inspecter les colonnes
                </h2>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Uploadez votre fichier pour vérifier la liste exacte des colonnes détectées par OREAS.
              </p>

              <input
                ref={inspectRef} type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) inspectHeaders(e.target.files[0]) }}
              />
              <button
                onClick={() => inspectRef.current?.click()}
                disabled={inspecting}
                style={{
                  padding: '10px 16px', borderRadius: 'var(--radius-md)',
                  background: 'rgba(139,92,246,0.1)', color: '#7c3aed',
                  border: '1px solid rgba(139,92,246,0.3)', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--font-sans)', transition: 'all var(--transition-fast)'
                }}
              >
                {inspecting
                  ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyse...</>
                  : <><FileSpreadsheet size={14} /> Analyser les colonnes</>}
              </button>

              {headers !== null && (
                <div style={{ marginTop: 14 }}>
                  {headers.length === 0
                    ? <p style={{ fontSize: 12, color: 'var(--error)' }}>Aucun en-tête détecté.</p>
                    : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {headers.map((h, i) => (
                          <span key={i} style={{
                            padding: '4px 10px', borderRadius: 'var(--radius-full)',
                            background: 'var(--accent-light)', color: 'var(--accent)',
                            fontSize: 11, fontWeight: 700
                          }}>{h}</span>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Sync History */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xl)', overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <button
                onClick={() => setHistoryOpen(o => !o)}
                style={{
                  width: '100%', padding: '18px 24px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Clock size={17} color="var(--text-secondary)" />
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>
                    Historique des synchronisations
                  </span>
                </div>
                {historyOpen ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
              </button>

              {historyOpen && (
                <div style={{ borderTop: '1px solid var(--border-color)' }}>
                  {history.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      Aucune synchronisation effectuée pour l'instant
                    </div>
                  ) : (
                    history.slice(0, 8).map((h, i) => (
                      <div key={i} style={{
                        padding: '12px 24px', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: i < history.length - 1 ? '1px solid var(--border-color)' : 'none',
                        fontSize: 13
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {h.source || 'Import Excel'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {fmtDate(h.created_at)} · {h.imported_count} importés, {h.updated_count} mis à jour
                          </div>
                        </div>
                        <Badge status={h.status === 'success' ? 'imported' : 'error'} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Zero Azure Info banner */}
            <div style={{
              padding: '16px 20px', borderRadius: 'var(--radius-lg)',
              background: 'var(--info-bg)', border: '1px solid rgba(59,130,246,0.2)',
              display: 'flex', gap: 12
            }}>
              <Info size={18} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Synchronisation 100% Automatique sans Azure.</strong><br />
                Partagez simplement le lien de votre fichier Excel OneDrive avec la permission "Lecture", et collez-le ci-dessus. OREAS mettra à jour vos données en tâche de fond automatiquement !
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
