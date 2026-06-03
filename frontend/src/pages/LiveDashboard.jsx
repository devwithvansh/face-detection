import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { api, buildWsUrl, storageUrl } from '../services/api.js';

export default function LiveDashboard({ token, onDetections }) {
  const [frame, setFrame]               = useState('');
  const [detections, setDetections]     = useState([]);
  const [cameraId, setCameraId]         = useState('GATE1');
  const [camForm, setCamForm]           = useState({ camera_id: 'GATE1', source: '0' });
  const [activeCameras, setActiveCameras] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ total: 0, entries: 0, exits: 0, inside: 0 });
  const [fps, setFps]                   = useState(0);
  const frameCount = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const { data } = await api.get('/camera/active');
      setActiveCameras(data.cameras || []);
    } catch {/* ignore */}
  }, []);

  const loadAttendanceStats = useCallback(async () => {
    try {
      const [attendanceRes, personnelRes] = await Promise.all([
        api.get('/attendance'),
        api.get('/personnel'),
      ]);
      const data  = attendanceRes.data;
      const total = personnelRes.data.length;
      const entries = data.filter((r) => r.status === 'ENTRY').length;
      const exits   = data.filter((r) => r.status === 'EXIT').length;
      setAttendanceStats({ total, entries, exits, inside: Math.max(0, entries - exits) });

      const sorted = [...data].sort((a, b) => {
        const ta = new Date(a.entry_time || a.timestamp || 0).getTime();
        const tb = new Date(b.entry_time || b.timestamp || 0).getTime();
        return tb - ta;
      });
      setRecentEvents(sorted.slice(0, 8).map((r) => ({
        id: r.id,
        name: r.full_name || `ID ${r.army_id || r.personnel_id}`,
        army_id: r.army_id || r.personnel_id,
        status: r.status,
        time: r.entry_time || r.timestamp,
        photo_path: r.photo_path,
        known: true,
      })));
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    loadCameras();
    loadAttendanceStats();
  }, [loadCameras, loadAttendanceStats]);

  useEffect(() => {
    if (!token) return undefined;
    let ws, ping, reconnectTimer, destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(buildWsUrl('/live', token));
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'frame') {
            frameCount.current += 1;
            setFrame(`data:image/jpeg;base64,${payload.image}`);
            setDetections(payload.detections || []);
            if (onDetections) onDetections(payload.detections || []);
            setCameraId(payload.camera_id || 'GATE1');
          }
          if (payload.type === 'unknown_detected') {
            loadAttendanceStats();
          }
        } catch {/* ignore */}
      };
      ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 15000);
    }

    connect();
    return () => {
      destroyed = true;
      clearInterval(ping);
      clearTimeout(reconnectTimer);
      if (ws) ws.close(1000, 'unmount');
    };
  }, [token, onDetections, loadAttendanceStats]);

  const startCamera = async () => {
    try {
      await api.post('/camera/start', camForm);
      await loadCameras();
    } catch (err) {/* ignore */}
  };

  const stopCamera = async (idToStop) => {
    const target = idToStop || camForm.camera_id;
    try {
      await api.post('/camera/stop', { camera_id: target, source: camForm.source });
      await loadCameras();
    } catch (err) {/* ignore */}
  };

  const primary = detections[0] || null;

  const displayEvents = useMemo(() => {
    const live = detections.slice(0, 4).map((d) => ({
      id: `live-${d.detection_id}`,
      name: d.full_name || 'UNKNOWN SUBJECT',
      army_id: d.army_id || d.unknown_id,
      status: d.known ? (d.status || 'ENTRY') : 'UNKNOWN',
      time: new Date().toISOString(),
      known: d.known,
      photo_path: d.photo_path,
    }));
    const merged = [...live, ...recentEvents];
    const seen = new Set();
    return merged.filter((e) => {
      const key = String(e.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [detections, recentEvents]);

  return (
    <div className="liveDashboard">
      {/* Header Row */}
      <div className="feedHeader">
        <div className="feedTitleArea">
          <div className="feedTitle">LIVE FEED</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--green-bright)', fontSize: 18, letterSpacing: 4 }}>SIGNAL: {cameraId.toUpperCase()}</div>
        </div>
        <div className="topStats">
          <div className="statBox">
            <div className="statBoxLabel">Authorized</div>
            <div className="statBoxValue" style={{ color: 'var(--green-bright)' }}>{detections.filter(d => d.known).length}</div>
          </div>
          <div className="statBox">
            <div className="statBoxLabel">Unidentified</div>
            <div className="statBoxValue" style={{ color: 'var(--red-bright)' }}>{detections.filter(d => !d.known).length}</div>
          </div>
          <div className="statBox">
            <div className="statBoxLabel">Total Hits</div>
            <div className="statBoxValue">{detections.length}</div>
          </div>
        </div>
      </div>

      {/* Main Center Area */}
      <div className="liveCenter">
        <div className="videoContainer">
          {frame ? (
            <img src={frame} alt="Surveillance Feed" />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 24, letterSpacing: 8, position: 'absolute' }}>AWAITING SIGNAL...</div>
          )}
          <div className="videoOverlay">
            <div className="liveBadge">
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite' }} />
              LIVE
            </div>
            <div style={{ marginTop: 15, background: 'rgba(0,0,0,0.85)', color: 'var(--green-bright)', padding: '6px 15px', fontFamily: 'var(--font-mono)', fontSize: 14, border: '1px solid var(--green-dim)' }}>
              FPS: {fps.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Identity Card — only shown when there is an active detection */}
        {primary && (
          <div className="identityCard">
            <div className="identityAvatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: primary.known ? 'var(--green-dim)' : 'var(--red-dim)', fontSize: 40, color: primary.known ? 'var(--green-bright)' : 'var(--red-bright)' }}>★</div>
            <div className="identityInfo">
              <h2>{primary.full_name || 'UNIDENTIFIED'}</h2>
              <div className="identityMeta">
                <div>SERVICE ID: {primary.army_id || 'NOT REGISTERED'}</div>
                <div>RANK/GRADE: {primary.rank || 'N/A'}</div>
                <div>ASSIGNED UNIT: {primary.unit || 'UNKNOWN'}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 900,
                color: primary.known ? 'var(--green-bright)' : 'var(--red-bright)',
                letterSpacing: 2,
                lineHeight: 1.1,
              }}>
                {primary.known ? 'ACCESS GRANTED' : 'LEVEL 1 ALERT'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                CONFIDENCE: {Math.round((primary.confidence || 0) * 100)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar Area */}
      <div className="liveRight">
        {/* Camera Controls */}
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Tactical Controls</div>
          </div>
          <div className="panelBody">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Feed</label>
                <select 
                  style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text)', padding: 12, fontFamily: 'var(--font-mono)', outline: 'none', fontSize: 14 }}
                  value={camForm.camera_id} 
                  onChange={e => setCamForm({...camForm, camera_id: e.target.value})}
                >
                  <option value="GATE1">GATE1 - MAIN ENTRANCE</option>
                  {activeCameras.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 15 }}>
                <button 
                  style={{ flex: 1, height: 54, background: 'var(--green)', color: '#000', border: 'none', fontWeight: 900, fontFamily: 'var(--font-display)', cursor: 'pointer', fontSize: 20, letterSpacing: 2 }}
                  onClick={startCamera}
                >
                  ENGAGE
                </button>
                <button 
                  style={{ flex: 1, height: 54, background: 'var(--red)', color: '#fff', border: 'none', fontWeight: 900, fontFamily: 'var(--font-display)', cursor: 'pointer', fontSize: 20, letterSpacing: 2 }}
                  onClick={() => stopCamera()}
                >
                  ABORT
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="panel" style={{ flex: 1 }}>
          <div className="panelHeader">
            <div className="panelTitle">Mission Log</div>
          </div>
          <div className="panelBody">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayEvents.map(evt => (
                <div key={evt.id} style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '12px', borderBottom: '1px solid var(--border)', background: evt.known ? 'transparent' : 'rgba(229,57,53,0.08)' }}>
                  <div style={{ width: 44, height: 44, border: `1px solid ${evt.known ? 'var(--border2)' : 'var(--red)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: evt.known ? 'var(--green-dim)' : 'var(--red-dim)', flexShrink: 0, fontSize: 20, color: evt.known ? 'var(--green-bright)' : 'var(--red-bright)' }}>★</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: evt.known ? 'var(--text)' : 'var(--red-bright)', textTransform: 'uppercase' }}>{evt.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{evt.army_id} • {evt.status}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{new Date(evt.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Stats Row */}
      <div className="bottomStats">
        {[
          { label: 'Total Personnel', val: attendanceStats.total, icon: '🪖' },
          { label: 'Today Entries', val: attendanceStats.entries, icon: '▲', color: 'var(--green-bright)' },
          { label: 'Today Exits', val: attendanceStats.exits, icon: '▼', color: 'var(--amber)' },
          { label: 'Active Inside', val: attendanceStats.inside, icon: '👥' }
        ].map((s, i) => (
          <div key={i} className="bottomStatItem">
            <div className="bottomStatIcon">{s.icon}</div>
            <div>
              <div className="bottomStatLabel">{s.label}</div>
              <div className="bottomStatValue" style={{ color: s.color || 'var(--text)' }}>{s.val}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}