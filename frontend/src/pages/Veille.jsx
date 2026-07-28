import { useState, useEffect } from 'react'
import {
  Compass, Search, UserPlus, Trash2, Heart,
  MessageSquare, ExternalLink, Sparkles, Filter, Check, RefreshCw,
  ChevronUp, ChevronDown, Star
} from 'lucide-react'
import Topbar from '../components/Topbar'
import {
  getCompetitors, addCompetitor, deleteCompetitor,
  triggerCompetitorSync, getCompetitorMedia, importCompetitorMedia,
  analyzeCandidateWithAI
} from '../services/api'

export default function Veille() {
  const [competitors, setCompetitors] = useState([])
  const [mediaList, setMediaList] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState(null)

  // Form states
  const [newUsername, setNewUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Filter/Sort states
  const [selectedCompetitor, setSelectedCompetitor] = useState('')
  const [sortBy, setSortBy] = useState('date') // date, engagement
  const [daysFilter, setDaysFilter] = useState('15') // 15, 30, all (default: last 15 days)

  // Status check for imports
  const [importedStatus, setImportedStatus] = useState({})
  const [expandedTechnical, setExpandedTechnical] = useState({}) // id -> true/false
  const [analyzingIds, setAnalyzingIds] = useState({}) // id -> true/false
  const [expandedAIReports, setExpandedAIReports] = useState({}) // id -> true/false

  // Load competitors & their media
  const loadData = async (compFilter = selectedCompetitor, order = sortBy, days = daysFilter) => {
    setLoading(true)
    try {
      const comps = await getCompetitors()
      setCompetitors(comps)

      const params = {}
      if (compFilter) {
        params.competitor_id = compFilter
      }
      params.sort_by = order === 'date' ? 'date' : 'engagement'
      if (days && days !== 'all') {
        params.days = days
      }

      const media = await getCompetitorMedia(params)
      setMediaList(media)
    } catch (e) {
      console.error('Error loading media:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Auto-sync any competitor whose URLs are older than 6 hours
  // Instagram CDN signed URLs expire in ~24h, so we keep them fresh automatically
  useEffect(() => {
    if (competitors.length === 0) return
    const SIX_HOURS = 6 * 60 * 60 * 1000
    const stale = competitors.filter(c => {
      if (!c.last_sync_at) return true
      return Date.now() - new Date(c.last_sync_at).getTime() > SIX_HOURS
    })
    if (stale.length === 0) return
    // Sync stale competitors sequentially in the background (no UI blocking)
    const syncStale = async () => {
      for (const comp of stale) {
        try {
          await triggerCompetitorSync(comp.id)
        } catch (e) {
          console.warn(`Auto-sync failed for @${comp.username}:`, e.message)
        }
      }
      // Reload after all background syncs complete
      await loadData(selectedCompetitor, sortBy)
    }
    syncStale()
  }, [competitors.length]) // Only re-run when the competitors list size changes


  // Handle adding competitor
  const handleAddCompetitor = async (e) => {
    e.preventDefault()
    const name = newUsername.trim().replace(/^@/, '')
    if (!name) return

    setSubmitting(true)
    setErrorMsg('')
    try {
      await addCompetitor(name)
      setNewUsername('')
      // Reload everything
      await loadData(selectedCompetitor, sortBy)
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Error adding competitor.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle deleting competitor
  const handleDeleteCompetitor = async (id) => {
    if (!window.confirm('Do you really want to stop tracking this competitor?')) return
    try {
      setErrorMsg('')
      await deleteCompetitor(id)
      // Reset filter if active
      let nextFilter = selectedCompetitor
      if (Number(selectedCompetitor) === id) {
        nextFilter = ''
        setSelectedCompetitor('')
      }
      await loadData(nextFilter, sortBy)
    } catch (e) {
      console.error(e)
      setErrorMsg(e.response?.data?.detail || e.response?.data?.error || 'Failed to delete competitor. Make sure the server is running.')
    }
  }

  // Handle sync trigger
  const handleSyncCompetitor = async (id) => {
    setSyncingId(id)
    setErrorMsg('')
    try {
      const result = await triggerCompetitorSync(id)
      // Immediately patch the competitor in state with fresh data from the response
      if (result?.competitor) {
        setCompetitors(prev => prev.map(c => c.id === id ? result.competitor : c))
      }
      // Reload the full data (competitors + media)
      await loadData(selectedCompetitor, sortBy)
    } catch (e) {
      console.error(e)
      const msg = e.response?.data?.detail || e.response?.data?.error || e.message || 'Sync failed.'
      setErrorMsg(`Sync failed: ${msg}`)
    } finally {
      setSyncingId(null)
    }
  }

  // Handle import to Runway candidates
  const handleImportCandidate = async (mediaId) => {
    try {
      await importCompetitorMedia(mediaId)
      setImportedStatus(prev => ({ ...prev, [mediaId]: true }))
    } catch (e) {
      console.error(e)
    }
  }

  // Handle AI analysis manually triggered
  const handleAIAnalyze = async (mediaId) => {
    setAnalyzingIds(prev => ({ ...prev, [mediaId]: true }))
    try {
      const res = await analyzeCandidateWithAI(mediaId)
      if (res.success && res.analysis) {
        setMediaList(prev => prev.map(m => m.id === mediaId ? {
          ...m,
          ai_analysis: res.analysis,
          ai_score: res.analysis.ai_score,
          is_candidate: res.analysis.status !== 'Ignore'
        } : m))
        setExpandedAIReports(prev => ({ ...prev, [mediaId]: true }))
      } else {
        alert("Analyse échouée: " + (res.error || "Erreur inconnue"))
      }
    } catch (e) {
      console.error(e)
      alert("Erreur de connexion. Veuillez vérifier que le serveur backend tourne et est joignable.")
    } finally {
      setAnalyzingIds(prev => ({ ...prev, [mediaId]: false }))
    }
  }

  // Calculate high-level stats for display cards
  const totalFollowers = competitors.reduce((acc, c) => acc + (c.followers_count || 0), 0)

  const avgEngagementRate = mediaList.length > 0
    ? (mediaList.reduce((acc, m) => acc + (m.engagement_score || 0), 0) / mediaList.length).toFixed(2)
    : '0.00'

  const bestPost = mediaList.length > 0
    ? [...mediaList].sort((a, b) => (b.like_count + b.comments_count) - (a.like_count + a.comments_count))[0]
    : null

  // Strip legacy "ARAM" brand references from cached AI analysis data
  const sanitize = (text) => {
    if (!text) return text
    if (Array.isArray(text)) return text.map(sanitize)
    return String(text)
      .replace(/ARAM\s*\/\s*OREAS/gi, 'OREAS')
      .replace(/\bARAM\b/gi, 'OREAS')
  }

  // Strategic AI Analysis Function - Business-focused with technical details
  const generateStrategicInsight = (media, allMedia, globalAvg) => {
    const caption = media.caption || ''
    const mediaType = media.media_type
    const likes = media.like_count || 0
    const comments = media.comments_count || 0
    const engagement = media.engagement_score || 0
    const postedDate = new Date(media.posted_at)
    const hour = postedDate.getHours()

    // Calculate competitor-specific averages
    const competitorPosts = allMedia.filter(m => m.competitor_username === media.competitor_username)
    const hasCompetitorData = competitorPosts.length >= 5

    let competitorAvgLikes = 0
    let competitorAvgComments = 0
    let competitorAvgEngagement = 0

    if (hasCompetitorData) {
      competitorAvgLikes = competitorPosts.reduce((acc, m) => acc + (m.like_count || 0), 0) / competitorPosts.length
      competitorAvgComments = competitorPosts.reduce((acc, m) => acc + (m.comments_count || 0), 0) / competitorPosts.length
      competitorAvgEngagement = competitorPosts.reduce((acc, m) => acc + (m.engagement_score || 0), 0) / competitorPosts.length
    }

    const likesRatio = hasCompetitorData && competitorAvgLikes > 0 ? (likes / competitorAvgLikes) : null
    const commentsRatio = hasCompetitorData && competitorAvgComments > 0 ? (comments / competitorAvgComments) : null
    const engagementRatio = hasCompetitorData && competitorAvgEngagement > 0 ? (engagement / competitorAvgEngagement) : null

    // Business-focused explanation
    let businessInsight = ''
    let recommendation = ''
    let technicalDetails = []

    if (!hasCompetitorData) {
      businessInsight = "Nous avons besoin de plus de données sur ce concurrent pour fournir une analyse fiable."
      recommendation = "Surveillez ce concurrent pour commencer à recevoir des insights stratégiques."
      technicalDetails.push("Données insuffisantes pour l'analyse comparative")
    } else {
      // Build business insight based on strongest signals
      if (likesRatio > 1.5) {
        businessInsight = "Ce post génère un engagement exceptionnellement élevé pour ce concurrent."
        recommendation = "Identifiez ce qui rend ce post unique et testez des approches similaires."
        technicalDetails.push(`${likesRatio.toFixed(1)}× plus de likes que la moyenne (${competitorAvgLikes.toFixed(0)})`)
      } else if (commentsRatio > 2.0) {
        businessInsight = "Ce contenu déclenche beaucoup plus de conversations que d'habitude."
        recommendation = "Ce type de contenu suscite des discussions - c'est souvent un signe d'intérêt d'achat."
        technicalDetails.push(`${commentsRatio.toFixed(1)}× plus de commentaires que la moyenne`)
      } else if (engagementRatio > 1.4) {
        businessInsight = "Performance nettement supérieure aux posts habituels de ce concurrent."
        recommendation = "Analysez les différences pour comprendre ce qui fonctionne."
        technicalDetails.push(`${engagementRatio.toFixed(1)}× l'engagement moyen`)
      } else if (likesRatio < 0.5) {
        businessInsight = "Ce post performe en dessous des attentes pour ce concurrent."
        recommendation = "Évitez les éléments qui pourraient expliquer cette sous-performance."
        technicalDetails.push(`${likesRatio.toFixed(1)}× moins de likes que la moyenne`)
      } else {
        businessInsight = "Performance normale pour ce concurrent."
        recommendation = "Continuez à surveiller pour identifier les posts qui se démarquent."
        technicalDetails.push("Performance alignée sur la moyenne historique")
      }

      // Add media type context
      if (mediaType === 'REEL' && engagementRatio > 1.3) {
        businessInsight += " Le format vidéo court fonctionne particulièrement bien ici."
        technicalDetails.push("Format Reel performant")
      } else if (mediaType === 'CAROUSEL_ALBUM' && commentsRatio > 1.5) {
        businessInsight += " Les carrousels semblent engager davantage l'audience."
        technicalDetails.push("Carrousel avec fort taux de commentaires")
      }

      // Add time context
      if (hour >= 18 && hour <= 21 && engagementRatio > 1.2) {
        businessInsight += " Les publications en soirée résonnent bien."
        technicalDetails.push(`Publié à ${hour}h - horaire optimal`)
      }
    }

    return {
      insight: businessInsight,
      recommendation: recommendation,
      technical: technicalDetails,
      confidence: hasCompetitorData ? `Basé sur ${competitorPosts.length} posts` : 'Données limitées'
    }
  }

  // Format follower counts elegantly
  const formatFollowers = (num) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
    if (num >= 1_000) return (num / 1_000).toFixed(0) + 'k'
    return num
  }

  return (
    <>
      <Topbar title="Veille Marché" subtitle="Benchmarks de marque et surveillance automatique des tendances" />

      <div className="page-body">

        {/* Tracked Competitors Manager Block */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="flex justify-between items-center" style={{ width: '100%' }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>
                <Compass size={14} /> Intelligence Concurrentielle
              </div>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Surveillance des flux de collections et détection des tendances de marque</p>
            </div>

            {/* Input Add Form */}
            <form onSubmit={handleAddCompetitor} className="flex items-center gap-8" style={{ margin: 0 }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>@</span>
                <input
                  type="text"
                  placeholder="nom_utilisateur"
                  className="form-input"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  disabled={submitting}
                  style={{
                    paddingLeft: '24px',
                    width: 180,
                    fontSize: 13,
                    borderRadius: 'var(--radius-md)'
                  }}
                />
              </div>
              <button type="submit" disabled={submitting || !newUsername.trim()} className="btn btn-primary" style={{ padding: '8px 16px', gap: 6, fontSize: 12.5 }}>
                <UserPlus size={14} />
                {submitting ? 'Ajout...' : 'Suivre'}
              </button>
            </form>
          </div>

          {errorMsg && (
            <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>{errorMsg}</div>
          )}

          {/* Competitors Tags List */}
          <div className="flex items-center gap-8 flex-wrap">
            {competitors.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun concurrent configuré. Suivez un compte public ci-dessus.</span>
            ) : (
              competitors.map(comp => (
                <div
                  key={comp.id}
                  className="flex items-center gap-8"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>@{comp.username}</span>
                  <span style={{ color: 'var(--accent)', fontSize: 11 }}>
                    {formatFollowers(comp.followers_count)} abonnés
                  </span>
                  <button
                    onClick={() => handleSyncCompetitor(comp.id)}
                    title="Actualiser les posts"
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 2,
                    }}
                  >
                    <RefreshCw size={11} className={syncingId === comp.id ? 'spin' : ''} />
                  </button>
                  <button
                    onClick={() => handleDeleteCompetitor(comp.id)}
                    title="Arrêter le suivi"
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 2,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Global Competitor Stats Row */}
        {loading ? (
          <div className="four-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-xl)' }} />
            ))}
          </div>
        ) : (
          <div className="four-col">
            <div className="card text-center" style={{ padding: '32px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 8 }}>Concurrents Actifs</div>
              <div className="kpi-value" style={{ color: 'var(--accent)', fontSize: 32 }}>{competitors.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, fontWeight: 500 }}>
                Audience Cumulative: {formatFollowers(totalFollowers)}
              </div>
            </div>

            <div className="card text-center" style={{ padding: '32px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 8 }}>Engagement Moyen</div>
              <div className="kpi-value" style={{ color: 'var(--text-primary)', fontSize: 32 }}>{avgEngagementRate}%</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, fontWeight: 500 }}>
                Basé sur {mediaList.length} posts récents
              </div>
            </div>

            <div className="card text-center" style={{ padding: '32px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 8 }}>Meilleur Concurrent</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 12, marginBottom: 8 }}>
                {bestPost ? `@${bestPost.competitor_username}` : 'None'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {bestPost ? `${(bestPost.like_count + bestPost.comments_count).toLocaleString('fr-FR')} interactions` : '-'}
              </div>
            </div>

            <div className="card text-center" style={{ padding: '32px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 8 }}>Total des Posts</div>
              <div className="kpi-value" style={{ color: 'var(--text-primary)', fontSize: 32 }}>{mediaList.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, fontWeight: 500 }}>
                Sur tous les concurrents suivis
              </div>
            </div>
          </div>
        )}

        {/* Filters and Feed inspiration Section */}
        <div className="page-header" style={{ marginBottom: 8, marginTop: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>
              <Sparkles size={14} /> Runway d'Inspiration
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>Extraction des meilleures pièces et concepts de style concurrents</p>
          </div>

          {/* Filtering and sorting controls */}
          <div className="flex items-center gap-12">
            {/* Filter competitor */}
            <div className="flex items-center gap-6" style={{ background: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <Filter size={12} color="var(--text-muted)" />
              <select
                value={selectedCompetitor}
                onChange={(e) => {
                  setSelectedCompetitor(e.target.value)
                  loadData(e.target.value, sortBy, daysFilter)
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="" style={{ background: 'var(--bg-card)' }}>Tous les concurrents</option>
                {competitors.map(c => (
                  <option key={c.id} value={c.id} style={{ background: 'var(--bg-card)' }}>@{c.username}</option>
                ))}
              </select>
            </div>

            {/* Filter recency (days) */}
            <div className="flex items-center gap-6" style={{ background: 'var(--bg-card)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <select
                value={daysFilter}
                onChange={(e) => {
                  const newDays = e.target.value
                  setDaysFilter(newDays)
                  loadData(selectedCompetitor, sortBy, newDays)
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="15" style={{ background: 'var(--bg-card)' }}>Derniers 15 jours</option>
                <option value="30" style={{ background: 'var(--bg-card)' }}>Derniers 30 jours</option>
                <option value="all" style={{ background: 'var(--bg-card)' }}>Tout l'historique</option>
              </select>
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-4" style={{ background: 'var(--bg-card)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <button
                onClick={() => { setSortBy('engagement'); loadData(selectedCompetitor, 'engagement', daysFilter); }}
                className="btn btn-sm"
                style={{
                  background: sortBy === 'engagement' ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: 'none',
                  color: sortBy === 'engagement' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                Engagement
              </button>
              <button
                onClick={() => { setSortBy('date'); loadData(selectedCompetitor, 'date', daysFilter); }}
                className="btn btn-sm"
                style={{
                  background: sortBy === 'date' ? 'rgba(255,255,255,0.04)' : 'transparent',
                  border: 'none',
                  color: sortBy === 'date' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                Date
              </button>
            </div>
          </div>
        </div>

        {/* Media Grid Feed */}
        {loading ? (
          <div className="media-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 450, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : mediaList.length === 0 ? (
          <div className="card text-center" style={{ padding: '80px 20px', borderStyle: 'dashed' }}>
            <Compass size={32} color="var(--text-muted)" style={{ marginBottom: 12, opacity: 0.5 }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Flux d'inspiration vide</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
              Ajoutez un concurrent ou actualisez la synchronisation pour commencer à analyser leurs posts et performances.
            </p>
          </div>
        ) : (
          <div className="media-grid">
            {mediaList.map((media, index) => {
              const isImported = importedStatus[media.id]

              // Score styling logic (Professional labels)
              let scoreColor = 'var(--text-secondary)'
              let scoreBg = 'rgba(255,255,255,0.03)'
              let scoreBorder = 'var(--border)'
              let scoreText = 'Stable'

              // Generate strategic AI insight
              const strategicAnalysis = generateStrategicInsight(media, mediaList, avgEngagementRate)
              const aiExplanation = strategicAnalysis.insight
              const aiRecommendation = strategicAnalysis.recommendation
              const aiTechnical = strategicAnalysis.technical
              const aiConfidence = strategicAnalysis.confidence
              const isTechnicalExpanded = expandedTechnical[media.id] || false

              if (media.engagement_score >= 0.6) {
                scoreColor = '#000'
                scoreBg = 'var(--accent)'
                scoreBorder = 'transparent'
                scoreText = 'Élite (Top 5%)'
              } else if (media.engagement_score >= 0.4) {
                scoreColor = 'var(--accent)'
                scoreBg = 'var(--accent-dim)'
                scoreBorder = 'rgba(var(--accent-rgb), 0.2)'
                scoreText = 'Haute Performance'
              } else if (media.engagement_score >= 0.25) {
                scoreColor = 'var(--text-primary)'
                scoreBg = 'rgba(255,255,255,0.05)'
                scoreBorder = 'var(--border)'
                scoreText = 'Tendance'
              }

              const isRecommend = media.ai_analysis?.business_decision === 'RECOMMEND'
              const badgeColor = isRecommend ? 'var(--success)' : 'var(--danger)'
              const badgeBg = isRecommend ? 'var(--success-dim)' : 'var(--danger-dim)'
              const badgeLabel = isRecommend ? 'Recommandé' : 'Rejeté'

              const profile = media.ai_analysis?.product_profile || {}
              const pourquoiTester = sanitize(media.ai_analysis?.pourquoi_tester && media.ai_analysis?.pourquoi_tester.length > 0
                ? media.ai_analysis.pourquoi_tester
                : (media.ai_analysis?.why_ai_recommends || []))

              const executiveSummary = sanitize(media.ai_analysis?.executive_summary || media.ai_analysis?.summary || 'Aucun résumé exécutif disponible.')

              const pourquoiMaintenant = sanitize(media.ai_analysis?.pourquoi_maintenant && media.ai_analysis?.pourquoi_maintenant.length > 0
                ? media.ai_analysis.pourquoi_maintenant
                : [
                  profile.trend ? `Tendance : ${profile.trend}` : "Tendance active sur le marché premium.",
                  "Forte demande pour ce type de coupe et silhouette.",
                  "Les couleurs neutres dominent les meilleures performances."
                ])

              const opportunitesAmelioration = sanitize(media.ai_analysis?.opportunites_amelioration && media.ai_analysis?.opportunites_amelioration.length > 0
                ? media.ai_analysis.opportunites_amelioration
                : (media.ai_analysis?.strengths && media.ai_analysis?.strengths.length > 0
                  ? media.ai_analysis.strengths.map(s => `Optimiser : ${s}`)
                  : ["Utiliser des matières plus nobles (soie, viscose)", "Ajouter des finitions faites main"]))

              const avantageConcurrentiel = sanitize(media.ai_analysis?.avantage_concurrentiel && media.ai_analysis?.avantage_concurrentiel.length > 0
                ? media.ai_analysis.avantage_concurrentiel
                : [
                  "Savoir-faire tailleur supérieur de l'atelier OREAS.",
                  "Tissus plus qualitatifs que le modèle concurrent.",
                  "Storytelling de marque plus fort et shooting exclusif."
                ])

              let recommendedPrice = 'Non spécifié'
              let suggestedPriceRange = 'Non spécifié'
              if (profile.recommended_price) {
                recommendedPrice = `${profile.recommended_price} MAD`
                suggestedPriceRange = profile.suggested_price_range || `${profile.recommended_price - 50}–${profile.recommended_price + 50} MAD`
              } else if (profile.estimated_price_range) {
                const match = String(profile.estimated_price_range).match(/(\d+)\s*-\s*(\d+)/)
                if (match) {
                  const min = parseInt(match[1])
                  const max = parseInt(match[2])
                  let avg = Math.round((min + max) / 2)
                  avg = Math.floor(avg / 10) * 10 + 9
                  recommendedPrice = `${avg} MAD`
                  suggestedPriceRange = `${min}–${max} MAD`
                } else {
                  recommendedPrice = profile.estimated_price_range
                  suggestedPriceRange = profile.estimated_price_range
                }
              }

              return (
                <div
                  key={media.id}
                  className="media-card fade-in"
                  style={{
                    animationDelay: `${index * 30}ms`,
                  }}
                >
                  {/* Top profile banner */}
                  <div className="flex justify-between items-center" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>@{media.competitor_username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(media.posted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>

                  {/* Image Display */}
                  <div className="media-thumb">
                    <img
                      src={media.thumbnail_url || media.media_url}
                      alt="Competitor visual"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        // Step 1: if thumbnail failed, try media_url directly
                        if (e.target.src !== media.media_url && media.media_url && e.target.src !== e.target.dataset.fallbackUsed) {
                          e.target.dataset.fallbackUsed = media.media_url
                          e.target.src = media.media_url
                          return
                        }
                        // Step 2: both CDN URLs expired — show an Instagram-branded
                        // placeholder with a direct link to the post
                        const parent = e.target.parentElement
                        e.target.style.display = 'none'
                        const existing = parent.querySelector('.ig-fallback')
                        if (!existing) {
                          const fallback = document.createElement('a')
                          fallback.href = media.permalink || '#'
                          fallback.target = '_blank'
                          fallback.rel = 'noopener noreferrer'
                          fallback.className = 'ig-fallback'
                          fallback.style.cssText = [
                            'display:flex', 'flex-direction:column', 'align-items:center',
                            'justify-content:center', 'width:100%', 'height:100%',
                            'background:linear-gradient(135deg,#1a1a2e,#16213e)',
                            'color:#a0aec0', 'font-size:11px', 'font-weight:600',
                            'gap:8px', 'text-decoration:none', 'cursor:pointer',
                            'transition:background 0.2s'
                          ].join(';')
                          fallback.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                            <span style="color:#6366f1">Voir sur Instagram</span>
                            <span style="font-size:9px;color:#64748b;max-width:120px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">@${media.competitor_username}</span>
                          `
                          parent.appendChild(fallback)
                        }
                      }}
                    />

                    {/* Media Type Badge */}
                    <span className="media-type-chip">
                      {media.media_type}
                    </span>

                    {/* Performance Label overlay */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        background: scoreBg,
                        color: scoreColor,
                        border: `1px solid ${scoreBorder}`,
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase'
                      }}
                    >
                      <span>{scoreText}</span>
                    </div>
                  </div>

                  {/* Caption & Performance Metrics */}
                  <div className="media-body">
                    <p
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: 54,
                      }}
                    >
                      {media.caption || 'Pas de description.'}
                    </p>

                    {/* AI Insight box per post */}
                    {media.ai_analysis && media.ai_analysis.business_decision ? (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(13, 148, 136, 0.03) 100%)',
                        border: '1px solid rgba(99, 102, 241, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: 'var(--shadow-sm)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '2px',
                          background: 'linear-gradient(90deg, var(--accent), var(--accent-secondary))'
                        }} />

                        {/* Header widgets */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 8 }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${isRecommend ? 'rgba(16, 185, 129, 0.2)' : 'rgba(220, 38, 38, 0.2)'}`
                          }}>
                            {badgeLabel}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)' }}>POTENTIEL :</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              {(() => {
                                const profile = media.ai_analysis.product_profile || {}
                                const potential = profile.commercial_potential || 'Moyen'
                                const ratings = {
                                  'Très élevé': 5,
                                  'Élevé': 4,
                                  'Moyen': 3,
                                  'Faible': 2,
                                  'Très faible': 1
                                }
                                const stars = ratings[potential] || 3
                                return Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    size={10}
                                    fill={i < stars ? 'var(--accent)' : 'none'}
                                    color={i < stars ? 'var(--accent)' : 'var(--text-muted)'}
                                  />
                                ))
                              })()}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CONFIANCE:</span>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: 'var(--text-primary)',
                              background: 'rgba(0,0,0,0.03)',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {media.ai_analysis.confidence_score || 80}%
                            </span>
                          </div>
                        </div>

                        {/* Business reasons block */}
                        {media.ai_analysis.decision_reasons && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, background: 'rgba(0,0,0,0.02)', padding: '8px', borderRadius: '4px' }}>
                            {media.ai_analysis.decision_reasons.map((r, i) => (
                              <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'start' }}>
                                <span style={{ color: badgeColor }}>•</span>
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Pourquoi tester checklist */}
                        {media.ai_analysis.pourquoi_tester && media.ai_analysis.pourquoi_tester.length > 0 && (
                          <div style={{ background: 'var(--success-bg)', padding: '10px', borderRadius: '4px', borderLeft: '3px solid var(--success)', fontSize: '11px' }}>
                            <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '9px', textTransform: 'uppercase', marginBottom: 4 }}>
                              ✓ Pourquoi ce produit mérite d'être testé
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {media.ai_analysis.pourquoi_tester.map((pt, i) => (
                                <div key={i} style={{ display: 'flex', gap: 4 }}>
                                  <span style={{ color: 'var(--success)' }}>✓</span>
                                  <span>{pt}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Executive Summary */}
                        <div>
                          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 2 }}>Executive Summary</div>
                          <p style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: 1.5, margin: 0 }}>
                            "{media.ai_analysis.executive_summary || media.ai_analysis.summary}"
                          </p>
                        </div>

                        {/* 2x2 Tactical Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 4 }}>
                          {/* Pourquoi maintenant */}
                          {media.ai_analysis.pourquoi_maintenant && media.ai_analysis.pourquoi_maintenant.length > 0 && (
                            <div style={{ background: 'rgba(255,255,255,0.3)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>Pourquoi maintenant ?</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '10px', color: 'var(--text-secondary)' }}>
                                {media.ai_analysis.pourquoi_maintenant.map((pm, i) => (
                                  <div key={i}>• {pm}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Opportunités d'amélioration */}
                          {media.ai_analysis.opportunites_amelioration && media.ai_analysis.opportunites_amelioration.length > 0 && (
                            <div style={{ background: 'rgba(255,255,255,0.3)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: '#059669', marginBottom: 4 }}>Opportunités d'Amélioration</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '10px', color: 'var(--text-secondary)' }}>
                                {media.ai_analysis.opportunites_amelioration.map((oa, i) => (
                                  <div key={i}>• {oa}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Accordion details trigger */}
                        <div>
                          <button
                            onClick={() => setExpandedAIReports(prev => ({ ...prev, [media.id]: !prev[media.id] }))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent)',
                              fontSize: '10px',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.3px'
                            }}
                          >
                            {expandedAIReports[media.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            {expandedAIReports[media.id] ? "Masquer les détails" : "Rapport d'Intelligence IA"}
                          </button>

                          {expandedAIReports[media.id] && (
                            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, borderTop: '1px solid rgba(99, 102, 241, 0.1)', paddingTop: 10 }}>

                              {/* Product Profile info */}
                              {media.ai_analysis.product_profile && (
                                <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Fiche Produit</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '10.5px' }}>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Potentiel : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.product_profile.commercial_potential}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Segment : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.product_profile.market_segment}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Difficulté : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.product_profile.manufacturing_difficulty}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Risque Prod : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.product_profile.production_risk}</span>
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                      <span style={{ color: 'var(--text-muted)' }}>Prix Conseillé : </span>
                                      <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{recommendedPrice}</span>
                                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>(Gamme : {suggestedPriceRange})</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Avantage concurrentiel */}
                              {media.ai_analysis.avantage_concurrentiel && media.ai_analysis.avantage_concurrentiel.length > 0 && (
                                <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 6 }}>Avantage Concurrentiel</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '10px', color: 'var(--text-secondary)' }}>
                                    {media.ai_analysis.avantage_concurrentiel.map((ac, idx) => (
                                      <div key={idx}>• {ac}</div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Vision Intelligence */}
                              {media.ai_analysis.vision_intelligence && (
                                <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Vision Intelligence</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                                    <div>• <b>Palette :</b> {media.ai_analysis.vision_intelligence.color_palette?.join(', ')}</div>
                                    <div>• <b>Cadrage :</b> {media.ai_analysis.vision_intelligence.product_visibility}</div>
                                    <div>• <b>Arrière-plan :</b> {media.ai_analysis.vision_intelligence.background_quality}</div>
                                    <div>• <b>Matière :</b> {media.ai_analysis.vision_intelligence.fabric_visibility}</div>
                                    <div>• <b>Lumière :</b> {media.ai_analysis.vision_intelligence.lighting_quality}</div>
                                  </div>
                                </div>
                              )}

                              {/* Manufacturing Intelligence */}
                              {media.ai_analysis.manufacturing_intelligence && (
                                <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Manufacturing Intelligence</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '10.5px' }}>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Temps Production : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.manufacturing_intelligence.estimated_production_time}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Matières : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.manufacturing_intelligence.required_fabrics?.join(', ')}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Complexité patron : </span>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{media.ai_analysis.manufacturing_intelligence.pattern_complexity}</span>
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Prod en masse : </span>
                                      <span style={{ fontWeight: 800, color: 'var(--success)' }}>{media.ai_analysis.manufacturing_intelligence.suitable_for_mass_production}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px 14px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.5
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>
                            <Sparkles size={9} /> Analyse Statistique (Locale)
                          </div>
                          <div style={{ marginBottom: 8 }}>{aiExplanation}</div>
                          <div style={{
                            borderTop: '1px solid var(--border)',
                            paddingTop: 6,
                            marginTop: 6,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: '10px'
                          }}>
                            <span style={{ color: 'var(--accent)' }}>Recommandation :</span> {aiRecommendation}
                          </div>

                          <button
                            onClick={() => setExpandedTechnical(prev => ({ ...prev, [media.id]: !prev[media.id] }))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              fontSize: '9px',
                              cursor: 'pointer',
                              marginTop: 8,
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontWeight: 500
                            }}
                          >
                            {isTechnicalExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            Détails techniques
                          </button>

                          {isTechnicalExpanded && (
                            <div style={{
                              marginTop: 8,
                              padding: '8px',
                              background: 'rgba(0,0,0,0.02)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '9px',
                              color: 'var(--text-muted)'
                            }}>
                              {aiTechnical.map((detail, idx) => (
                                <div key={idx} style={{ marginBottom: idx < aiTechnical.length - 1 ? 4 : 0 }}>
                                  • {detail}
                                </div>
                              ))}
                              <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                                {aiConfidence}
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleAIAnalyze(media.id)}
                          disabled={analyzingIds[media.id]}
                          style={{
                            width: '100%',
                            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            padding: '8px 12px',
                            gap: 6,
                            borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-sm)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 200ms ease',
                            fontSize: '11px'
                          }}
                        >
                          {analyzingIds[media.id] ? (
                            <>
                              <RefreshCw size={12} className="spin" style={{ marginRight: 6 }} />
                              <span>Analyse Gemini...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} fill="#ffffff" style={{ marginRight: 6 }} />
                              <span>Analyser avec l'IA</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Metrics Row */}
                    <div className="flex justify-between items-center" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Heart size={11} style={{ opacity: 0.6 }} />
                          {media.like_count >= 1000 ? (media.like_count / 1000).toFixed(1) + 'k' : media.like_count}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <MessageSquare size={11} style={{ opacity: 0.6 }} />
                          {media.comments_count}
                        </span>
                        <span style={{ color: 'var(--accent)' }}>{media.engagement_score}% eng</span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex" style={{ gap: '12px' }}>
                        <a
                          href={media.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '6px 10px', minWidth: 'auto', borderRadius: 'var(--radius-md)' }}
                          title="Ouvrir sur Instagram"
                        >
                          <ExternalLink size={11} />
                        </a>

                        {isImported ? (
                          <span
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '6px 12px',
                              background: 'var(--success-dim)',
                              color: 'var(--success)',
                              borderColor: 'rgba(16, 185, 129, 0.2)',
                              gap: 4,
                              fontWeight: 700,
                              cursor: 'default',
                              borderRadius: 'var(--radius-md)'
                            }}
                          >
                            <Check size={11} />
                            Importé
                          </span>
                        ) : (
                          <button
                            onClick={() => handleImportCandidate(media.id)}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '6px 12px', gap: 4, fontSize: 11, borderRadius: 'var(--radius-md)' }}
                          >
                            <Sparkles size={10} />
                            Importer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
