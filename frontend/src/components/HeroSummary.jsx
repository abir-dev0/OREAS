import { MOCK } from '../services/api'
import { Sparkles, CheckCircle, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react'

export default function HeroSummary({ account, kpis, syncing, mediaList = [] }) {
  const k = kpis || MOCK.kpis
  const isMock = !account || account.is_mock;

  // Déterminer le statut de synchronisation
  let statusText = "Compte Connecté"
  let statusColor = "var(--success)"
  let StatusIcon = CheckCircle

  if (isMock) {
    statusText = "Mode Démo"
    statusColor = "var(--text-secondary)"
    StatusIcon = HelpCircle
  } else {
    const isAnyMediaSyncing = mediaList.some(m => m.sync_status === 'syncing');
    const isAnyMediaFailed = mediaList.some(m => m.sync_status === 'failed');

    if (syncing || isAnyMediaSyncing) {
      statusText = "Synchronisation..."
      statusColor = "var(--accent)"
      StatusIcon = RefreshCw
    } else if (isAnyMediaFailed) {
      statusText = "Échec Sync"
      statusColor = "var(--danger)"
      StatusIcon = AlertCircle
    } else if (!account.last_sync_at || mediaList.length === 0) {
      statusText = "Aucune Donnée"
      statusColor = "var(--text-muted)"
      StatusIcon = AlertCircle
    } else {
      const lastSyncDate = new Date(account.last_sync_at).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
      statusText = `Sync: ${lastSyncDate}`
      statusColor = "var(--text-primary)"
      StatusIcon = CheckCircle
    }
  }

  // Générer l'explication IA automatique pour le dashboard
  const totalSignals = k.price_signals + k.availability_signals + k.color_signals + k.delivery_signals;
  const aiExplanation = totalSignals > 0 
    ? `${totalSignals.toLocaleString('fr-FR')} signaux d'achat détectés cette semaine. Les demandes de prix dominent à ${(k.price_signals / totalSignals * 100).toFixed(0)}%, indiquant une intention d'achat exceptionnellement forte.`
    : "Aucune donnée d'interaction client disponible. Connectez votre compte Meta et synchronisez vos posts pour générer des insights prédictifs.";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }} className="fade-in">
      {/* Barre de commande premium pour le statut de sync et le profil */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 600 }}>@{account?.instagram_username || 'oreas_ai'}</span>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <span style={{ color: 'var(--text-secondary)' }}>{k.candidates} candidats actifs</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: statusColor, fontWeight: 600 }}>
          <StatusIcon
            size={13}
            style={{
              animation: statusText === "Synchronisation..." ? 'spin 1.5s linear infinite' : 'none'
            }}
          />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Explication IA Insight en haut du dashboard */}
      <div className="ai-insight-box">
        <Sparkles size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div className="ai-insight-title">Insight IA OREAS</div>
          <div className="ai-insight-text">{aiExplanation}</div>
        </div>
      </div>
    </div>
  )
}
