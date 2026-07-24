import { useState, useEffect } from 'react'
import { Link2, Sparkles, CheckCircle, ArrowRight, AlertTriangle, Camera } from 'lucide-react'
import Topbar from '../components/Topbar'
import { getOAuthConnectUrl, completeOAuthCallback } from '../services/api'

export default function Connexion() {
  const [step, setStep] = useState('idle')  // idle | connecting | connected
  const [username, setUsername] = useState('oreas_clothing')
  const [error, setError] = useState(null)

  const redirectUri = window.location.origin + '/connexion'

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state') // state holds the brand slug in our oauth redirect

    if (code) {
      setStep('connecting')
      setError(null)
      completeOAuthCallback(state || 'oreas', redirectUri, code)
        .then(res => {
          if (res && res.account) {
            setUsername(res.account.instagram_username)
          }
          setStep('connected')
          // Clean up URL query parameters
          window.history.replaceState({}, document.title, window.location.pathname)
        })
        .catch(err => {
          console.error('OAuth Callback Error:', err)
          const errMsg = err.response?.data?.error || err.message || 'An error occurred during account connection.'
          setError(errMsg)
          setStep('idle')
          // Clean up URL query parameters even on error
          window.history.replaceState({}, document.title, window.location.pathname)
        })
    }
  }, [])

  async function handleConnect() {
    setStep('connecting')
    setError(null)
    try {
      const res = await getOAuthConnectUrl('oreas', redirectUri)
      if (res && res.url) {
        window.location.href = res.url
      } else {
        throw new Error("Impossible de récupérer l'URL de redirection Meta.")
      }
    } catch (err) {
      console.error('OAuth Connect Error:', err)
      let errMsg = err.response?.data?.error || err.message || 'Impossible de se connecter à Meta.'
      if (errMsg.includes('403')) {
        errMsg = "Statut 403 (Accès Refusé) : L'App Meta Business est actuellement en mode Développement ou le domaine local requiert des autorisations dans la console Facebook Developers."
      }
      setError(errMsg)
      setStep('idle')
    }
  }

  async function handleDemoConnect() {
    setStep('connecting')
    setError(null)
    try {
      const res = await completeOAuthCallback('oreas', redirectUri, 'mock_code')
      if (res && res.account) {
        setUsername(res.account.instagram_username || 'oreas_clothing')
      }
      setStep('connected')
    } catch (err) {
      console.error('Demo Connect Error:', err)
      setError('Erreur lors de la connexion démo.')
      setStep('idle')
    }
  }

  return (
    <>
      <Topbar title="Intégrations" subtitle="Configurer les permissions de synchronisation et l'accès à l'analyse" />
      <div className="page-body">
        <div className="connect-card fade-in" style={{ padding: 40, border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xl)' }}>
          <div className="connect-icon" style={{
            background: step === 'connected' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
            color: step === 'connected' ? '#22C55E' : '#3B82F6',
            boxShadow: 'var(--shadow-md)'
          }}>
            {step === 'connected' ? <CheckCircle size={28} /> : <Link2 size={28} />}
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #EF4444',
              color: '#EF4444',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              fontSize: 14,
              marginBottom: 24,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: 4 }}>Erreur d'autorisation Meta (403)</strong>
                <p style={{ margin: 0, lineHeight: 1.5, opacity: 0.9 }}>{error}</p>
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={handleDemoConnect}
                    className="btn btn-secondary btn-sm"
                    style={{ background: 'rgba(255,255,255,0.15)', borderColor: '#EF4444', color: '#EF4444' }}
                  >
                    ⚡ Activer le compte en Mode Simulation / Démo
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'connected' ? (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                Connexion Réussie
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                Le compte <strong>@{username}</strong> est désormais officiellement connecté à votre instance OREAS. La synchronisation automatique est configurée.
              </p>
              <div className="status-badge connected" style={{ display: 'inline-flex', margin: '0 auto 24px' }}>
                <span className="dot" />
                <span>Actif — @{username}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <a href="/" className="btn btn-primary" style={{ borderRadius: 'var(--radius-md)' }}>
                  Tableau de Bord <ArrowRight size={14} />
                </a>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                Intégration Meta Business
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
                Connectez votre compte de marque via le portail d'autorisation Meta. OREAS extraira en toute sécurité vos visuels et signaux d'achat.
              </p>

              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '24px', marginBottom: 28, textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9A9A9A', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Permissions d'Accès OREAS
                </div>
                {[
                  'Lire les posts et reels',
                  'Extraire les flux de commentaires',
                  'Statistiques de visibilité organique',
                  'Gestion de réponse intelligente',
                ].map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 14, color: '#6F6F6F', fontWeight: 500 }}>
                    <Sparkles size={14} color="#3B82F6" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '14px 28px', fontSize: 14, borderRadius: 'var(--radius-md)' }}
                  onClick={handleConnect}
                  disabled={step === 'connecting'}
                >
                  {step === 'connecting'
                    ? <><span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff', marginRight: 8 }} /> Connexion…</>
                    : <><Camera size={16} /> Connecter via Meta Center</>}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px 20px', fontSize: 13, borderRadius: 'var(--radius-md)' }}
                  onClick={handleDemoConnect}
                  disabled={step === 'connecting'}
                >
                  Mode Démo / Simulation Rapide
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
