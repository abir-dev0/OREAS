import { useState, useEffect } from 'react'
import { Star, Heart, MessageSquare, ExternalLink, ShoppingBag, Sparkles, Check, ChevronDown, ChevronUp, TrendingUp, Target, Lightbulb, AlertCircle, Plus, X, Brain, Zap } from 'lucide-react'
import Topbar from '../components/Topbar'
import { getCandidates, promoteCompetitorMedia, removeCompetitorMediaFromCandidates } from '../services/api'

export default function Candidats() {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [shopifyStatus, setShopifyStatus] = useState({})
  const [expandedCards, setExpandedCards] = useState({})

  useEffect(() => {
    getCandidates().then(res => {
      const arr = (res.results || res).sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))
      setCandidates(arr)
      setLoading(false)
    }).catch(err => {
      console.error('Error fetching candidates:', err)
      setLoading(false)
    })
  }, [])

  const triggerShopifySync = (id) => {
    setShopifyStatus(prev => ({ ...prev, [id]: true }))
  }

  const toggleCard = (id) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // Generate strategic analysis for each candidate using actual AI score breakdown
  const generateStrategicAnalysis = (candidate, index, totalCandidates) => {
    const score = candidate.ai_score || 0
    const breakdown = candidate.ai_score_details || {}
    const likes = candidate.like_count || 0
    const comments = candidate.comments_count || 0
    const mediaType = candidate.media_type
    const selectionSource = candidate.selection_source || 'ai'
    
    // Extract actual scoring factors
    const engagementRelative = breakdown.engagement_relative || 0
    const engagementNormalized = breakdown.engagement_normalized || 0
    const mediaTypeScore = breakdown.media_type_performance || 0
    const captionScore = breakdown.caption_quality || 0
    const freshnessScore = breakdown.freshness || 0
    const historicalScore = breakdown.historical_performance || 0
    
    // Business impact assessment based on actual score
    let businessImpact = 'moderate'
    let impactLabel = 'Impact modéré'
    if (score >= 75) {
      businessImpact = 'high'
      impactLabel = 'Impact élevé'
    } else if (score >= 55) {
      businessImpact = 'medium'
      impactLabel = 'Impact moyen'
    }
    
    // Reproducibility based on actual media type score
    const reproducibility = Math.round(mediaTypeScore * 6)  // Scale 0-15 to 0-90
    let reproducibilityLabel = 'Facilement reproductible'
    if (reproducibility >= 80) {
      reproducibilityLabel = 'Très facile à reproduire'
    } else if (reproducibility >= 60) {
      reproducibilityLabel = 'Reproductible avec effort'
    } else if (reproducibility >= 40) {
      reproducibilityLabel = 'Difficile à reproduire'
    } else {
      reproducibilityLabel = 'Très difficile à reproduire'
    }
    
    // Confidence based on actual engagement relative score
    const confidence = engagementRelative >= 25 ? 'Élevée' : engagementRelative >= 15 ? 'Moyenne' : 'Faible'
    
    // Generate explanation based on actual scoring factors
    const reasons = []
    
    if (engagementRelative >= 25) {
      reasons.push(`Performance exceptionnelle (${Math.round(engagementRelative)}/30) par rapport à la moyenne du concurrent`)
    } else if (engagementRelative >= 18) {
      reasons.push(`Performance supérieure à la moyenne historique du concurrent`)
    }
    
    if (engagementNormalized >= 20) {
      reasons.push(`Taux d'engagement très élevé (${Math.round(engagementNormalized)}/25) pour cette taille d'audience`)
    } else if (engagementNormalized >= 15) {
      reasons.push(`Bon taux d'engagement normalisé par le nombre d'abonnés`)
    }
    
    if (captionScore >= 10) {
      reasons.push(`Caption de haute qualité avec intention commerciale forte`)
    } else if (captionScore >= 7) {
      reasons.push(`Caption bien structurée avec éléments commerciaux`)
    }
    
    if (freshnessScore >= 8) {
      reasons.push(`Contenu très récent (moins de 3 jours)`)
    } else if (freshnessScore >= 6) {
      reasons.push(`Contenu récent (moins d'une semaine)`)
    }
    
    if (historicalScore >= 4) {
      reasons.push(`Se classe dans le top 25% des performances du concurrent`)
    }
    
    // Why selected - based on actual factors
    const whySelected = reasons.length > 0
      ? `Ce candidat se classe n°${index + 1} avec un score de ${score.toFixed(1)}/100. ${reasons.slice(0, 2).join('. ')}.`
      : `Ce candidat présente un score de ${score.toFixed(1)}/100, le plaçant dans le top ${Math.round((index + 1) / totalCandidates * 100)}% des contenus analysés.`
    
    // Why it worked - based on actual engagement metrics
    const engagementRate = likes > 0 ? ((comments / likes) * 100).toFixed(1) : 0
    const whyWorked = engagementRate > 5
      ? `Taux de commentaires exceptionnel (${engagementRate}%) indiquant un fort intérêt d'achat.`
      : likes > 5000
      ? `Volume élevé de likes (${likes.toLocaleString()}) démontrant une forte résonance visuelle.`
      : `Performance équilibrée avec engagement solide pour ce type de contenu.`
    
    // Can we reproduce it - based on actual media type
    const canReproduce = mediaTypeScore >= 13
      ? `Oui. Le format ${mediaType === 'IMAGE' ? 'image statique' : mediaType === 'CAROUSEL_ALBUM' ? 'carrousel' : 'vidéo'} est facilement adaptable avec vos ressources actuelles.`
      : mediaTypeScore >= 11
      ? `Oui, avec un investissement modéré. Ce format nécessite plus de ressources mais reste réalisable.`
      : `Difficile. Ce format exige des ressources spécialisées qui peuvent ne pas être disponibles actuellement.`
    
    // What to do next - based on actual score
    const whatNext = score >= 75
      ? `Priorisez ce candidat pour votre prochaine campagne. Testez des variations similaires pour confirmer le pattern.`
      : score >= 55
      ? `Intégrez ce candidat dans votre pipeline de production. Surveillez les performances des variations.`
      : `Utilisez ce candidat comme référence secondaire. Concentrez-vous d'abord sur les scores plus élevés.`
    
    return {
      businessImpact,
      impactLabel,
      reproducibility,
      reproducibilityLabel,
      confidence,
      selectionSource,
      whySelected,
      whyWorked,
      canReproduce,
      whatNext,
      breakdown  // Include breakdown for transparency
    }
  }

  const handleRemoveCandidate = (id) => {
    removeCompetitorMediaFromCandidates(id).then(() => {
      setCandidates(prev => prev.filter(c => c.id !== id))
    })
  }

  // Generate product profile from AI analysis
  const generateProductProfile = (candidate) => {
    const aiAnalysis = candidate.ai_analysis || {}
    const productProfile = aiAnalysis.product_profile || {}
    const oreasScore = aiAnalysis.oreas_score || {}
    const visionIntelligence = aiAnalysis.vision_intelligence || {}
    const manufacturingIntelligence = aiAnalysis.manufacturing_intelligence || {}
    
    // Star rating based on commercial potential
    const getStarRating = (potential) => {
      const ratings = {
        'Very High': 5,
        'High': 4,
        'Medium': 3,
        'Low': 2,
        'Very Low': 1
      }
      return ratings[potential] || 3
    }
    
    const stars = getStarRating(productProfile.commercial_potential)
    
    return {
      stars,
      commercialPotential: productProfile.commercial_potential || 'Medium',
      marketSegment: productProfile.market_segment || 'Premium',
      trend: productProfile.trend || 'Unknown',
      targetAudience: productProfile.target_audience || 'General',
      manufacturingDifficulty: productProfile.manufacturing_difficulty || 'Medium',
      productionRisk: productProfile.production_risk || 'Medium',
      estimatedPrice: productProfile.estimated_price_range || '200-400 MAD',
      recommendedAction: productProfile.recommended_action || 'Review manually',
      businessDecision: aiAnalysis.business_decision || 'RECOMMEND',
      decisionReasons: aiAnalysis.decision_reasons || [],
      visionIntelligence,
      manufacturingIntelligence,
      whyAiRecommends: aiAnalysis.why_ai_recommends || [],
      oreasScore
    }
  }

  return (
    <>
      <Topbar title="Candidats IA" subtitle="Décisions stratégiques basées sur l'analyse d'intention d'achat" />
      
      <div className="page-body">
        
        {/* AI Consultant Summary */}
        <div className="card" style={{ 
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)',
          border: 'none',
          padding: '28px 32px',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <Brain size={24} color="#fff" style={{ flexShrink: 0 }} />
            <div style={{ color: '#fff' }}>
              <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                Produits Validés par l'IA
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.95 }}>
                {candidates.length > 0 
                  ? `${candidates.length} produits analysés et validés par l'IA pour leur potentiel commercial.`
                  : "Aucun candidat détecté. Synchronisez votre compte Instagram pour commencer l'analyse."
                }
              </div>
            </div>
          </div>
        </div>

        {/* Decision Cards */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 20 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: 400, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="card empty-state" style={{ padding: 48 }}>
            <Star className="empty-state-icon" />
            <h3>Aucun candidat détecté</h3>
            <p>Synchronisez votre compte Instagram pour identifier les produits à fort potentiel.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 24 }}>
            {candidates.map((candidate, index) => {
              const profile = generateProductProfile(candidate)
              const isExpanded = expandedCards[candidate.id]
              const isSynced = shopifyStatus[candidate.id]
              
              return (
                <div 
                  key={candidate.id}
                  className="card"
                  style={{ 
                    padding: 0, 
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    border: profile.businessDecision === 'RECOMMEND' ? '2px solid var(--success)' : '1px solid var(--border)'
                  }}
                >
                  {/* Card Header */}
                  <div style={{ 
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--border)',
                    background: profile.businessDecision === 'RECOMMEND' ? 'var(--success-light)' : 'transparent'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          width: 32, 
                          height: 32, 
                          borderRadius: '50%', 
                          background: profile.businessDecision === 'RECOMMEND' ? 'var(--success)' : 'var(--accent)', 
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13
                        }}>
                          {index + 1}
                        </div>
                        <span className="badge" style={{ 
                          background: profile.businessDecision === 'RECOMMEND' ? 'var(--success)' : 'var(--bg-surface)',
                          color: profile.businessDecision === 'RECOMMEND' ? '#fff' : 'var(--text-primary)'
                        }}>
                          {profile.businessDecision === 'RECOMMEND' ? '✓ Recommandé' : '✗ Rejeté'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star 
                            key={i} 
                            size={16} 
                            fill={i < profile.stars ? 'var(--accent)' : 'none'}
                            color={i < profile.stars ? 'var(--accent)' : 'var(--text-muted)'}
                          />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <img 
                        src={candidate.thumbnail_url || candidate.media_url} 
                        alt="" 
                        style={{ 
                          width: 80, 
                          height: 80, 
                          borderRadius: 'var(--radius-md)', 
                          objectFit: 'cover',
                          border: '1px solid var(--border)'
                        }} 
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: 13, 
                          fontWeight: 600, 
                          marginBottom: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {candidate.caption || 'Sans titre'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                          @{candidate.competitor_username}
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Heart size={10} />
                            {(candidate.like_count || 0).toLocaleString('fr-FR')}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <MessageSquare size={10} />
                            {candidate.comments_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Product Profile */}
                  <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        Marché
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {profile.marketSegment}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        Tendance
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {profile.trend}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        Audience
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {profile.targetAudience}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        Difficulté
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {profile.manufacturingDifficulty}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        Risque Production
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: profile.productionRisk === 'Low' ? 'var(--success)' : profile.productionRisk === 'Medium' ? 'var(--warning)' : 'var(--error)' }}>
                        {profile.productionRisk}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                        Prix Estimé
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {profile.estimatedPrice}
                      </div>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div style={{ 
                    padding: '16px 24px', 
                    background: profile.businessDecision === 'RECOMMEND' ? 'var(--success-light)' : 'var(--error-light)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Recommandation
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {profile.recommendedAction}
                    </div>
                  </div>

                  {/* Expandable Details */}
                  <div>
                    <button
                      onClick={() => toggleCard(candidate.id)}
                      style={{
                        width: '100%',
                        padding: '12px 24px',
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
                      {isExpanded ? 'Masquer les détails' : 'Voir les détails'}
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        {/* Why AI Recommends */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)', marginBottom: 8 }}>
                            <Check size={12} />
                            Pourquoi l'IA recommande ce produit
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                            {profile.whyAiRecommends.map((reason, i) => (
                              <li key={i} style={{ marginBottom: 4 }}>{reason}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Vision Intelligence */}
                        {profile.visionIntelligence && Object.keys(profile.visionIntelligence).length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
                              <Lightbulb size={12} />
                              Intelligence Visuelle
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              <div>• Palette: {profile.visionIntelligence.color_palette?.join(', ') || 'Non détecté'}</div>
                              <div>• Visibilité produit: {profile.visionIntelligence.product_visibility || 'N/A'}</div>
                              <div>• Qualité lumière: {profile.visionIntelligence.lighting_quality || 'N/A'}</div>
                              <div>• Impact première image: {profile.visionIntelligence.first_frame_impact || 'N/A'}</div>
                            </div>
                          </div>
                        )}

                        {/* Manufacturing Intelligence */}
                        {profile.manufacturingIntelligence && Object.keys(profile.manufacturingIntelligence).length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
                              <Target size={12} />
                              Intelligence Fabrication
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              <div>• Temps production: {profile.manufacturingIntelligence.estimated_production_time || 'N/A'}</div>
                              <div>• Tissus requis: {profile.manufacturingIntelligence.required_fabrics?.join(', ') || 'N/A'}</div>
                              <div>• Accessoires: {profile.manufacturingIntelligence.required_accessories?.join(', ') || 'Aucun'}</div>
                              <div>• Complexité patron: {profile.manufacturingIntelligence.pattern_complexity || 'N/A'}</div>
                              <div>• Production masse: {profile.manufacturingIntelligence.suitable_for_mass_production || 'N/A'}</div>
                            </div>
                          </div>
                        )}

                        {/* OREAS Score Breakdown */}
                        {profile.oreasScore && Object.keys(profile.oreasScore).length > 0 && (
                          <div style={{ 
                            padding: 12, 
                            background: 'var(--bg-surface)',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)'
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                              Score OREAS (Hybrid)
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              <div>• Engagement (30%): {profile.oreasScore.engagement_score || 0}/100</div>
                              <div>• Intention Achat (25%): {profile.oreasScore.purchase_intent_score || 0}/100</div>
                              <div>• Qualité Visuelle (20%): {profile.oreasScore.visual_quality_score || 0}/100</div>
                              <div>• Faisabilité Fabrication (15%): {profile.oreasScore.manufacturing_feasibility_score || 0}/100</div>
                              <div>• Alignement Tendance (10%): {profile.oreasScore.trend_alignment_score || 0}/100</div>
                              <div style={{ marginTop: 8, fontWeight: 600, color: 'var(--accent)' }}>
                                Total: {profile.oreasScore.total_score || 0}/100
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* AI Analysis Button */}
                  <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                    <button
                      onClick={() => handleAnalyzeWithAI(candidate.id)}
                      disabled={analyzingId === candidate.id}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: analyzingId === candidate.id ? 'var(--bg-surface)' : 'var(--accent)',
                        border: analyzingId === candidate.id ? '1px solid var(--border)' : 'none',
                        color: analyzingId === candidate.id ? 'var(--text-muted)' : '#fff',
                        borderRadius: 'var(--radius)',
                        cursor: analyzingId === candidate.id ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        transition: 'all 0.2s'
                      }}
                    >
                      {analyzingId === candidate.id ? (
                        <>
                          <Zap size={14} className="spin" />
                          Analyse en cours...
                        </>
                      ) : aiAnalysis[candidate.id] ? (
                        <>
                          <Brain size={14} />
                          Réanalyser avec IA
                        </>
                      ) : (
                        <>
                          <Brain size={14} />
                          Analyser avec IA
                        </>
                      )}
                    </button>
                  </div>

                  {/* AI Commercial Intelligence Panel */}
                  {aiAnalysis[candidate.id] && (
                    <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 16 }}>
                        <Brain size={14} />
                        Intelligence Commerciale IA
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Score IA
                          </div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
                            {aiAnalysis[candidate.id].ai_score}/100
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Potentiel Commercial
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: aiAnalysis[candidate.id].commercial_potential === 'Very High' || aiAnalysis[candidate.id].commercial_potential === 'High' ? 'var(--success)' : 'var(--text-primary)' }}>
                            {aiAnalysis[candidate.id].commercial_potential}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Difficulté Fabrication
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {aiAnalysis[candidate.id].manufacturing_difficulty}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Reproductibilité
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: aiAnalysis[candidate.id].reproducibility >= 70 ? 'var(--success)' : 'var(--text-primary)' }}>
                            {aiAnalysis[candidate.id].reproducibility}%
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Tendance
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {aiAnalysis[candidate.id].trend}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Cible
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {aiAnalysis[candidate.id].target_audience}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                            Intention Achat
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: aiAnalysis[candidate.id].purchase_intent === 'Very High' || aiAnalysis[candidate.id].purchase_intent === 'High' ? 'var(--success)' : 'var(--text-primary)' }}>
                            {aiAnalysis[candidate.id].purchase_intent}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Résumé
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                          {aiAnalysis[candidate.id].summary}
                        </div>
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>
                          Points Forts
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {aiAnalysis[candidate.id].strengths.map((strength, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>{strength}</li>
                          ))}
                        </ul>
                      </div>

                      {aiAnalysis[candidate.id].weaknesses && aiAnalysis[candidate.id].weaknesses.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--error)', marginBottom: 6 }}>
                            Points Faibles
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                            {aiAnalysis[candidate.id].weaknesses.map((weakness, i) => (
                              <li key={i} style={{ marginBottom: 4 }}>{weakness}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div style={{ 
                        padding: 12, 
                        background: aiAnalysis[candidate.id].recommendation === 'Test immediately' ? 'var(--success-light)' : aiAnalysis[candidate.id].recommendation === 'Watch competitor' ? 'var(--warning-light)' : 'var(--bg-surface)',
                        borderRadius: 'var(--radius)',
                        border: `1px solid ${aiAnalysis[candidate.id].recommendation === 'Test immediately' ? 'var(--success)' : aiAnalysis[candidate.id].recommendation === 'Watch competitor' ? 'var(--warning)' : 'var(--border)'}`
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Action Recommandée
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {aiAnalysis[candidate.id].recommended_action}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expandable Strategic Analysis */}
                  <div>
                    <button
                      onClick={() => toggleCard(candidate.id)}
                      style={{
                        width: '100%',
                        padding: '12px 24px',
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
                      {isExpanded ? 'Masquer l\'analyse' : 'Voir l\'analyse stratégique'}
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        {/* Why Selected */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
                            <Target size={12} />
                            Pourquoi sélectionné ?
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            {analysis.whySelected}
                          </div>
                        </div>

                        {/* Why Worked */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
                            <TrendingUp size={12} />
                            Pourquoi ça fonctionne ?
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            {analysis.whyWorked}
                          </div>
                        </div>

                        {/* Can Reproduce */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
                            <Lightbulb size={12} />
                            Peut-on le reproduire ?
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            {analysis.canReproduce}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                            Score de reproductibilité: {analysis.reproducibilityLabel}
                          </div>
                        </div>

                        {/* What Next */}
                        <div style={{ 
                          padding: 12, 
                          background: 'var(--accent-dim)', 
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(var(--accent-rgb), 0.2)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
                            <Sparkles size={12} />
                            Action recommandée
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)', fontWeight: 500 }}>
                            {analysis.whatNext}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
                    <a 
                      href={candidate.permalink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="btn btn-secondary btn-sm"
                      style={{ borderRadius: 'var(--radius-md)' }}
                    >
                      <ExternalLink size={11} />
                      Voir original
                    </a>
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      {isSynced ? (
                        <span className="btn btn-secondary btn-sm" style={{ 
                          background: 'var(--success-light)', 
                          color: 'var(--success)', 
                          borderColor: 'var(--success)',
                          gap: 4, 
                          fontWeight: 700, 
                          cursor: 'default',
                          borderRadius: 'var(--radius-md)' 
                        }}>
                          <Check size={11} /> Shopify synchronisé
                        </span>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => triggerShopifySync(candidate.id)}
                          disabled={!candidate.linked_product}
                          style={{
                            opacity: !candidate.linked_product ? 0.35 : 1,
                            cursor: !candidate.linked_product ? 'not-allowed' : 'pointer',
                            gap: 4,
                            borderRadius: 'var(--radius-md)'
                          }}
                        >
                          <ShoppingBag size={11} />
                          Synchroniser Shopify
                        </button>
                      )}
                      
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRemoveCandidate(candidate.id)}
                        style={{
                          gap: 4,
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--text-muted)'
                        }}
                        title="Retirer des candidats"
                      >
                        <X size={11} />
                      </button>
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
