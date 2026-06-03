import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { api, buildWsUrl, storageUrl } from '../services/api.js';

export default function LiveDashboard({ token, onDetections }) {
  const [frame, setFrame]               = useState('');
  const [detections, setDetections]     = useState([]);
  const [cameraId, setCameraId]         = useState('—');
  const [feedActive, setFeedActive]     = useState(false);
  const [camForm, setCamForm]           = useState({ camera_id: 'GATE1', source: '0' });
  const [activeCameras, setActiveCameras] = useState([]);
  const [camMessage, setCamMessage]     = useState('');
  const [recentEvents, setRecentEvents] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ total: 0, entries: 0, exits: 0, inside: 0 });
  const [fps, setFps]                   = useState(0);
  const frameCount = useRef(0);
  const fpsTimer   = useRef(null);

  /* FPS counter */
  useEffect(() => {
    fpsTimer.current = setInterval(() => {
      setFps(frameCount.current);
      frameCount.current = 0;
    }, 1000);
    return () => clearInterval(fpsTimer.current);
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
      ws.onopen  = () => setFeedActive(true);
      ws.onclose = (evt) => {
        setFeedActive(false);
        clearInterval(ping);
        if (!destroyed && evt.code !== 1000) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'frame') {
            frameCount.current += 1;
            setFrame(`data:image/jpeg;base64,${payload.image}`);
            setDetections(payload.detections || []);
            if (onDetections) onDetections(payload.detections || []);
            setCameraId(payload.camera_id || 'CAM');
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

  /* Refresh stats periodically */
  useEffect(() => {
    const t = setInterval(loadAttendanceStats, 15000);
    return () => clearInterval(t);
  }, [loadAttendanceStats]);

  const startCamera = async () => {
    try {
      await api.post('/camera/start', camForm);
      await loadCameras();
      setCamMessage(`Camera "${camForm.camera_id}" started.`);
    } catch (err) {
      setCamMessage(err.response?.data?.detail || 'Failed to start camera.');
    }
  };

  const stopCamera = async (idToStop) => {
    const target = idToStop || camForm.camera_id;
    try {
      await api.post('/camera/stop', { camera_id: target, source: camForm.source });
      await loadCameras();
      setCamMessage(`Camera "${target}" stopped.`);
    } catch (err) {
      setCamMessage(err.response?.data?.detail || 'Failed to stop camera.');
    }
  };

  /* Primary detection */
  const primary = detections[0] || null;

  const fmtTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  const fmtEventTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  /* Merge live detections into recent events for right panel */
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

      {/* ── Feed header row ── */}
      <div className="feedHeader">
        <div className="feedHeaderLeft">
          <div className="feedTitle">LIVE FEED</div>
          <div className="feedCamLabel">CAMERA: {cameraId.toUpperCase()}</div>
        </div>
      </div>

      {/* ── Center: video + detection card + stats bar ── */}
      <div className="liveCenter">

        <div className="videoWrap">
          {frame ? (
            <>
              <img src={frame} alt="Live annotated surveillance feed" />
              <div className="videoLiveBadge">
                <div className="videoLiveDot" />
                LIVE
              </div>
              <div className="videoFpsBadge">FPS: {fps.toFixed(1)}</div>
              <div className="videoResBadge">RESOLUTION: 1280x720</div>
            </>
          ) : (
            <div className="videoPlaceholder">
              <div className="radar" />
              <span>Awaiting camera signal…</span>
              <span style={{ fontSize: 10, opacity: 0.5 }}>Start a camera to receive frames</span>
            </div>
          )}
        </div>

        {/* Detection identity card */}
        <div className="detectionCard">
          {primary ? (
            <>
              {primary.photo_path ? (
                <img className="detectionCardAvatar" src={storageUrl(primary.photo_path)} alt={primary.full_name} />
              ) : (
                <div className="detectionCardAvatarPlaceholder">{primary.known ? '👤' : '❓'}</div>
              )}
              <div className="detectionCardInfo">
                <div className="detectionCardName">{primary.full_name || `Unknown #${primary.unknown_id || '?'}`}</div>
                <div className="detectionCardMeta">
                  {primary.army_id && <span>ID: {primary.army_id}</span>}
                  {primary.rank    && <span>RANK: {primary.rank}</span>}
                  {primary.unit    && <span>UNIT: {primary.unit}</span>}
                  <span className={`detectionCardStatus ${primary.known ? '' : 'unknown-status'}`}>
                    STATUS: {primary.known ? 'ACCESS GRANTED' : 'UNIDENTIFIED'}
                  </span>
                </div>
              </div>
              <div className={`detectionCardPunch ${primary.status === 'EXIT' ? 'exit-punch' : ''}`}>
                <div className="detectionCardPunchLabel">
                  {primary.known ? (primary.status === 'EXIT' ? 'EXIT RECORDED' : 'ENTRY RECORDED') : 'ALERT'}
                </div>
                <div className="detectionCardPunchTime">{fmtTime()}</div>
                <div className="detectionCardPunchDate">
                  {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase()}
                </div>
                <div className="detectionCardPunchIcon">
                  {primary.known ? (primary.status === 'EXIT' ? '🔓' : '✅') : '⚠️'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="detectionCardAvatarPlaceholder" style={{ opacity: 0.3 }}>👁️</div>
              <div className="detectionCardInfo">
                <div className="detectionCardName" style={{ color: 'var(--text-muted)' }}>NO ACTIVE DETECTION</div>
                <div className="detectionCardMeta">
                  <span style={{ color: 'var(--text-muted)' }}>Awaiting face in frame…</span>
                </div>
              </div>
              <div className="detectionCardPunch" style={{ opacity: 0.25 }}>
                <div className="detectionCardPunchLabel">STANDBY</div>
              </div>
            </>
          )}
        </div>

        {/* Bottom stats bar */}
        <div className="statsBar">
          <div className="statsBarItem">
            <div className="statsBarIcon">🪖</div>
            <div className="statsBarInfo">
              <div className="statsBarLabel">Total Personnel</div>
              <div className="statsBarValue">{attendanceStats.total}</div>
            </div>
          </div>
          <div className="statsBarItem">
            <div className="statsBarIcon" style={{ fontSize: 20 }}>🚪</div>
            <div className="statsBarInfo">
              <div className="statsBarLabel">Today's Entries</div>
              <div className="statsBarValue" style={{ color: 'var(--green-bright)' }}>{attendanceStats.entries}</div>
            </div>
          </div>
          <div className="statsBarItem">
            <div className="statsBarIcon" style={{ fontSize: 20 }}>🏃</div>
            <div className="statsBarInfo">
              <div className="statsBarLabel">Today's Exits</div>
              <div className="statsBarValue" style={{ color: 'var(--amber)' }}>{attendanceStats.exits}</div>
            </div>
          </div>
          <div className="statsBarItem">
            <div className="statsBarIcon">👥</div>
            <div className="statsBarInfo">
              <div className="statsBarLabel">Active Inside</div>
              <div className="statsBarValue">{attendanceStats.inside}</div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Right panel ── */}
      <div className="liveRight">

        {/* Camera Controls */}
        <div className="panel">
          <div className="panelHead">
            <div className="panelHeadTitle">Camera Controls</div>
          </div>
          <div className="panelBody">
            <div className="camFieldRow">
              <div className="camFieldLabel">Camera ID</div>
              <select
                className="camSelect"
                value={camForm.camera_id}
                onChange={(e) => setCamForm({ ...camForm, camera_id: e.target.value })}
              >
                {activeCameras.length > 0
                  ? activeCameras.map((id) => <option key={id} value={id}>{id}</option>)
                  : <option value={camForm.camera_id}>{camForm.camera_id}</option>
                }
              </select>
            </div>
            <div className="camFieldRow">
              <div className="camFieldLabel">Source</div>
              <select
                className="camSelect"
                value={camForm.source}
                onChange={(e) => setCamForm({ ...camForm, source: e.target.value })}
              >
                <option value="0">0 (Webcam)</option>
                <option value="1">1 (USB Cam 2)</option>
              </select>
            </div>
            <div className="camBtns">
              <button className="camBtn start" onClick={startCamera}>
                <PlayArrowIcon style={{ fontSize: 16 }} />
                START
              </button>
              <button className="camBtn stop" onClick={() => stopCamera(null)}>
                <StopIcon style={{ fontSize: 16 }} />
                STOP
              </button>
            </div>
            {camMessage && (
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: camMessage.includes('Failed') ? 'var(--red-bright)' : 'var(--green-bright)',
                letterSpacing: 0.5,
                padding: '4px 0',
              }}>
                {camMessage}
              </div>
            )}
            {activeCameras.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {activeCameras.map((id) => (
                  <div className="cameraItem" key={id}>
                    <span>
                      <span className="statusDot" style={{ display: 'inline-block', marginRight: 8 }} />
                      <span className="cameraItemId">{id}</span>
                    </span>
                    <button
                      onClick={() => stopCamera(id)}
                      style={{
                        background: 'rgba(229,57,53,0.12)',
                        border: '1px solid rgba(229,57,53,0.4)',
                        color: 'var(--red-bright)',
                        borderRadius: 'var(--radius)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: 1,
                        padding: '3px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      STOP
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Events */}
        <div className="panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="panelHead">
            <div className="panelHeadTitle">Recent Events</div>
            <a href="/attendance" className="panelHeadAction">View All</a>
          </div>
          <div className="eventList">
            {displayEvents.length === 0 && (
              <div className="emptyState" style={{ padding: '20px 14px', fontSize: 10 }}>No events yet</div>
            )}
            {displayEvents.map((evt) => (
              <div className="eventItem" key={evt.id}>
                <div className="eventAvatar">
                  {evt.photo_path
                    ? <img
                        src={storageUrl(evt.photo_path)}
                        alt={evt.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                      />
                    : (evt.known ? '👤' : '❓')
                  }
                </div>
                <div className="eventInfo">
                  <div className={`eventName ${evt.known ? '' : 'unknown'}`}>{evt.name.toUpperCase()}</div>
                  <div className="eventMeta">
                    ID: {evt.army_id || '—'} &bull;{' '}
                    <span className={evt.status === 'UNKNOWN' ? 'unknown-tag' : evt.status === 'EXIT' ? 'exit' : 'entry'}>
                      {evt.status}
                    </span>
                  </div>
                </div>
                <div className="eventRight">
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {fmtEventTime(evt.time)}
                  </div>
                  <div style={{ fontSize: 14 }}>
                    {evt.status === 'UNKNOWN' ? '❓' : evt.status === 'EXIT' ? '🔓' : '✅'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Secure */}
        <div className="systemSecurePanel">
          <div className="systemSecureIcon">🔒</div>
          <div className="systemSecureInfo">
            <div className="systemSecureTitle">SYSTEM SECURE</div>
            <div className="systemSecureSub">ALL SYSTEMS OPERATIONAL</div>
          </div>
        </div>

      </div>
    </div>
  );
}