import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { api, buildWsUrl } from '../services/api.js';

export default function LiveDashboard({ token }) {
  const [frame, setFrame]               = useState('');
  const [detections, setDetections]     = useState([]);
  const [cameraId, setCameraId]         = useState('waiting');
  const [feedActive, setFeedActive]     = useState(false);
  const [camForm, setCamForm]           = useState({ camera_id: 'gate1', source: '0' });
  const [activeCameras, setActiveCameras] = useState([]);
  const [camMessage, setCamMessage]     = useState('');
  const [camMsgType, setCamMsgType]     = useState('info');
  const [showFeed, setShowFeed]         = useState(true);

  const wsRef = useRef(null);

  const loadCameras = useCallback(async () => {
    try {
      const { data } = await api.get('/camera/active');
      setActiveCameras(data.cameras || []);
    } catch {/* ignore */}
  }, []);

  useEffect(() => { loadCameras(); }, [loadCameras]);

  /* WebSocket for live video frames only */
  useEffect(() => {
    if (!token) return undefined;

    let ws;
    let ping;
    let reconnectTimer;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      // Token passed as query param — WS can't send Authorization headers
      ws = new WebSocket(buildWsUrl('/live', token));
      wsRef.current = ws;

      ws.onopen = () => setFeedActive(true);

      ws.onclose = (evt) => {
        setFeedActive(false);
        clearInterval(ping);
        if (!destroyed && evt.code !== 1000) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          // Only handle frame messages here — unknown_detected is handled in main.jsx
          if (payload.type === 'frame') {
            setFrame(`data:image/jpeg;base64,${payload.image}`);
            setDetections(payload.detections || []);
            setCameraId(payload.camera_id || 'unknown');
          }
        } catch {/* ignore */}
      };

      ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 15000);
    }

    connect();
    return () => {
      destroyed = true;
      clearInterval(ping);
      clearTimeout(reconnectTimer);
      if (ws) ws.close(1000, 'unmount');
    };
  }, [token]);

  const stats = useMemo(() => {
    const known = detections.filter((d) => d.known).length;
    return { known, unknown: detections.length - known };
  }, [detections]);

  const startCamera = async () => {
    try {
      await api.post('/camera/start', camForm);
      await loadCameras();
      setCamMessage(`Camera "${camForm.camera_id}" activated on source ${camForm.source}.`);
      setCamMsgType('success');
    } catch (err) {
      setCamMessage(err.response?.data?.detail || 'Failed to start camera.');
      setCamMsgType('error');
    }
  };

  const stopCamera = async (idToStop) => {
    const target = idToStop || camForm.camera_id;
    try {
      await api.post('/camera/stop', { camera_id: target, source: camForm.source });
      await loadCameras();
      setCamMessage(`Camera "${target}" deactivated.`);
      setCamMsgType('info');
    } catch (err) {
      setCamMessage(err.response?.data?.detail || 'Failed to stop camera.');
      setCamMsgType('error');
    }
  };

  return (
    <Stack spacing={2}>
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Live Surveillance</Typography>
          <div className="pageSub">
            FEED: {cameraId.toUpperCase()} &nbsp;|&nbsp; DETECTIONS: {detections.length}
            &nbsp;|&nbsp;
            <span style={{ color: feedActive ? 'var(--color-known)' : 'var(--color-unknown)' }}>
              {feedActive ? '● WS CONNECTED' : '○ WS OFFLINE'}
            </span>
          </div>
        </div>
        <div className="statChips">
          <div className="statChip known"><span>▲</span> KNOWN: {stats.known}</div>
          <div className="statChip unknown"><span>!</span> UNKNOWN: {stats.unknown}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">Camera Control</div>
        <div className="cameraControlPanel">
          <TextField
            label="Camera ID"
            size="small"
            value={camForm.camera_id}
            onChange={(e) => setCamForm({ ...camForm, camera_id: e.target.value })}
            sx={{ width: 150 }}
          />
          <TextField
            label="Source"
            size="small"
            value={camForm.source}
            onChange={(e) => setCamForm({ ...camForm, source: e.target.value })}
            helperText="0 = webcam · RTSP URL"
            sx={{ width: 200 }}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={startCamera}>Start</Button>
            <Button variant="outlined" startIcon={<StopIcon />} onClick={() => stopCamera(null)}>Stop</Button>
          </Stack>
          <Button
            variant="outlined"
            startIcon={showFeed ? <VisibilityOffIcon /> : <VisibilityIcon />}
            onClick={() => setShowFeed((v) => !v)}
            sx={{ ml: 'auto' }}
          >
            {showFeed ? 'Hide Feed' : 'Show Feed'}
          </Button>
        </div>

        {activeCameras.length > 0 && (
          <div className="cameraActiveList">
            {activeCameras.map((id) => (
              <div className="cameraItem" key={id}>
                <span>
                  <span className="statusDot" style={{ display: 'inline-block', marginRight: 8 }} />
                  <span className="cameraItemId">{id}</span>
                </span>
                <Button size="small" color="error" startIcon={<StopIcon />} onClick={() => stopCamera(id)}>
                  Stop
                </Button>
              </div>
            ))}
          </div>
        )}

        {camMessage && (
          <div style={{ padding: '0 12px 12px' }}>
            <Alert severity={camMsgType} onClose={() => setCamMessage('')}>{camMessage}</Alert>
          </div>
        )}
      </div>

      {showFeed && (
        <div className="videoPanel" style={{ position: 'relative' }}>
          {frame ? (
            <>
              <img src={frame} alt="Live annotated surveillance feed" />
              <div className="videoCamLabel">CAM: {cameraId.toUpperCase()}</div>
              <div className="videoRecIndicator">
                <div className="recDot" />
                REC LIVE
              </div>
            </>
          ) : (
            <div className="videoPlaceholder">
              <div className="radar" />
              <span>Awaiting camera signal…</span>
              <span style={{ fontSize: 10, opacity: 0.5 }}>Start a camera to receive frames</span>
            </div>
          )}
        </div>
      )}

      {detections.length > 0 && (
        <div className="panel">
          <div className="panelHeader">
            Active Detections — {detections.length} subject{detections.length !== 1 ? 's' : ''}
          </div>
          <div className="detectionTable">
            <div className="detectionRow" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, letterSpacing: 1, color: 'var(--color-text-dim)', background: 'transparent', border: 'none', paddingBottom: 4 }}>
              <span>NAME / ID</span><span>STATUS</span><span>CONFIDENCE</span><span></span>
            </div>
            {detections.map((item) => (
              <div className={`detectionRow ${item.known ? 'known' : 'unknown'}`} key={item.detection_id}>
                <span className="detectionName">
                  {item.full_name || `Unknown #${item.unknown_id || '?'}`}
                  {item.army_id && (
                    <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, marginLeft: 8, color: 'var(--color-text-dim)' }}>
                      [{item.army_id}]
                    </span>
                  )}
                </span>
                <span className={`detectionStatus ${item.status}`}>{item.status}</span>
                <span className="detectionConf">{Math.round(item.confidence * 100)}%</span>
                <span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Stack>
  );
}