const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// Simple file-based database (JSON storage)
const DB_FILE = './water_data.json';

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.log('Creating new database file');
  }
  return { reports: [] };
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
  saveDB({ reports: [] });
  console.log('Database file created:', DB_FILE);
}

// API Routes

// Get latest report
app.get('/api/report/latest', (req, res) => {
  const db = loadDB();
  if (db.reports.length === 0) {
    res.json({ report: null });
    return;
  }
  const report = db.reports[db.reports.length - 1];
  res.json(report);
});

// Get all reports
app.get('/api/reports', (req, res) => {
  const db = loadDB();
  // Sort by date desc then updated_at desc
  const sorted = db.reports.sort((a, b) => {
    if (b.reportDate !== a.reportDate) return b.reportDate.localeCompare(a.reportDate);
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
  res.json(sorted.map(r => ({
    id: r.id,
    report_date: r.reportDate,
    crop_year: r.cropYear,
    created_at: r.created_at,
    updated_at: r.updated_at
  })));
});

// Get report by ID
app.get('/api/report/:id', (req, res) => {
  const db = loadDB();
  const reportId = parseInt(req.params.id);
  const report = db.reports.find(r => r.id === reportId);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  res.json(report);
});

// Save new report
app.post('/api/report', (req, res) => {
  const db = loadDB();
  const data = req.body;
  
  const now = new Date().toISOString();
  const newReport = {
    id: db.reports.length > 0 ? Math.max(...db.reports.map(r => r.id)) + 1 : 1,
    reportDate: data.reportDate,
    cropYear: data.cropYear,
    created_at: now,
    updated_at: now,
    rain: data.rain || [],
    reservoir: data.reservoir || [],
    reservoirStatus: data.reservoirStatus || [],
    river: data.river || [],
    crop: data.crop || {},
    allocation: data.allocation || {},
    assistance: data.assistance || {},
    weed: data.weed || {}
  };
  
  db.reports.push(newReport);
  saveDB(db);
  
  res.json({ success: true, reportId: newReport.id, message: 'บันทึกรายงานสำเร็จ' });
});

// Update existing report
app.put('/api/report/:id', (req, res) => {
  const db = loadDB();
  const reportId = parseInt(req.params.id);
  const data = req.body;
  
  const reportIndex = db.reports.findIndex(r => r.id === reportId);
  if (reportIndex === -1) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  
  // Update the report
  db.reports[reportIndex] = {
    ...db.reports[reportIndex],
    reportDate: data.reportDate,
    cropYear: data.cropYear,
    updated_at: new Date().toISOString(),
    rain: data.rain || [],
    reservoir: data.reservoir || [],
    reservoirStatus: data.reservoirStatus || [],
    river: data.river || [],
    crop: data.crop || {},
    allocation: data.allocation || {},
    assistance: data.assistance || {},
    weed: data.weed || {}
  };
  
  saveDB(db);
  
  res.json({ success: true, reportId, message: 'อัปเดตรายงานสำเร็จ' });
});

// Delete report
app.delete('/api/report/:id', (req, res) => {
  const db = loadDB();
  const reportId = parseInt(req.params.id);
  const initialLength = db.reports.length;
  db.reports = db.reports.filter(r => r.id !== reportId);
  
  if (db.reports.length === initialLength) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  
  saveDB(db);
  res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
});

// Rain API endpoint (for external API integration)
app.get('/api/rain', (req, res) => {
  // This is a sample endpoint - replace with actual API logic
  const sampleRainData = {
    rows: [
      ['เพชรบูรณ์', 'บ้านวังขอน', '40', '957.84', '+10.10'],
      ['อยุธยา', 'คลองบางบาล', '28', '977.81', '+12.39'],
      ['ลพบุรี', 'อบต.ท่ามะนาว', '83', '590.91', '-32.08'],
      ['สระบุรี', 'บ้านหินลับ', '99', '862.80', '-0.83'],
      ['ชัยนาท', 'ปตร.มโนรมย์', '32.2', '572.11', '-34.24']
    ]
  };
  res.json(sampleRainData);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
