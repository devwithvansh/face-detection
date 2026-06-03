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
} from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import { api, storageUrl } from '../services/api.js';

const emptyForm = {
  army_id: '',
  full_name: '',
  rank: '',
  battalion: '',
  unit: '',
};

export default function UnknownRegistrationDialog({
  unknown,
  open,
  onDismiss,
  onRegistered,
  onClearQueue,
}) {
  const [form, setForm]     = useState(emptyForm);
  const [files, setFiles]   = useState([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setFiles([]);
      setMessage('');
    }
  }, [open, unknown?.unknown_id]);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = async () => {
    setSaving(true);
    setMessage('');
    const body = new FormData();
    body.set('unknown_id', unknown.unknown_id);
    body.set('camera_id', unknown.camera_id || 'registration');
    Object.entries(form).forEach(([k, v]) => body.set(k, v));
    [...files].forEach((f) => body.append('images', f));
    try {
      await api.post('/unknown/register', body);
      window.dispatchEvent(new CustomEvent('personnel-registered', {
        detail: { unknownId: unknown.unknown_id },
      }));
      onRegistered(unknown.unknown_id);
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    try {
      await api.delete('/unknown/clear');
      onClearQueue();
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Unable to clear queue.');
    }
  };

  const fields = [
    { key: 'army_id',   label: 'Service ID Number' },
    { key: 'full_name', label: 'Full Legal Name' },
    { key: 'rank',      label: 'Rank / Grade' },
    { key: 'battalion', label: 'Battalion' },
    { key: 'unit',      label: 'Assigned Unit' },
  ];

  return (
    <Dialog open={open} onClose={onDismiss} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--red-bright) !important' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--red-bright)', animation: 'pulse 1s infinite' }} />
        ALERT: UNIDENTIFIED SUBJECT DETECTED
      </DialogTitle>

      <DialogContent className="dialogForm">
        {unknown?.image_path && (
          <div style={{ position: 'relative', marginBottom: 30 }}>
            <img
              className="registrationPreview"
              src={storageUrl(unknown.image_path)}
              alt="Unknown Subject"
              style={{ height: 300, border: '1px solid var(--red-dim)' }}
            />
            <div style={{ position: 'absolute', top: 15, right: 15, background: 'var(--red)', color: '#fff', padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 900 }}>
              ID: #{unknown?.unknown_id}
            </div>
          </div>
        )}

        <div className="dialogClassification" style={{ borderLeftColor: 'var(--red)' }}>
          CRITICAL: Subject captured at {unknown?.camera_id?.toUpperCase() || 'UNKNOWN SECTOR'}. 
          Assign identity credentials to resolve alert.
        </div>

        {message && <Alert severity="error" sx={{ mb: 3, borderRadius: 0 }}>{message}</Alert>}

        <Stack spacing={3}>
          {fields.map(({ key, label }) => (
            <TextField
              key={key}
              label={label}
              fullWidth
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
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
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: 10,
              textAlign: 'center'
            }}>
              Primary face capture is used by default. Additional samples improve biometric confidence.
            </div>
          </div>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 4, background: 'var(--bg3)', gap: 2 }}>
        <Button
          color="error"
          startIcon={<ClearAllIcon />}
          onClick={clearAll}
          sx={{ mr: 'auto' }}
        >
          CLEAR ALL
        </Button>
        <Button
          startIcon={<SkipNextIcon />}
          onClick={onDismiss}
        >
          DISMISS
        </Button>
        <Button
          variant="contained"
          startIcon={<HowToRegIcon />}
          onClick={submit}
          disabled={saving}
          sx={{ background: 'var(--green)', color: '#000', px: 4, height: 50 }}
        >
          {saving ? 'PROCESSING...' : 'RESOLVE & REGISTER'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
