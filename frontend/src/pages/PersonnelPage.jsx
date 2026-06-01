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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { api } from '../services/api.js';

const emptyForm = { army_id: '', full_name: '', rank: '', battalion: '', unit: '' };

export default function PersonnelPage() {
  const [rows, setRows]             = useState([]);
  const [query, setQuery]           = useState('');
  const [error, setError]           = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Registration dialog state
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
      setDeleteError(
        err.response?.data?.detail ||
        `Delete failed (status ${err.response?.status || 'unknown'}). Confirm admin access.`
      );
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
    <Stack spacing={2}>
      {/* Header */}
      <div className="pageHeader">
        <div>
          <Typography className="pageTitle">Personnel Roster</Typography>
          <div className="pageSub">REGISTERED SUBJECTS — {rows.length} TOTAL</div>
        </div>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={openReg}>
            Enlist
          </Button>
        </Stack>
      </div>

      {error      && <Alert severity="error">{error}</Alert>}
      {deleteError && <Alert severity="error" onClose={() => setDeleteError('')}>{deleteError}</Alert>}

      {/* Search */}
      <div className="filterPanel">
        <TextField
          label="Search roster"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Army ID, name, rank, unit…"
          sx={{ minWidth: 280 }}
        />
        <Typography className="pageSub" sx={{ ml: 'auto' }}>
          SHOWING {filtered.length} / {rows.length}
        </Typography>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panelHeader">Active Personnel</div>
        <div className="tablePanel">
          <div className="tableHeaderRow personnelHeaderRow">
            <span>Army ID</span>
            <span>Name</span>
            <span>Rank</span>
            <span>Battalion</span>
            <span>Unit</span>
            <span></span>
          </div>

          {filtered.length === 0 && (
            <div className="emptyState">No personnel records found</div>
          )}

          {filtered.map((row) => (
            <div className="gridRow personnelGrid" key={row.id ?? Math.random()}>
              <span className="armyId">{row.army_id || <em style={{ opacity: 0.4 }}>—</em>}</span>
              <span style={{ fontWeight: 600 }}>{row.full_name || <em style={{ opacity: 0.4 }}>—</em>}</span>
              <span className="rankBadge">{row.rank || '—'}</span>
              <span style={{ fontSize: 12 }}>{row.battalion || '—'}</span>
              <span style={{ fontSize: 12 }}>{row.unit || '—'}</span>
              <Button
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                disabled={deletingId === row.id}
                onClick={() => handleDelete(row.id, row.full_name)}
              >
                {deletingId === row.id ? 'Removing…' : 'Remove'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Registration dialog ── */}
      <Dialog open={regOpen} onClose={closeReg} fullWidth maxWidth="sm">
        <DialogTitle>Enlist New Personnel</DialogTitle>
        <DialogContent className="dialogForm">
          <div className="dialogClassification">
            FORM SEC-REG-01 — BIOMETRIC ENROLMENT
          </div>

          {regError && <Alert severity="error">{regError}</Alert>}

          <Stack spacing={2}>
            {fields.map(({ key, label }) => (
              <TextField
                key={key}
                label={label}
                size="small"
                value={regForm[key]}
                onChange={(e) => setRegForm({ ...regForm, [key]: e.target.value })}
              />
            ))}

            {/* File upload */}
            <div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => setRegFiles(e.target.files)}
              />
              <Button
                variant="outlined"
                fullWidth
                startIcon={<UploadFileIcon />}
                onClick={() => fileRef.current.click()}
              >
                {regFiles.length
                  ? `${regFiles.length} photo${regFiles.length > 1 ? 's' : ''} selected`
                  : 'Upload Face Photos'}
              </Button>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--color-text-dim)', marginTop: 4, letterSpacing: 0.5 }}>
                Upload 2–5 photos for best recognition accuracy. Different angles recommended.
              </div>
            </div>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReg}>Cancel</Button>
          <Button variant="contained" onClick={submitReg} disabled={regSaving}>
            {regSaving ? 'Enlisting…' : 'Enlist Soldier'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}