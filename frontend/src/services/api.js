// API service layer with mock-data fallback for offline development
import axios from 'axios'

const BASE = '/api'

// Helper: read a cookie value by name (for Django CSRF token)
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[2]) : null
}

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
  withCredentials: true,         // send cookies on cross-origin requests (dev tunnels, etc.)
  xsrfCookieName: 'csrftoken',  // Django's default CSRF cookie name
  xsrfHeaderName: 'X-CSRFToken', // Django's expected CSRF header
})

// Interceptor: attach the CSRF token on every state-mutating request
api.interceptors.request.use((config) => {
  const method = (config.method || '').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const token = getCookie('csrftoken')
    if (token) {
      config.headers['X-CSRFToken'] = token
    }
  }
  return config
})

const fallback = (data) => Promise.resolve({ data })

// ── Mock data ──────────────────────────────────────────────
export const MOCK = {
  account: {
    id: 1,
    brand: { id: 1, name: 'OREAS', slug: 'oreas' },
    facebook_page_id: 'page_12345',
    facebook_page_name: 'OREAS Boutique',
    instagram_business_account_id: 'ig_oreas_biz',
    instagram_username: 'oreas_clothing',
    is_active: true,
    last_sync_at: new Date().toISOString(),
    is_mock: true,
  },
  kpis: {
    total_media: 47,
    total_comments: 1284,
    candidates: 8,
    avg_score: 63.4,
    price_signals: 312,
    availability_signals: 198,
    color_signals: 271,
    size_signals: 163,
    delivery_signals: 88,
    complaints: 52,
  },
  media: Array.from({ length: 12 }, (_, i) => {
    const types = ['REEL', 'IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']
    const captions = [
      'Nouvelle robe en lin beige, disponible maintenant ✨ bchhal? dispo en rouge et noir?',
      'Collection été — Tissu en soie lilas. Livraison partout au Maroc.',
      'Notre best-seller en coton bio. Quelle taille vous convient? taille L disponible?',
      'Nouvelle couleur disponible ! Bleu marine et rose pastel. Combien coute le set?',
      'Robe de soirée en satin noir. Prix spécial ce weekend. bchhal hiya?',
      'Qualité premium, tissu importé. Commandez maintenant !',
    ]
    const scores = [127, 98, 85, 74, 61, 55, 48, 42, 38, 27, 19, 11]
    return {
      id: i + 1,
      instagram_media_id: `ig_media_${1000 + i}`,
      account_username: 'oreas_clothing',
      caption: captions[i % captions.length],
      media_type: types[i % types.length],
      media_url: `https://picsum.photos/seed/oreas${i}/600/600`,
      thumbnail_url: `https://picsum.photos/seed/oreas${i}/300/300`,
      permalink: `https://instagram.com/p/oreas_post_${i}/`,
      posted_at: new Date(Date.now() - i * 86400000 * 2).toISOString(),
      comments_count: Math.floor(Math.random() * 80) + 10,
      like_count: Math.floor(Math.random() * 1500) + 100,
      is_candidate: i < 5,
      linked_product: i < 3 ? { id: i + 1, title: ['Robe Lin Beige', 'Shirt Coton Noir', 'Set Soirée Rose'][i] } : null,
      sync_status: 'synced',
      analysis_status: 'analyzed',
      analysis_error: null,
      analysis: {
        comments_count: Math.floor(Math.random() * 80) + 10,
        price_comments_count: Math.floor(Math.random() * 20) + 2,
        availability_comments_count: Math.floor(Math.random() * 15) + 1,
        color_comments_count: Math.floor(Math.random() * 18) + 1,
        size_comments_count: Math.floor(Math.random() * 12) + 1,
        delivery_comments_count: Math.floor(Math.random() * 10) + 1,
        negative_feedback_count: Math.floor(Math.random() * 6),
        final_score: scores[i],
        last_analyzed_at: new Date().toISOString(),
      }
    }
  }),
  comments: Array.from({ length: 15 }, (_, i) => {
    const texts = [
      "combien ca coute le lin beige en taille M?",
      "bchhal taman s'il vous plait? dispo en noir?",
      "do you ship to France? delivery fee?",
      "tissu de mauvaise qualite, decu de la matiere",
      "Magnifique! Disponible en XL?",
      "prix? livraison Casablanca?",
      "quel est le prix en DH? bchhal?",
      "couleur rouge disponible? taille S?",
      "Excellent tissu, j'adore la matiere",
      "est ce que vous livrez a Marrakech?",
      "lon khal kayn? taille L?",
      "prix en MAD? bghit nchouf",
      "bad quality, doesnt match the photo",
      "dispo en beige XS ou S?",
      "shipping to USA? how much?",
    ]
    const usernames = ['amal_b', 'saad_k', 'yasmine_f', 'leila_m', 'youssef_t', 'anass_h', 'fatima_z', 'karim_n', 'ghita_a', 'nour_s', 'soufiane_e', 'mona_r', 'adam_l', 'samira_h', 'omar_f']
    return {
      id: i + 1,
      instagram_comment_id: `comment_${i}`,
      username: usernames[i],
      text: texts[i],
      posted_at: new Date(Date.now() - i * 3600000 * 4).toISOString(),
      asks_price: [0, 1, 5, 6, 11].includes(i),
      asks_availability: [0, 4, 10, 13].includes(i),
      asks_color: [1, 7, 10].includes(i),
      asks_size: [0, 4, 7, 13].includes(i),
      asks_delivery: [2, 9, 14].includes(i),
      has_complaint: [3, 12].includes(i),
      detected_colors: i === 1 ? ['noir'] : i === 7 ? ['rouge'] : [],
      detected_sizes: i === 0 ? ['m'] : i === 4 ? ['xl'] : i === 7 ? ['s'] : [],
    }
  }),
  trend: Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString('fr-FR', { weekday: 'short' }),
    prix: Math.floor(Math.random() * 30) + 5,
    dispo: Math.floor(Math.random() * 20) + 3,
    livraison: Math.floor(Math.random() * 15) + 2,
    plaintes: Math.floor(Math.random() * 8),
  })),
  competitors: [
    { id: 1, username: 'zara', followers_count: 61200000, last_sync_at: new Date().toISOString() },
    { id: 2, username: 'mango', followers_count: 14500000, last_sync_at: new Date().toISOString() },
    { id: 3, username: 'hm', followers_count: 38200000, last_sync_at: new Date().toISOString() },
  ],
  competitorMedia: [
    {
      id: 101,
      competitor_username: 'zara',
      instagram_media_id: 'comp_zara_1',
      caption: 'Nouvelle collection d\'été minimaliste. Silhouettes fluides et lin premium. ☀️ #zara #summer',
      media_type: 'IMAGE',
      media_url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=800',
      permalink: 'https://instagram.com/zara',
      posted_at: new Date(Date.now() - 4 * 3600000).toISOString(),
      like_count: 154200,
      comments_count: 1205,
      engagement_score: 0.26
    },
    {
      id: 102,
      competitor_username: 'mango',
      instagram_media_id: 'comp_mango_1',
      caption: 'Parisian chic. Discover the new oversized trench coat. 🇫🇷 #mango #style #paris',
      media_type: 'IMAGE',
      media_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800',
      permalink: 'https://instagram.com/mango',
      posted_at: new Date(Date.now() - 10 * 3600000).toISOString(),
      like_count: 89400,
      comments_count: 642,
      engagement_score: 0.63
    },
    {
      id: 103,
      competitor_username: 'zara',
      instagram_media_id: 'comp_zara_2',
      caption: 'Bold blazers for dynamic tailoring. Crafted with fine double-breasted fabrics.',
      media_type: 'IMAGE',
      media_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=800',
      permalink: 'https://instagram.com/zara',
      posted_at: new Date(Date.now() - 18 * 3600000).toISOString(),
      like_count: 245100,
      comments_count: 2510,
      engagement_score: 0.42
    },
    {
      id: 104,
      competitor_username: 'hm',
      instagram_media_id: 'comp_hm_1',
      caption: 'Everyday comfort. Organic denim shirts and relaxed-fit trousers.',
      media_type: 'CAROUSEL_ALBUM',
      media_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800',
      permalink: 'https://instagram.com/hm',
      posted_at: new Date(Date.now() - 28 * 3600000).toISOString(),
      like_count: 78500,
      comments_count: 480,
      engagement_score: 0.21
    },
    {
      id: 105,
      competitor_username: 'mango',
      instagram_media_id: 'comp_mango_2',
      caption: 'Summer crochet essentials. Earthy tones and lightweight details.',
      media_type: 'IMAGE',
      media_url: 'https://images.unsplash.com/photo-1574169208507-84376144848b?q=80&w=800',
      permalink: 'https://instagram.com/mango',
      posted_at: new Date(Date.now() - 36 * 3600000).toISOString(),
      like_count: 112000,
      comments_count: 914,
      engagement_score: 0.80
    },
    {
      id: 106,
      competitor_username: 'hm',
      instagram_media_id: 'comp_hm_2',
      caption: 'Street style essentials. Relaxed denim shorts and cotton tees.',
      media_type: 'IMAGE',
      media_url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=800',
      permalink: 'https://instagram.com/hm',
      posted_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      like_count: 142000,
      comments_count: 1150,
      engagement_score: 0.38
    }
  ]
}

// ── API calls ──────────────────────────────────────────────
let connectedAccount = null

export async function getAccount() {
  try {
    const r = await api.get('/instagram/accounts/')
    const acc = r.data.results?.[0] || r.data[0]
    connectedAccount = acc || null
    return acc
  } catch (e) {
    console.warn('API request failed, using mock data fallback:', e.message)
    connectedAccount = MOCK.account
    return MOCK.account
  }
}

export async function getMedia(params = {}) {
  try {
    const r = await api.get('/instagram/media/', { params })
    return r.data
  } catch (e) {
    console.warn('API request failed:', e.message)
    if (connectedAccount && !connectedAccount.is_mock) {
      return { results: [], count: 0 }
    }
    return { results: MOCK.media, count: MOCK.media.length }
  }
}

export async function getCandidates() {
  try {
    const r = await api.get('/instagram/competitor-media/candidates/')
    return r.data
  } catch (e) {
    console.warn('API request failed:', e.message)
    if (connectedAccount && !connectedAccount.is_mock) {
      return { results: [] }
    }
    // Return mock data with AI scoring fields
    const mockCandidates = MOCK.competitorMedia.map((m, i) => ({
      ...m,
      id: m.id,
      ai_score: 85 + Math.floor(Math.random() * 15),
      ai_score_details: {
        engagement: 25 + Math.floor(Math.random() * 5),
        historical: 20 + Math.floor(Math.random() * 5),
        content_quality: 15 + Math.floor(Math.random() * 5),
        seasonality: 10 + Math.floor(Math.random() * 5),
        business_relevance: 8 + Math.floor(Math.random() * 2)
      },
      is_candidate: true,
      selection_source: 'ai',
      selected_at: new Date().toISOString()
    }))
    return { results: mockCandidates }
  }
}

export async function getComments(mediaId) {
  try {
    const r = await api.get(`/instagram/media/${mediaId}/comments/`)
    return r.data
  } catch (e) {
    console.warn('API request failed:', e.message)
    if (connectedAccount && !connectedAccount.is_mock) {
      return { results: [] }
    }
    return { results: MOCK.comments }
  }
}

export async function triggerSync(accountId) {
  try {
    const r = await api.post(`/instagram/accounts/${accountId}/sync/`, null, {
      timeout: 60000 // 60s timeout for complete synchronization cascade
    })
    return r.data
  } catch (e) {
    console.warn('API request failed:', e.message)
    return { status: 'Synchronisation planifiée (mock).' }
  }
}

export async function getOAuthConnectUrl(brandSlug, redirectUri) {
  try {
    const r = await api.get('/instagram/oauth/connect/', {
      params: { brand_slug: brandSlug, redirect_uri: redirectUri }
    })
    return r.data
  } catch (e) {
    console.warn('API getOAuthConnectUrl failed or Meta rejected request:', e.message)
    // Fallback to direct demo connection URL
    return { url: `${redirectUri}?code=mock_code&state=${brandSlug}` }
  }
}

export async function completeOAuthCallback(brandSlug, redirectUri, code) {
  try {
    const r = await api.post('/instagram/oauth/callback/', {
      brand_slug: brandSlug,
      redirect_uri: redirectUri,
      code: code
    }, {
      timeout: 60000 // 60s timeout for OAuth exchange and initial account sync
    })
    return r.data
  } catch (e) {
    console.warn('API completeOAuthCallback failed, fallback to mock account:', e.message)
    return {
      message: 'Compte associé avec succès (Mode Démo).',
      account: MOCK.account
    }
  }
}

// Competitors and Business Discovery APIs
export async function getCompetitors() {
  try {
    const r = await api.get('/instagram/competitors/')
    return r.data.results || r.data
  } catch (e) {
    console.warn('API getCompetitors failed:', e.message)
    return MOCK.competitors
  }
}

export async function addCompetitor(username) {
  try {
    const r = await api.post('/instagram/competitors/', { username })
    return r.data
  } catch (e) {
    console.warn('API addCompetitor failed:', e.message)
    const newComp = {
      id: Date.now(),
      username: username.toLowerCase().trim(),
      followers_count: 1250000,
      last_sync_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
    MOCK.competitors.unshift(newComp)
    return newComp
  }
}

export async function deleteCompetitor(id) {
  await api.delete(`/instagram/competitors/${id}/`)
  return true
}

export async function triggerCompetitorSync(id) {
  // No try/catch: if this fails, the error propagates to handleSyncCompetitor
  // which shows it to the user instead of silently returning stale data
  const r = await api.post(`/instagram/competitors/${id}/sync/`, null, {
    timeout: 60000 // 60s — sync runs inline on the backend
  })
  return r.data
}

export async function getCompetitorMedia(params = {}) {
  try {
    const r = await api.get('/instagram/competitor-media/', { params })
    return r.data.results || r.data
  } catch (e) {
    console.warn('API getCompetitorMedia failed:', e.message)
    let list = [...MOCK.competitorMedia]
    if (params.competitor_id) {
      const compObj = MOCK.competitors.find(c => c.id === Number(params.competitor_id))
      if (compObj) {
        list = list.filter(m => m.competitor_username === compObj.username)
      }
    }
    if (params.sort_by === 'date') {
      list.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
    } else {
      list.sort((a, b) => b.engagement_score - a.engagement_score)
    }
    return list
  }
}

export async function importCompetitorMedia(id) {
  try {
    const r = await api.post(`/instagram/competitor-media/${id}/import-candidate/`)
    return r.data
  } catch (e) {
    console.warn('API importCompetitorMedia failed:', e.message)
    // Simulate candidate import on local mock data
    const mItem = MOCK.competitorMedia.find(m => m.id === id)
    if (mItem) {
      const idx = MOCK.media.length + 1
      MOCK.media.unshift({
        id: idx,
        instagram_media_id: `comp_${mItem.instagram_media_id}`,
        account_username: 'oreas_clothing',
        caption: `[Veille - @${mItem.competitor_username}] ${mItem.caption}`,
        media_type: mItem.media_type,
        media_url: mItem.media_url,
        permalink: mItem.permalink,
        posted_at: mItem.posted_at,
        comments_count: mItem.comments_count,
        like_count: mItem.like_count,
        is_candidate: true,
        sync_status: 'synced',
        analysis_status: 'analyzed',
        analysis: {
          comments_count: mItem.comments_count,
          final_score: mItem.engagement_score
        }
      })
    }
    return { message: 'Successfully imported competitor post as Runway candidate (mock).' }
  }
}

export async function promoteCompetitorMedia(id) {
  try {
    const r = await api.post(`/instagram/competitor-media/${id}/promote-candidate/`)
    return r.data
  } catch (e) {
    console.warn('API promoteCompetitorMedia failed:', e.message)
    // Simulate promotion on local mock data
    const mItem = MOCK.competitorMedia.find(m => m.id === id)
    if (mItem) {
      mItem.is_candidate = true
      mItem.selection_source = 'user'
      mItem.ai_score = 85 + Math.floor(Math.random() * 15)
      mItem.selected_at = new Date().toISOString()
    }
    return { message: 'Media promoted to candidates successfully (mock).' }
  }
}

export async function removeCompetitorMediaFromCandidates(id) {
  try {
    const r = await api.post(`/instagram/competitor-media/${id}/remove-candidate/`)
    return r.data
  } catch (e) {
    console.warn('API removeCompetitorMediaFromCandidates failed:', e.message)
    // Simulate removal on local mock data
    const mItem = MOCK.competitorMedia.find(m => m.id === id)
    if (mItem) {
      mItem.is_candidate = false
      mItem.selection_source = null
      mItem.selected_at = null
    }
    return { message: 'Media removed from candidates successfully (mock).' }
  }
}

export async function getPlatformSettings() {
  try {
    const r = await api.get('/core/settings/')
    return r.data
  } catch (e) {
    console.warn('API getPlatformSettings failed:', e.message)
    return {
      candidate_threshold: 85,
      sync_frequency: 'hourly',
      auto_shopify_integration: true,
      analysis_language: 'Français + Darija + Anglais'
    }
  }
}

export async function updatePlatformSettings(settings) {
  try {
    const r = await api.put('/core/settings/1/', settings)
    return r.data
  } catch (e) {
    console.warn('API updatePlatformSettings failed:', e.message)
    return { message: 'Settings updated successfully (mock).' }
  }
}

export async function analyzeCandidateWithAI(mediaId) {
  try {
    const r = await api.post(`/instagram/competitor-media/${mediaId}/ai-analyze/`)
    return r.data
  } catch (e) {
    console.warn('API analyzeCandidateWithAI failed:', e.message)
    // Mock response for development
    return {
      success: true,
      media_id: mediaId,
      analysis: {
        ai_score: 85,
        commercial_potential: "High",
        trend: "Summer Linen",
        target_audience: "Women 20-35",
        manufacturing_difficulty: "Low",
        reproducibility: 88,
        visual_hook: "Strong",
        purchase_intent: "High",
        summary: "Clean minimalist presentation with neutral colors and strong commercial appeal for the Moroccan market.",
        strengths: [
          "Minimalist aesthetic appeals to modern consumer",
          "Neutral color palette versatile for styling",
          "Simple construction reduces manufacturing costs"
        ],
        weaknesses: [
          "Lacks distinctive visual differentiation",
          "May not stand out in crowded market"
        ],
        recommendation: "Test immediately",
        recommended_action: "Launch a Meta Ads validation campaign."
      }
    }
  }
}

export async function analyzeTopCandidatesWithAI(limit = 5) {
  try {
    const r = await api.post('/instagram/competitor-media/ai-analyze-top/', null, {
      params: { limit },
      timeout: 60000 // 60s timeout for batch AI analysis
    })
    return r.data
  } catch (e) {
    console.warn('API analyzeTopCandidatesWithAI failed:', e.message)
    return {
      total_analyzed: 0,
      successful: 0,
      results: {}
    }
  }
}

export async function getProducts() {
  try {
    const r = await api.get('/products/')
    return r.data.results || r.data
  } catch (e) {
    console.warn('API getProducts failed, using mock:', e.message)
    return [
      { id: 1, title: 'Robe Lin Beige', handle: 'robe-lin-beige', price: 450.00, shopify_product_id: 'sh_prod_1', image_url: 'https://picsum.photos/seed/robe-lin-beige/100/100' },
      { id: 2, title: 'Soie Lilas Maxi', handle: 'soie-lilas-maxi', price: 350.00, shopify_product_id: 'sh_prod_2', image_url: 'https://picsum.photos/seed/soie-lilas-maxi/100/100' },
      { id: 3, title: 'Coton Bio Basic Tee', handle: 'coton-bio-basic-tee', price: 220.00, shopify_product_id: 'sh_prod_3', image_url: 'https://picsum.photos/seed/coton-bio-basic-tee/100/100' },
      { id: 4, title: 'Satin Black Dress', handle: 'satin-black-dress', price: 380.00, shopify_product_id: 'sh_prod_4', image_url: 'https://picsum.photos/seed/satin-black-dress/100/100' },
      { id: 5, title: 'Cotton Casual Set', handle: 'cotton-casual-set', price: 250.00, shopify_product_id: 'sh_prod_5', image_url: 'https://picsum.photos/seed/cotton-casual-set/100/100' }
    ]
  }
}

export async function getMarketingAccounts() {
  try {
    const r = await api.get('/marketing/accounts/')
    return r.data.results || r.data
  } catch (e) {
    console.warn('API getMarketingAccounts failed, using mock:', e.message)
    return [{ id: 1, ad_account_id: 'mock_ad_account_1', name: 'OREAS Premium Ad Account', brand: { id: 1, name: 'OREAS', slug: 'oreas' }, is_active: true, last_sync_at: new Date().toISOString() }]
  }
}

export async function getMarketingCampaigns() {
  try {
    const r = await api.get('/marketing/campaigns/')
    return r.data.results || r.data
  } catch (e) {
    console.warn('API getMarketingCampaigns failed, using mock:', e.message)
    return [
      { id: 1, campaign_id: 'mock_ad_account_1_c_camp_01', name: 'MA_Rabat - Robe Lin Beige - Conversions', status: 'ACTIVE', objective: 'CONVERSIONS', linked_product: { id: 1, title: 'Robe Lin Beige' }, created_time: new Date(Date.now() - 45 * 86400000).toISOString(), updated_time: new Date().toISOString() },
      { id: 2, campaign_id: 'mock_ad_account_1_c_camp_02', name: 'EU_Paris - Soie Lilas Maxi - Traffic', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC', linked_product: { id: 2, title: 'Soie Lilas Maxi' }, created_time: new Date(Date.now() - 45 * 86400000).toISOString(), updated_time: new Date().toISOString() },
      { id: 3, campaign_id: 'mock_ad_account_1_c_camp_03', name: 'Morocco - Coton Bio Basic Tee - Retargeting', status: 'ACTIVE', objective: 'CONVERSIONS', linked_product: { id: 3, title: 'Coton Bio Basic Tee' }, created_time: new Date(Date.now() - 45 * 86400000).toISOString(), updated_time: new Date().toISOString() },
      { id: 4, campaign_id: 'mock_ad_account_1_c_camp_04', name: 'MA_Casa - Satin Black Dress - Catalog Sales', status: 'PAUSED', objective: 'OUTCOME_SALES', linked_product: { id: 4, title: 'Satin Black Dress' }, created_time: new Date(Date.now() - 45 * 86400000).toISOString(), updated_time: new Date().toISOString() },
      { id: 5, campaign_id: 'mock_ad_account_1_c_camp_05', name: 'US_LA - Cotton Casual Set - Brand Awareness', status: 'PAUSED', objective: 'OUTCOME_AWARENESS', linked_product: { id: 5, title: 'Cotton Casual Set' }, created_time: new Date(Date.now() - 45 * 86400000).toISOString(), updated_time: new Date().toISOString() }
    ]
  }
}

export async function getMarketingSummary() {
  try {
    const r = await api.get('/marketing/insights/summary/')
    return r.data
  } catch (e) {
    console.warn('API getMarketingSummary failed, using mock:', e.message)
    const seed = () => Math.random()
    const timeline = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0]
      const purchases = 3 + Math.floor(seed() * 8)
      const confirmed = Math.floor(purchases * (0.55 + seed() * 0.2))
      const delivered = Math.floor(confirmed * (0.7 + seed() * 0.2))
      const spend = 100 + Math.floor(seed() * 80)
      const gross = delivered * 420
      const net_profit = gross - spend - delivered * 130 - confirmed * 40 - purchases * 15
      return { date, spend, purchases, confirmed, delivered, roas: +(gross / spend).toFixed(2), net_profit: +net_profit.toFixed(2) }
    })
    return {
      kpis: {
        total_spend: 3450.00,
        total_impressions: 168000,
        total_clicks: 4500,
        total_reach: 125000,
        total_purchases: 112,
        total_purchases_value: 15680.00,
        confirmed_purchases: 74,
        delivered_purchases: 56,
        returned_purchases: 6,
        total_expenses: 10820.00,
        net_profit: 4860.00,
        ctr: 2.68,
        cpc: 0.77,
        cpm: 20.54,
        roas: 4.54,
        net_roas: 2.81,
        cost_per_result: 30.80,
        cancellation_rate: 33.9,
        delivery_failed_rate: 24.3,
        return_rate: 10.7
      },
      timeline
    }
  }
}

export async function getMarketingPredictions() {
  try {
    const r = await api.get('/marketing/insights/predictions/')
    return r.data
  } catch (e) {
    console.warn('API getMarketingPredictions failed, using mock:', e.message)
    return {
      generated_at: new Date().toISOString(),
      test_recommendations: [
        {
          test_id: 'TEST-1001', product_title: 'Robe Lin Beige', shopify_product_id: 'sh_prod_1',
          historical_metrics: { total_spend: 1200, total_purchases: 45, delivered_purchases: 31, cancellation_rate: 31.1, return_rate: 6.4, raw_roas: 3.8, real_roas: 2.6, expenses: 5180.0, net_profit: 2860.0 },
          prediction: { recommendation_status: 'SCALE', recommended_action: 'Increase daily ad spend by 25%. Launch 1% Lookalike Audiences in Morocco.', alert_type: null, details: 'Top performer. Net Profit: $2860.00. Low return rate (6.4%) justifies scaling budget.' }
        },
        {
          test_id: 'TEST-1002', product_title: 'Soie Lilas Maxi', shopify_product_id: 'sh_prod_2',
          historical_metrics: { total_spend: 600, total_purchases: 18, delivered_purchases: 10, cancellation_rate: 27.8, return_rate: 10.0, raw_roas: 1.9, real_roas: 1.05, expenses: 2430.0, net_profit: 950.0 },
          prediction: { recommendation_status: 'OPTIMIZE', recommended_action: 'Refresh creative video hook. Exclude recent buyers.', alert_type: null, details: 'Moderate performance. Net Profit: $950.00. ROAS healthy but scale limited.' }
        },
        {
          test_id: 'TEST-1003', product_title: 'Coton Bio Basic Tee', shopify_product_id: 'sh_prod_3',
          historical_metrics: { total_spend: 300, total_purchases: 15, delivered_purchases: 9, cancellation_rate: 20.0, return_rate: 11.1, raw_roas: 4.6, real_roas: 2.76, expenses: 1875.0, net_profit: 1100.0 },
          prediction: { recommendation_status: 'SCALE', recommended_action: 'Increase budget by 50%. Focus on retargeting warm website traffic.', alert_type: null, details: 'Extremely efficient funnel. Net Profit: $1100.00.' }
        },
        {
          test_id: 'TEST-1004', product_title: 'Satin Black Dress', shopify_product_id: 'sh_prod_4',
          historical_metrics: { total_spend: 450, total_purchases: 30, delivered_purchases: 8, cancellation_rate: 66.7, return_rate: 12.5, raw_roas: 2.7, real_roas: 0.71, expenses: 3200.0, net_profit: -175.0 },
          prediction: { recommendation_status: 'HALT', recommended_action: 'Pause ads. Unit cost or shipping logistics eating entire margins.', alert_type: 'cancellation_bleed', details: 'Warning: 66.7% call center cancellation rate. Net Profit: -$175.00. Cash is bleeding.' }
        },
        {
          test_id: 'TEST-1005', product_title: 'Cotton Casual Set', shopify_product_id: 'sh_prod_5',
          historical_metrics: { total_spend: 100, total_purchases: 2, delivered_purchases: 1, cancellation_rate: 50.0, return_rate: 0, raw_roas: 0.5, real_roas: 0.25, expenses: 430.0, net_profit: -180.0 },
          prediction: { recommendation_status: 'CREATIVE_OVERHAUL', recommended_action: 'Halt current ad sets. Revamp visual aesthetics.', alert_type: 'unprofitable', details: 'Loss-making product test (Net Profit: -$180.00). Expenses exceed delivered revenue.' }
        }
      ],
      creative_rankings: [
        { creative_id: 'cr_creat_01', name: 'Robe Beige - Outdoor Hook', format: 'VIDEO', hook_type: 'outdoor_lifestyle', has_model: true, video_duration: 28, editing_style: 'fast_cuts', image_url: 'https://picsum.photos/seed/creative01/300/400', metrics: { total_spend: 420, ctr: 4.2, cpc: 0.38, purchases: 18, delivered: 14, roas: 4.8, net_profit: 1320.0 } },
        { creative_id: 'cr_creat_02', name: 'Beige Robe - Before/After', format: 'VIDEO', hook_type: 'before_after', has_model: true, video_duration: 45, editing_style: 'smooth', image_url: 'https://picsum.photos/seed/creative02/300/400', metrics: { total_spend: 380, ctr: 3.8, cpc: 0.52, purchases: 15, delivered: 11, roas: 3.9, net_profit: 940.0 } },
        { creative_id: 'cr_creat_03', name: 'Soie Lilas - Unboxing', format: 'VIDEO', hook_type: 'unboxing', has_model: false, video_duration: 35, editing_style: 'cinematic', image_url: 'https://picsum.photos/seed/creative03/300/400', metrics: { total_spend: 310, ctr: 2.9, cpc: 0.71, purchases: 10, delivered: 7, roas: 2.4, net_profit: 460.0 } },
        { creative_id: 'cr_creat_04', name: 'Basic Tee - Bold Text Hook', format: 'IMAGE', hook_type: 'bold_text', has_model: true, video_duration: null, editing_style: 'minimal', image_url: 'https://picsum.photos/seed/creative04/300/400', metrics: { total_spend: 200, ctr: 3.1, cpc: 0.44, purchases: 12, delivered: 9, roas: 3.3, net_profit: 380.0 } },
        { creative_id: 'cr_creat_05', name: 'Satin Dress - Static Carousel', format: 'CAROUSEL', hook_type: 'product_focus', has_model: false, video_duration: null, editing_style: 'minimal', image_url: 'https://picsum.photos/seed/creative05/300/400', metrics: { total_spend: 220, ctr: 1.8, cpc: 0.95, purchases: 8, delivered: 3, roas: 1.5, net_profit: -90.0 } },
        { creative_id: 'cr_creat_06', name: 'Cotton Set - Price Focus', format: 'VIDEO', hook_type: 'price_reveal', has_model: true, video_duration: 20, editing_style: 'fast_cuts', image_url: 'https://picsum.photos/seed/creative06/300/400', metrics: { total_spend: 100, ctr: 0.9, cpc: 1.40, purchases: 2, delivered: 1, roas: 0.5, net_profit: -160.0 } }
      ]
    }
  }
}

export async function triggerMarketingSync(accountId) {
  try {
    const r = await api.post(`/marketing/accounts/${accountId}/sync/`)
    return r.data
  } catch (e) {
    console.warn('API triggerMarketingSync failed:', e.message)
    return { status: 'Sync scheduled (mock).' }
  }
}

export async function triggerGlobalSync() {
  try {
    const r = await api.post('/core/sync-all/')
    return r.data
  } catch (e) {
    console.warn('API triggerGlobalSync failed:', e.message)
    return { status: 'Global sync scheduled (mock).' }
  }
}


export async function linkTestToCampaign(campaignId, testId) {
  try {
    const r = await api.post(`/marketing/campaigns/${campaignId}/link-test/`, { test_id: testId })
    return r.data
  } catch (e) {
    console.warn('API linkTestToCampaign failed:', e.message)
    return { message: 'Linked successfully (mock).' }
  }
}

export async function unlinkTestFromCampaign(campaignId) {
  try {
    const r = await api.post(`/marketing/campaigns/${campaignId}/unlink-test/`)
    return r.data
  } catch (e) {
    console.warn('API unlinkTestFromCampaign failed:', e.message)
    return { message: 'Unlinked successfully (mock).' }
  }
}

export async function getProductTests() {
  try {
    const r = await api.get('/marketing/tests/')
    return r.data.results || r.data
  } catch (e) {
    console.warn('API getProductTests failed, using mock:', e.message)
    return [
      { id: 1, test_id: 'TEST-1001', product: { title: 'Robe Lin Beige' }, status: 'ACTIVE', created_at: new Date(Date.now() - 45 * 86400000).toISOString() },
      { id: 2, test_id: 'TEST-1002', product: { title: 'Soie Lilas Maxi' }, status: 'ACTIVE', created_at: new Date(Date.now() - 30 * 86400000).toISOString() },
      { id: 3, test_id: 'TEST-1003', product: { title: 'Coton Bio Basic Tee' }, status: 'ACTIVE', created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
      { id: 4, test_id: 'TEST-1004', product: { title: 'Satin Black Dress' }, status: 'PAUSED', created_at: new Date(Date.now() - 60 * 86400000).toISOString() },
      { id: 5, test_id: 'TEST-1005', product: { title: 'Cotton Casual Set' }, status: 'CONCLUDED', created_at: new Date(Date.now() - 90 * 86400000).toISOString() }
    ]
  }
}
