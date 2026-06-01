import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { WS_BASE } from '../services/api.js';

export default function LiveDashboard({ token }) {
  const [frame, setFrame] = useState('');
  const [detections, setDetections] = useState([]);
  const [camera, setCamera] = useState('waiting');

  useEffect(() => {
    if (!token) return undefined;
    const ws = new WebSocket(`${WS_BASE}/live`);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'frame') {
        setFrame(`data:image/jpeg;base64,${payload.image}`);
        setDetections(payload.detections || []);
        setCamera(payload.camera_id);
      }
    };
    const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 15000);
    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [token]);

  const stats = useMemo(() => {
    const known = detections.filter((item) => item.known).length;
    return { known, unknown: detections.length - known };
  }, [detections]);

  if (!token) return <Alert severity="info">Login to view realtime camera feeds.</Alert>;

  return (
    <Stack spacing={2}>
      <Box className="pageHeader">
        <div>
          <Typography variant="h4">Live Feed</Typography>
          <Typography color="text.secondary">Camera {camera}</Typography>
        </div>
        <Stack direction="row" spacing={1}>
          <Chip label={`Known ${stats.known}`} color="success" />
          <Chip label={`Unknown ${stats.unknown}`} color="error" />
        </Stack>
      </Box>
      <Paper className="videoPanel">
        {frame ? <img src={frame} alt="Live annotated feed" /> : <Typography color="text.secondary">Start a camera to receive frames.</Typography>}
      </Paper>
      <Paper className="tablePanel">
        {detections.map((item) => (
          <Box className="detectionRow" key={item.detection_id}>
            <strong>{item.full_name || 'Unknown Person'}</strong>
            <span>{item.status}</span>
            <span>{Math.round(item.confidence * 100)}%</span>
          </Box>
        ))}
      </Paper>
    </Stack>
  );
}
