import React from 'react';
import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { api } from '../services/api.js';

export default function AttendancePage() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ status: '', camera_id: '' });
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/attendance', { params: filters });
      setRows(data);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to load attendance logs.');
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Attendance Logs</Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Paper className="filterPanel">
        <TextField select label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="ENTRY">Entry</MenuItem>
          <MenuItem value="EXIT">Exit</MenuItem>
        </TextField>
        <TextField label="Camera ID" value={filters.camera_id} onChange={(e) => setFilters({ ...filters, camera_id: e.target.value })} />
        <Button variant="contained" startIcon={<SearchIcon />} onClick={load}>Search</Button>
      </Paper>
      <Paper className="tablePanel">
        {rows.map((row) => (
          <div className="gridRow attendanceGrid" key={row.id}>
            <strong>{row.status}</strong>
            <span>Personnel #{row.personnel_id}</span>
            <span>{row.camera_id}</span>
            <span>{row.entry_time ? new Date(row.entry_time).toLocaleString() : '-'}</span>
            <span>{row.exit_time ? new Date(row.exit_time).toLocaleString() : '-'}</span>
            <span>{row.confidence_score ? Math.round(row.confidence_score * 100) : 0}%</span>
          </div>
        ))}
      </Paper>
    </Stack>
  );
}
