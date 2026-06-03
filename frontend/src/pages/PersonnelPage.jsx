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
              <div className="gridRow personnelGrid" key={row.id}>
                <span className="armyId">{row.army_id || '—'}</span>
                <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{row.full_name || '—'}</span>
                <span className="rankBadge">{row.rank || '—'}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{row.battalion || '—'}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{row.unit || '—'}</span>
                <div style={{ textAlign: 'right' }}>
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

      <Dialog open={regOpen} onClose={closeReg} fullWidth maxWidth="sm">
        <DialogTitle>Personnel Enrolment</DialogTitle>
        <DialogContent className="dialogForm">
          <div className="dialogClassification">
            BIOMETRIC REGISTRATION FORM — SEC-LEVEL 4 AUTHORIZATION REQUIRED
          </div>

          {regError && <Alert severity="error" sx={{ mb: 3 }}>{regError}</Alert>}

          <Stack spacing={3}>
            {fields.map(({ key, label }) => (
              <TextField
                key={key}
                label={label}
                fullWidth
                value={regForm[key]}
                onChange={(e) => setRegForm({ ...regForm, [key]: e.target.value })}
              />
            ))}

            <div style={{ marginTop: 10 }}>
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
                sx={{ height: 60, borderStyle: 'dashed' }}
              >
                {regFiles.length
                  ? `${regFiles.length} IMAGES SELECTED`
                  : 'UPLOAD BIOMETRIC SAMPLES (PHOTOS)'}
              </Button>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 10, textAlign: 'center', letterSpacing: 1 }}>
                MINIMUM 3 HIGH-RESOLUTION SAMPLES REQUIRED FOR OPTIMAL ACCURACY
              </div>
            </div>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 4, background: 'var(--bg3)' }}>
          <Button onClick={closeReg} sx={{ color: 'var(--text-muted)' }}>ABORT</Button>
          <Button 
            variant="contained" 
            onClick={submitReg} 
            disabled={regSaving}
            sx={{ px: 4, height: 50, background: 'var(--green)', color: '#000' }}
          >
            {regSaving ? 'PROCESSING...' : 'CONFIRM ENLISTMENT'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
