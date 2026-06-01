import React from 'react';
import { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api } from '../services/api.js';

export default function PersonnelPage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/personnel');
      setRows(data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to load personnel.');
    }
  };

  useEffect(() => {
    load();
    window.addEventListener('personnel-registered', load);
    return () => window.removeEventListener('personnel-registered', load);
  }, []);

  const filtered = rows.filter((row) => `${row.army_id} ${row.full_name} ${row.rank} ${row.unit}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Stack spacing={2}>
      <div className="pageHeader">
        <Typography variant="h4">Personnel</Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </div>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField label="Search personnel" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Paper className="tablePanel">
        {filtered.map((row) => (
          <div className="gridRow personnelGrid" key={row.id}>
            <strong>{row.army_id}</strong>
            <span>{row.full_name}</span>
            <span>{row.rank}</span>
            <span>{row.battalion}</span>
            <span>{row.unit}</span>
            <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={async () => { await api.delete(`/personnel/${row.id}`); load(); }}>Delete</Button>
          </div>
        ))}
      </Paper>
    </Stack>
  );
}
