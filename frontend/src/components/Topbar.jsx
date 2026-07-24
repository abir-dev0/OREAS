import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Moon, Sun, Search, Bell, User, Wifi, ChevronDown, Sparkles } from 'lucide-react'
import { triggerGlobalSync } from '../services/api'

export default function Topbar({ title, subtitle, onSync, syncing }) {
  const [localSyncing, setLocalSyncing] = useState(false)
  const [theme, setTheme] = useState('light')
  const [lastSync, setLastSync] = useState('2 minutes ago')
  const [searchFocused, setSearchFocused] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const notificationsRef = useRef(null)
  const profileRef = useRef(null)
  const isSyncing = syncing || localSyncing

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    // Check for saved theme preference or default to light
    const savedTheme = localStorage.getItem('theme') || 'light'
    setTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  const handleSyncClick = async () => {
    if (isSyncing) return
    setLocalSyncing(true)
    
    try {
      // Trigger global sync (both Instagram and Meta Ads)
      await triggerGlobalSync()
      
      // If the page provided its own local refresh function, invoke it
      if (onSync) {
        await onSync()
      } else {
        // If no custom handler, wait 3.5 seconds for Celery tasks to start/execute, then refresh page to load new data
        setTimeout(() => {
          window.location.reload()
        }, 3500)
      }
    } catch (error) {
      console.error("Global sync failed:", error)
    } finally {
      // Keep spinning for at least 2.5s for great visual feedback
      setTimeout(() => {
        setLocalSyncing(false)
      }, 2500)
    }
  }

  return (
    <header className="topbar-command">
      {/* Left Section - Page Info */}
      <div className="topbar-section-left">
        <h1 className="topbar-title">{title}</h1>
        {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
      </div>

      {/* Center Section - Global Search */}
      <div className="topbar-section-center">
        <div className={`topbar-search ${searchFocused ? 'focused' : ''}`}>
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            placeholder="Search products, orders, customers, campaigns, AI agents..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className="search-shortcut">⌘K</kbd>
        </div>
      </div>

      {/* Right Section - Command Center */}
      <div className="topbar-section-right">
        {/* Meta Connection */}
        <div className="meta-connection-card">
          <div className="meta-status">
            <Wifi size={14} className="meta-icon" />
            <span className="meta-text">Meta Connected</span>
          </div>
          <span className="meta-sync-time">Last sync: {lastSync}</span>
          <button 
            className="meta-sync-btn"
            onClick={handleSyncClick}
            disabled={isSyncing}
          >
            <RefreshCw size={12} style={{ animation: isSyncing ? 'spin 1.2s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* Notifications */}
        <div 
          className="topbar-action-wrapper"
          ref={notificationsRef}
        >
          <button 
            className="topbar-action-btn notification-btn"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
          >
            <Bell size={18} />
            <span className="notification-badge">3</span>
          </button>
          {notificationsOpen && (
            <div className="dropdown-menu notifications-dropdown">
              <div className="dropdown-item">
                <Sparkles size={16} className="dropdown-icon" />
                <div className="dropdown-content">
                  <div className="dropdown-title">AI completed workflow</div>
                  <div className="dropdown-time">2 minutes ago</div>
                </div>
              </div>
              <div className="dropdown-item">
                <Sparkles size={16} className="dropdown-icon" />
                <div className="dropdown-content">
                  <div className="dropdown-title">Shopify order imported</div>
                  <div className="dropdown-time">15 minutes ago</div>
                </div>
              </div>
              <div className="dropdown-item">
                <Sparkles size={16} className="dropdown-icon" />
                <div className="dropdown-content">
                  <div className="dropdown-title">Instagram trend detected</div>
                  <div className="dropdown-time">1 hour ago</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button 
          className="topbar-action-btn"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* User Profile */}
        <div 
          className="topbar-action-wrapper"
          ref={profileRef}
        >
          <button 
            className="topbar-action-btn profile-btn"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <div className="profile-avatar">
              <User size={18} />
            </div>
            <ChevronDown size={14} className="profile-chevron" />
          </button>
          {profileOpen && (
            <div className="dropdown-menu profile-dropdown">
              <div className="dropdown-item">Profile</div>
              <div className="dropdown-item">Settings</div>
              <div className="dropdown-item logout">Logout</div>
            </div>
          )}
        </div>
      </div>
    </header>
  )

}

