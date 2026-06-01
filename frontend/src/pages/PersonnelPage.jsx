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
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

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

  const handleDelete = async (id, name) => {
    // Guard against blank/corrupted rows with no id
    if (!id) {
      setDeleteError('Cannot delete: this record has no valid ID.');
      return;
    }

    const label = name || `ID ${id}`;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setDeletingId(id);
    setDeleteError('');
    try {
      await api.delete(`/personnel/${id}`);
      await load();
    } catch (err) {
      setDeleteError(
        err.response?.data?.detail ||
        `Delete failed (status ${err.response?.status || 'unknown'}). Are you logged in as admin?`
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = rows.filter((row) =>
    `${row.army_id} ${row.full_name} ${row.rank} ${row.unit}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <Stack spacing={2}>
      <div className="pageHeader">
        <Typography variant="h4">Personnel</Typography>
        <Button startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </div>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {deleteError ? (
        <Alert severity="error" onClose={() => setDeleteError('')}>{deleteError}</Alert>
      ) : null}
      <TextField label="Search personnel" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Paper className="tablePanel">
        {filtered.map((row) => (
          <div className="gridRow personnelGrid" key={row.id ?? Math.random()}>
            <strong>{row.army_id || <em style={{ color: '#aaa' }}>no ID</em>}</strong>
            <span>{row.full_name || <em style={{ color: '#aaa' }}>no name</em>}</span>
            <span>{row.rank}</span>
            <span>{row.battalion}</span>
            <span>{row.unit}</span>
            <Button
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              disabled={deletingId === row.id}
              onClick={() => handleDelete(row.id, row.full_name)}
            >
              {deletingId === row.id ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        ))}
      </Paper>
    </Stack>
  );
}