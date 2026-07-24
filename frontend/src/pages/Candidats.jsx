import { useState, useEffect } from 'react'
import { Star, ExternalLink, ShoppingBag, Check, ChevronDown, ChevronUp, Target, Lightbulb, AlertCircle, Play, Bookmark, BarChart3, Clock, Scissors, Package, TrendingUp, Award, Zap, RefreshCw, Filter, Sparkles, Trash2 } from 'lucide-react'
import Topbar from '../components/Topbar'
import { getCandidates, promoteCompetitorMedia, removeCompetitorMediaFromCandidates, analyzeCandidateWithAI } from '../services/api'

export default function Candidats() {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCards, setExpandedCards] = useState({})
  const [filterStatus, setFilterStatus] = useState('all')
  const [analyzingIds, setAnalyzingIds] = useState({})

  useEffect(() => {
    getCandidates().then(res => {
      const arr = (res.results || res).sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))
      setCandidates(arr)
      setLoading(false)

      // Auto-analyze manual imports that lack AI decision mapping
      arr.forEach(c => {
        if (!c.ai_analysis || !c.ai_analysis.business_decision) {
          handleAIAnalyze(c.id)
        }
      })
    }).catch(err => {
      console.error('Error fetching candidates:', err)
      setLoading(false)
    })
  }, [])

  const toggleCard = (id) => {
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const handleRemoveCandidate = (id) => {
    removeCompetitorMediaFromCandidates(id).then(() => {
      setCandidates(prev => prev.filter(c => c.id !== id))
    })
  }

  // Handle AI analysis manually triggered (also called automatically on load for non-analyzed candidates)
  const handleAIAnalyze = async (mediaId) => {
    setAnalyzingIds(prev => ({ ...prev, [mediaId]: true }))
    try {
      const res = await analyzeCandidateWithAI(mediaId)
      if (res.success && res.analysis) {
        setCandidates(prev => prev.map(c => c.id === mediaId ? {
          ...c,
          ai_analysis: res.analysis,
          ai_score: res.analysis.ai_score
        } : c))
      }
    } catch (e) {
      console.error('Background AI analyze failed:', e)
    } finally {
      setAnalyzingIds(prev => ({ ...prev, [mediaId]: false }))
    }
  }

  // Strip legacy "ARAM" brand references from cached AI analysis data
  const sanitize = (text) => {
    if (!text) return text
    if (Array.isArray(text)) return text.map(sanitize)
    return String(text)
      .replace(/ARAM\s*\/\s*OREAS/gi, 'OREAS')
      .replace(/\bARAM\b/gi, 'OREAS')
  }

  // Extract product intelligence from AI analysis
  const getProductIntelligence = (candidate) => {
    const aiAnalysis = candidate.ai_analysis || {}
    const profile = aiAnalysis.product_profile || {}
    const vision = aiAnalysis.vision_intelligence || {}
    const mfg = aiAnalysis.manufacturing_intelligence || {}

    // Fallbacks for older data records
    const pourquoiTester = aiAnalysis.pourquoi_tester && aiAnalysis.pourquoi_tester.length > 0
      ? aiAnalysis.pourquoi_tester
      : (aiAnalysis.why_ai_recommends || [])

    const executiveSummary = aiAnalysis.executive_summary || aiAnalysis.summary || 'Aucun résumé exécutif disponible.'

    const pourquoiMaintenant = aiAnalysis.pourquoi_maintenant && aiAnalysis.pourquoi_maintenant.length > 0
      ? aiAnalysis.pourquoi_maintenant
      : [
        profile.trend ? `Tendance : ${profile.trend}` : "Tendance active sur le marché premium.",
        "Forte demande pour ce type de coupe et silhouette.",
        "Les couleurs neutres dominent les meilleures performances."
      ]

    const risques = aiAnalysis.risques && aiAnalysis.risques.length > 0
      ? aiAnalysis.risques
      : (aiAnalysis.weaknesses && aiAnalysis.weaknesses.length > 0
        ? aiAnalysis.weaknesses
        : ["Marché concurrentiel sur ce segment", "Nécessite une sélection de tissus de haute qualité"])

    const opportunitesAmelioration = aiAnalysis.opportunites_amelioration && aiAnalysis.opportunites_amelioration.length > 0
      ? aiAnalysis.opportunites_amelioration
      : (aiAnalysis.strengths && aiAnalysis.strengths.length > 0
        ? aiAnalysis.strengths.map(s => `Optimiser : ${s}`)
        : ["Utiliser des matières plus nobles (soie, viscose)", "Ajouter des finitions faites main"])

    const avantageConcurrentiel = aiAnalysis.avantage_concurrentiel && aiAnalysis.avantage_concurrentiel.length > 0
      ? aiAnalysis.avantage_concurrentiel
      : [
        "Savoir-faire tailleur supérieur de l'atelier OREAS.",
        "Tissus plus qualitatifs que le modèle concurrent.",
        "Storytelling de marque plus fort et shooting exclusif."
      ]

    // Detect category reference range for dynamic validation and fallback
    const pricingText = String(profile.trend || candidate.caption || '').toLowerCase()
    let minLimit = 300
    let maxLimit = 700
    if (pricingText.includes('set') || pricingText.includes('ensemble') || pricingText.includes('co-ord') || pricingText.includes('tailleur')) {
      minLimit = 350
      maxLimit = 600
    } else if (pricingText.includes('t-shirt') || pricingText.includes('top') || pricingText.includes('debardeur') || pricingText.includes('crop')) {
      minLimit = 150
      maxLimit = 300
    } else if (pricingText.includes('chemise') || pricingText.includes('blouse') || pricingText.includes('shirt')) {
      minLimit = 200
      maxLimit = 350
    } else if (pricingText.includes('pant') || pricingText.includes('jean') || pricingText.includes('legging') || pricingText.includes('jupe') || pricingText.includes('short')) {
      minLimit = 250
      maxLimit = 450
    } else if (pricingText.includes('veste') || pricingText.includes('jacket') || pricingText.includes('manteau') || pricingText.includes('blazer') || pricingText.includes('bomber')) {
      minLimit = 450
      maxLimit = 900
    } else if (pricingText.includes('robe') || pricingText.includes('dress') || pricingText.includes('caftan')) {
      minLimit = 300
      maxLimit = 700
    }

    let recommendedPrice = 'Non spécifié'
    let suggestedPriceRange = 'Non spécifié'
    if (profile.recommended_price) {
      let recVal = profile.recommended_price
      if (recVal > maxLimit) recVal = maxLimit - 1
      if (recVal < minLimit) recVal = minLimit + 49
      recVal = Math.floor(recVal / 10) * 10 + 9
      recommendedPrice = `${recVal} MAD`
      suggestedPriceRange = profile.suggested_price_range || `${Math.max(minLimit, recVal - 50)}–${Math.min(maxLimit, recVal + 50)} MAD`
    } else if (profile.estimated_price_range) {
      const match = String(profile.estimated_price_range).match(/(\d+)\s*-\s*(\d+)/)
      if (match) {
        const fileMin = parseInt(match[1])
        const fileMax = parseInt(match[2])
        let avgVal = Math.round((fileMin + fileMax) / 2)
        if (avgVal > maxLimit) avgVal = Math.round((minLimit + maxLimit) / 2)
        avgVal = Math.floor(avgVal / 10) * 10 + 9
        recommendedPrice = `${avgVal} MAD`

        const parsedMin = Math.max(minLimit, fileMin)
        const parsedMax = Math.min(maxLimit, fileMax)
        if (parsedMin >= parsedMax) {
          suggestedPriceRange = `${minLimit}–${maxLimit} MAD`
        } else {
          suggestedPriceRange = `${parsedMin}–${parsedMax} MAD`
        }
      } else {
        let defaultVal = Math.round((minLimit + maxLimit) / 2)
        defaultVal = Math.floor(defaultVal / 10) * 10 + 9
        recommendedPrice = `${defaultVal} MAD`
        suggestedPriceRange = `${minLimit}–${maxLimit} MAD`
      }
    } else {
      let defaultVal = Math.round((minLimit + maxLimit) / 2)
      defaultVal = Math.floor(defaultVal / 10) * 10 + 9
      recommendedPrice = `${defaultVal} MAD`
      suggestedPriceRange = `${minLimit}–${maxLimit} MAD`
    }

    return {
      aiScore: candidate.ai_score || 50,
      businessDecision: aiAnalysis.business_decision || 'RECOMMEND',
      decisionReasons: sanitize(aiAnalysis.decision_reasons || []),
      confidenceScore: aiAnalysis.confidence_score || 80,
      commercialPotential: sanitize(profile.commercial_potential || 'Moyen'),
      marketSegment: sanitize(profile.market_segment || 'Premium'),
      trend: sanitize(profile.trend || 'Inconnue'),
      targetAudience: sanitize(profile.target_audience || 'Général'),
      manufacturingDifficulty: sanitize(profile.manufacturing_difficulty || 'Moyen'),
      productionRisk: sanitize(profile.production_risk || 'Moyen'),
      recommendedPrice: sanitize(recommendedPrice),
      suggestedPriceRange: sanitize(suggestedPriceRange),
      recommendation: sanitize(profile.recommendation || 'Revue manuelle'),
      pourquoiTester: sanitize(pourquoiTester),
      pourquoiMaintenant: sanitize(pourquoiMaintenant),
      risques: sanitize(risques),
      opportunitesAmelioration: sanitize(opportunitesAmelioration),
      avantageConcurrentiel: sanitize(avantageConcurrentiel),
      executiveSummary: sanitize(executiveSummary),
      strengths: sanitize(aiAnalysis.strengths || []),
      weaknesses: sanitize(aiAnalysis.weaknesses || []),
      vision,
      mfg
    }
  }

  const getRecommendationBadge = (decision) => {
    const badges = {
      'recommend': { label: 'Recommandé', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', border: '#3B82F6' },
      'reject': { label: 'Rejeté', bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '#EF4444' }
    }
    const key = String(decision || '').toLowerCase()
    return badges[key] || badges['recommend']
  }

  const getStarRating = (potential) => {
    const ratings = {
      'Très élevé': 5,
      'Élevé': 4,
      'Moyen': 3,
      'Faible': 2,
      'Très faible': 1
    }
    return ratings[potential] || 3
  }

  return (
    <>
      <Topbar title="Validation & Sélection Produits" subtitle="Assistant d'Achat IA pour l'atelier de création OREAS" />

      <div className="page-body">

        {/* Header Summary */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="flex justify-between items-center" style={{ width: '100%' }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>
                <Award size={14} /> Top 4 Opportunités de Création
              </div>
              <p style={{ fontSize: '12.5px', color: '#6F6F6F' }}>
                Les 4 meilleurs concepts produits recommandés par l'IA pour les tests d'achat, classés par Score OREAS décroissant
              </p>
            </div>
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              color: '#3B82F6',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: 700,
              border: '1px solid rgba(198, 164, 106, 0.2)'
            }}>
              Sélection Active : Top 4 Produits
            </div>
          </div>
        </div>

        {/* Info Banner Section */}
        <div className="page-header" style={{ marginBottom: 8, marginTop: 8 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>
              <Zap size={14} /> Fiches Techniques & Prix Conseillés
            </div>
            <p style={{ color: '#6F6F6F' }}>Analyse tarifaire marocaine et faisabilité de fabrication de l'atelier</p>
          </div>
        </div>

        {/* Product Cards */}
        {loading ? (
          <div className="text-center" style={{ padding: '60px 0', color: '#9A9A9A' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: 12 }} />
            <div>Chargement des fiches produits...</div>
          </div>
        ) : candidates.length === 0 ? (
          <div className="card text-center" style={{ padding: '80px 20px', borderStyle: 'dashed' }}>
            <Award size={32} color="#9A9A9A" style={{ marginBottom: 12, opacity: 0.5 }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111111', marginBottom: 6 }}>Aucun produit dans le Runway</h3>
            <p style={{ fontSize: 13, color: '#6F6F6F', maxWidth: 400, margin: '0 auto' }}>
              Importez des posts depuis l'onglet Veille Concurrentielle pour générer leurs rapports commerciaux.
            </p>
          </div>
        ) : (
          <div className="candidates-grid">
            {candidates
              .slice(0, 4)
              .map((candidate, index) => {
                const isAnalyzed = candidate.ai_analysis && candidate.ai_analysis.business_decision
                const intelligence = getProductIntelligence(candidate)
                const badge = getRecommendationBadge(intelligence.businessDecision)
                const stars = getStarRating(intelligence.commercialPotential)
                const isExpanded = expandedCards[candidate.id]

                if (!isAnalyzed) {
                  return (
                    <div
                      key={candidate.id}
                      className="card text-center"
                      style={{
                        padding: '40px 20px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255, 255, 255, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12
                      }}
                    >
                      <RefreshCw size={20} className="spin" color="#3B82F6" />
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#111111' }}>Analyse IA en cours...</div>
                      <div style={{ fontSize: '11px', color: '#6F6F6F' }}>L'assistant de collection OREAS rédige la fiche technique...</div>
                    </div>
                  )
                }

                return (
                  <div
                    key={candidate.id}
                    className="card"
                    style={{
                      padding: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Card Header - Image & Key Info */}
                    <div style={{
                      padding: '20px',
                      borderBottom: '1px solid var(--border-color)',
                      background: 'var(--bg-card)',
                      display: 'flex',
                      gap: 16
                    }}>
                      <img
                        src={candidate.thumbnail_url || candidate.media_url}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="%231e293b"/><path d="M32 15c-4 0-8 4-8 8s4 8 8 8 8-4 8-8-4-8-8-8zm0 18c-7 0-20 3-20 10v4h40v-4c0-7-13-10-20-10z" fill="%2364748b"/></svg>`
                        }}
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 'var(--radius-md)',
                          objectFit: 'cover',
                          border: '1px solid var(--border-color)',
                          flexShrink: 0
                        }}
                      />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginBottom: 4 }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: badge.bg,
                              color: badge.color,
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              border: `1px solid ${badge.border}`
                            }}>
                              {badge.label}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#9A9A9A' }}>POTENTIEL :</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star
                                    key={i}
                                    size={11}
                                    fill={i < stars ? '#3B82F6' : 'none'}
                                    color={i < stars ? '#3B82F6' : '#9CA3AF'}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: '#9A9A9A', fontWeight: 500 }}>
                            @{candidate.competitor_username}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                          <div>
                            <div className="kpi-value" style={{ color: '#3B82F6', fontSize: 24, fontWeight: 900, lineHeight: 1 }}>
                              {intelligence.aiScore}
                            </div>
                            <div style={{ fontSize: 9, color: '#9A9A9A', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                              SCORE OREAS
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#111111', lineHeight: 1 }}>
                              {intelligence.confidenceScore}%
                            </div>
                            <div style={{ fontSize: 9, color: '#9A9A9A', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>
                              Confiance IA
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#111111', lineHeight: 1 }}>
                              {intelligence.recommendedPrice}
                            </div>
                            <div style={{ fontSize: 9, color: '#9A9A9A', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>
                              Prix Conseillé
                            </div>
                            <div style={{ fontSize: 9.5, color: '#6F6F6F', marginTop: 2, whiteSpace: 'nowrap' }}>
                              Gamme : {intelligence.suggestedPriceRange}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pourquoi ce produit mérite d'être testé */}
                    {intelligence.pourquoiTester && intelligence.pourquoiTester.length > 0 && (
                      <div style={{
                        padding: '14px 20px',
                        background: 'rgba(244, 252, 248, 0.7)',
                        borderLeft: '4px solid #059669',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '11.5px',
                        color: '#6F6F6F'
                      }}>
                        <div style={{ fontWeight: 800, textTransform: 'uppercase', color: '#059669', fontSize: '9.5px', marginBottom: 6, letterSpacing: '0.5px' }}>
                          ✓ Pourquoi ce produit mérite d'être testé
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                          {intelligence.pourquoiTester.map((r, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'start' }}>
                              <Check size={12} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Executive Summary */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.4)' }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4, letterSpacing: '0.5px' }}>
                        Executive Summary
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: 1.5, fontWeight: 500 }}>
                        "{intelligence.executiveSummary}"
                      </div>
                    </div>

                    {/* Product Profile Grid */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                            Segment
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {intelligence.marketSegment}
                          </div>
                        </div>
                        <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                            Difficulté Fab.
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {intelligence.manufacturingDifficulty}
                          </div>
                        </div>
                        <div style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                            Risque Prod.
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: intelligence.productionRisk === 'Faible' ? 'var(--success)' : 'var(--warning)' }}>
                            {intelligence.productionRisk}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CEO Tactical Widgets Grid */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {/* Pourquoi maintenant */}
                      <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6, letterSpacing: '0.5px' }}>
                          Pourquoi maintenant ?
                        </div>
                        <ul style={{ listStyleType: 'none', margin: 0, paddingLeft: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {intelligence.pourquoiMaintenant.map((item, i) => (
                            <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'start', gap: 4 }}>
                              <span style={{ color: 'var(--accent)' }}>•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Risques */}
                      <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 6, letterSpacing: '0.5px' }}>
                          Risques Associés
                        </div>
                        <ul style={{ listStyleType: 'none', margin: 0, paddingLeft: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {intelligence.risques.map((item, i) => (
                            <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'start', gap: 4 }}>
                              <span style={{ color: 'var(--danger)' }}>•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Opportunités d'amélioration */}
                      <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#059669', marginBottom: 6, letterSpacing: '0.5px' }}>
                          Opportunités d'Amélioration
                        </div>
                        <ul style={{ listStyleType: 'none', margin: 0, paddingLeft: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {intelligence.opportunitesAmelioration.map((item, i) => (
                            <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'start', gap: 4 }}>
                              <span style={{ color: '#059669' }}>•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Avantage concurrentiel */}
                      <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', color: '#7c3aed', marginBottom: 6, letterSpacing: '0.5px' }}>
                          Avantage Concurrentiel
                        </div>
                        <ul style={{ listStyleType: 'none', margin: 0, paddingLeft: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {intelligence.avantageConcurrentiel.map((item, i) => (
                            <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'start', gap: 4 }}>
                              <span style={{ color: '#7c3aed' }}>•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    <div>
                      <button
                        onClick={() => toggleCard(candidate.id)}
                        style={{
                          width: '100%',
                          padding: '10px 20px',
                          background: 'none',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? 'Masquer les rapports techniques' : 'Afficher les rapports Vision & Fabrication'}
                      </button>

                      {isExpanded && (
                        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 20 }}>

                          {/* Vision Intelligence */}
                          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12, letterSpacing: '0.5px' }}>
                              <Lightbulb size={14} />
                              Vision Intelligence
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                              {intelligence.vision.color_palette?.map((col, i) => (
                                <span key={i} style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', fontSize: '10px', color: 'var(--accent)', fontWeight: 600, border: '1px solid var(--accent)' }}>
                                  {col}
                                </span>
                              ))}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Cadrage :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.vision.product_visibility}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Arrière-plan :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.vision.background_quality}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Impact :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.vision.first_frame_impact}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Texture :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.vision.fabric_visibility}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Lumière :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.vision.lighting_quality}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Distractions :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.vision.visual_distractions}</span>
                              </div>
                            </div>
                          </div>

                          {/* Manufacturing Intelligence */}
                          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12, letterSpacing: '0.5px' }}>
                              <Scissors size={14} />
                              Manufacturing Intelligence
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Temps prod :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.mfg.estimated_production_time}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Complexité :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.mfg.pattern_complexity}</span>
                              </div>
                              <div style={{ gridColumn: 'span 2', display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Matières :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.mfg.required_fabrics?.join(', ')}</span>
                              </div>
                              <div style={{ gridColumn: 'span 2', display: 'flex', gap: 6 }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Accessoires :</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{intelligence.mfg.required_accessories?.join(', ')}</span>
                              </div>
                              <div style={{ gridColumn: 'span 2', display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Production masse :</span>
                                <span style={{
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  color: '#fff',
                                  background: intelligence.mfg.suitable_for_mass_production === 'OUI' ? 'var(--success)' : 'var(--danger)'
                                }}>
                                  {intelligence.mfg.suitable_for_mass_production}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* OREAS Score Breakdown */}
                          {candidate.ai_score_details && (
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 12, letterSpacing: '0.5px' }}>
                                <BarChart3 size={14} />
                                Métriques d'Engagement Détaillées
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {Object.entries(candidate.ai_score_details).map(([key, val]) => {
                                  if (typeof val !== 'number') return null
                                  const displayVal = Math.round(val)
                                  return (
                                    <div key={key}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                                        <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 500 }}>{key.replace('_', ' ')}</span>
                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{displayVal} pts</span>
                                      </div>
                                      <div style={{ height: 6, background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${(val / 30) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: '3px' }} />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Original caption */}
                          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 8, letterSpacing: '0.5px' }}>
                              Description originale
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                              {candidate.caption || 'Pas de description.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Panel */}
                    <div style={{ padding: '12px 20px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => window.open(candidate.permalink, '_blank')}
                        className="btn btn-secondary btn-sm"
                        style={{
                          flex: 1,
                          minWidth: '100px',
                          gap: 6,
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <ExternalLink size={12} />
                        Voir Original
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{
                          flex: 1,
                          minWidth: '100px',
                          gap: 6,
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <ShoppingBag size={12} />
                        Shopify Sync
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{
                          flex: 1,
                          minWidth: '100px',
                          gap: 6,
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--success)',
                          border: 'none',
                          color: '#fff'
                        }}
                      >
                        <Play size={12} />
                        Tester Pubs Meta
                      </button>
                      <button
                        onClick={() => handleRemoveCandidate(candidate.id)}
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '8px 12px',
                          gap: 6,
                          borderRadius: 'var(--radius-md)',
                          borderColor: 'var(--danger)',
                          color: 'var(--danger)'
                        }}
                        title="Retirer le candidat"
                      >
                        <Trash2 size={12} />
                      </button>
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
