import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import { Settings as SettingsIcon, Sparkles } from 'lucide-react'
import { getPlatformSettings, updatePlatformSettings } from '../services/api'

export default function Parametres() {
  const [syncFreq, setSyncFreq] = useState('hourly')
  const [candidateThreshold, setCandidateThreshold] = useState('40')
  const [lang, setLang] = useState('Français + Darija + Anglais')
  const [autoShopify, setAutoShopify] = useState(true)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPlatformSettings().then(settings => {
      if (settings) {
        setSyncFreq(settings.sync_frequency || 'hourly')
        setCandidateThreshold(settings.candidate_threshold?.toString() || '40')
        setLang(settings.analysis_language || 'Français + Darija + Anglais')
        setAutoShopify(settings.auto_shopify_integration !== false)
      }
      setLoading(false)
    })
  }, [])

  function handleSave() {
    const settings = {
      sync_frequency: syncFreq,
      candidate_threshold: parseFloat(candidateThreshold),
      analysis_language: lang,
      auto_shopify_integration: autoShopify
    }
    updatePlatformSettings(settings).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <>
      <Topbar title="Paramètres Plateforme" subtitle="Préférences de l'instance Intelligence OREAS" />
      <div className="page-body">
        {loading ? (
          <>
            <div className="skeleton" style={{ height: 60, borderRadius: 'var(--radius-xl)', marginBottom: 'var(--space-6)' }} />
            <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-xl)' }} />
          </>
        ) : (
          <>
            <div className="page-header">
              <div>
                <h1>Paramètres Plateforme</h1>
                <p>Ajuster les variables d'analyse IA OREAS</p>
              </div>
            </div>

            <div className="card fade-in" style={{ maxWidth: 620 }}>
              <div className="card-title"><SettingsIcon size={14} /> Préférences IA</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Frequency selection */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#6F6F6F', display: 'block', marginBottom: 8 }}>
                    Fréquence d'Extraction Meta
                  </label>
                  <select
                    className="form-input"
                    style={{ width: '100%', cursor: 'pointer', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}
                    value={syncFreq}
                    onChange={e => setSyncFreq(e.target.value)}
                  >
                    <option value="hourly" style={{ background: 'var(--bg-card)' }}>Toutes les heures (Recommandé)</option>
                    <option value="6hours" style={{ background: 'var(--bg-card)' }}>Toutes les 6 heures</option>
                    <option value="daily" style={{ background: 'var(--bg-card)' }}>Une fois par jour</option>
                  </select>
                </div>

                {/* Threshold value input */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#6F6F6F', display: 'block', marginBottom: 8 }}>
                    Seuil de Promotion Candidat IA
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                    value={candidateThreshold}
                    onChange={e => setCandidateThreshold(e.target.value)}
                    min="0"
                    max="100"
                  />
                  <span style={{ fontSize: 11, color: '#9A9A9A', display: 'block', marginTop: 4 }}>
                    Les posts concurrents avec un score IA supérieur à ce seuil (0-100) seront automatiquement promus en Candidats IA.
                  </span>
                </div>

                {/* Languages text input */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#6F6F6F', display: 'block', marginBottom: 8 }}>
                    Modèle Langue d'Analyse
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                    value={lang}
                    onChange={e => setLang(e.target.value)}
                  />
                </div>

                {/* Shopify Auto toggle */}
                <div className="flex items-center justify-between" style={{ padding: '16px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block' }}>
                      Intégration Directe Shopify
                    </label>
                    <span style={{ fontSize: 11.5, color: '#9A9A9A' }}>
                      Pré-créer les fiches produits sur Shopify lors du lien des candidats.
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={autoShopify}
                      onChange={e => setAutoShopify(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="flex items-center gap-12" style={{ marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={handleSave} style={{ borderRadius: 'var(--radius-md)' }}>
                    Enregistrer les Paramètres
                  </button>
                  {saved && (
                    <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#3B82F6', fontWeight: 600 }}>
                      <Sparkles size={14} /> Préférences enregistrées !
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
