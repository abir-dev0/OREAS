import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ShoppingBag, Users, Package, RefreshCw, Search,
  ChevronLeft, ChevronRight, ExternalLink, MapPin,
  CheckCircle, Clock, ShoppingCart, DollarSign
} from 'lucide-react'
import Topbar from '../components/Topbar'
import { syncShopifyProducts, syncShopifyOrders } from '../services/api'

// ─── API base ────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || '/api'

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })

const STATUS_MAP = {
  fulfilled: { bg: 'rgba(16,185,129,0.12)', color: '#059669', label: 'Livré' },
  open: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', label: 'En cours' },
  cancelled: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Annulé' },
  pending: { bg: 'rgba(245,158,11,0.12)', color: '#D97706', label: 'En attente' },
  confirmed: { bg: 'rgba(16,185,129,0.12)', color: '#059669', label: 'Confirmé' },
  delivered: { bg: 'rgba(16,185,129,0.12)', color: '#059669', label: 'Livré & Payé' },
  out_for_delivery: { bg: 'rgba(99,102,241,0.12)', color: '#6366F1', label: 'En livraison' },
  failed: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Échec' },
}

const Badge = ({ val }) => {
  const s = STATUS_MAP[val] || { bg: 'rgba(156,163,175,0.15)', color: '#6B7280', label: val || '—' }
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: 'nowrap'
    }}>{s.label}</span>
  )
}

// ─── Pagination bar ───────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, pageSize, onPage }) {
  if (totalPages <= 1) return null
  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) pages.push(i)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px', borderTop: '1px solid var(--border)',
      background: 'var(--bg-surface)', fontSize: 12
    }}>
      <span style={{ color: 'var(--text-muted)' }}>
        {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} sur <strong>{total}</strong>
      </span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={() => onPage(page - 1)} disabled={page <= 1}
          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-card)', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)' }}
        ><ChevronLeft size={14} /></button>

        {pages.map((p, i) => p === '…'
          ? <span key={`e${i}`} style={{ padding: '5px 4px', color: 'var(--text-muted)' }}>…</span>
          : <button key={p} onClick={() => onPage(p)}
            style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontWeight: p === page ? 800 : 500, background: p === page ? 'var(--accent)' : 'var(--bg-card)', color: p === page ? '#fff' : 'var(--text-primary)' }}
          >{p}</button>
        )}

        <button
          onClick={() => onPage(page + 1)} disabled={page >= totalPages}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: page >= totalPages ? 'var(--bg-surface)' : 'var(--bg-card)',
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
          onMouseEnter={e => {
            if (page < totalPages) {
              e.currentTarget.style.background = 'var(--accent)'
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.borderColor = 'var(--accent)'
            }
          }}
          onMouseLeave={e => {
            if (page < totalPages) {
              e.currentTarget.style.background = 'var(--bg-card)'
              e.currentTarget.style.color = 'var(--text-primary)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }
          }}
        >
          <span>Suivant</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Page sizes ───────────────────────────────────────────────────────────────
const PAGE_SIZES = { products: 20, orders: 50, customers: 50 }

export default function Shopify() {
  const [tab, setTab] = useState('products')

  // ── Products state ──
  const [products, setProducts] = useState([])
  const [prodPage, setProdPage] = useState(1)
  const [prodTotal, setProdTotal] = useState(0)
  const [prodPageCount, setProdPageCount] = useState(1)
  const [prodLoading, setProdLoading] = useState(true)
  const [prodSearch, setProdSearch] = useState('')

  // ── Orders state ──
  const [orders, setOrders] = useState([])
  const [ordPage, setOrdPage] = useState(1)
  const [ordTotal, setOrdTotal] = useState(0)
  const [ordPageCount, setOrdPageCount] = useState(1)
  const [ordLoading, setOrdLoading] = useState(true)
  const [ordSearch, setOrdSearch] = useState('')
  const [ordFilter, setOrdFilter] = useState('')

  // ── Customers state ──
  const [customers, setCustomers] = useState([])
  const [custPage, setCustPage] = useState(1)
  const [custTotal, setCustTotal] = useState(0)
  const [custPageCount, setCustPageCount] = useState(1)
  const [custLoading, setCustLoading] = useState(true)
  const [custSearch, setCustSearch] = useState('')

  // ── Sync ──
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef(null)

  // ── KPI (first page totals from server counts) ──
  const [kpi, setKpi] = useState({ revenue: 0, delivered: 0, pending: 0, avgOrder: 0 })
  const [kpiLoading, setKpiLoading] = useState(true)

  // ─── Fetchers ────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async (page = 1, search = '') => {
    setProdLoading(true)
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZES.products })
      if (search) params.set('search', search)
      const data = await apiFetch(`/products/items/?${params}`)
      setProducts(data.results || data)
      const total = data.count || (data.results || data).length
      setProdTotal(total)
      setProdPageCount(Math.max(1, Math.ceil(total / PAGE_SIZES.products)))
    } catch (e) {
      console.warn('Products fetch failed:', e.message)
    } finally {
      setProdLoading(false)
    }
  }, [])

  const fetchOrders = useCallback(async (page = 1, search = '', filter = '') => {
    setOrdLoading(true)
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZES.orders })
      if (search) params.set('search', search)
      if (filter) params.set('shopify_status', filter)
      const data = await apiFetch(`/marketing/orders/?${params}`)
      setOrders(data.results || data)
      const total = data.count || (data.results || data).length
      setOrdTotal(total)
      setOrdPageCount(Math.max(1, Math.ceil(total / PAGE_SIZES.orders)))
    } catch (e) {
      console.warn('Orders fetch failed:', e.message)
    } finally {
      setOrdLoading(false)
    }
  }, [])

  const fetchCustomers = useCallback(async (page = 1, search = '') => {
    setCustLoading(true)
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZES.customers })
      if (search) params.set('search', search)
      const data = await apiFetch(`/products/customers/?${params}`)
      setCustomers(data.results || data)
      const total = data.count || (data.results || data).length
      setCustTotal(total)
      setCustPageCount(Math.max(1, Math.ceil(total / PAGE_SIZES.customers)))
    } catch (e) {
      console.warn('Customers fetch failed:', e.message)
    } finally {
      setCustLoading(false)
    }
  }, [])

  const fetchKpi = useCallback(async () => {
    setKpiLoading(true)
    try {
      // Use count=1 trick: get total counts from summary page
      const [pData, oData, cData] = await Promise.all([
        apiFetch('/products/items/?page=1'),
        apiFetch('/marketing/orders/?page=1'),
        apiFetch('/products/customers/?page=1'),
      ])
      const allOrders = oData.count || 0
      const fulfilledR = await apiFetch('/marketing/orders/?shopify_status=fulfilled&page=1')
      const pendingR = await apiFetch('/marketing/orders/?shopify_status=open&page=1')
      const delivR = await apiFetch('/marketing/orders/?delivery_status=delivered&page=1')
      setKpi({
        revenue: 0,   // We'll compute from loaded page
        delivered: delivR.count || 0,
        pending: pendingR.count || 0,
        avgOrder: 0,
      })
    } catch (e) {
      console.warn('KPI fetch:', e.message)
    } finally {
      setKpiLoading(false)
    }
  }, [])

  // ─── Initial loads ────────────────────────────────────────────────────────
  useEffect(() => { fetchProducts(1) }, [fetchProducts])
  useEffect(() => { fetchOrders(1) }, [fetchOrders])
  useEffect(() => { fetchCustomers(1) }, [fetchCustomers])
  useEffect(() => { fetchKpi() }, [fetchKpi])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ─── Search debounce ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setProdPage(1); fetchProducts(1, prodSearch) }, 350)
    return () => clearTimeout(t)
  }, [prodSearch, fetchProducts])

  useEffect(() => {
    const t = setTimeout(() => { setOrdPage(1); fetchOrders(1, ordSearch, ordFilter) }, 350)
    return () => clearTimeout(t)
  }, [ordSearch, ordFilter, fetchOrders])

  useEffect(() => {
    const t = setTimeout(() => { setCustPage(1); fetchCustomers(1, custSearch) }, 350)
    return () => clearTimeout(t)
  }, [custSearch, fetchCustomers])

  // ─── Sync handler ─────────────────────────────────────────────────────────
  const handleFullSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      await Promise.all([
        syncShopifyProducts(),
        syncShopifyOrders(),
        fetch('/api/products/sync-customers/', { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      ])
      setSyncMsg('Synchronisation complète ✓')
      fetchProducts(prodPage, prodSearch)
      fetchOrders(ordPage, ordSearch, ordFilter)
      fetchCustomers(custPage, custSearch)
    } catch {
      setSyncMsg('Erreur de synchronisation')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }

  // ─── KPI from current orders page ────────────────────────────────────────
  const revenue = orders.filter(o => o.shopify_status === 'fulfilled').reduce((s, o) => s + Number(o.price || 0), 0)
  const avgOrder = orders.length ? orders.reduce((s, o) => s + Number(o.price || 0), 0) / orders.length : 0

  const TABS = [
    { key: 'products', icon: Package, label: 'Produits', count: prodTotal },
    { key: 'orders', icon: ShoppingCart, label: 'Commandes', count: ordTotal },
    { key: 'customers', icon: Users, label: 'Clients', count: custTotal },
  ]

  return (
    <>
      <Topbar title="Shopify Store" subtitle="Produits · Commandes · Clients synchronisés depuis Shopify" />
      <div className="page-body">

        {/* ── KPI Row ───────────────────────────────────────────────────── */}
        {kpiLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-xl)' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Produits en catalogue', value: prodTotal, icon: Package, color: '#C6A46A' },
              { label: 'Commandes totales', value: ordTotal, icon: ShoppingCart, color: '#6366F1' },
              { label: 'Commandes livrées', value: kpi.delivered || 0, icon: CheckCircle, color: '#10B981' },
              { label: 'En attente livraison', value: kpi.pending || 0, icon: Clock, color: '#F59E0B' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{value.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Main Card ─────────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            background: 'var(--bg-surface)',
            flexWrap: 'wrap',
            gap: 16
          }}>
            <div style={{
              display: 'flex',
              gap: 4
            }}>
              {TABS.map(({ key, icon: Icon, label, count }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '14px 20px',
                    fontSize: 13,
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
                    color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                  <span style={{
                    background: tab === key ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.06)',
                    color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
                    borderRadius: 10,
                    padding: '2px 7px',
                    fontSize: 11,
                    fontWeight: 700,
                    minWidth: 20,
                    textAlign: 'center'
                  }}>
                    {count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  value={tab === 'products' ? prodSearch : tab === 'orders' ? ordSearch : custSearch}
                  onChange={e => {
                    if (tab === 'products') setProdSearch(e.target.value)
                    else if (tab === 'orders') setOrdSearch(e.target.value)
                    else setCustSearch(e.target.value)
                  }}
                  placeholder="Rechercher..."
                  style={{
                    paddingLeft: 36,
                    paddingRight: 12,
                    paddingTop: 8,
                    paddingBottom: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    width: 200,
                    outline: 'none',
                    transition: 'all 0.2s ease'
                  }}
                />
              </div>

              {tab === 'orders' && (
                <div style={{ position: 'relative', width: 140 }} ref={filterRef}>
                  <button
                    onClick={() => setFilterOpen(!filterOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 500,
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      outline: 'none',
                      width: '100%',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <span>{ordFilter ? STATUS_MAP[ordFilter]?.label || ordFilter : 'Tous statuts'}</span>
                    <ChevronRight size={14} style={{
                      transform: filterOpen ? 'rotate(90deg)' : 'rotate(90deg)',
                      transition: 'transform 0.2s ease'
                    }} />
                  </button>
                  {filterOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      minWidth: 160,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 12,
                      boxShadow: 'var(--shadow-lg)',
                      padding: 8,
                      zIndex: 9999
                    }}>
                      <div
                        onClick={() => { setOrdFilter(''); setFilterOpen(false) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        Tous statuts
                      </div>
                      <div
                        onClick={() => { setOrdFilter('fulfilled'); setFilterOpen(false) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                        Livré
                      </div>
                      <div
                        onClick={() => { setOrdFilter('open'); setFilterOpen(false) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
                        En cours
                      </div>
                      <div
                        onClick={() => { setOrdFilter('cancelled'); setFilterOpen(false) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                        Annulé
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleFullSync}
                disabled={syncing}
                className="btn btn-primary"
                style={{
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13,
                  fontWeight: 600
                }}
              >
                <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Sync...' : 'Synchroniser'}
              </button>
            </div>
          </div>

          {syncMsg && (
            <div style={{ padding: '9px 20px', background: 'rgba(16,185,129,0.08)', color: '#059669', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
              ✓ {syncMsg}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* PRODUCTS TAB                                                  */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === 'products' && (
            <>
              {prodLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, padding: 20 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-lg)' }} />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, padding: 24 }}>
                  {products.map(p => (
                    <div
                      key={p.id}
                      className="card"
                      style={{
                        padding: 0,
                        overflow: 'hidden',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        position: 'relative',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-6px)'
                        e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.12)'
                        e.currentTarget.style.borderColor = 'var(--accent)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = ''
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }}
                    >
                      <div style={{
                        width: '100%',
                        height: 200,
                        overflow: 'hidden',
                        background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-card) 100%)',
                        position: 'relative'
                      }}>
                        {p.image_url
                          ? (
                            <img
                              src={p.image_url}
                              alt={p.title}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transition: 'transform 0.4s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                              onError={e => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                              <Package size={40} style={{ opacity: 0.4 }} />
                            </div>
                          )
                        }
                      </div>
                      <div style={{ padding: '16px 18px', background: 'var(--bg-card)' }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: 6,
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          letterSpacing: '-0.2px'
                        }}>{p.title}</div>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginBottom: 12,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'monospace'
                        }}>{p.handle || '—'}</div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: 12,
                          borderTop: '1px solid var(--border)'
                        }}>
                          <span style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: 'var(--accent)',
                            letterSpacing: '-0.5px'
                          }}>{p.price ? `${fmt(p.price)} MAD` : '—'}</span>
                          {p.shopify_product_id && (
                            <a
                              href={`https://admin.shopify.com/store/4nk04k-c8/products/${p.shopify_product_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: 'var(--text-muted)',
                                padding: 6,
                                borderRadius: 8,
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(59,130,246,0.1)'
                                e.currentTarget.style.color = 'var(--accent)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--text-muted)'
                              }}
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {products.length === 0 && (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                      <Package size={36} style={{ marginBottom: 12 }} /><div>Aucun produit trouvé</div>
                    </div>
                  )}
                </div>
              )}
              <Pagination page={prodPage} totalPages={prodPageCount} total={prodTotal} pageSize={PAGE_SIZES.products}
                onPage={p => { setProdPage(p); fetchProducts(p, prodSearch) }} />
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* ORDERS TAB                                                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === 'orders' && (
            <>
              {ordLoading ? (
                <div style={{ padding: 20 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 50, borderRadius: 'var(--radius-md)', marginBottom: 8 }} />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px' }}>
                  <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{
                            background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-card) 100%)',
                            borderBottom: '1px solid var(--border)'
                          }}>
                            {['#Commande', 'Produit', 'Prix', 'Shopify', 'Call Center', 'Livraison', 'Date'].map(h => (
                              <th key={h} style={{
                                padding: '14px 16px',
                                textAlign: 'left',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.6px',
                                whiteSpace: 'nowrap'
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o, i) => (
                            <tr key={o.id}
                              style={{
                                borderBottom: i < orders.length - 1 ? '1px solid var(--border)' : 'none',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(198,164,106,0.04)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontSize: 13 }}>{o.order_id}</td>
                              <td style={{ padding: '16px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{o.product?.title || '—'}</td>
                              <td style={{ padding: '16px', fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap', fontSize: 14, letterSpacing: '-0.3px' }}>{fmt(o.price)} MAD</td>
                              <td style={{ padding: '16px' }}><Badge val={o.shopify_status} /></td>
                              <td style={{ padding: '16px' }}><Badge val={o.call_center_status} /></td>
                              <td style={{ padding: '16px' }}><Badge val={o.delivery_status} /></td>
                              <td style={{ padding: '16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 500 }}>
                                {o.created_at ? new Date(o.created_at).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {orders.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                        <ShoppingCart size={36} style={{ marginBottom: 12 }} /><div>Aucune commande trouvée</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Pagination page={ordPage} totalPages={ordPageCount} total={ordTotal} pageSize={PAGE_SIZES.orders}
                onPage={p => { setOrdPage(p); fetchOrders(p, ordSearch, ordFilter) }} />
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* CUSTOMERS TAB                                                 */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {tab === 'customers' && (
            <>
              {custLoading ? (
                <div style={{ padding: 20 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 50, borderRadius: 'var(--radius-md)', marginBottom: 8 }} />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px' }}>
                  <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{
                            background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-card) 100%)',
                            borderBottom: '1px solid var(--border)'
                          }}>
                            {['Client', 'Email', 'Téléphone', 'Ville', 'Commandes', 'Total dépensé'].map(h => (
                              <th key={h} style={{
                                padding: '14px 16px',
                                textAlign: 'left',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.6px',
                                whiteSpace: 'nowrap'
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {customers.map((c, i) => {
                            const initials = (c.full_name || '?')[0].toUpperCase()
                            const hue = ((c.full_name?.charCodeAt(0) || 65) * 4) % 360
                            return (
                              <tr key={c.id}
                                style={{
                                  borderBottom: i < customers.length - 1 ? '1px solid var(--border)' : 'none',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(198,164,106,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                      width: 40,
                                      height: 40,
                                      borderRadius: '50%',
                                      background: `linear-gradient(135deg, hsl(${hue},55%,88%) 0%, hsl(${hue},55%,80%) 100%)`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 14,
                                      fontWeight: 800,
                                      color: `hsl(${hue},55%,30%)`,
                                      flexShrink: 0,
                                      boxShadow: `0 2px 8px hsl(${hue},55%,40%,0.2)`
                                    }}>{initials}</div>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>{c.full_name || '—'}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: 13 }}>
                                  {c.email ? <a href={`mailto:${c.email}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{c.email}</a> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: 13 }}>{c.phone || '—'}</td>
                                <td style={{ padding: '16px' }}>
                                  {c.city ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <MapPin size={13} style={{ color: 'var(--text-muted)' }} />
                                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{c.city}</span>
                                    </div>
                                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                </td>
                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                  <span style={{
                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.08) 100%)',
                                    color: '#6366F1',
                                    padding: '4px 12px',
                                    borderRadius: 12,
                                    fontWeight: 800,
                                    fontSize: 12
                                  }}>{c.orders_count}</span>
                                </td>
                                <td style={{ padding: '16px', fontWeight: 800, color: 'var(--accent)', fontSize: 14, letterSpacing: '-0.3px' }}>{fmt(c.total_spent)} MAD</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {customers.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                        <Users size={36} style={{ marginBottom: 12 }} /><div>Aucun client trouvé</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Pagination page={custPage} totalPages={custPageCount} total={custTotal} pageSize={PAGE_SIZES.customers}
                onPage={p => { setCustPage(p); fetchCustomers(p, custSearch) }} />
            </>
          )}

        </div>
      </div>
    </>
  )
}
