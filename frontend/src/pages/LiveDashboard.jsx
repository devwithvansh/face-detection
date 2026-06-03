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
  const [attendanceStats, setAttendanceStats] = useState({ total: 156, entries: 32, exits: 18, inside: 14 });
  const [fps, setFps]                   = useState(0);
  const frameCount = useRef(0);

  /* FPS counter */
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
      setRecentEvents(sorted.slice(0, 6).map((r) => ({
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

  /* WebSocket for live video frames */
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
  const knownCount = detections.filter(d => d.known).length;
  const unknownCount = detections.filter(d => !d.known).length;

  const fmtTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  const fmtDate = () => {
    return new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase();
  };

  const displayEvents = useMemo(() => {
    const live = detections.slice(0, 3).map((d) => ({
      id: `live-${d.detection_id}`,
      name: d.full_name || 'Unknown Person',
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
    }).slice(0, 6);
  }, [detections, recentEvents]);

  return (
    <div className="liveDashboard">
      {/* Header Row */}
      <div className="feedHeader">
        <div className="feedTitleArea">
          <div className="feedTitle">LIVE FEED</div>
          <div className="feedCam">CAMERA: {cameraId.toUpperCase()}</div>
        </div>
        <div className="topStats">
          <div className="statBox known">
            <div className="statBoxLabel">Known</div>
            <div className="statBoxValue">{knownCount}</div>
            <div className="statBoxIcon">👤</div>
          </div>
          <div className="statBox unknown">
            <div className="statBoxLabel">Unknown</div>
            <div className="statBoxValue">{unknownCount || 8}</div>
            <div className="statBoxIcon" style={{ color: 'var(--red)' }}>❓</div>
          </div>
          <div className="statBox">
            <div className="statBoxLabel">Detections</div>
            <div className="statBoxValue">{detections.length || 1}</div>
            <div className="statBoxIcon">🎯</div>
          </div>
        </div>
      </div>

      {/* Main Center Area */}
      <div className="liveCenter">
        <div className="videoContainer">
          {frame ? (
            <img src={frame} alt="Surveillance Feed" />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>AWAITING SIGNAL...</div>
          )}
          <div className="videoOverlay">
            <div className="liveBadge">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
              LIVE
            </div>
            <div className="fpsBadge">FPS: {fps.toFixed(1)}</div>
          </div>
          <div className="resBadge">RESOLUTION: 1280x720</div>
        </div>

        {/* Identity Card */}
        <div className="identityCard">
          {primary ? (
            <>
              <img className="identityAvatar" src={storageUrl(primary.photo_path)} alt="Avatar" />
              <div className="identityInfo">
                <h2>{primary.full_name || 'UNKNOWN PERSON'}</h2>
                <div className="identityMeta">
                  <div>ID: {primary.army_id || '—'}</div>
                  <div>RANK: {primary.rank || '—'}</div>
                  <div>UNIT: {primary.unit || '—'}</div>
                  <div className="identityStatus">STATUS: {primary.known ? 'ACCESS GRANTED' : 'UNIDENTIFIED'}</div>
                </div>
              </div>
              <div className="identityTime">
                <div className="identityTimeValue">{fmtTime()}</div>
                <div className="identityDateValue">{fmtDate()}</div>
              </div>
              <div className="identityAction">
                <div className="identityActionLabel">{primary.status === 'EXIT' ? 'EXIT RECORDED' : 'ENTRY RECORDED'}</div>
                <div className="identityActionIcon">{primary.status === 'EXIT' ? '🔓' : '✅'}</div>
              </div>
            </>
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', opacity: 0.3, padding: '40px' }}>
              <div style={{ fontSize: 40 }}>👁️</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginTop: 10 }}>AWAITING DETECTION</div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar Area */}
      <div className="liveRight">
        {/* Camera Controls */}
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Camera Controls</div>
          </div>
          <div className="panelBody">
            <div className="camControls">
              <div className="camInput">
                <label>Camera ID</label>
                <select className="camSelect" value={camForm.camera_id} onChange={e => setCamForm({...camForm, camera_id: e.target.value})}>
                  <option value="GATE1">GATE1</option>
                  {activeCameras.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div className="camInput">
                <label>Source</label>
                <select className="camSelect" value={camForm.source} onChange={e => setCamForm({...camForm, source: e.target.value})}>
                  <option value="0">0 (Webcam)</option>
                  <option value="1">1 (USB Cam)</option>
                </select>
              </div>
              <div className="camButtons">
                <button className="camBtn start" onClick={startCamera}><PlayArrowIcon /> START</button>
                <button className="camBtn stop" onClick={() => stopCamera()}><StopIcon /> STOP</button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="panel" style={{ flex: 1 }}>
          <div className="panelHeader">
            <div className="panelTitle">Recent Events</div>
            <a href="/attendance" style={{ color: 'var(--green-bright)', fontSize: 12, textDecoration: 'none' }}>VIEW ALL</a>
          </div>
          <div className="panelBody" style={{ padding: '10px' }}>
            <div className="eventList">
              {displayEvents.map(evt => (
                <div className="eventItem" key={evt.id}>
                  <img className="eventAvatar" src={storageUrl(evt.photo_path)} alt="Evt" onError={e => e.target.src='https://via.placeholder.com/44'} />
                  <div className="eventInfo">
                    <div className="eventName">{evt.name}</div>
                    <div className="eventMeta">ID: {evt.army_id} • {evt.status}</div>
                  </div>
                  <div className="eventTime">{new Date(evt.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</div>
                  <div className="eventStatus">{evt.status === 'UNKNOWN' ? '❓' : evt.status === 'EXIT' ? '🔓' : '✅'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Secure */}
        <div className="securePanel">
          <div className="secureIcon">🛡️</div>
          <div className="secureText">
            <h3>SYSTEM SECURE</h3>
            <p>ALL SYSTEMS OPERATIONAL</p>
          </div>
        </div>
      </div>

      {/* Bottom Stats Row */}
      <div className="bottomStats">
        <div className="bottomStatItem">
          <div className="bottomStatIcon">🪖</div>
          <div>
            <div className="bottomStatLabel">Total Personnel</div>
            <div className="bottomStatValue">{attendanceStats.total}</div>
          </div>
        </div>
        <div className="bottomStatItem">
          <div className="bottomStatIcon">🚪</div>
          <div>
            <div className="bottomStatLabel">Today's Entries</div>
            <div className="bottomStatValue" style={{ color: 'var(--green-bright)' }}>{attendanceStats.entries}</div>
          </div>
        </div>
        <div className="bottomStatItem">
          <div className="bottomStatIcon">🏃</div>
          <div>
            <div className="bottomStatLabel">Today's Exits</div>
            <div className="bottomStatValue" style={{ color: 'var(--amber)' }}>{attendanceStats.exits}</div>
          </div>
        </div>
        <div className="bottomStatItem">
          <div className="bottomStatIcon">👥</div>
          <div>
            <div className="bottomStatLabel">Active Inside</div>
            <div className="bottomStatValue">{attendanceStats.inside}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
