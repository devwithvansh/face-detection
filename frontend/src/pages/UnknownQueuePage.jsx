import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { api, storageUrl } from '../services/api.js';

const emptyForm = { army_id: '', full_name: '', rank: '', battalion: '', unit: '' };

export default function UnknownQueuePage() {
  const [rows, setRows]         = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm]         = useState(emptyForm);
  const [files, setFiles]       = useState([]);
  const [message, setMessage]   = useState('');
  const [msgType, setMsgType]   = useState('warning');
  const [saving, setSaving]     = useState(false);
  const [regError, setRegError] = useState('');
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/unknown');
      setRows(data);
      setMessage('');
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Unable to load unknown queue.');
      setMsgType('error');
    }
  };

  useEffect(() => { load(); }, []);

  const openReg = (row) => {
    setSelected(row);
    setForm(emptyForm);
    setFiles([]);
    setRegError('');
  };

  const closeReg = () => setSelected(null);

  const submit = async () => {
    setSaving(true);
    setRegError('');
    const body = new FormData();
    if (selected) body.set('unknown_id', selected.id);
    body.set('camera_id', 'registration');
    Object.entries(form).forEach(([k, v]) => body.set(k, v));
    [...files].forEach((f) => body.append('images', f));
    try {
      await api.post('/unknown/register', body);
      closeReg();
      await load();
      setMessage('Personnel registered successfully.');
      setMsgType('success');
    } catch (err) {
      setRegError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const clearQueue = async () => {
    if (!window.confirm('Clear all unidentified subject records?')) return;
    try {
      await api.delete('/unknown/clear');
      setRows([]);
      setMessage('Queue cleared.');
      setMsgType('info');
    } catch (err) {
      setMessage('Unable to clear queue.');
      setMsgType('error');
    }
  };

  const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  }).toUpperCase() : '—';

  const fields = [
    { key: 'army_id',   label: 'Service ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'rank',      label: 'Rank' },
    { key: 'battalion', label: 'Battalion' },
    { key: 'unit',      label: 'Unit' },
  ];

  return (
    <div className="mainContent">
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Unknown Queue</Typography>
          <div className="pageSub">UNIDENTIFIED BIOMETRIC CAPTURES — {rows.length} PENDING REVIEW</div>
        </div>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ height: 50, px: 3 }}>REFRESH</Button>
          {rows.length > 0 && (
            <Button color="error" variant="contained" startIcon={<DeleteSweepIcon />} onClick={clearQueue} sx={{ height: 50, px: 3 }}>
              PURGE QUEUE
            </Button>
          )}
        </Stack>
      </div>

      {message && <Alert severity={msgType} sx={{ mb: 4, borderRadius: 0 }}>{message}</Alert>}

      {rows.length === 0 ? (
        <div className="panel" style={{ padding: 100, textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 30, opacity: 0.1 }}>🛡️</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, letterSpacing: 8, color: 'var(--text-muted)' }}>
            SECTOR SECURE — NO PENDING ALERTS
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 30 }}>
          {rows.map((row) => (
            <div key={row.id} style={{ background: 'var(--surface)', border: '1px solid var(--red-dim)', overflow: 'hidden', transition: 'transform 0.2s' }}>
              <div style={{ position: 'relative', height: 250, background: '#000' }}>
                <img
                  src={storageUrl(row.image_path)}
                  alt="Unknown"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{ position: 'absolute', top: 0, left: 0, background: 'var(--red)', color: '#fff', padding: '6px 15px', fontFamily: 'var(--font-display)', fontWeight: 900, letterSpacing: 2 }}>
                  ALERT #{row.id}
                </div>
              </div>
              <div style={{ padding: 25 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>DETECTED AT:</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>{fmtTime(row.detected_time)}</div>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<HowToRegIcon />}
                  onClick={() => openReg(row)}
                  sx={{ height: 50, background: 'var(--green)', color: '#000' }}
                >
                  RESOLVE IDENTITY
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selected)} onClose={closeReg} fullWidth maxWidth="sm">
        <DialogTitle sx={{ color: 'var(--amber) !important' }}>Identity Resolution — #{selected?.id}</DialogTitle>
        <DialogContent className="dialogForm">
          {selected?.image_path && (
            <img
              className="registrationPreview"
              src={storageUrl(selected.image_path)}
              alt="Subject"
              style={{ height: 300 }}
            />
          )}

          <div className="dialogClassification">
            BIOMETRIC ID ASSIGNMENT — SEC-REG-02
          </div>

          {regError && <Alert severity="error" sx={{ mb: 3 }}>{regError}</Alert>}

          <Stack spacing={3}>
            {fields.map(({ key, label }) => (
              <TextField
                key={key}
                label={label}
                fullWidth
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            ))}

            <div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => setFiles(e.target.files)}
              />
              <Button
                variant="outlined"
                fullWidth
                startIcon={<UploadFileIcon />}
                onClick={() => fileRef.current.click()}
                sx={{ height: 50, borderStyle: 'dashed' }}
              >
                {files.length
                  ? `${files.length} ADDITIONAL SAMPLES ATTACHED`
                  : 'ATTACH SUPPLEMENTARY PHOTOS'}
              </Button>
            </div>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 4, background: 'var(--bg3)' }}>
          <Button onClick={closeReg} sx={{ color: 'var(--text-muted)' }}>CANCEL</Button>
          <Button 
            variant="contained" 
            onClick={submit} 
            disabled={saving}
            sx={{ px: 4, height: 50, background: 'var(--green)', color: '#000' }}
          >
            {saving ? 'PROCESSING...' : 'CONFIRM IDENTITY'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
