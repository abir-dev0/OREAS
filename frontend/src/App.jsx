import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Sidebar from './components/Sidebar'
import Overview from './pages/Overview'
import Instagram from './pages/Instagram'
import Candidats from './pages/Candidats'
import Analyses from './pages/Analyses'
import Connexion from './pages/Connexion'
import Parametres from './pages/Parametres'
import Veille from './pages/Veille'
import Marketing from './pages/Marketing'

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar />
        <div className="main-content">
          <Routes>
            <Route path="/"           element={<Overview />} />
            <Route path="/instagram"  element={<Instagram />} />
            <Route path="/candidats"  element={<Candidats />} />
            <Route path="/marketing"  element={<Marketing />} />
            <Route path="/analyses"   element={<Analyses />} />
            <Route path="/connexion"  element={<Connexion />} />
            <Route path="/parametres" element={<Parametres />} />
            <Route path="/veille"     element={<Veille />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
