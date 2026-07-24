export default function KPITile({ label, value, change, changeDir = 'up', gradient = false }) {
  const isUp = changeDir === 'up';
  
  return (
    <div className={`kpi-tile fade-in${gradient ? ' gradient' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {change && (
        <div className={`kpi-change ${isUp ? 'up' : 'down'}`}>
          <span>{isUp ? '↑' : '↓'} {change}</span>
        </div>
      )}
    </div>
  )
}
