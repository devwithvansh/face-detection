import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import { api } from '../services/api.js';

export default function AttendancePage() {
  const [rows, setRows]       = useState([]);
  const [filters, setFilters] = useState({ status: '', camera_id: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance', { params: filters });
      setRows(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load access logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fmtTime = (ts) => ts ? new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : '—';

  const entryCounts  = rows.filter((r) => r.status === 'ENTRY').length;
  const exitCounts   = rows.filter((r) => r.status === 'EXIT').length;
  const insideNow    = entryCounts - exitCounts;

  return (
    <Stack spacing={2}>
      {/* Header */}
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Access Logs</Typography>
          <div className="pageSub">ENTRY / EXIT — {rows.length} RECORDS</div>
        </div>
        <Stack direction="row" spacing={1}>
          <div className="statChip known">▲ ENTRIES: {entryCounts}</div>
          <div className="statChip" style={{ background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.25)', color: 'var(--color-amber)' }}>
            ▼ EXITS: {exitCounts}
          </div>
          {insideNow > 0 && (
            <div className="statChip known">● INSIDE: {insideNow}</div>
          )}
        </Stack>
      </div>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Filters */}
      <div className="filterPanel">
        <TextField
          select
          label="Status"
          size="small"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          sx={{ width: 140 }}
        >
          <MenuItem value="">All Events</MenuItem>
          <MenuItem value="ENTRY">Entry</MenuItem>
          <MenuItem value="EXIT">Exit</MenuItem>
        </TextField>

        <TextField
          label="Camera ID"
          size="small"
          value={filters.camera_id}
          onChange={(e) => setFilters({ ...filters, camera_id: e.target.value })}
          placeholder="e.g. gate1"
          sx={{ width: 180 }}
        />

        <Button variant="contained" startIcon={<SearchIcon />} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Search'}
        </Button>

        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panelHeader">Access Event Log</div>
        <div className="tablePanel">
          <div className="tableHeaderRow attendanceHeaderRow">
            <span>Event</span>
            <span>Personnel</span>
            <span>Camera</span>
            <span>Entry Time</span>
            <span>Exit Time</span>
            <span>Conf.</span>
          </div>

          {rows.length === 0 && !loading && (
            <div className="emptyState">No access log records found</div>
          )}

          {rows.map((row) => (
            <div className="gridRow attendanceGrid" key={row.id}>
              <span>
                <span className={`statusEntry ${row.status.toLowerCase()}`}>
                  {row.status === 'ENTRY' ? '▲ ENTRY' : '▼ EXIT'}
                </span>
              </span>
              <span>
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--color-primary)', display: 'block' }}>
                  {row.army_id || `#${row.personnel_id}`}
                </span>
                <span style={{ fontSize: 12 }}>{row.full_name || '—'}</span>
              </span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--color-text-dim)' }}>
                {row.camera_id}
              </span>
              <span className="timestamp">{fmtTime(row.entry_time)}</span>
              <span className="timestamp">{fmtTime(row.exit_time)}</span>
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11 }}>
                {row.confidence_score ? `${Math.round(row.confidence_score * 100)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Stack>
  );
}