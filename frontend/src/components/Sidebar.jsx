import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Camera, Star, BarChart2,
  Link2, Settings, Sparkles, Compass, BrainCircuit, Target
} from 'lucide-react'

const NAV = [
  {
    section: 'Intelligence IA',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Hub Intelligence' },
      { to: '/veille', icon: Compass, label: 'Veille Marché' },
    ]
  },
  {
    section: 'Sources de Données',
    items: [
      { to: '/instagram', icon: Camera, label: 'Social Connect' },
      { to: '/candidats', icon: Star, label: 'Candidats IA' },
      { to: '/marketing', icon: Target, label: 'Meta Ads' },
      { to: '/analyses', icon: BarChart2, label: 'Analyses Prédictives' },
    ]
  },
  {
    section: 'Système',
    items: [
      { to: '/connexion', icon: Link2, label: 'Intégrations' },
      { to: '/parametres', icon: Settings, label: 'Paramètres Plateforme' },
    ]
  }
]

export default function Sidebar() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    }
    
    // Check initial theme
    checkTheme()
    
    // Listen for theme changes
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    
    return () => observer.disconnect()
  }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={isDark ? "/dist/oreas_darklogo.png" : "/dist/oreas_logo.png"} alt="OREAS" />
      </div>

      <nav className="sidebar-nav">
        {NAV.map(group => (
          <div key={group.section}>
            <div className="nav-section-label">{group.section}</div>
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon className="nav-icon" size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="account-chip">
          <div className="account-avatar">
            <Sparkles size={14} />
          </div>
          <div className="account-info">
            <div className="acc-name">Administrateur</div>
            <div className="acc-email">admin@oreas.ai</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
