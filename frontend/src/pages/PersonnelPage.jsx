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
  Typography,
  Tabs,
  Tab,
  Box,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import HistoryIcon from '@mui/icons-material/History';
import { api, storageUrl } from '../services/api.js';

const emptyForm = { army_id: '', full_name: '', rank: '', battalion: '', unit: '' };

function PersonnelHistoryModal({ open, onClose, personnel }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (open && personnel) {
      loadHistory();
    }
  }, [open, personnel]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance', {
        params: { personnel_id: personnel.id, limit: 500 }
      });
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
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

  // Group by date
  const historyByDate = {};
  history.forEach((log) => {
    const date = new Date(log.timestamp || log.entry_time).toLocaleDateString('en-GB');
    if (!historyByDate[date]) {
      historyByDate[date] = [];
    }
    historyByDate[date].push(log);
  });

  const sortedDates = Object.keys(historyByDate).sort((a, b) => new Date(b) - new Date(a));

  // Calculate stats
  const totalEntries = history.filter(l => l.status === 'ENTRY').length;
  const totalExits = history.filter(l => l.status === 'EXIT').length;
  const currentlyInside = totalEntries - totalExits;

  // Monthly breakdown
  const monthlyStats = {};
  history.forEach((log) => {
    const date = new Date(log.timestamp || log.entry_time);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = { entries: 0, exits: 0, days: new Set() };
    }
    if (log.status === 'ENTRY') monthlyStats[monthKey].entries++;
    else monthlyStats[monthKey].exits++;
    monthlyStats[monthKey].days.add(date.toLocaleDateString('en-GB'));
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, textTransform: 'uppercase' }}>
        {personnel?.full_name} — Complete History
      </DialogTitle>
      <DialogContent sx={{ minHeight: 500 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ marginBottom: 3, marginTop: 2 }}>
          <Tab label="Status Analyzer" />
          <Tab label="Monthly Breakdown" />
          <Tab label="Daily Details" />
        </Tabs>

        {/* Tab 1: Status Analyzer */}
        {tabValue === 0 && (
          <Box>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 30 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: 20 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Total Entries</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 900, color: 'var(--green-bright)' }}>{totalEntries}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: 20 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Total Exits</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 900, color: 'var(--amber)' }}>{totalExits}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: 20 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Currently Inside</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 900, color: currentlyInside > 0 ? 'var(--green-bright)' : 'var(--red-bright)' }}>
                  {currentlyInside > 0 ? '✓' : '✗'}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, textTransform: 'uppercase', marginBottom: 15 }}>Status Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Total Access Events</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{history.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Unique Days Active</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{sortedDates.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>Average Daily Events</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{(history.length / Math.max(sortedDates.length, 1)).toFixed(1)}</span>
                </div>
              </div>
            </div>
          </Box>
        )}

        {/* Tab 2: Monthly Breakdown */}
        {tabValue === 1 && (
          <Box>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {Object.entries(monthlyStats).sort(([a], [b]) => b.localeCompare(a)).map(([month, stats]) => (
                <div key={month} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, textTransform: 'uppercase' }}>
                        {new Date(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                        {stats.days.size} active days
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 30 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Entries</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: 'var(--green-bright)' }}>{stats.entries}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Exits</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: 'var(--amber)' }}>{stats.exits}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Box>
        )}

        {/* Tab 3: Daily Details */}
        {tabValue === 2 && (
          <Box>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, maxHeight: 400, overflowY: 'auto' }}>
              {sortedDates.map((date) => {
                const dayLogs = historyByDate[date];
                const dayEntries = dayLogs.filter(l => l.status === 'ENTRY').length;
                const dayExits = dayLogs.filter(l => l.status === 'EXIT').length;
                return (
                  <div key={date} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', padding: 15 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, textTransform: 'uppercase' }}>
                        {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                      <div style={{ display: 'flex', gap: 20 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>IN</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--green-bright)' }}>{dayEntries}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>OUT</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--amber)' }}>{dayExits}</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dayLogs.map((log) => (
                        <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>
                            {log.status === 'ENTRY' ? '▲ ENTRY' : '▼ EXIT'} @ {log.camera_id}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            {fmtTime(log.timestamp || log.entry_time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PersonnelPage() {
  const [rows, setRows]             = useState([]);
  const [query, setQuery]           = useState('');
  const [error, setError]           = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [selectedPersonnel, setSelectedPersonnel] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [regOpen, setRegOpen]   = useState(false);
  const [regForm, setRegForm]   = useState(emptyForm);
  const [regFiles, setRegFiles] = useState([]);
  const [regError, setRegError] = useState('');
  const [regSaving, setRegSaving] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/personnel');
      setRows(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to load personnel roster.');
    }
  };

  useEffect(() => {
    load();
    window.addEventListener('personnel-registered', load);
    return () => window.removeEventListener('personnel-registered', load);
  }, []);

  const handleDelete = async (id, name) => {
    if (!id) { setDeleteError('Cannot delete: record has no valid ID.'); return; }
    if (!window.confirm(`Permanently remove "${name || `ID ${id}`}" from roster?`)) return;
    setDeletingId(id);
    setDeleteError('');
    try {
      await api.delete(`/personnel/${id}`);
      await load();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const openReg = () => { setRegForm(emptyForm); setRegFiles([]); setRegError(''); setRegOpen(true); };
  const closeReg = () => setRegOpen(false);

  const submitReg = async () => {
    if (!regFiles.length) { setRegError('At least one face photo is required.'); return; }
    setRegSaving(true);
    setRegError('');
    const body = new FormData();
    Object.entries(regForm).forEach(([k, v]) => body.set(k, v));
    [...regFiles].forEach((f) => body.append('images', f));
    try {
      await api.post('/register', body);
      closeReg();
      await load();
    } catch (err) {
      setRegError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setRegSaving(false);
    }
  };

  const filtered = rows.filter((row) =>
    `${row.army_id} ${row.full_name} ${row.rank} ${row.unit} ${row.battalion}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const fields = [
    { key: 'army_id',    label: 'Army ID' },
    { key: 'full_name',  label: 'Full Name' },
    { key: 'rank',       label: 'Rank' },
    { key: 'battalion',  label: 'Battalion' },
    { key: 'unit',       label: 'Unit' },
  ];

  return (
    <div className="mainContent">
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Personnel Roster</Typography>
          <div className="pageSub">AUTHORIZED SUBJECT DATABASE — {rows.length} REGISTERED</div>
        </div>
        <Stack direction="row" spacing={2}>
          <Button 
            variant="outlined" 
            startIcon={<RefreshIcon />} 
            onClick={load}
            sx={{ height: 50, px: 3 }}
          >
            REFRESH
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            startIcon={<PersonAddIcon />} 
            onClick={openReg}
            sx={{ height: 50, px: 4, background: 'var(--green)', color: '#000' }}
          >
            ENLIST NEW
          </Button>
        </Stack>
      </div>

      <Stack spacing={4}>
        {error && <Alert severity="error" sx={{ borderRadius: 0 }}>{error}</Alert>}
        {deleteError && <Alert severity="error" sx={{ borderRadius: 0 }}>{deleteError}</Alert>}
        
        <div className="panel" style={{ padding: 25, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <TextField
              label="FILTER BY ID, NAME, OR UNIT"
              variant="outlined"
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search parameters..."
              sx={{ maxWidth: 500 }}
            />
            <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--amber)', letterSpacing: 2 }}>
              SHOWING {filtered.length} OF {rows.length} RECORDS
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Active Duty Personnel</div>
          </div>
          <div className="tablePanel">
            <div className="tableHeaderRow personnelHeaderRow">
              <span>Service ID</span>
              <span>Full Name</span>
              <span>Rank</span>
              <span>Battalion</span>
              <span>Unit</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 4 }}>
                NO MATCHING RECORDS FOUND
              </div>
            )}

            {filtered.map((row) => (
              <div className="gridRow personnelGrid" key={row.id} style={{ cursor: 'pointer' }}>
                <span className="armyId">{row.army_id || '—'}</span>
                <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{row.full_name || '—'}</span>
                <span className="rankBadge">{row.rank || '—'}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{row.battalion || '—'}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{row.unit || '—'}</span>
                <div style={{ textAlign: 'right', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Button
                    color="info"
                    size="small"
                    variant="outlined"
                    startIcon={<HistoryIcon />}
                    onClick={() => {
                      setSelectedPersonnel(row);
                      setHistoryOpen(true);
                    }}
                    sx={{ border: 'none', '&:hover': { background: 'var(--surface2)' } }}
                  >
                    HISTORY
                  </Button>
                  <Button
                    color="error"
                    size="small"
                    variant="outlined"
                    startIcon={<DeleteIcon />}
                    disabled={deletingId === row.id}
                    onClick={() => handleDelete(row.id, row.full_name)}
                    sx={{ border: 'none', '&:hover': { background: 'var(--red-dim)' } }}
                  >
                    {deletingId === row.id ? 'REMOVING...' : 'REMOVE'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Stack>

      {/* Personnel History Modal */}
      <PersonnelHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        personnel={selectedPersonnel}
      />

      <Dialog open={regOpen} onClose={closeReg} fullWidth maxWidth="sm">
        <DialogTitle>Personnel Enrolment</DialogTitle>
        <DialogContent className="dialogForm">
          <div className="dialogClassification">
            BIOMETRIC REGISTRATION FORM — SEC-LEVEL 4 AUTHORIZATION REQUIRED
          </div>
          {regError && <Alert severity="error" sx={{ my: 2, borderRadius: 0 }}>{regError}</Alert>}
          <Stack spacing={3} sx={{ mt: 3 }}>
            {fields.map((field) => (
              <TextField
                key={field.key}
                label={field.label.toUpperCase()}
                value={regForm[field.key]}
                onChange={(e) => setRegForm({ ...regForm, [field.key]: e.target.value })}
                fullWidth
              />
            ))}
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                Face Photos
              </div>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileRef.current?.click()}
                fullWidth
              >
                SELECT IMAGES
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => setRegFiles(Array.from(e.target.files || []))}
              />
              {regFiles.length > 0 && (
                <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green-bright)' }}>
                  ✓ {regFiles.length} image(s) selected
                </div>
              )}
            </div>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReg}>CANCEL</Button>
          <Button onClick={submitReg} disabled={regSaving} variant="contained" sx={{ background: 'var(--green)', color: '#000' }}>
            {regSaving ? 'ENROLLING...' : 'ENROLL'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
