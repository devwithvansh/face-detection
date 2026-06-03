import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
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
  const [overriding, setOverriding] = useState(null);

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
      ? new Date(ts).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true
        }).toUpperCase()
      : '—';

  const entryCount = rows.filter((r) => r.status === 'ENTRY').length;
  const exitCount  = rows.filter((r) => r.status === 'EXIT').length;
  const insideNow  = entryCount - exitCount;

  return (
    <div className="mainContent">
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Access Logs</Typography>
          <div className="pageSub">SECURE LOGISTICS — {rows.length} RECORDED EVENTS</div>
        </div>
        <Stack direction="row" spacing={3}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: '15px 25px', display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>ENTRIES</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: 'var(--green-bright)' }}>{entryCount}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: '15px 25px', display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>EXITS</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: 'var(--amber)' }}>{exitCount}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: '15px 25px', display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>INSIDE</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900 }}>{insideNow}</div>
          </div>
        </Stack>
      </div>

      <Stack spacing={4}>
        {error && <Alert severity="error" sx={{ borderRadius: 0 }}>{error}</Alert>}

        <div className="panel" style={{ padding: 25 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <TextField
              select label="FILTER STATUS"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              sx={{ width: 200 }}
            >
              <MenuItem value="">ALL EVENTS</MenuItem>
              <MenuItem value="ENTRY">ENTRY ONLY</MenuItem>
              <MenuItem value="EXIT">EXIT ONLY</MenuItem>
            </TextField>

            <TextField
              label="FILTER CAMERA ID"
              value={filters.camera_id}
              onChange={(e) => setFilters({ ...filters, camera_id: e.target.value })}
              placeholder="e.g. GATE1"
              sx={{ width: 250 }}
            />

            <Button 
              variant="contained" 
              startIcon={<SearchIcon />} 
              onClick={load} 
              disabled={loading}
              sx={{ height: 50, px: 4, background: 'var(--green)', color: '#000' }}
            >
              {loading ? 'SEARCHING...' : 'EXECUTE SEARCH'}
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<RefreshIcon />} 
              onClick={load} 
              disabled={loading}
              sx={{ height: 50, px: 3 }}
            >
              REFRESH
            </Button>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Secure Punch Logs</div>
          </div>
          <div className="tablePanel">
            <div className="tableHeaderRow" style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px 220px 220px 100px 120px', gap: 20, padding: '20px 25px' }}>
              <span>Event</span>
              <span>Personnel</span>
              <span>Sector</span>
              <span>Entry Time</span>
              <span>Exit Time</span>
              <span>Conf.</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {rows.length === 0 && !loading && (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 4 }}>
                NO LOG RECORDS FOUND
              </div>
            )}

            {rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 120px 220px 220px 100px 120px',
                  gap: 20,
                  padding: '20px 25px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                }}
              >
                <span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 900,
                      letterSpacing: 1,
                      background: row.status === 'ENTRY' ? 'rgba(76,175,80,0.1)' : 'rgba(255,179,0,0.1)',
                      color: row.status === 'ENTRY' ? 'var(--green-bright)' : 'var(--amber)',
                      border: `1px solid ${row.status === 'ENTRY' ? 'var(--green-dim)' : 'rgba(255,179,0,0.2)'}`,
                    }}
                  >
                    {row.status === 'ENTRY' ? '▲ ENTRY' : '▼ EXIT'}
                  </span>
                </span>

                <span>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, textTransform: 'uppercase' }}>
                    {row.full_name || 'UNKNOWN'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    ID: {row.army_id || `#${row.personnel_id}`} • {row.rank || 'N/A'}
                  </div>
                </span>

                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)' }}>
                  {row.camera_id}
                </span>

                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>{fmtTime(row.entry_time)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>{fmtTime(row.exit_time)}</span>

                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>
                  {row.confidence_score ? `${Math.round(row.confidence_score * 100)}%` : '—'}
                </span>

                <div style={{ textAlign: 'right' }}>
                  <Tooltip title="MANUAL OVERRIDE" arrow>
                    <Button
                      size="small"
                      variant="outlined"
                      color={row.status === 'ENTRY' ? 'warning' : 'success'}
                      startIcon={<SwapVertIcon />}
                      disabled={overriding === row.id}
                      onClick={() => handleOverride(row.id)}
                      sx={{ border: 'none', '&:hover': { background: 'var(--surface2)' } }}
                    >
                      {overriding === row.id ? '...' : 'OVERRIDE'}
                    </Button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Stack>
    </div>
  );
}
