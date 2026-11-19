import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

const KEY = 'sg_prefs';
const DEF = { name: '', riskFilter: 'All' };
const prefs = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEF; } };
const HEX = { High: '#f04438', Medium: '#fb923c', Low: '#22c58b' };
const CLR = { High: 'red', Medium: 'orange', Low: 'green' };
const fmt = (iso) => new Date(iso).toLocaleString();
const Empty = ({ t }) => <div className="empty-state">{t}</div>;
const DemoNote = () => <div className="notice">Locations are randomly assigned demo forest sites (uploaded images carry no GPS). They are not real fire locations.</div>;
const Bar = ({ children }) => <div className="filter-bar">{children}</div>;
const RiskSelect = ({ v, set }) => <select value={v} onChange={(e) => set(e.target.value)}>{['All', 'High', 'Medium', 'Low'].map((r) => <option key={r}>{r}</option>)}</select>;
const Panel = ({ title, right, children }) => <section className="panel"><div className="panel-title"><div className="panel-title-main"><h2>{title}</h2></div>{right}</div>{children}</section>;

export function ReportsPage({ incidents, apiOnline }) {
  const [q, setQ] = useState(''); const [risk, setRisk] = useState(prefs().riskFilter);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [open, setOpen] = useState(null);
  const rows = useMemo(() => incidents.filter((i) => (risk === 'All' || i.risk === risk)
    && (!q || `${i.label} ${i.location}`.toLowerCase().includes(q.toLowerCase()))
    && (!from || new Date(i.created_at) >= new Date(from)) && (!to || new Date(i.created_at) <= new Date(`${to}T23:59:59`))), [incidents, q, risk, from, to]);
  const csv = () => {
    const head = ['id', 'time', 'type', 'risk', 'confidence', 'location', 'lat', 'lon'];
    const body = rows.map((i) => [i.id, i.created_at, i.label, i.risk, i.confidence, i.location, i.lat, i.lon].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }));
    a.download = 'smokeguard-incidents.csv'; a.click();
  };
  return <Panel title={`Incident reports (${rows.length})`} right={<button className="outline-button" onClick={csv} disabled={!rows.length}><Download size={14} /> Export CSV</button>}>
    <Bar><input placeholder="Search type or location" value={q} onChange={(e) => setQ(e.target.value)} /><RiskSelect v={risk} set={setRisk} />
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Bar>
    {apiOnline === false ? <Empty t="API offline. Start the Flask backend to load incidents." /> : !rows.length ? <Empty t="No incidents match the filters." /> :
      <div className="table-wrap"><table className="report-table"><thead><tr><th>Time</th><th>Type</th><th>Risk</th><th>Confidence</th><th>Location</th></tr></thead><tbody>
        {rows.map((i) => <React.Fragment key={i.id}><tr onClick={() => setOpen(open === i.id ? null : i.id)}><td>{fmt(i.created_at)}</td><td>{i.label}</td>
          <td><span className={`risk-pill ${CLR[i.risk]}`}>{i.risk}</span></td><td>{(i.confidence * 100).toFixed(1)}%</td><td>{i.location}</td></tr>
          {open === i.id && <tr><td colSpan={5} className="detail-row">ID {i.id} · Coordinates (demo) {i.lat?.toFixed(4)}, {i.lon?.toFixed(4)} · Image: {i.image}</td></tr>}</React.Fragment>)}
      </tbody></table></div>}
    <DemoNote />
  </Panel>;
}

export function AlertsPage({ incidents, apiOnline }) {
  const [read, setRead] = useState(() => new Set()); const [sev, setSev] = useState(prefs().riskFilter); const [sort, setSort] = useState('new');
  const rank = { High: 3, Medium: 2, Low: 1 };
  const list = useMemo(() => incidents.filter((i) => sev === 'All' || i.risk === sev).slice().sort((a, b) =>
    sort === 'sev' ? rank[b.risk] - rank[a.risk] : (new Date(b.created_at) - new Date(a.created_at)) * (sort === 'old' ? -1 : 1)), [incidents, sev, sort]);
  const unread = list.filter((i) => !read.has(i.id)).length;
  return <Panel title={`Alerts (${unread} unread)`} right={<button className="outline-button" onClick={() => setRead(new Set(incidents.map((i) => i.id)))}>Mark all read</button>}>
    <Bar><RiskSelect v={sev} set={setSev} /><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Newest</option><option value="old">Oldest</option><option value="sev">Severity</option></select></Bar>
    {apiOnline === false ? <Empty t="API offline. Start the Flask backend to load alerts." /> : !list.length ? <Empty t="No alerts." /> :
      <div className="activity-list">{list.map((i) => <div key={i.id} className="activity-row" style={{ opacity: read.has(i.id) ? 0.55 : 1, cursor: 'pointer' }} onClick={() => setRead(new Set(read).add(i.id))}>
        <div className="activity-main"><b>{i.label === 'fire' ? 'Fire' : 'Smoke'} detected · {(i.confidence * 100).toFixed(0)}%</b><span>{i.location} · {fmt(i.created_at)}</span></div>
        <span className={`risk-pill ${CLR[i.risk]}`}>{i.risk}</span></div>)}</div>}
    <div className="notice">Alerts are generated from stored detections and shown here only. No email or SMS is sent. Read state is not saved.</div>
  </Panel>;
}

export function MapPage({ incidents }) {
  const [risk, setRisk] = useState('All');
  const pts = incidents.filter((i) => i.lat && i.lon && (risk === 'All' || i.risk === risk));
  return <Panel title={`Incident map (${pts.length})`} right={<RiskSelect v={risk} set={setRisk} />}>
    <div className="real-map" style={{ height: 520 }}><MapContainer center={[20, 10]} zoom={2} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pts.map((i) => <CircleMarker key={i.id} center={[i.lat, i.lon]} radius={10} pathOptions={{ color: HEX[i.risk], fillOpacity: 0.7 }}>
        <Popup><b>{i.label} · {i.risk}</b><br />{(i.confidence * 100).toFixed(1)}% · {fmt(i.created_at)}<br />{i.lat.toFixed(4)}, {i.lon.toFixed(4)} (demo)</Popup></CircleMarker>)}
    </MapContainer></div>
    {!pts.length && <Empty t="No incidents to show." />}
    <div className="filter-bar">{Object.entries(HEX).map(([k, c]) => <span key={k}><i className="legend-dot" style={{ background: c }} /> {k}</span>)}</div>
    <DemoNote />
  </Panel>;
}

export function SettingsPage({ apiOnline, health }) {
  const [p, setP] = useState(prefs()); const [msg, setMsg] = useState('');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(p)); setMsg('Saved in this browser only.'); } catch { setMsg('Could not save.'); } };
  return <Panel title="Settings">
    <div className="settings-grid">
      <label>Display name<input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
      <label>Default risk filter (Reports, Alerts)<RiskSelect v={p.riskFilter} set={(v) => setP({ ...p, riskFilter: v })} /></label>
      <div><button className="primary-button" onClick={save}>Save</button> <button className="outline-button" onClick={() => { setP(DEF); localStorage.removeItem(KEY); setMsg('Reset.'); }}>Reset</button> <small>{msg}</small></div>
    </div>
    <div className="notice">These settings are stored in your browser only (not in the backend). Login, language and notification delivery are not implemented.</div>
    <div className="settings-grid"><b>Application info</b>
      <span>API URL: {import.meta.env.VITE_API_BASE_URL || '(dev proxy)'}</span><span>API status: {apiOnline === null ? 'checking' : apiOnline ? 'online' : 'offline'}</span>
      <span>Model: {health?.model || 'unknown'} · Storage: {health?.storage || '-'} · Database: {health?.database || '-'}</span></div>
  </Panel>;
}