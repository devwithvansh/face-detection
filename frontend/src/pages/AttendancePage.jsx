import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { api } from '../services/api.js';

export default function AttendancePage() {
  const [rows, setRows]         = useState([]);
  const [filters, setFilters]   = useState({ status: '', camera_id: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [overriding, setOverriding] = useState(null); // log id being overridden

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

  const handleOverride = async (logId) => {
    setOverriding(logId);
    try {
      const { data } = await api.patch(`/attendance/${logId}/override`);
      // Update the row in-place so table refreshes instantly
      setRows((prev) => prev.map((r) =>
        r.id === logId
          ? { ...r, status: data.status, entry_time: data.entry_time, exit_time: data.exit_time, timestamp: data.timestamp }
          : r
      ));
    } catch (err) {
      setError(err.response?.data?.detail || 'Override failed.');
    } finally {
      setOverriding(null);
    }
  };

  const fmtTime = (ts) =>
    ts
      ? new Date(ts).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
      : '—';

  const entryCount = rows.filter((r) => r.status === 'ENTRY').length;
  const exitCount  = rows.filter((r) => r.status === 'EXIT').length;
  const insideNow  = entryCount - exitCount;

  return (
    <Stack spacing={2}>
      {/* ── Header ── */}
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Access Logs</Typography>
          <div className="pageSub">PUNCH LOG — {rows.length} RECORDS</div>
        </div>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <div className="statChip known">▲ ENTRIES: {entryCount}</div>
          <div className="statChip" style={{ background: 'rgba(240,180,41,0.08)', border: '1px solid rgba(240,180,41,0.25)', color: 'var(--color-amber)' }}>
            ▼ EXITS: {exitCount}
          </div>
          {insideNow > 0 && <div className="statChip known">● INSIDE: {insideNow}</div>}
        </Stack>
      </div>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {/* ── Filters ── */}
      <div className="filterPanel">
        <TextField
          select label="Status" size="small"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          sx={{ width: 140 }}
        >
          <MenuItem value="">All Events</MenuItem>
          <MenuItem value="ENTRY">Entry</MenuItem>
          <MenuItem value="EXIT">Exit</MenuItem>
        </TextField>

        <TextField
          label="Camera ID" size="small"
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

      {/* ── Info banner about punch logic ── */}
      <Alert severity="info" sx={{ fontSize: 12 }}>
        <strong>Punch logic:</strong> First appearance of the day = ENTRY. Each reappearance after the minimum gap toggles ENTRY↔EXIT automatically.
        Use <strong>Override</strong> to manually flip any record.
      </Alert>

      {/* ── Table ── */}
      <div className="panel">
        <div className="panelHeader">Access Punch Log</div>
        <div className="tablePanel">
          <div className="tableHeaderRow" style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 160px 160px 60px 80px', gap: 8, padding: '8px 12px' }}>
            <span>Event</span>
            <span>Personnel</span>
            <span>Camera</span>
            <span>Entry Time</span>
            <span>Exit Time</span>
            <span>Conf.</span>
            <span>Override</span>
          </div>

          {rows.length === 0 && !loading && (
            <div className="emptyState">No access log records found</div>
          )}

          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr 100px 160px 160px 60px 80px',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid var(--color-border)',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              {/* Status badge */}
              <span>
                <span
                  className={`statusEntry ${row.status.toLowerCase()}`}
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 3,
                    fontSize: 11,
                    fontFamily: "'Share Tech Mono', monospace",
                    letterSpacing: 1,
                    background: row.status === 'ENTRY'
                      ? 'rgba(61,255,122,0.1)'
                      : 'rgba(240,180,41,0.1)',
                    color: row.status === 'ENTRY'
                      ? 'var(--color-primary)'
                      : 'var(--color-amber)',
                    border: `1px solid ${row.status === 'ENTRY' ? 'rgba(61,255,122,0.25)' : 'rgba(240,180,41,0.25)'}`,
                  }}
                >
                  {row.status === 'ENTRY' ? '▲ ENTRY' : '▼ EXIT'}
                </span>
              </span>

              {/* Personnel */}
              <span>
                <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--color-primary)', display: 'block' }}>
                  {row.army_id || `#${row.personnel_id}`}
                </span>
                <span style={{ fontSize: 12 }}>{row.full_name || '—'}</span>
                {row.rank && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}> {row.rank}</span>
                )}
              </span>

              {/* Camera */}
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--color-text-dim)' }}>
                {row.camera_id}
              </span>

              {/* Times */}
              <span className="timestamp" style={{ fontSize: 11 }}>{fmtTime(row.entry_time)}</span>
              <span className="timestamp" style={{ fontSize: 11 }}>{fmtTime(row.exit_time)}</span>

              {/* Confidence */}
              <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11 }}>
                {row.confidence_score ? `${Math.round(row.confidence_score * 100)}%` : '—'}
              </span>

              {/* Admin override button */}
              <span>
                <Tooltip title={`Flip to ${row.status === 'ENTRY' ? 'EXIT' : 'ENTRY'}`} arrow>
                  <Button
                    size="small"
                    variant="outlined"
                    color={row.status === 'ENTRY' ? 'warning' : 'success'}
                    startIcon={<SwapVertIcon />}
                    disabled={overriding === row.id}
                    onClick={() => handleOverride(row.id)}
                    sx={{ fontSize: 10, px: 1, minWidth: 0 }}
                  >
                    {overriding === row.id ? '…' : 'Override'}
                  </Button>
                </Tooltip>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Stack>
  );
}