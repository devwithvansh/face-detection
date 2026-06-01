import React from 'react';
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { api, storageUrl } from '../services/api.js';

export default function UnknownQueuePage() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ army_id: '', full_name: '', rank: '', battalion: '', unit: '', images: [] });
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/unknown');
      setRows(data);
      setMessage('');
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to load unknown queue.');
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    const body = new FormData();
    if (selected) body.set('unknown_id', selected.id);
    body.set('camera_id', 'registration');
    Object.entries(form).forEach(([key, value]) => {
      if (key !== 'images') body.set(key, value);
    });
    [...form.images].forEach((file) => body.append('images', file));
    try {
      await api.post('/unknown/register', body);
      setSelected(null);
      setForm({ army_id: '', full_name: '', rank: '', battalion: '', unit: '', images: [] });
      await load();
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Registration failed.');
    }
  };

  const clearQueue = async () => {
    try {
      const { data } = await api.delete('/unknown/clear');
      setRows([]);
      setMessage(`Cleared ${data.cleared} pending unknown record${data.cleared === 1 ? '' : 's'}.`);
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to clear queue.');
    }
  };

  return (
    <Stack spacing={2}>
      <div className="pageHeader">
        <Typography variant="h4">Unknown Queue</Typography>
        <Button color="error" variant="outlined" onClick={clearQueue}>Clear Queue</Button>
      </div>
      {message ? <Alert severity="warning">{message}</Alert> : null}
      <Paper className="queueGrid">
        {rows.map((row) => (
          <div className="unknownCard" key={row.id}>
            <img src={storageUrl(row.image_path)} alt="Unknown face" />
            <strong>Unknown #{row.id}</strong>
            <span>Status: Waiting Registration</span>
            <span>{new Date(row.detected_time).toLocaleString()}</span>
            <Button startIcon={<HowToRegIcon />} variant="contained" onClick={() => setSelected(row)}>Register</Button>
          </div>
        ))}
      </Paper>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>Register Personnel</DialogTitle>
        <DialogContent className="dialogForm">
          {['army_id', 'full_name', 'rank', 'battalion', 'unit'].map((field) => (
            <TextField key={field} label={field.replace('_', ' ').toUpperCase()} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
          ))}
          <input type="file" multiple accept="image/*" onChange={(e) => setForm({ ...form, images: e.target.files })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancel</Button>
          <Button variant="contained" onClick={submit}>Register</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
