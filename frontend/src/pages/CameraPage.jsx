import React from 'react';
import { useState } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { api } from '../services/api.js';

export default function CameraPage() {
  const [camera, setCamera] = useState({ camera_id: 'gate1', source: '0' });
  const [active, setActive] = useState([]);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    try {
      const { data } = await api.get('/camera/active');
      setActive(data.cameras);
      setMessage('');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to load active cameras.');
    }
  };

  const start = async () => {
    try {
      await api.post('/camera/start', camera);
      await refresh();
      setMessage(`Camera ${camera.camera_id} started.`);
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to start camera. Confirm backend is running and you are logged in.');
    }
  };

  const stop = async () => {
    try {
      await api.post('/camera/stop', camera);
      await refresh();
      setMessage(`Camera ${camera.camera_id} stopped.`);
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to stop camera.');
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Camera Monitoring</Typography>
      {message ? <Alert severity={message.includes('Unable') ? 'error' : 'success'}>{message}</Alert> : null}
      <Paper className="formPanel">
        <TextField label="Camera ID" value={camera.camera_id} onChange={(e) => setCamera({ ...camera, camera_id: e.target.value })} />
        <TextField label="Source" value={camera.source} onChange={(e) => setCamera({ ...camera, source: e.target.value })} helperText="Use 0 for webcam or an RTSP URL" />
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={start}>Start</Button>
          <Button variant="outlined" startIcon={<StopIcon />} onClick={stop}>Stop</Button>
        </Stack>
      </Paper>
      <Paper className="tablePanel">
        <Typography variant="h6">Active Cameras</Typography>
        {active.map((id) => <div key={id}>{id}</div>)}
      </Paper>
    </Stack>
  );
}
