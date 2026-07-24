import { useState, useEffect, useMemo, memo, useTransition, useDeferredValue } from 'react'
import {
  Target, RefreshCw, AlertCircle, ShoppingBag,
  TrendingUp, Activity, MousePointer, DollarSign,
  Layers, CheckCircle, Sparkles, AlertTriangle,
  XCircle, Truck, RotateCcw, PhoneCall,
  Video, Image as ImageIcon, Star, ChevronDown, ChevronUp,
  Zap, BarChart2, Eye, ArrowRight, LineChart as LineChartIcon,
  PieChart, Filter, Users, Award, TrendingDown, Scissors, Clock,
  Megaphone, Brain, Link as LinkIcon, Unlink, Search, Calendar,
  ChevronRight, SlidersHorizontal, Check, ShieldAlert
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend
} from 'recharts'
import Topbar from '../components/Topbar'
import {
  getMarketingAccounts, getMarketingCampaigns,
  getMarketingSummary, getMarketingPredictions,
  linkTestToCampaign, unlinkTestFromCampaign,
  triggerMarketingSync
} from '../services/api'
import { handleImageError } from '../utils/imageFallback'

/* ─────────────────── Helpers & Formatting ─────────────────── */
const fmt = (n, decimals = 0) =>
  n == null ? '—' : Number(n).toLocaleString('fr-MA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmtMAD0 = (n) => (n == null ? '—' : `${fmt(n, 0)} MAD`)
const pct = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`)

const STATUS_CONF = {
  SCALE: {
    label: 'Scaler à Marge Max',
    badge: 'SCALE',
    bg: '#F0FDF4',
    border: '#16A34A',
    text: '#15803D',
    icon: TrendingUp
  },
  OPTIMIZE: {
    label: 'Optimiser le Funnel',
    badge: 'OPTIMISER',
    bg: '#FFFBEB',
    border: '#F59E0B',
    text: '#B45309',
    icon: Activity
  },
  HALT: {
    label: 'Arrêter d’Urgence',
    badge: 'STOP',
    bg: '#FEF2F2',
    border: '#DC2626',
    text: '#B91C1C',
    icon: XCircle
  },
  CREATIVE_OVERHAUL: {
    label: 'Refonte Créative Exigée',
    badge: 'REFONTE',
    bg: '#F5F3FF',
    border: '#8B5CF6',
    text: '#6D28D9',
    icon: Layers
  },
  STABLE: {
    label: 'Performances Stables',
    badge: 'STABLE',
    bg: '#EFF6FF',
    border: '#2563EB',
    text: '#1D4ED8',
    icon: CheckCircle
  }
}

const FORMAT_ICON = { VIDEO: Video, IMAGE: ImageIcon, CAROUSEL: Layers }

/* ─────────────────── Recharts Custom Tooltip ─────────────────── */
const CustomTooltip = memo(({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.96)',
      backdropFilter: 'blur(12px)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      fontSize: 12,
      boxShadow: 'var(--shadow-md)',
      pointerEvents: 'none'
    }}>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, margin: '3px 0' }}>
          <span style={{ color: p.color, fontSize: 11, fontWeight: 500 }}>{p.name}:</span>
          <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>
            {typeof p.value === 'number' && (p.name.includes('MAD') || p.name.includes('Dépenses') || p.name.includes('Bénéfice'))
              ? fmtMAD0(p.value)
              : fmt(p.value, 0)}
          </strong>
        </div>
      ))}
    </div>
  )
})

/* ─────────────────── Interactive COD Funnel Flow (Memoized) ─────────────────── */
const FunnelFlowVisualizer = memo(({ kpis }) => {
  if (!kpis) return null

  const total = kpis.total_purchases || 0
  const confirmed = kpis.confirmed_purchases || 0
  const delivered = kpis.delivered_purchases || 0
  const returned = kpis.returned_purchases || 0

  const pctConfirmed = total > 0 ? ((confirmed / total) * 100).toFixed(1) : 0
  const pctDelivered = total > 0 ? ((delivered / total) * 100).toFixed(1) : 0
  const pctReturned = delivered > 0 ? ((returned / delivered) * 100).toFixed(1) : 0

  const steps = [
    { title: '1. Shopify Orders', value: total, sub: 'Intention d’achat brute', color: '#2563EB', pct: '100%' },
    { title: '2. Confirmées CC', value: confirmed, sub: `${pctConfirmed}% validation Call Center`, color: '#F59E0B', pct: `${pctConfirmed}%` },
    { title: '3. Colis Livrés', value: delivered, sub: `${pctDelivered}% livrées & payées`, color: '#16A34A', pct: `${pctDelivered}%` },
    { title: '4. Retours Client', value: returned, sub: `${pctReturned}% retours post-livraison`, color: '#DC2626', pct: `${pctReturned}%` },
  ]

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <PieChart size={17} color="var(--accent)" /> Entonnoir de Conversion Cash-on-Delivery (COD)
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0' }}>
            Vision intégrée de la commande web à l'encaissement réel après livraison
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-light)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
          Rendement global: {pctDelivered}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {steps.map((step) => (
          <div
            key={step.title}
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${step.color}25`,
              borderLeft: `4px solid ${step.color}`,
              borderRadius: 'var(--radius-md)',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{step.title}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: step.color, background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)' }}>
                {step.pct}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>
              {fmt(step.value)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{step.sub}</div>

            <div style={{ marginTop: 10, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: step.pct, height: '100%', background: step.color, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

/* ─────────────────── Creative Card Component (Memoized + Pure CSS Hover) ─────────────────── */
const CreativeCard = memo(({ c, rank }) => {
  const profitable = c.metrics.net_profit >= 0
  const Icon = FORMAT_ICON[c.format] || Video

  return (
    <div
      className="card creative-card-hover"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${profitable ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`
      }}
    >
      {/* Thumbnail Frame */}
      <div style={{ position: 'relative', width: '100%', height: 180, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <img
          src={c.image_url}
          alt={c.name}
          onError={(e) => handleImageError(e, c.image_url)}
          referrerPolicy="no-referrer"
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%)' }} />

        {/* Rank Badge */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: rank === 1 ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'var(--bg-secondary)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px',
          fontSize: 11, fontWeight: 800, color: rank === 1 ? '#000000' : '#FFFFFF',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', gap: 4
        }}>
          {rank === 1 && <Star size={11} fill="#000" color="#000" />} #{rank}
        </div>

        {/* Format Chip */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(255, 255, 255, 0.92)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px',
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 700, color: '#1F2937'
        }}>
          <Icon size={11} color="var(--accent)" /> {c.format}
        </div>

        {/* Floating Quick Stats on Thumbnail */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', color: '#fff' }}>
          <div>
            <span style={{ fontSize: 10, opacity: 0.8, display: 'block' }}>Dépenses Ads</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMAD0(c.metrics.total_spend)}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 10, opacity: 0.8, display: 'block' }}>ROAS</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: c.metrics.roas >= 2.5 ? '#4ADE80' : '#FBBF24' }}>
              {c.metrics.roas?.toFixed(2)}x
            </span>
          </div>
        </div>
      </div>

      {/* Content Body */}
      <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h4 style={{ margin: 0, fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4, minHeight: 36 }}>
          {c.name}
        </h4>

        {/* Tag Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {c.hook_type && (
            <span style={{ background: 'var(--accent-light)', borderRadius: 'var(--radius-xs)', padding: '2px 7px', fontSize: 10, color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Target size={10} /> {c.hook_type.replace(/_/g, ' ')}
            </span>
          )}
          {c.editing_style && (
            <span style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xs)', padding: '2px 7px', fontSize: 10, color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Scissors size={10} /> {c.editing_style.replace(/_/g, ' ')}
            </span>
          )}
          {c.has_model && (
            <span style={{ background: 'var(--info-bg)', borderRadius: 'var(--radius-xs)', padding: '2px 7px', fontSize: 10, color: 'var(--info)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Users size={10} /> Modèle
            </span>
          )}
          {c.video_duration && (
            <span style={{ background: 'var(--warning-light)', borderRadius: 'var(--radius-xs)', padding: '2px 7px', fontSize: 10, color: 'var(--warning)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Clock size={10} /> {c.video_duration}s
            </span>
          )}
        </div>

        {/* Key Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 2 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>CTR</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{pct(c.metrics.ctr)}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>CPC</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{c.metrics.cpc?.toFixed(2)} MAD</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>Livrées</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{fmt(c.metrics.delivered)}</div>
          </div>
        </div>

        {/* Net Profit Callout */}
        <div style={{
          marginTop: 'auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: profitable ? 'var(--success-light)' : 'var(--danger-light)',
          borderRadius: 'var(--radius-sm)', padding: '8px 12px',
          border: `1px solid ${profitable ? 'var(--success)' : 'var(--danger)'}`
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Bénéfice Net</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: profitable ? 'var(--success)' : 'var(--danger)' }}>
            {profitable ? '+' : ''}{fmtMAD0(c.metrics.net_profit)}
          </span>
        </div>
      </div>
    </div>
  )
})

/* ─────────────────── Product Test Recommendation Card (Memoized) ─────────────────── */
const TestRecCard = memo(({ rec, campaigns, onLinkCampaign }) => {
  const [expanded, setExpanded] = useState(false)
  const conf = STATUS_CONF[rec.prediction.recommendation_status] || STATUS_CONF.STABLE
  const StatusIcon = conf.icon
  const m = rec.historical_metrics

  const isProfitable = m.net_profit >= 0

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        border: `1px solid ${conf.border}`,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          cursor: 'pointer',
          background: expanded ? 'var(--bg-surface)' : 'var(--bg-card)'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ background: `${conf.border}15`, borderRadius: 'var(--radius-md)', padding: 10, flexShrink: 0 }}>
          <StatusIcon size={20} color={conf.border} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <h4 style={{ margin: 0, fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>{rec.product_title}</h4>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-xs)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontWeight: 700, border: '1px solid var(--border)' }}>
              {rec.test_id}
            </span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: conf.bg, color: conf.text, fontWeight: 700, border: `1px solid ${conf.border}40` }}>
              {conf.badge}: {conf.label}
            </span>
            {rec.prediction.alert_type && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--danger-light)', color: 'var(--danger)', fontWeight: 700, border: '1px solid var(--danger)' }}>
                ⚠️ {rec.prediction.alert_type === 'cancellation_bleed' ? 'Annulations CC' : 'Pertes Nettes'}
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rec.prediction.recommended_action}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Bénéfice Net Réel</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: isProfitable ? 'var(--success)' : 'var(--danger)' }}>
              {isProfitable ? '+' : ''}{fmtMAD0(m.net_profit)}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </div>

      {/* Expanded Details Body */}
      {expanded && (
        <div style={{ padding: '18px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Dual ROAS Comparison Card */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '14px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Écart ROAS Brut vs ROAS Réel (Encaissement effectif)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
              <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>ROAS Brut (Shopify)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{m.raw_roas?.toFixed(2)}x</div>
              </div>

              <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <ArrowRight size={18} />
                <span style={{ fontSize: 9, fontWeight: 700 }}>Ajustement CC</span>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>ROAS Réel (Après livraison)</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: m.real_roas >= 2.0 ? 'var(--success)' : m.real_roas >= 1.0 ? 'var(--warning)' : 'var(--danger)' }}>
                  {m.real_roas?.toFixed(2)}x
                </div>
              </div>
            </div>
          </div>

          {/* Metric Chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            {[
              { label: 'Dépenses Totales', val: fmtMAD0(m.total_spend), icon: DollarSign, color: 'var(--accent)' },
              { label: 'Commandes Web', val: fmt(m.total_purchases), icon: ShoppingBag, color: 'var(--warning)' },
              { label: 'Colis Livrés', val: fmt(m.delivered_purchases), icon: Truck, color: 'var(--success)' },
              { label: 'Annulation CC', val: pct(m.cancellation_rate), icon: PhoneCall, color: m.cancellation_rate > 35 ? 'var(--danger)' : 'var(--warning)' },
              { label: 'Taux de Retour', val: pct(m.return_rate), icon: RotateCcw, color: m.return_rate > 10 ? 'var(--danger)' : 'var(--text-secondary)' },
            ].map((chip) => (
              <div key={chip.label} style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                  <chip.icon size={12} color={chip.color} /> {chip.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{chip.val}</div>
              </div>
            ))}
          </div>

          {/* AI Recommendation Box */}
          <div style={{ background: conf.bg, border: `1px solid ${conf.border}40`, borderRadius: 'var(--radius-md)', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: conf.text, fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
              <Sparkles size={15} /> Recommandation Stratégique IA
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{rec.prediction.recommended_action}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{rec.prediction.details}</p>
          </div>

          {/* Campaign Link Manager */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LinkIcon size={13} color="var(--accent)" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Liaison Campagne Meta Ads:</span>
            </div>

            <select
              className="btn btn-secondary btn-sm"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onLinkCampaign(e.target.value, rec.test_id)
                  e.target.value = ""
                }
              }}
              style={{ fontSize: 11, borderRadius: 'var(--radius-sm)' }}
            >
              <option value="" disabled>Lier une campagne...</option>
              {campaigns.map((camp) => (
                <option key={camp.id} value={camp.id}>
                  {camp.name} ({camp.status})
                </option>
              ))}
            </select>
          </div>

        </div>
      )}
    </div>
  )
})

/* ─────────────────── Main Marketing Intelligence Component ─────────────────── */
export default function Marketing() {
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [summary, setSummary] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  /* ── Filter & Search states ── */
  const [activeTab, setActiveTab] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [creativeFormatFilter, setCreativeFormatFilter] = useState('ALL')
  const [creativeSort, setCreativeSort] = useState('profit')
  const [testStatusFilter, setTestStatusFilter] = useState('ALL')
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('ALL')

  // useTransition: marks tab switching as a non-urgent update so the UI stays
  // responsive during the re-render. The old tab stays visible until the new one
  // is ready — eliminating the "freeze" between tab clicks.
  const [isPending, startTransition] = useTransition()

  // useDeferredValue: search filtering runs at lower priority than user input,
  // preventing keystrokes from feeling sluggish when the list is large.
  const deferredSearch = useDeferredValue(searchQuery)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      getMarketingAccounts(),
      getMarketingCampaigns(),
      getMarketingSummary(),
      getMarketingPredictions()
    ])
      .then(([accs, camps, summ, preds]) => {
        setAccounts(accs || [])
        if (accs?.length) setSelectedAccount(accs[0])
        setCampaigns(camps || [])
        setSummary(summ || null)
        setPredictions(preds || null)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error loading marketing data', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSync = () => {
    if (!selectedAccount) return
    setSyncing(true)
    setSyncMessage('Synchronisation Meta Ads & Call Center...')
    triggerMarketingSync(selectedAccount.id)
      .then(() => {
        setSyncMessage('Données synchronisées avec succès !')
        setTimeout(() => setSyncMessage(''), 3000)
        loadData()
        setSyncing(false)
      })
      .catch(() => {
        setSyncMessage('Erreur de synchronisation')
        setTimeout(() => setSyncMessage(''), 3000)
        setSyncing(false)
      })
  }

  const handleLinkCampaign = (campaignId, testId) => {
    linkTestToCampaign(campaignId, testId).then(() => {
      setSyncMessage(`Campagne liée au test ${testId}`)
      setTimeout(() => setSyncMessage(''), 3000)
      loadData()
    })
  }

  const handleUnlinkCampaign = (campaignId) => {
    unlinkTestFromCampaign(campaignId).then(() => {
      setSyncMessage('Campagne déliée')
      setTimeout(() => setSyncMessage(''), 3000)
      loadData()
    })
  }

  const kpis = summary?.kpi || summary?.kpis

  /* ── Derived Alert Counts & Top Creative ── */
  const alertCount = useMemo(() => {
    return predictions?.test_recommendations?.filter((r) =>
      ['HALT', 'CREATIVE_OVERHAUL'].includes(r.prediction.recommendation_status)
    ).length || 0
  }, [predictions])

  const topCreative = predictions?.creative_rankings?.[0]

  /* ── Filtered & Sorted Creatives ── */
  const filteredCreatives = useMemo(() => {
    let list = predictions?.creative_rankings || []

    if (creativeFormatFilter !== 'ALL') {
      list = list.filter((c) => c.format === creativeFormatFilter)
    }

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.hook_type?.toLowerCase().includes(q) ||
          c.editing_style?.toLowerCase().includes(q)
      )
    }

    return [...list].sort((a, b) => {
      if (creativeSort === 'profit') return b.metrics.net_profit - a.metrics.net_profit
      if (creativeSort === 'roas') return b.metrics.roas - a.metrics.roas
      if (creativeSort === 'ctr') return b.metrics.ctr - a.metrics.ctr
      if (creativeSort === 'delivered') return b.metrics.delivered - a.metrics.delivered
      return 0
    })
  }, [predictions, creativeFormatFilter, creativeSort, deferredSearch])

  /* ── Filtered Product Tests ── */
  const filteredTests = useMemo(() => {
    let list = predictions?.test_recommendations || []

    if (testStatusFilter !== 'ALL') {
      list = list.filter((t) => t.prediction.recommendation_status === testStatusFilter)
    }

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase()
      list = list.filter(
        (t) =>
          t.product_title.toLowerCase().includes(q) ||
          t.test_id.toLowerCase().includes(q)
      )
    }

    const statusOrder = { HALT: 0, CREATIVE_OVERHAUL: 1, OPTIMIZE: 2, SCALE: 3, STABLE: 4 }
    return [...list].sort(
      (a, b) => (statusOrder[a.prediction.recommendation_status] ?? 5) - (statusOrder[b.prediction.recommendation_status] ?? 5)
    )
  }, [predictions, testStatusFilter, deferredSearch])

  /* ── Filtered Campaigns ── */
  const filteredCampaigns = useMemo(() => {
    let list = campaigns || []

    if (campaignStatusFilter !== 'ALL') {
      list = list.filter((c) => c.status === campaignStatusFilter)
    }

    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.objective?.toLowerCase().includes(q)
      )
    }

    return list
  }, [campaigns, campaignStatusFilter, deferredSearch])

  /* ── Memoized Creative Insights Analysis ── */
  const creativeInsights = useMemo(() => {
    const all = predictions?.creative_rankings || []
    if (!all.length) return null

    const withModel = all.filter((c) => c.has_model)
    const withoutModel = all.filter((c) => !c.has_model)
    const avgModelProfit = withModel.length ? withModel.reduce((s, c) => s + c.metrics.net_profit, 0) / withModel.length : 0
    const avgNoModelProfit = withoutModel.length ? withoutModel.reduce((s, c) => s + c.metrics.net_profit, 0) / withoutModel.length : 0
    const bestFormat = all.reduce((best, c) => (c.metrics.roas > (best?.metrics?.roas || 0) ? c : best), null)
    const bestHook = all.reduce((best, c) => (c.metrics.ctr > (best?.metrics?.ctr || 0) ? c : best), null)

    return [
      { title: 'Présence Modèle Humain', value: `+${fmtMAD0(avgModelProfit)} / pub`, detail: 'Génère un bénéfice net nettement supérieur', bg: 'var(--success-light)', border: 'var(--success)' },
      { title: `Format Performant: ${bestFormat?.format || 'VIDEO'}`, value: `${bestFormat?.metrics?.roas?.toFixed(2) || '0.00'}x ROAS`, detail: bestFormat?.name || 'Top format', bg: 'var(--accent-light)', border: 'var(--accent)' },
      { title: `Top Hook: ${bestHook?.hook_type?.replace(/_/g, ' ') || 'Lifestyle'}`, value: pct(bestHook?.metrics?.ctr), detail: 'Taux de clic le plus fort', bg: 'var(--warning-light)', border: 'var(--warning)' },
      { title: 'Sans Modèle Humain', value: `${fmtMAD0(avgNoModelProfit)} / pub`, detail: 'Marge réduite post-livraison', bg: 'var(--danger-light)', border: 'var(--danger)' },
    ]
  }, [predictions])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
        <Topbar title="Marketing Intelligence" subtitle="Chargement du tableau d'intelligence marketing..." />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
          <div className="spin" style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Agrégation des métriques full-funnel...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Topbar
        title="Marketing Intelligence"
        subtitle="Full-funnel ROI intelligence — Shopify → Call Center → Livraison → Retours"
        onSync={handleSync}
        syncing={syncing}
        showSyncButton={true}
      />

      <div className="page-body" style={{ marginTop: 0 }}>

        {/* ── Sub-header Bar: Account & Controls ── */}
        <div className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {/* Account Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compte Ads Actif</span>
              <select
                value={selectedAccount?.id || ''}
                onChange={(e) => {
                  const acc = accounts.find((a) => a.id === Number(e.target.value))
                  if (acc) setSelectedAccount(acc)
                }}
                style={{
                  background: 'transparent', border: 'none', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', padding: 0
                }}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.brand?.name || 'OREAS'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Universal Search Input */}
          <div style={{ position: 'relative', minWidth: 240, flex: 1, maxWidth: 380 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Rechercher créatif, test produit, campagne..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: 32,
                paddingRight: 12,
                paddingTop: 7,
                paddingBottom: 7,
                fontSize: 12,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          {/* Sync Toast / Status */}
          {syncMessage && (
            <div style={{ fontSize: 11, fontWeight: 600, color: '#22C55E', background: 'rgba(34, 197, 94, 0.1)', padding: '5px 12px', borderRadius: 'var(--radius-full)', border: '1px solid #22C55E', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={13} /> {syncMessage}
            </div>
          )}
        </div>

        {/* ── Pillar KPI Grid (3 Functional Columns) ── */}
        {kpis && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

            {/* Pillar 1: Finances & Marges Nettes */}
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <DollarSign size={13} color="#3B82F6" /> Marge & Rentabilité Nette
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: kpis.net_profit >= 0 ? '#22C55E' : '#EF4444', background: kpis.net_profit >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '2px 7px', borderRadius: 'var(--radius-xs)' }}>
                  Net: {kpis.net_profit >= 0 ? '+' : ''}{fmtMAD0(kpis.net_profit)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 10, color: '#9A9A9A' }}>Dépenses Ads</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#3B82F6' }}>{fmtMAD0(kpis.total_spend)}</div>
                  <span style={{ fontSize: 9, color: '#9A9A9A' }}>{fmt(kpis.total_impressions)} impressions</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 10, color: '#9A9A9A' }}>ROAS Réel</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: kpis.net_roas >= 2.0 ? '#22C55E' : '#F59E0B' }}>{(kpis.net_roas || 0).toFixed(2)}x</div>
                  <span style={{ fontSize: 9, color: '#9A9A9A' }}>Brut: {(kpis.roas || 0).toFixed(2)}x</span>
                </div>
              </div>
            </div>

            {/* Pillar 2: Conversion & Entonnoir COD */}
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Truck size={13} color="#F59E0B" /> Conversion & Entonnoir COD
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: kpis.cancellation_rate > 35 ? '#EF4444' : '#F59E0B', background: kpis.cancellation_rate > 35 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '2px 7px', borderRadius: 'var(--radius-xs)' }}>
                  Annulation CC: {pct(kpis.cancellation_rate)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 10, color: '#9A9A9A' }}>Commandes Web</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#E0A941' }}>{fmt(kpis.total_purchases)}</div>
                  <span style={{ fontSize: 9, color: '#9A9A9A' }}>{fmt(kpis.confirmed_purchases)} confirmées CC</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 10, color: '#9A9A9A' }}>Colis Livrés</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#22C55E' }}>{fmt(kpis.delivered_purchases)}</div>
                  <span style={{ fontSize: 9, color: '#9A9A9A' }}>{fmt(kpis.returned_purchases)} retours client</span>
                </div>
              </div>
            </div>

            {/* Pillar 3: Efficacité Trafic & Acquisition */}
            <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Activity size={13} color="#3B82F6" /> Efficacité Trafic & Ads
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 7px', borderRadius: 'var(--radius-xs)' }}>
                  CTR: {pct(kpis.ctr)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 10, color: '#9A9A9A' }}>Coût / Clic (CPC)</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#7BA3C7' }}>{(kpis.cpc || 0).toFixed(2)} MAD</div>
                  <span style={{ fontSize: 9, color: '#9A9A9A' }}>CPM: {(kpis.cpm || 0).toFixed(2)} MAD</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 10, color: '#9A9A9A' }}>Coût / Résultat</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(kpis.cost_per_result, 2)} MAD</div>
                  <span style={{ fontSize: 9, color: '#9A9A9A' }}>Par commande acquise</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Segmented Navigation Tabs Bar ── */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 4, width: 'fit-content' }}>
          {[
            { id: 'overview', label: 'Vue Générale', icon: BarChart2 },
            { id: 'creatives', label: 'Créatifs', icon: Video, badge: predictions?.creative_rankings?.length },
            { id: 'tests', label: 'Tests Produit', icon: Zap, alertBadge: alertCount },
            { id: 'campaigns', label: 'Campagnes Meta', icon: Target, badge: campaigns?.length },
          ].map((t) => {
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#3B82F6' : '#6B7280',
                  background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease, color 0.2s ease'
                }}
              >
                <t.icon size={14} />
                <span>{t.label}</span>
                {t.badge != null && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 'var(--radius-full)', background: isActive ? '#3B82F6' : 'var(--bg-secondary)', color: isActive ? '#FFFFFF' : '#9CA3AF' }}>
                    {t.badge}
                  </span>
                )}
                {t.alertBadge > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 'var(--radius-full)', background: '#EF4444', color: '#FFFFFF' }}>
                    {t.alertBadge} !
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ══════════════════════════════════════════
            TAB: VUE GÉNÉRALE (OVERVIEW)
        ══════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Timeline Chart: Spend vs Net Profit */}
            {summary?.timeline?.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                      <LineChartIcon size={17} color="var(--accent)" /> Évolution 30 Jours — Dépenses Ads vs Bénéfice Net Réel
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0' }}>Analyse quotidienne de la marge nette générée par rapport au budget publicitaire engagé</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={summary.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6EAF2" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#9A9A9A', fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fill: '#9A9A9A', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Area type="monotone" dataKey="spend" name="Dépenses Ads MAD" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorSpend)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="net_profit" name="Bénéfice Net MAD" stroke="#22C55E" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* COD Funnel Visualizer */}
            <FunnelFlowVisualizer kpis={kpis} />

            {/* Spotlight Banner: Top Performing Creative */}
            {topCreative && (
              <div
                style={{
                  background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--success-bg) 100%)',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
                    <Award size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Créatif #1 — Top Rentabilité Réelle
                    </span>
                    <h4 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{topCreative.name}</h4>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Format: <strong>{topCreative.format}</strong> · Hook: <strong>{topCreative.hook_type?.replace(/_/g, ' ')}</strong> · ROAS: <strong>{topCreative.metrics.roas?.toFixed(2)}x</strong>
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bénéfice Net Généré</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)' }}>+{fmtMAD0(topCreative.metrics.net_profit)}</div>
                  </div>

                  <button
                    onClick={() => setActiveTab('creatives')}
                    className="btn btn-primary"
                    style={{ borderRadius: 'var(--radius-md)', padding: '9px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    Voir tous les créatifs <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: CRÉATIFS (CREATIVE INTELLIGENCE)
        ══════════════════════════════════════════ */}
        {activeTab === 'creatives' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Filter Bar */}
            <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              {/* Format Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>Format:</span>
                {['ALL', 'VIDEO', 'IMAGE', 'CAROUSEL'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setCreativeFormatFilter(f)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: creativeFormatFilter === f ? 'var(--accent)' : 'var(--bg-card)',
                      color: creativeFormatFilter === f ? '#FFFFFF' : 'var(--text-secondary)',
                      transition: 'background 0.15s ease, color 0.15s ease'
                    }}
                  >
                    {f === 'ALL' ? 'Tous' : f}
                  </button>
                ))}
              </div>

              {/* Sort selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SlidersHorizontal size={13} color="var(--text-muted)" />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Trier par:</span>
                <select
                  value={creativeSort}
                  onChange={(e) => setCreativeSort(e.target.value)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 11,
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  <option value="profit">Bénéfice Net (Plus élevé)</option>
                  <option value="roas">ROAS (Plus élevé)</option>
                  <option value="ctr">CTR (Plus élevé)</option>
                  <option value="delivered">Colis Livrés (Plus élevé)</option>
                </select>
              </div>
            </div>

            {/* Creative Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {filteredCreatives.map((c, i) => (
                <CreativeCard key={c.creative_id} c={c} rank={i + 1} />
              ))}
              {filteredCreatives.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                  <Video size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <p>Aucun créatif ne correspond à vos filtres.</p>
                </div>
              )}
            </div>

            {/* Creative Insights Summary */}
            {creativeInsights && (
              <div className="card" style={{ padding: 20, marginTop: 4 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px' }}>
                  <Brain size={17} color="var(--accent)" /> Insights Créatifs Automatisés par IA
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {creativeInsights.map((ins) => (
                    <div key={ins.title} style={{ background: ins.bg, border: `1px solid ${ins.border}40`, borderRadius: 'var(--radius-md)', padding: 14 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{ins.title}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '3px 0' }}>{ins.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ins.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: TESTS PRODUIT (PRODUCT TESTS & RECS)
        ══════════════════════════════════════════ */}
        {activeTab === 'tests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Filters & Status Bar */}
            <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>Filtrer par Statut:</span>
                {['ALL', 'SCALE', 'OPTIMIZE', 'HALT', 'CREATIVE_OVERHAUL', 'STABLE'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setTestStatusFilter(st)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: testStatusFilter === st ? 'var(--accent)' : 'var(--bg-card)',
                      color: testStatusFilter === st ? '#FFFFFF' : 'var(--text-secondary)',
                      transition: 'background 0.15s ease, color 0.15s ease'
                    }}
                  >
                    {st === 'ALL' ? 'Tous' : STATUS_CONF[st]?.badge || st}
                  </button>
                ))}
              </div>
            </div>

            {/* Critical Alert Box */}
            {alertCount > 0 && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <ShieldAlert size={22} color="var(--danger)" />
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 800, color: 'var(--danger)' }}>
                    {alertCount} test{alertCount > 1 ? 's' : ''} nécessite{alertCount > 1 ? 'nt' : ''} une action corrective immédiate
                  </h4>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                    Taux d’annulation Call Center anormal ou dépenses non rentables. L’IA préconise l’arrêt ou la refonte pour préserver la trésorerie.
                  </p>
                </div>
              </div>
            )}

            {/* List of Test Cards */}
            {filteredTests.map((rec) => (
              <TestRecCard
                key={rec.test_id}
                rec={rec}
                campaigns={campaigns}
                onLinkCampaign={handleLinkCampaign}
              />
            ))}

            {filteredTests.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                <Zap size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
                <p>Aucun test produit ne correspond à vos filtres.</p>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════
            TAB: CAMPAGNES (META ADS CAMPAIGNS)
        ══════════════════════════════════════════ */}
        {activeTab === 'campaigns' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Campaign Status Filter */}
            <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>Statut Campagne:</span>
                {['ALL', 'ACTIVE', 'PAUSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setCampaignStatusFilter(st)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: campaignStatusFilter === st ? 'var(--accent)' : 'var(--bg-card)',
                      color: campaignStatusFilter === st ? '#FFFFFF' : 'var(--text-secondary)',
                      transition: 'background 0.15s ease, color 0.15s ease'
                    }}
                  >
                    {st === 'ALL' ? 'Toutes' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredCampaigns.map((c) => {
                const isActive = c.status === 'ACTIVE'
                const statusColor = isActive ? 'var(--success)' : 'var(--warning)'

                return (
                  <div
                    key={c.id}
                    className="card"
                    style={{
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 14,
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 220 }}>
                      <div
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: statusColor,
                          boxShadow: `0 0 6px ${statusColor}`,
                          flexShrink: 0
                        }}
                      />
                      <div>
                        <h4 style={{ margin: '0 0 3px', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{c.name}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>ID: {c.campaign_id}</span>
                          <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-light)', padding: '2px 7px', borderRadius: 'var(--radius-xs)', fontWeight: 600 }}>
                            {c.objective || 'CONVERSIONS'}
                          </span>
                          {c.linked_test && (
                            <span style={{ fontSize: 10, color: 'var(--success)', background: 'var(--success-light)', border: '1px solid var(--success)', padding: '2px 7px', borderRadius: 'var(--radius-xs)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <LinkIcon size={9} /> Test: {c.linked_test.test_id} ({c.linked_test.product?.title})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: `${statusColor}15`, padding: '3px 8px', borderRadius: 'var(--radius-full)', border: `1px solid ${statusColor}40` }}>
                        {c.status}
                      </span>

                      {c.linked_test ? (
                        <button
                          onClick={() => handleUnlinkCampaign(c.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--danger)' }}
                        >
                          <Unlink size={11} /> Délier
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}

              {filteredCampaigns.length === 0 && (
                <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                  <Target size={36} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <p>Aucune campagne trouvée.</p>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </>
  )
}
