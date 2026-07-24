import { useState, useEffect } from 'react'
import { Heart, MessageSquare, ExternalLink, Search, Filter, Sparkles } from 'lucide-react'
import Topbar from '../components/Topbar'
import { getMedia } from '../services/api'

const TYPES = ['Tous', 'REEL', 'IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']
const TYPE_LABELS = { 'Tous': 'Tous', 'REEL': 'Reel', 'IMAGE': 'Image', 'VIDEO': 'Vidéo', 'CAROUSEL_ALBUM': 'Carrousel' }

function MediaCard({ media }) {
  const a = media.analysis || {}

  // Indicateur d'intention d'achat IA
  let appetiteText = "Stable"
  let appetiteColor = "#6F6F6F"
  let appetiteBg = "var(--bg-secondary)"
  let appetiteBorder = "var(--border-color)"

  if (a.final_score >= 70) {
    appetiteText = "Campagne Élite"
    appetiteColor = "#ffffff"
    appetiteBg = "#3B82F6"
    appetiteBorder = "transparent"
  } else if (a.final_score >= 45) {
    appetiteText = "Intention Élevée"
    appetiteColor = "#3B82F6"
    appetiteBg = "rgba(59, 130, 246, 0.1)"
    appetiteBorder = "#3B82F6"
  } else if (a.final_score >= 20) {
    appetiteText = "Tendance"
    appetiteColor = "#111111"
    appetiteBg = "var(--bg-secondary)"
    appetiteBorder = "var(--border-color)"
  }

  return (
    <div className={`media-card fade-in${media.is_candidate ? ' candidate' : ''}`}>
      {media.is_candidate && (
        <div className="candidate-star" title="Candidat IA">★</div>
      )}
      <span className="media-type-chip">{TYPE_LABELS[media.media_type] || media.media_type}</span>

      <div className="media-thumb">
        <img
          src={media.thumbnail_url || media.media_url}
          alt="Visuel"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231e293b"/><path d="M150 90c-15 0-30 15-30 30s15 30 30 30 30-15 30-30-15-30-30-30zm0 48c-10 0-18-8-18-18s8-18 18-18 18 8 18 18-8 18-18 18zm0 42c-25 0-75 12-75 37v13h150v-13c0-25-50-37-75-37zm-61 38c6-6 25-13 61-13s55 7 61 13H89z" fill="%2364748b"/><text x="50%" y="80%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12" font-weight="600">Visuel non disponible</text></svg>`
          }}
        />

        {a.final_score > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: appetiteBg,
              color: appetiteColor,
              border: `1px solid ${appetiteBorder}`,
              padding: '3px 8px',
              borderRadius: 4,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }}
          >
            <span>{appetiteText} ({a.final_score}%)</span>
          </div>
        )}
      </div>

      <div className="media-body">
        <p style={{ fontSize: 14, color: '#6F6F6F', lineHeight: 1.5, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 42 }}>
          {media.caption || 'Sans description'}
        </p>

        {a.final_score > 0 && (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#6F6F6F',
            lineHeight: 1.5
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#3B82F6', marginBottom: 4 }}>
              <Sparkles size={10} /> Analyse Intention Achat IA
            </div>
            {a.price_comments_count > 0
              ? `Ce post génère un fort intérêt commercial avec ${a.price_comments_count} demandes de prix et de commande explicites.`
              : "Le volume de commentaires est élevé mais les signaux d'achat directs restent stables."}
          </div>
        )}

        <div className="media-stats" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
          <span className="media-stat"><Heart size={11} style={{ opacity: 0.6 }} /> {(media.like_count || 0).toLocaleString('fr-FR')}</span>
          <span className="media-stat"><MessageSquare size={11} style={{ opacity: 0.6 }} /> {media.comments_count || 0}</span>
        </div>

        {a && (
          <div className="flags-row" style={{ minHeight: 20, marginTop: 4 }}>
            {a.price_comments_count > 0 && <span className="badge badge-gray" style={{ fontSize: 10 }}>Prix ({a.price_comments_count})</span>}
            {a.availability_comments_count > 0 && <span className="badge badge-gray" style={{ fontSize: 10 }}>Stock ({a.availability_comments_count})</span>}
            {a.color_comments_count > 0 && <span className="badge badge-gray" style={{ fontSize: 10 }}>Couleur ({a.color_comments_count})</span>}
            {a.size_comments_count > 0 && <span className="badge badge-gray" style={{ fontSize: 10 }}>Taille ({a.size_comments_count})</span>}
            {a.delivery_comments_count > 0 && <span className="badge badge-gray" style={{ fontSize: 10 }}>Livraison ({a.delivery_comments_count})</span>}
            {a.negative_feedback_count > 0 && <span className="badge badge-red" style={{ fontSize: 10 }}>Retours ({a.negative_feedback_count})</span>}
          </div>
        )}

        <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
          <div>
            {media.linked_product
              ? <span className="badge badge-green" style={{ textTransform: 'none' }}>{media.linked_product.title}</span>
              : <span className="badge badge-gray" style={{ textTransform: 'none' }}>Non lié</span>}
          </div>
          <a href={media.permalink} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
            <ExternalLink size={12} /> Voir
          </a>
        </div>
      </div>
    </div>
  )
}

export default function Instagram() {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('Tous')

  useEffect(() => {
    getMedia().then(res => {
      setMedia(res.results || res)
      setLoading(false)
    })
  }, [])

  const filtered = media.filter(m => {
    const matchType = typeFilter === 'Tous' || m.media_type === typeFilter
    const matchSearch = !search || m.caption?.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  return (
    <>
      <Topbar title="Social Connect" subtitle="Synchronisation visuelle de marque et détection d'intention d'achat par IA" />
      <div className="page-body">
        <div className="card fade-in">
          <div className="flex items-center gap-16" style={{ flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
              <Search size={13} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 36, width: '100%', borderRadius: 'var(--radius-md)' }}
                placeholder="Rechercher collections, mots-clés..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
              <Filter size={12} style={{ color: 'var(--text-muted)' }} />
              {TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className="btn btn-secondary btn-sm"
                  style={typeFilter === t ? { background: 'var(--accent)', color: '#000', borderColor: 'transparent', borderRadius: 'var(--radius-md)' } : { borderRadius: 'var(--radius-md)' }}
                >
                  {TYPE_LABELS[t] || t}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 600 }}>
              {filtered.length} élément(s)
            </span>
          </div>
        </div>

        {loading ? (
          <div className="media-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 380, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-state-icon"><MessageSquare /></div>
            <h3>Aucun élément trouvé</h3>
            <p>Ajustez vos filtres ou effectuez une nouvelle synchronisation.</p>
          </div>
        ) : (
          <div className="media-grid">
            {filtered.map(m => <MediaCard key={m.id} media={m} />)}
          </div>
        )}
      </div>
    </>
  )
}
