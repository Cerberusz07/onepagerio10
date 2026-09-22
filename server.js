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
  db.get('SELECT * FROM reports ORDER BY id DESC LIMIT 1', (err, report) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!report) {
      res.json({ report: null });
      return;
    }

    const responseData = { report };

    // Fetch all related data
    const queries = {
      rain: 'SELECT * FROM rain_data WHERE report_id = ?',
      reservoir: 'SELECT * FROM reservoir_data WHERE report_id = ?',
      reservoir_status: 'SELECT * FROM reservoir_status WHERE report_id = ?',
      river: 'SELECT * FROM river_data WHERE report_id = ?',
      crop: 'SELECT * FROM crop_data WHERE report_id = ?',
      allocation: 'SELECT * FROM allocation_data WHERE report_id = ?',
      assistance: 'SELECT * FROM assistance_data WHERE report_id = ?',
      weed: 'SELECT * FROM weed_data WHERE report_id = ?'
    };

    let completed = 0;
    const total = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, sql]) => {
      db.all(sql, [report.id], (err, rows) => {
        if (err) {
          responseData[key] = [];
        } else {
          responseData[key] = rows;
        }
        completed++;
        if (completed === total) {
          res.json(responseData);
        }
      });
    });
  });
});

// Get report by ID with all related data
app.get('/api/report/:id', (req, res) => {
  const reportId = req.params.id;
  db.get('SELECT * FROM reports WHERE id = ?', [reportId], (err, report) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const responseData = { report };

    // Fetch all related data
    const queries = {
      rain: 'SELECT * FROM rain_data WHERE report_id = ?',
      reservoir: 'SELECT * FROM reservoir_data WHERE report_id = ?',
      reservoir_status: 'SELECT * FROM reservoir_status WHERE report_id = ?',
      river: 'SELECT * FROM river_data WHERE report_id = ?',
      crop: 'SELECT * FROM crop_data WHERE report_id = ?',
      allocation: 'SELECT * FROM allocation_data WHERE report_id = ?',
      assistance: 'SELECT * FROM assistance_data WHERE report_id = ?',
      weed: 'SELECT * FROM weed_data WHERE report_id = ?'
    };

    let completed = 0;
    const total = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, sql]) => {
      db.all(sql, [reportId], (err, rows) => {
        if (err) {
          responseData[key] = [];
        } else {
          responseData[key] = rows;
        }
        completed++;
        if (completed === total) {
          res.json(responseData);
        }
      });
    });
  });
});

// Save/Update report
app.post('/api/report', (req, res) => {
  const data = req.body;
  
  const transaction = () => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Insert or get report
        db.run(
          `INSERT INTO reports (report_date, crop_year) VALUES (?, ?)`,
          [data.reportDate, data.cropYear],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            const reportId = this.lastID;

            // Insert rain data
            if (data.rain && data.rain.length > 0) {
              const rainStmt = db.prepare(
                `INSERT INTO rain_data (report_id, province, station, rain_max, rain_accumulated, normal_compare) 
                 VALUES (?, ?, ?, ?, ?, ?)`
              );
              data.rain.forEach(row => {
                rainStmt.run(reportId, row.province, row.station, row.rainMax, row.rainAccumulated, row.normalCompare);
              });
              rainStmt.finalize();
            }

            // Insert reservoir data
            if (data.reservoir && data.reservoir.length > 0) {
              const resStmt = db.prepare(
                `INSERT INTO reservoir_data (report_id, size_category, capacity_mcm, volume_today, percent_capacity, 
                 usable_water, percent_usable, inflow, outflow, can_receive) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );
              data.reservoir.forEach(row => {
                resStmt.run(reportId, row.sizeCategory, row.capacity, row.volumeToday, row.percentCapacity,
                  row.usableWater, row.percentUsable, row.inflow, row.outflow, row.canReceive);
              });
              resStmt.finalize();
            }

            // Insert reservoir status
            if (data.reservoirStatus && data.reservoirStatus.length > 0) {
              const statusStmt = db.prepare(
                `INSERT INTO reservoir_status (report_id, size_category, over_80, range_51_80, range_31_50, under_30) 
                 VALUES (?, ?, ?, ?, ?, ?)`
              );
              data.reservoirStatus.forEach(row => {
                statusStmt.run(reportId, row.sizeCategory, row.over80, row.range51_80, row.range31_50, row.under30);
              });
              statusStmt.finalize();
            }

            // Insert river data
            if (data.river && data.river.length > 0) {
              const riverStmt = db.prepare(
                `INSERT INTO river_data (report_id, checkpoint, flow_rate, capacity, percent, status) 
                 VALUES (?, ?, ?, ?, ?, ?)`
              );
              data.river.forEach(row => {
                riverStmt.run(reportId, row.checkpoint, row.flowRate, row.capacity, row.percent, row.status);
              });
              riverStmt.finalize();
            }

            // Insert crop data
            if (data.crop) {
              db.run(
                `INSERT INTO crop_data (report_id, rice_plan, rice_actual, rice_percent, lowland_plan, lowland_actual, lowland_percent) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportId, data.crop.ricePlan, data.crop.riceActual, data.crop.ricePercent,
                 data.crop.lowlandPlan, data.crop.lowlandActual, data.crop.lowlandPercent]
              );
            }

            // Insert allocation data
            if (data.allocation) {
              db.run(
                `INSERT INTO allocation_data (report_id, chao_phraya_plan, chao_phraya_used, chao_phraya_needed, 
                 reservoir_plan, reservoir_used, reservoir_needed) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportId, data.allocation.chaoPhrayaPlan, data.allocation.chaoPhrayaUsed, data.allocation.chaoPhrayaNeeded,
                 data.allocation.reservoirPlan, data.allocation.reservoirUsed, data.allocation.reservoirNeeded]
              );
            }

            // Insert assistance data
            if (data.assistance) {
              db.run(
                `INSERT INTO assistance_data (report_id, push_pumps, water_pumps, water_trucks, drought_pumps) 
                 VALUES (?, ?, ?, ?, ?)`,
                [reportId, data.assistance.pushPumps, data.assistance.waterPumps, data.assistance.waterTrucks, data.assistance.droughtPumps]
              );
            }

            // Insert weed data
            if (data.weed) {
              db.run(
                `INSERT INTO weed_data (report_id, machine_plan, machine_actual, machine_percent, labor_plan, labor_actual, labor_percent) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportId, data.weed.machinePlan, data.weed.machineActual, data.weed.machinePercent,
                 data.weed.laborPlan, data.weed.laborActual, data.weed.laborPercent]
              );
            }

            resolve(reportId);
          }
        );
      });
    });
  };

  transaction()
    .then(reportId => {
      res.json({ success: true, reportId, message: 'รายงานบันทึกสำเร็จ' });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// Get all reports with timestamps
app.get('/api/reports', (req, res) => {
  db.all('SELECT id, report_date, crop_year, created_at, updated_at FROM reports ORDER BY report_date DESC, updated_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Update existing report by ID
app.put('/api/report/:id', (req, res) => {
  const reportId = req.params.id;
  const data = req.body;
  
  const transaction = () => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Update report with timestamp
        db.run(
          `UPDATE reports SET report_date = ?, crop_year = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [data.reportDate, data.cropYear, reportId],
          function(err) {
            if (err) {
              reject(err);
              return;
            }

            // Delete old related data
            db.run('DELETE FROM rain_data WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM reservoir_data WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM reservoir_status WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM river_data WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM crop_data WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM allocation_data WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM assistance_data WHERE report_id = ?', [reportId]);
            db.run('DELETE FROM weed_data WHERE report_id = ?', [reportId]);

            // Insert new rain data
            if (data.rain && data.rain.length > 0) {
              const rainStmt = db.prepare(
                `INSERT INTO rain_data (report_id, province, station, rain_max, rain_accumulated, normal_compare) 
                 VALUES (?, ?, ?, ?, ?, ?)`
              );
              data.rain.forEach(row => {
                rainStmt.run(reportId, row.province, row.station, row.rainMax, row.rainAccumulated, row.normalCompare);
              });
              rainStmt.finalize();
            }

            // Insert new reservoir data
            if (data.reservoir && data.reservoir.length > 0) {
              const resStmt = db.prepare(
                `INSERT INTO reservoir_data (report_id, size_category, capacity_mcm, volume_today, percent_capacity, 
                 usable_water, percent_usable, inflow, outflow, can_receive) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );
              data.reservoir.forEach(row => {
                resStmt.run(reportId, row.sizeCategory, row.capacity, row.volumeToday, row.percentCapacity,
                  row.usableWater, row.percentUsable, row.inflow, row.outflow, row.canReceive);
              });
              resStmt.finalize();
            }

            // Insert new reservoir status
            if (data.reservoirStatus && data.reservoirStatus.length > 0) {
              const statusStmt = db.prepare(
                `INSERT INTO reservoir_status (report_id, size_category, over_80, range_51_80, range_31_50, under_30) 
                 VALUES (?, ?, ?, ?, ?, ?)`
              );
              data.reservoirStatus.forEach(row => {
                statusStmt.run(reportId, row.sizeCategory, row.over80, row.range51_80, row.range31_50, row.under30);
              });
              statusStmt.finalize();
            }

            // Insert new river data
            if (data.river && data.river.length > 0) {
              const riverStmt = db.prepare(
                `INSERT INTO river_data (report_id, checkpoint, flow_rate, capacity, percent, status) 
                 VALUES (?, ?, ?, ?, ?, ?)`
              );
              data.river.forEach(row => {
                riverStmt.run(reportId, row.checkpoint, row.flowRate, row.capacity, row.percent, row.status);
              });
              riverStmt.finalize();
            }

            // Insert new crop data
            if (data.crop) {
              db.run(
                `INSERT INTO crop_data (report_id, rice_plan, rice_actual, rice_percent, lowland_plan, lowland_actual, lowland_percent) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportId, data.crop.ricePlan, data.crop.riceActual, data.crop.ricePercent,
                 data.crop.lowlandPlan, data.crop.lowlandActual, data.crop.lowlandPercent]
              );
            }

            // Insert new allocation data
            if (data.allocation) {
              db.run(
                `INSERT INTO allocation_data (report_id, chao_phraya_plan, chao_phraya_used, chao_phraya_needed, 
                 reservoir_plan, reservoir_used, reservoir_needed) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportId, data.allocation.chaoPhrayaPlan, data.allocation.chaoPhrayaUsed, data.allocation.chaoPhrayaNeeded,
                 data.allocation.reservoirPlan, data.allocation.reservoirUsed, data.allocation.reservoirNeeded]
              );
            }

            // Insert new assistance data
            if (data.assistance) {
              db.run(
                `INSERT INTO assistance_data (report_id, push_pumps, water_pumps, water_trucks, drought_pumps) 
                 VALUES (?, ?, ?, ?, ?)`,
                [reportId, data.assistance.pushPumps, data.assistance.waterPumps, data.assistance.waterTrucks, data.assistance.droughtPumps]
              );
            }

            // Insert new weed data
            if (data.weed) {
              db.run(
                `INSERT INTO weed_data (report_id, machine_plan, machine_actual, machine_percent, labor_plan, labor_actual, labor_percent) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportId, data.weed.machinePlan, data.weed.machineActual, data.weed.machinePercent,
                 data.weed.laborPlan, data.weed.laborActual, data.weed.laborPercent]
              );
            }

            resolve(reportId);
          }
        );
      });
    });
  };

  transaction()
    .then(reportId => {
      res.json({ success: true, reportId, message: 'อัปเดตรายงานสำเร็จ' });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// Delete report
app.delete('/api/report/:id', (req, res) => {
  const reportId = req.params.id;
  db.run('DELETE FROM reports WHERE id = ?', [reportId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, message: 'ลบรายงานสำเร็จ' });
  });
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
