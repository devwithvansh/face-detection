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
    { key: 'army_id',   label: 'Army ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'rank',      label: 'Rank' },
    { key: 'battalion', label: 'Battalion' },
    { key: 'unit',      label: 'Unit' },
  ];

  return (
    <Dialog open={open} onClose={onDismiss} fullWidth maxWidth="sm">
      <DialogTitle>
        ⚠ Unidentified Subject — #{unknown?.unknown_id}
      </DialogTitle>

      <DialogContent className="dialogForm">
        {/* Captured image */}
        {unknown?.image_path && (
          <img
            className="registrationPreview"
            src={storageUrl(unknown.image_path)}
            alt={`Unknown #${unknown?.unknown_id}`}
          />
        )}

        <div className="dialogClassification">
          ALERT: Unknown subject detected at {unknown?.camera_id?.toUpperCase() || 'UNKNOWN CAM'}.
          Register or dismiss.
        </div>

        {message && <Alert severity="error">{message}</Alert>}

        <Stack spacing={2}>
          {fields.map(({ key, label }) => (
            <TextField
              key={key}
              label={label}
              size="small"
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
            />
          ))}

          {/* Optional extra photos */}
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
              size="small"
              startIcon={<UploadFileIcon />}
              onClick={() => fileRef.current.click()}
            >
              {files.length
                ? `${files.length} extra photo${files.length > 1 ? 's' : ''} selected`
                : 'Add Extra Photos (optional)'}
            </Button>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10,
              color: 'var(--color-text-dim)',
              marginTop: 4,
            }}>
              Captured face is used automatically. Extra photos improve future accuracy.
            </div>
          </div>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          color="error"
          startIcon={<ClearAllIcon />}
          onClick={clearAll}
          size="small"
        >
          Clear All
        </Button>
        <Button
          startIcon={<SkipNextIcon />}
          onClick={onDismiss}
          size="small"
        >
          Skip
        </Button>
        <Button
          variant="contained"
          startIcon={<HowToRegIcon />}
          onClick={submit}
          disabled={saving}
        >
          {saving ? 'Registering…' : 'Register Soldier'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}