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
      setMessage('Personnel registered and added to the biometric index.');
      setMsgType('success');
    } catch (err) {
      setRegError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const clearQueue = async () => {
    if (!window.confirm('Clear all unreviewed unknown records? This cannot be undone.')) return;
    try {
      const { data } = await api.delete('/unknown/clear');
      setRows([]);
      setMessage(`Cleared ${data.cleared} pending record${data.cleared !== 1 ? 's' : ''}.`);
      setMsgType('info');
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Unable to clear queue.');
      setMsgType('error');
    }
  };

  const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '—';

  const fields = [
    { key: 'army_id',   label: 'Army ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'rank',      label: 'Rank' },
    { key: 'battalion', label: 'Battalion' },
    { key: 'unit',      label: 'Unit' },
  ];

  return (
    <Stack spacing={2}>
      {/* Header */}
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Unknown Queue</Typography>
          <div className="pageSub">UNIDENTIFIED SUBJECTS — {rows.length} PENDING</div>
        </div>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
          {rows.length > 0 && (
            <Button color="error" variant="outlined" startIcon={<DeleteSweepIcon />} onClick={clearQueue}>
              Clear Queue
            </Button>
          )}
        </Stack>
      </div>

      {message && <Alert severity={msgType} onClose={() => setMessage('')}>{message}</Alert>}

      {rows.length === 0 ? (
        <div className="panel">
          <div className="emptyState" style={{ padding: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>◎</div>
            No unidentified subjects in queue
          </div>
        </div>
      ) : (
        <div className="queueGrid">
          {rows.map((row) => (
            <div className="unknownCard" key={row.id}>
              <img
                src={storageUrl(row.image_path)}
                alt={`Unknown subject #${row.id}`}
                onError={(e) => { e.target.style.background = '#111'; e.target.src = ''; }}
              />
              <div className="unknownCardBody">
                <div className="unknownCardId">⚠ UNKNOWN #{row.id}</div>
                <div className="unknownCardTime">{fmtTime(row.detected_time)}</div>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<HowToRegIcon />}
                  onClick={() => openReg(row)}
                  fullWidth
                >
                  Register
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Registration dialog */}
      <Dialog open={Boolean(selected)} onClose={closeReg} fullWidth maxWidth="sm">
        <DialogTitle>
          Register Unknown #{selected?.id}
        </DialogTitle>
        <DialogContent className="dialogForm">
          {selected?.image_path && (
            <img
              className="registrationPreview"
              src={storageUrl(selected.image_path)}
              alt={`Unknown #${selected.id}`}
            />
          )}

          <div className="dialogClassification">
            BIOMETRIC ID ASSIGNMENT — FORM SEC-REG-02
          </div>

          {regError && <Alert severity="error">{regError}</Alert>}

          <Stack spacing={2}>
            {fields.map(({ key, label }) => (
              <TextField
                key={key}
                label={label}
                size="small"
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
              >
                {files.length
                  ? `${files.length} additional photo${files.length > 1 ? 's' : ''} selected`
                  : 'Add Extra Photos (optional)'}
              </Button>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4 }}>
                Captured face will be used automatically. Extra photos improve accuracy.
              </div>
            </div>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReg}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? 'Registering…' : 'Register Soldier'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}