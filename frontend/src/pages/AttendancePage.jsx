import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadIcon from '@mui/icons-material/Download';
import { api } from '../services/api.js';

export default function AttendancePage() {
  const [rows, setRows]         = useState([]);
  const [filters, setFilters]   = useState({ status: '', camera_id: '', date_range: 'all' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [overriding, setOverriding] = useState(null);
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState('pdf');
  const [downloadRange, setDownloadRange] = useState('day');

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

  // Group logs by person
  const groupedByPerson = {};
  rows.forEach((row) => {
    const key = row.personnel_id || row.army_id || 'UNKNOWN';
    if (!groupedByPerson[key]) {
      groupedByPerson[key] = {
        personnel_id: row.personnel_id,
        army_id: row.army_id,
        full_name: row.full_name || 'UNKNOWN',
        rank: row.rank,
        logs: [],
      };
    }
    groupedByPerson[key].logs.push(row);
  });

  const personGroups = Object.values(groupedByPerson).sort((a, b) => {
    const latestA = a.logs[0]?.timestamp || 0;
    const latestB = b.logs[0]?.timestamp || 0;
    return new Date(latestB).getTime() - new Date(latestA).getTime();
  });

  const entryCount = rows.filter((r) => r.status === 'ENTRY').length;
  const exitCount  = rows.filter((r) => r.status === 'EXIT').length;
  const insideNow  = entryCount - exitCount;

  const handleDownload = async () => {
    // Placeholder for download functionality
    // In real implementation, this would call a backend endpoint
    console.log(`Downloading ${downloadFormat.toUpperCase()} for ${downloadRange}`);
    setDownloadOpen(false);
  };

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
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
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

            <TextField
              select label="DATE RANGE"
              value={filters.date_range}
              onChange={(e) => setFilters({ ...filters, date_range: e.target.value })}
              sx={{ width: 200 }}
            >
              <MenuItem value="all">ALL DATES</MenuItem>
              <MenuItem value="today">TODAY</MenuItem>
              <MenuItem value="week">THIS WEEK</MenuItem>
              <MenuItem value="month">THIS MONTH</MenuItem>
            </TextField>

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
            <Button 
              variant="outlined" 
              startIcon={<DownloadIcon />} 
              onClick={() => setDownloadOpen(true)}
              sx={{ height: 50, px: 3, marginLeft: 'auto' }}
            >
              EXPORT
            </Button>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Personnel Access History</div>
          </div>
          <div className="tablePanel">
            {personGroups.length === 0 && !loading && (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 4 }}>
                NO LOG RECORDS FOUND
              </div>
            )}

            {personGroups.map((person) => (
              <div key={person.personnel_id || person.army_id}>
                {/* Person Header - Clickable */}
                <div
                  onClick={() => setExpandedPerson(expandedPerson === (person.personnel_id || person.army_id) ? null : (person.personnel_id || person.army_id))}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 1fr 150px 150px 100px',
                    gap: 20,
                    padding: '20px 25px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--surface2)',
                    cursor: 'pointer',
                    alignItems: 'center',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                >
                  <div style={{ fontSize: 20, textAlign: 'center' }}>
                    <ExpandMoreIcon 
                      sx={{ 
                        transform: expandedPerson === (person.personnel_id || person.army_id) ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }} 
                    />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, textTransform: 'uppercase' }}>
                      {person.full_name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                      ID: {person.army_id || person.personnel_id} • {person.rank || 'N/A'}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-dim)', textAlign: 'center' }}>
                    {person.logs.length} EVENTS
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green-bright)', textAlign: 'center', fontWeight: 700 }}>
                    {person.logs.filter(l => l.status === 'ENTRY').length} IN / {person.logs.filter(l => l.status === 'EXIT').length} OUT
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                    LAST: {fmtTime(person.logs[0]?.timestamp)}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedPerson === (person.personnel_id || person.army_id) && (
                  <div style={{ background: 'rgba(76,175,80,0.05)', borderBottom: '1px solid var(--border)' }}>
                    {person.logs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '40px 120px 1fr 120px 220px 220px 100px 120px',
                          gap: 20,
                          padding: '16px 25px 16px 65px',
                          borderBottom: '1px solid var(--border)',
                          alignItems: 'center',
                          fontSize: 13,
                        }}
                      >
                        <span></span>
                        <span>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 12px',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 900,
                              letterSpacing: 1,
                              background: log.status === 'ENTRY' ? 'rgba(76,175,80,0.1)' : 'rgba(255,179,0,0.1)',
                              color: log.status === 'ENTRY' ? 'var(--green-bright)' : 'var(--amber)',
                              border: `1px solid ${log.status === 'ENTRY' ? 'var(--green-dim)' : 'rgba(255,179,0,0.2)'}`,
                            }}
                          >
                            {log.status === 'ENTRY' ? '▲ ENTRY' : '▼ EXIT'}
                          </span>
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                          {log.camera_id}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                          {log.confidence_score ? `${Math.round(log.confidence_score * 100)}%` : '—'}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{fmtTime(log.entry_time)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{fmtTime(log.exit_time)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{fmtTime(log.timestamp)}</span>
                        <div style={{ textAlign: 'right' }}>
                          <Tooltip title="MANUAL OVERRIDE" arrow>
                            <Button
                              size="small"
                              variant="outlined"
                              color={log.status === 'ENTRY' ? 'warning' : 'success'}
                              startIcon={<SwapVertIcon />}
                              disabled={overriding === log.id}
                              onClick={() => handleOverride(log.id)}
                              sx={{ border: 'none', '&:hover': { background: 'var(--surface2)' } }}
                            >
                              {overriding === log.id ? '...' : 'OVERRIDE'}
                            </Button>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Stack>

      {/* Download Dialog */}
      <Dialog open={downloadOpen} onClose={() => setDownloadOpen(false)}>
        <DialogTitle>Export Access Logs</DialogTitle>
        <DialogContent style={{ minWidth: 400, paddingTop: 20 }}>
          <TextField
            select
            label="FORMAT"
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value)}
            fullWidth
            sx={{ marginBottom: 2 }}
          >
            <MenuItem value="pdf">PDF Report</MenuItem>
            <MenuItem value="excel">Excel Spreadsheet</MenuItem>
          </TextField>
          <TextField
            select
            label="TIME RANGE"
            value={downloadRange}
            onChange={(e) => setDownloadRange(e.target.value)}
            fullWidth
          >
            <MenuItem value="day">Today</MenuItem>
            <MenuItem value="week">This Week</MenuItem>
            <MenuItem value="month">This Month</MenuItem>
            <MenuItem value="all">All Records</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadOpen(false)}>Cancel</Button>
          <Button onClick={handleDownload} variant="contained" sx={{ background: 'var(--green)', color: '#000' }}>
            Download
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
