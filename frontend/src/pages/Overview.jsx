import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Camera, MessageSquare, Star, TrendingUp,
  DollarSign, AlertCircle, Tag, Truck, ThumbsDown
} from 'lucide-react'
import Topbar from '../components/Topbar'
import HeroSummary from '../components/HeroSummary'
import KPITile from '../components/KPITile'
import { getAccount, getMedia, getCandidates, triggerSync, MOCK } from '../services/api'

const TREND_DATA = MOCK.trend

export default function Overview() {
  const [account, setAccount] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [mediaList, setMediaList] = useState([])
  const [kpis, setKpis] = useState(MOCK.kpis)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAccount().then(acc => {
      setAccount(acc)

      const isRealConnected = acc && !acc.is_mock;

      Promise.all([getMedia(), getCandidates()]).then(([mediaRes, candidatesRes]) => {
        const list = mediaRes.results || mediaRes || []
        const candidatesList = candidatesRes.results || candidatesRes || []
        setMediaList(list)

        if (list.length > 0) {
          let totalComments = 0
          let totalScore = 0
          let scoreCount = 0
          let price = 0, dispo = 0, color = 0, size = 0, delivery = 0, complaints = 0

          list.forEach(m => {
            totalComments += m.comments_count || 0
            const a = m.analysis || {}
            if (a.final_score) {
              totalScore += a.final_score
              scoreCount++
            }
            price += a.price_comments_count || 0
            dispo += a.availability_comments_count || 0
            color += a.color_comments_count || 0
            size += a.size_comments_count || 0
            delivery += a.delivery_comments_count || 0
            complaints += a.negative_feedback_count || 0
          })

          setKpis({
            total_media: list.length,
            total_comments: totalComments,
            candidates: candidatesList.length,
            avg_score: scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0,
            price_signals: price,
            availability_signals: dispo,
            color_signals: color,
            size_signals: size,
            delivery_signals: delivery,
            complaints: complaints
          })
          setCandidates(candidatesList.slice(0, 5))
        } else if (isRealConnected) {
          setKpis({
            total_media: 0,
            total_comments: 0,
            candidates: 0,
            avg_score: 0,
            price_signals: 0,
            availability_signals: 0,
            color_signals: 0,
            size_signals: 0,
            delivery_signals: 0,
            complaints: 0
          })
          setCandidates([])
        } else {
          setKpis(MOCK.kpis)
          setCandidates(MOCK.media.slice(0, 5))
        }
        setLoading(false)
      }).catch(err => {
        console.warn("Failed to load real database stats:", err)
        if (isRealConnected) {
          setKpis({
            total_media: 0,
            total_comments: 0,
            candidates: 0,
            avg_score: 0,
            price_signals: 0,
            availability_signals: 0,
            color_signals: 0,
            size_signals: 0,
            delivery_signals: 0,
            complaints: 0
          })
          setCandidates([])
        } else {
          setKpis(MOCK.kpis)
          setCandidates(MOCK.media.slice(0, 5))
        }
        setLoading(false)
      })
    }).catch(err => {
      console.warn("Failed to retrieve account:", err)
      setKpis(MOCK.kpis)
      setCandidates(MOCK.media.slice(0, 5))
      setLoading(false)
    })
  }, [])

  async function handleSync() {
    if (!account) return
    setSyncing(true)
    await triggerSync(account.id)

    setTimeout(() => {
      Promise.all([getMedia(), getCandidates()]).then(([mediaRes, candidatesRes]) => {
        const list = mediaRes.results || mediaRes || []
        const candidatesList = candidatesRes.results || candidatesRes || []
        setMediaList(list)
        if (list.length > 0) {
          let totalComments = 0
          let totalScore = 0
          let scoreCount = 0
          let price = 0, dispo = 0, color = 0, size = 0, delivery = 0, complaints = 0

          list.forEach(m => {
            totalComments += m.comments_count || 0
            const a = m.analysis || {}
            if (a.final_score) {
              totalScore += a.final_score
              scoreCount++
            }
            price += a.price_comments_count || 0
            dispo += a.availability_comments_count || 0
            color += a.color_comments_count || 0
            size += a.size_comments_count || 0
            delivery += a.delivery_comments_count || 0
            complaints += a.negative_feedback_count || 0
          })

          setKpis({
            total_media: list.length,
            total_comments: totalComments,
            candidates: candidatesList.length,
            avg_score: scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 0,
            price_signals: price,
            availability_signals: dispo,
            color_signals: color,
            size_signals: size,
            delivery_signals: delivery,
            complaints: complaints
          })
          setCandidates(candidatesList.slice(0, 5))
        }
        setSyncing(false)
      }).catch(() => setSyncing(false))
    }, 2500)
  }

  const k = kpis

  return (
    <>
      <Topbar
        title="Hub Intelligence"
        subtitle="Analytiques prédictives et détection d'intention d'achat en temps réel"
        onSync={handleSync}
        syncing={syncing}
      />
      <div className="page-body">
        {loading ? (
          <>
            <div className="kpi-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-xl)' }} />
              ))}
            </div>
            <div className="col-8-4">
              <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-xl)' }} />
              <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-xl)' }} />
            </div>
            <div className="skeleton" style={{ height: 400, borderRadius: 'var(--radius-xl)' }} />
          </>
        ) : (
          <>
            <HeroSummary account={account} kpis={k} syncing={syncing} mediaList={mediaList} />

        <div className="kpi-grid">
          <KPITile gradient label="Candidats IA" value={k.candidates} change="+2 cette semaine" />
          <KPITile label="Contenu Sync" value={k.total_media} change="+5 ce mois" />
          <KPITile label="Signaux Traités" value={k.total_comments.toLocaleString('fr-FR')} change="+87 aujourd'hui" />
          <KPITile label="Score Intention Achat" value={`${k.avg_score}%`} change="+4.2 pts" />
        </div>

        <div className="col-8-4">
          <div className="card fade-in">
            <div className="card-title">
              <TrendingUp size={14} /> Signaux d'Intention & Demande (7j)
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={TREND_DATA} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.05)'
                    }}
                  />
                  <Area type="monotone" dataKey="prix" name="Intentions Prix" stroke="#3B82F6" fill="url(#gBlue)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="dispo" name="Disponibilité" stroke="#38BDF8" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card fade-in">
            <div className="card-title">
              <AlertCircle size={14} /> Classification des Intentions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { label: 'Demandes de Prix', val: k.price_signals, max: 350, icon: DollarSign },
                { label: 'Stock & Disponibilité', val: k.availability_signals, max: 350, icon: Tag },
                { label: 'Préférences Couleur', val: k.color_signals, max: 350, icon: Tag },
                { label: 'Demandes Taille', val: k.size_signals, max: 350, icon: Tag },
                { label: 'Livraison & Expédition', val: k.delivery_signals, max: 350, icon: Truck },
                { label: 'Retours & Réclamations', val: k.complaints, max: 350, icon: ThumbsDown },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                      <s.icon size={13} style={{ color: 'var(--text-muted)' }} /> {s.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.val}</span>
                  </div>
                  <div className="score-bar-bg">
                    <div className="score-bar-fill" style={{ width: `${(s.val / s.max) * 100}%`, background: 'linear-gradient(135deg, #3B82F6 0%, #38BDF8 100%)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card fade-in">
          <div className="card-title">
            <Star size={14} /> Classement Performance IA (Top Candidats)
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Visuel & Légende</th>
                  <th>Format</th>
                  <th>Engagement</th>
                  <th>Commentaires</th>
                  <th>Score IA</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((m, i) => (
                  <tr key={m.id} className="fade-in">
                    <td style={{ color: '#3B82F6', fontWeight: 700, fontSize: 13 }}>
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={m.thumbnail_url || m.media_url}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="%23F5F3EF"/><path d="M20 10c-3 0-5 2-5 5s2 5 5 5 5-2 5-5-2-5-5-5zm0 11c-5 0-13 2-13 7v3h26v-3c0-5-8-7-13-7z" fill="%236F6F6F"/></svg>`
                          }}
                          style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid #ECE7E1' }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, maxWidth: 260 }} className="truncate">{m.caption || 'Sans légende'}</div>
                          <div style={{ fontSize: 11, color: '#9A9A9A' }}>@{m.account_username || account?.instagram_username || 'oreas_ai'}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-gray">{m.media_type}</span></td>
                    <td style={{ fontWeight: 600 }}>{(m.like_count || 0).toLocaleString('fr-FR')}</td>
                    <td style={{ color: '#6F6F6F' }}>{m.comments_count}</td>
                    <td>
                      <div className="score-bar-wrap">
                        <div className="score-bar-bg" style={{ width: 80 }}>
                          <div className="score-bar-fill" style={{ width: `${Math.min(((m.analysis?.final_score || 0) / 100) * 100, 100)}%`, background: 'linear-gradient(135deg, #3B82F6 0%, #38BDF8 100%)' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#3B82F6' }}>{m.analysis?.final_score || 0}%</span>
                      </div>
                    </td>
                    <td>
                      {m.linked_product
                        ? <span className="badge badge-green">Lié Shopify</span>
                        : <span className="badge badge-gray">Non lié</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}
      </div>
    </>
  )
}
