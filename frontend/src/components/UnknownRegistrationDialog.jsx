import React, { useEffect, useState } from 'react';
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
import { api, storageUrl } from '../services/api.js';

const emptyForm = {
  army_id: '',
  full_name: '',
  rank: '',
  battalion: '',
  unit: '',
};

export default function UnknownRegistrationDialog({ unknown, open, onDismiss, onRegistered, onClearQueue }) {
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setMessage('');
    }
  }, [open, unknown?.unknown_id]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async () => {
    setSaving(true);
    setMessage('');
    const body = new FormData();
    body.set('unknown_id', unknown.unknown_id);
    body.set('camera_id', unknown.camera_id || 'registration');
    Object.entries(form).forEach(([key, value]) => body.set(key, value));
    try {
      await api.post('/unknown/register', body);
      window.dispatchEvent(new CustomEvent('personnel-registered', { detail: { unknownId: unknown.unknown_id } }));
      onRegistered(unknown.unknown_id);
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const clearQueue = async () => {
    try {
      await api.delete('/unknown/clear');
      onClearQueue();
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to clear queue.');
    }
  };

  return (
    <Dialog open={open} onClose={onDismiss} fullWidth maxWidth="sm">
      <DialogTitle>Register Unknown #{unknown?.unknown_id}</DialogTitle>
      <DialogContent className="dialogForm">
        {unknown?.image_path ? (
          <img className="registrationPreview" src={storageUrl(unknown.image_path)} alt={`Unknown #${unknown.unknown_id}`} />
        ) : null}
        <Typography color="text.secondary">Status: Waiting Registration</Typography>
        {message ? <Alert severity="error">{message}</Alert> : null}
        <Stack spacing={2}>
          <TextField label="Army ID" value={form.army_id} onChange={(event) => update('army_id', event.target.value)} />
          <TextField label="Full Name" value={form.full_name} onChange={(event) => update('full_name', event.target.value)} />
          <TextField label="Rank" value={form.rank} onChange={(event) => update('rank', event.target.value)} />
          <TextField label="Battalion" value={form.battalion} onChange={(event) => update('battalion', event.target.value)} />
          <TextField label="Unit" value={form.unit} onChange={(event) => update('unit', event.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={clearQueue}>Clear Queue</Button>
        <Button onClick={onDismiss}>Dismiss</Button>
        <Button variant="contained" onClick={submit} disabled={saving}>
          Register Soldier
        </Button>
      </DialogActions>
    </Dialog>
  );
}
