import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Flame,
  LayoutDashboard,
  Camera,
  Map,
  Bell,
  ChartNoAxesColumn,
  FileText,
  Settings,
  Search,
  UserRound,
  ShieldCheck,
  MapPin,
  Trees,
  Cloud,
  UploadCloud,
  Clock3,
  ChevronDown,
  Menu,
  X,
  Eye,
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ReportsPage, AlertsPage, MapPage, SettingsPage } from './pages.jsx';
import './styles.css';

const PAGES = { Reports: ReportsPage, History: ReportsPage, Alerts: AlertsPage, 'Map View': MapPage, Settings: SettingsPage };

// Vite proxies /api requests to Flask during local development.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_URL = `${API_BASE}/api/predict`;
const DEFAULT_CENTER = [27.18, 31.18]; // Asyut
const RISK_COLOR = { High: 'red', Medium: 'orange', Low: 'green' };
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Live Detection', icon: Camera },
  { label: 'Map View', icon: Map },
  { label: 'Alerts', icon: Bell },
  { label: 'History', icon: ChartNoAxesColumn },
  { label: 'Reports', icon: FileText },
  { label: 'Settings', icon: Settings },
];

function normalizeConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  // Accept either 0–1 or 0–100 confidence values.
  return value <= 1 ? value * 100 : value;
}

function getPredictionLabel(result) {
  const prediction = String(
    result?.class ??
    result?.prediction ??
    result?.label ??
    ''
  ).toLowerCase();

  if (
    prediction.includes('no_fire') ||
    prediction.includes('no fire') ||
    prediction.includes('normal') ||
    prediction.includes('safe') ||
    prediction.includes('no_smoke')
  ) {
    return 'No Fire or Smoke Detected';
  }

  if (
    prediction.includes('fire') ||
    prediction.includes('flame') ||
    prediction.includes('wildfire')
  ) {
    return 'Fire Detected';
  }

  if (prediction.includes('smoke')) {
    return 'Smoke Detected';
  }

  if (
    prediction.includes('no_fire') ||
    prediction.includes('no fire') ||
    prediction.includes('normal') ||
    prediction.includes('safe') ||
    prediction.includes('no_smoke')
  ) {
    return 'No Fire or Smoke Detected';
  }

  return result?.class ?? result?.prediction ?? result?.label ?? 'Unknown Result';
}

function getRiskLevel(result, confidence) {
  const prediction = String(
    result?.class ??
    result?.prediction ??
    result?.label ??
    ''
  ).toLowerCase();

  if (
    prediction.includes('no_fire') ||
    prediction.includes('no fire') ||
    prediction.includes('normal') ||
    prediction.includes('safe') ||
    prediction.includes('no_smoke')
  ) {
    return 'Low';
  }

  if (prediction.includes('fire') || prediction.includes('flame')) {
    if (confidence !== null && confidence >= 80) return 'High';
    if (confidence !== null && confidence >= 50) return 'Medium';
    return 'Needs Review';
  }

  if (prediction.includes('smoke')) {
    if (confidence !== null && confidence >= 80) return 'High';
    if (confidence !== null && confidence >= 50) return 'Medium';
    return 'Needs Review';
  }

  return 'Unknown';
}

function App() {
  const [active, setActive] = useState('Dashboard');
  const Page = PAGES[active];
  const [mobileMenu, setMobileMenu] = useState(false);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('info');

  const [stats, setStats] = useState({ total: 0, fires: 0, smoke: 0, high_risk: 0 });
  const [incidents, setIncidents] = useState([]);
  const [modelInfo, setModelInfo] = useState({});
  const [apiOnline, setApiOnline] = useState(null);
  const [health, setHealth] = useState({});
  const visualRef = useRef(null);
  const [imgNat, setImgNat] = useState(null);
  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const h = () => setResizeTick((t) => t + 1);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Convert the model's normalized bbox to pixels over the displayed (object-fit: contain) image
  const boxStyle = (d) => {
    const el = visualRef.current;
    if (!el || !imgNat || !d?.bbox) return null;
    const cw = el.clientWidth, ch = el.clientHeight;
    const sc = Math.min(cw / imgNat.w, ch / imgNat.h);
    const dw = imgNat.w * sc, dh = imgNat.h * sc;
    const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    return { left: ox + d.bbox[0] * dw, top: oy + d.bbox[1] * dh, width: (d.bbox[2] - d.bbox[0]) * dw, height: (d.bbox[3] - d.bbox[1]) * dh };
  };

  const refresh = async () => {
    try {
      const [st, inc, mi, hl] = await Promise.all([
        fetch(`${API_BASE}/api/stats`).then((r) => r.json()),
        fetch(`${API_BASE}/api/incidents?limit=100`).then((r) => r.json()),
        fetch(`${API_BASE}/api/model-info`).then((r) => r.json()),
        fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      ]);
      setStats(st); setIncidents(inc); setModelInfo(mi); setHealth(hl); setApiOnline(true);
    } catch { setApiOnline(false); }
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, []);

  const activity = useMemo(() => incidents.slice(0, 8).map((i) => ({
    type: `${i.label === 'fire' ? 'Fire' : 'Smoke'} detected`, place: i.location || 'Unknown',
    time: ago(i.created_at), risk: i.risk, color: RISK_COLOR[i.risk] || 'green',
    icon: i.label === 'fire' ? Flame : Cloud,
  })), [incidents]);

  const chartData = useMemo(() => {
    const days = [...Array(7)].map((_, k) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - k));
      return { key: d.toDateString(), day: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), fires: 0, smoke: 0 };
    });
    incidents.forEach((i) => { const row = days.find((d) => d.key === new Date(i.created_at).toDateString()); if (row) row[i.label === 'fire' ? 'fires' : 'smoke']++; });
    return days;
  }, [incidents]);

  const filteredActivity = useMemo(() => {
    const query = search.toLowerCase();

    return activity.filter((item) =>
      `${item.type} ${item.place} ${item.risk}`
        .toLowerCase()
        .includes(query)
    );
  }, [search, activity]);

  const predictionLabel = result ? getPredictionLabel(result) : '';
  const confidence = result
    ? normalizeConfidence(
        result.confidence ??
        result.confidence_score ??
        result.score
      )
    : null;

  const riskLevel = result
    ? (result.risk && result.risk !== 'None' ? result.risk : getRiskLevel(result, confidence))
    : '—';

  const isFire = predictionLabel === 'Fire Detected';
  const isSmoke = predictionLabel === 'Smoke Detected';
  const isPositive = isFire || isSmoke;

  const onFile = (event) => {
    const selected = event.target.files?.[0];

    if (!selected) return;

    if (!selected.type.startsWith('image/')) {
      setNotice('Please choose a valid image file, such as JPG, PNG, or WEBP.');
      setNoticeType('error');
      event.target.value = '';
      return;
    }

    // Optional size limit: 10 MB.
    if (selected.size > 10 * 1024 * 1024) {
      setNotice('The image is too large. Please choose an image smaller than 10 MB.');
      setNoticeType('error');
      event.target.value = '';
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setNotice('');
    setNoticeType('info');
  };

  const analyze = async () => {
    if (!file) {
      setNotice('Please upload an image first.');
      setNoticeType('error');
      return;
    }

    setLoading(true);
    setResult(null);
    setNotice('');
    setNoticeType('info');

    try {
      const formData = new FormData();

      // The Flask backend must expect the uploaded file under "image".
      formData.append('image', file);
      formData.append('location', 'Asyut, Egypt');
      formData.append('lat', DEFAULT_CENTER[0] + (Math.random() - 0.5) * 0.2);
      formData.append('lon', DEFAULT_CENTER[1] + (Math.random() - 0.5) * 0.2);

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          data.message ||
          `Analysis failed with status ${response.status}.`
        );
      }

      // Do not display a made-up prediction if the API response is empty.
      const prediction =
        data.class ??
        data.prediction ??
        data.label;

      if (!prediction) {
        throw new Error(
          'The API responded, but no prediction was returned. Check the backend response format.'
        );
      }

      setResult(data);
      setNotice(data.mock ? 'Backend is in MOCK mode (no model weights) - this result is random.' : 'Image analysis completed successfully.');
      refresh();
      setNoticeType('success');
    } catch (error) {
      console.error('SmokeGuard API error:', error);

      if (
        error instanceof TypeError ||
        String(error.message).toLowerCase().includes('failed to fetch')
      ) {
        setNotice(
          'Cannot connect to the Flask backend. Start the backend and check the API URL.'
        );
      } else {
        setNotice(error.message || 'Something went wrong during image analysis.');
      }

      setNoticeType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="Close menu"
        />
      )}

      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Flame size={26} fill="currentColor" />
          </div>

          <div>
            <div className="brand-name">
              SmokeGuard <span>AI</span>
            </div>
            <div className="brand-subtitle">Forest Fire Detection</div>
          </div>

          <button
            className="close-menu"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map(({ label, icon: Icon, badge }) => (
            <button
              key={label}
              className={`nav-item ${active === label ? 'active' : ''}`}
              onClick={() => {
                setActive(label);
                setMobileMenu(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {badge && <b className="nav-badge">{badge}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot" />
            <div>
              <b>{apiOnline ? 'System Operational' : apiOnline === false ? 'API Offline' : 'Connecting…'}</b>
              <small>{apiOnline ? (health.model === 'mock' ? 'Model: mock mode' : 'AI model active') : 'start the Flask backend'}</small>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">
              <UserRound size={21} />
            </div>
            <div>
              <b>Hossam Shaban</b>
              <small>Administrator</small>
            </div>
            <ChevronDown size={16} className="profile-chevron" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger"
              onClick={() => setMobileMenu(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div>
              <div className="page-eyebrow">MONITORING CENTER</div>
              <h1>{active}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search location, incident..."
              />
            </label>

            <div className="weather">
              <span className="sun">☀</span>
              <div>
                <b>26°C</b>
                <small>Asyut, Egypt</small>
              </div>
            </div>

            <div className="date-chip">
              <div className="date-icon">
                <Clock3 size={19} />
              </div>
              <div>
                <b>SmokeGuard AI</b>
                <small>Monitoring Dashboard</small>
              </div>
            </div>

            <button className="user-button" aria-label="User profile">
              <UserRound size={19} />
            </button>
          </div>
        </header>

        <section className="page-content">
          {active !== 'Dashboard' && !Page && (
            <div className="section-banner">
              <div>
                <b>{active}</b>
                <p>
                  This section is currently part of the frontend prototype.
                </p>
              </div>

              <button
                className="outline-button"
                onClick={() => setActive('Dashboard')}
              >
                Back to Dashboard
              </button>
            </div>
          )}

          {Page ? <Page incidents={incidents} apiOnline={apiOnline} health={health} /> : (<>
          <div className="stats-grid">
            <StatCard
              icon={Flame}
              title="Active Fires"
              value={String(stats.fires)}
              trend={`${stats.total} total detections`}
              tone="red"
            />

            <StatCard
              icon={ShieldCheck}
              title="Model mAP@50"
              value={modelInfo.map50 ? `${(modelInfo.map50 * 100).toFixed(1)}%` : "—"}
              trend={modelInfo.map50 ? "from validation set" : "train model to see metrics"}
              tone="green"
            />

            <StatCard
              icon={MapPin}
              title="High Risk Incidents"
              value={String(stats.high_risk)}
              trend="fire confidence ≥ 60%"
              tone="blue"
            />

            <StatCard
              icon={Cloud}
              title="Smoke Events"
              value={String(stats.smoke)}
              trend={apiOnline === false ? "API offline" : "from stored incidents"}
              tone="purple"
            />
          </div>

          <div className="primary-grid">
            <section className="panel live-panel">
              <PanelTitle
                icon={Camera}
                title="Image Detection"
                trailing={
                  <span className="live-pill">
                    <span />
                    {apiOnline === false ? 'API OFFLINE' : health.model === 'mock' ? 'MOCK MODE' : 'MODEL ACTIVE'}
                  </span>
                }
              />

              <div className="detection-visual" ref={visualRef} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile({ target: { files: e.dataTransfer.files, value: '' } }); }}>
                {preview ? (
                  <img
                    src={preview}
                    alt="Selected image for analysis"
                    className="detection-image"
                    style={{ objectFit: 'contain' }}
                    onLoad={(e) => setImgNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                  />
                ) : (
                  <div className="forest-placeholder">
                    <div className="forest-sunlight" />
                    <div className="smoke smoke-one" />
                    <div className="smoke smoke-two" />
                    <div className="fire-glow" />
                    <div className="tree-line tree-back" />
                    <div className="tree-line tree-front" />
                  </div>
                )}

                {result?.detections?.map((d, i) => {
                  const st = boxStyle(d);
                  return st ? (
                    <div key={i} className="detection-box" style={{ ...st, borderColor: d.label === 'fire' ? '#ff4c43' : '#fb923c' }}>
                      <span style={{ background: d.label === 'fire' ? '#e83b3b' : '#e0861f', ...(st.top < 64 ? (st.height > 120 ? { top: Math.max(4, 66 - st.top), left: 0, borderRadius: '0 4px 4px 0' } : { top: 'auto', bottom: 0, left: 0, borderRadius: '0 4px 0 0' }) : {}) }}>
                        {d.label.toUpperCase()} {(d.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ) : null;
                })}

                <div className="visual-caption">
                  <span className="caption-dot" />
                  <span className="caption-filename">
                    {preview ? file?.name : 'Upload an image to analyze'}
                  </span>
                  <span className="caption-right">
                    {loading
                      ? 'Analyzing...'
                      : result
                        ? 'Analysis complete'
                        : 'Awaiting image'}
                  </span>
                </div>

                <label className="upload-overlay">
                  <UploadCloud size={16} />
                  <span>{preview ? 'Change Image' : 'Upload Image'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={onFile}
                    disabled={loading}
                  />
                </label>
              </div>

              <div className="detection-footer">
                <div className="mini-status">
                  <span className="status-dot" />
                  <span>
                    {loading
                      ? 'Sending image to the AI backend'
                      : result
                        ? `Backend returned a prediction${result?.detections?.length ? ': ' + result.detections.map((d) => `${d.label} ${(d.confidence * 100).toFixed(1)}%`).join(', ') : ''}`
                        : 'Ready for image analysis'}
                  </span>
                </div>

                <button
                  className="primary-button"
                  onClick={analyze}
                  disabled={loading || !file}
                >
                  {loading ? (
                    <LoaderCircle size={16} className="loading-icon" />
                  ) : (
                    <Eye size={16} />
                  )}

                  {loading ? 'Analyzing image...' : 'Analyze Image'}
                </button>
              </div>

              {notice && (
                <div
                  className={`notice ${
                    noticeType === 'success'
                      ? 'notice-success'
                      : noticeType === 'error'
                        ? 'notice-error'
                        : ''
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {notice}
                </div>
              )}
            </section>

            <section className="panel map-panel">
              <PanelTitle
                icon={Map}
                title="Map View"
                trailing={
                  <button
                    className="text-button"
                    onClick={() => setActive('Map View')}
                  >
                    Open map <span>↗</span>
                  </button>
                }
              />

              <div className="real-map">
                <MapContainer center={DEFAULT_CENTER} zoom={8} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {incidents.filter((i) => i.lat && i.lon).map((i) => (
                    <CircleMarker key={i.id} center={[i.lat, i.lon]} radius={9}
                      pathOptions={{ color: i.risk === 'High' ? '#f04438' : i.risk === 'Medium' ? '#fb923c' : '#22c58b', fillOpacity: 0.7 }}>
                      <Popup><b>{i.label} - {i.risk}</b><br />{i.location}<br />{ago(i.created_at)}</Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            </section>
          </div>

          <div className="secondary-grid">
            <section className="panel chart-panel">
              <PanelTitle
                icon={ChartNoAxesColumn}
                title="Detection Activity"
                trailing={
                  <span className="demo-chip">LAST 7 DAYS</span>
                }
              />

              <div className="chart-summary">
                <b>{chartData.reduce((n, d) => n + d.fires + d.smoke, 0)} <small>detections</small></b>
                <span className="chart-change">from stored incidents</span>
              </div>

              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    barGap={4}
                    margin={{ top: 10, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#26394b"
                    />

                    <XAxis
                      dataKey="day"
                      tick={{ fill: '#8fa2b8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      tick={{ fill: '#8fa2b8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        background: '#101e2d',
                        border: '1px solid #31475b',
                        borderRadius: 10,
                        color: '#f1f5f9',
                      }}
                    />

                    <Bar
                      dataKey="fires"
                      name="Fires"
                      fill="#f04438"
                      radius={[4, 4, 0, 0]}
                    />

                    <Bar
                      dataKey="smoke"
                      name="Smoke"
                      fill="#f99b37"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-legend">
                <span><i className="legend-dot red-dot" /> Fires</span>
                <span><i className="legend-dot orange-dot" /> Smoke</span>
              </div>
            </section>

            <section className="panel activity-panel">
              <PanelTitle
                icon={Bell}
                title="Recent Activity"
                trailing={
                  <button
                    className="text-button"
                    onClick={() => setActive('History')}
                  >
                    View all <span>↗</span>
                  </button>
                }
              />

              <div className="activity-list">
                {filteredActivity.length ? (
                  filteredActivity.map((item, index) => (
                    <ActivityRow
                      key={`${item.place}-${index}`}
                      item={item}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    No incidents match your search.
                  </div>
                )}
              </div>

              <div className="activity-footer">
                <span>
                  Showing {filteredActivity.length} recent incidents
                </span>
                <button onClick={() => setActive('History')}>
                  View incident history
                </button>
              </div>
            </section>

            <section className="panel result-panel">
              <PanelTitle
                icon={ShieldCheck}
                title="Detection Result"
                trailing={
                  <span
                    className={`result-status ${
                      result ? 'result-status-live' : ''
                    }`}
                  >
                    {loading
                      ? 'Analyzing'
                      : result
                        ? 'API result'
                        : 'No analysis yet'}
                  </span>
                }
              />

              <div className="result-content">
                <div className="result-image">
                  {preview ? (
                    <img src={preview} alt="Selected image" />
                  ) : (
                    <div className="result-image-placeholder">
                      <Flame size={35} />
                      <span>Image preview</span>
                    </div>
                  )}
                </div>

                <div className="result-details">
                  <div className="result-headline">
                    <div className="result-fire-icon">
                      {result && !isPositive ? (
                        <CheckCircle2 size={22} />
                      ) : (
                        <Flame size={22} fill="currentColor" />
                      )}
                    </div>

                    <div>
                      <b>
                        {loading
                          ? 'Analyzing image...'
                          : result
                            ? predictionLabel
                            : 'Waiting for image'}
                      </b>

                      <small>
                        {loading
                          ? 'Waiting for the backend response'
                          : result
                            ? confidence !== null
                              ? `Confidence: ${confidence.toFixed(1)}%`
                              : 'Prediction received; confidence not provided'
                            : 'Upload an image to begin'}
                      </small>
                    </div>
                  </div>

                  <div className="result-row">
                    <MapPin size={15} />
                    <span>Image</span>
                    <b>{file ? file.name : '—'}</b>
                  </div>

                  <div className="result-row">
                    <AlertTriangle size={15} />
                    <span>Risk level</span>
                    <b
                      className={
                        riskLevel === 'High' ? 'high-risk' : ''
                      }
                    >
                      {result ? riskLevel : '—'}
                    </b>
                  </div>

                  <div className="result-row">
                    <Clock3 size={15} />
                    <span>Analysis time</span>
                    <b>{result ? new Date().toLocaleTimeString() : '—'}</b>
                  </div>

                  <button
                    className="outline-button full-width"
                    onClick={() => setActive('Map View')}
                  >
                    <Map size={16} /> View on Map
                  </button>
                </div>
              </div>

              <div className="demo-disclaimer">
                <AlertTriangle size={13} />
                {result
                  ? 'Prediction received from the configured API. Accuracy depends on the trained model.'
                  : 'No AI prediction is shown until the backend returns a result.'}
              </div>
            </section>
          </div>

          </>)}
          <footer className="footer-note">
            <span>© 2026 SmokeGuard AI</span>
            <span>
              <span className="status-dot" />
              API availability is checked when you run an analysis
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, trend, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon
          size={22}
          fill={tone === 'red' ? 'currentColor' : 'none'}
        />
      </div>

      <div className="stat-info">
        <span>{title}</span>
        <strong>{value}</strong>
        <small
          className={
            tone === 'red'
              ? 'trend-red'
              : tone === 'green'
                ? 'trend-green'
                : tone === 'blue'
                  ? 'trend-blue'
                  : 'trend-purple'
          }
        >
          {trend}
        </small>
      </div>

      <div className={`stat-spark ${tone}`}>
        <svg viewBox="0 0 72 28" preserveAspectRatio="none">
          <polyline
            points="1,23 12,18 21,20 31,10 42,15 53,6 62,10 71,2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, trailing }) {
  return (
    <div className="panel-title">
      <div className="panel-title-main">
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

function ActivityRow({ item }) {
  const Icon = item.icon;

  return (
    <div className="activity-row">
      <div className={`activity-icon ${item.color}`}>
        <Icon size={17} />
      </div>

      <div className="activity-main">
        <b>{item.type}</b>
        <span>
          <MapPin size={12} />
          {item.place}
        </span>
      </div>

      <span className={`risk-pill ${item.color}`}>
        {item.risk}
      </span>

      <small className="activity-time">{item.time}</small>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);