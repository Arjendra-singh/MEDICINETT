const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const DailyLog = require('../models/DailyLog');
const moment = require('moment');
const { generateDailyReport } = require('../utils/pdfGenerator');
const path = require('path');

// Helper to get today's date string
const getTodayDate = () => moment().format('YYYY-MM-DD');

// GET all medicines with today's status
router.get('/', async (req, res) => {
    try {
        const today = getTodayDate();
        const medicines = await Medicine.find().sort({ medicineNo: 1 });
        const logs = await DailyLog.find({ date: today });

        const result = medicines.map(med => {
            const log = logs.find(l => l.medicineNo === med.medicineNo);
            return {
                ...med.toObject(),
                status: log ? log.status : 'PENDING',
                takenTime: log ? log.takenTime : null
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST create a new medicine (manual input)
router.post('/', async (req, res) => {
    try {
        const { name, scheduledTime, frequency, timeSlot } = req.body;

        if (!name || !scheduledTime || !frequency || !timeSlot) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Get the next incremental medicineNo
        const lastMedicine = await Medicine.findOne().sort({ medicineNo: -1 });
        const nextNo = lastMedicine ? lastMedicine.medicineNo + 1 : 1;

        const med = new Medicine({
            medicineNo: nextNo,
            name,
            scheduledTime,
            frequency,
            timeSlot
        });

        await med.save();
        res.status(201).json({ message: 'Medicine created', medicine: med });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST generate PDF report for a given date (or today if not provided)
router.post('/report', async (req, res) => {
    try {
        const date = req.body.date || moment().format('YYYY-MM-DD');
        const medicines = await Medicine.find().sort({ medicineNo: 1 });

        if (medicines.length === 0) {
            return res.status(400).json({ message: 'No medicines data available to generate report.' });
        }

        // Get logs and enrich with latest medicine data to ensure correct mapping
        const logs = await DailyLog.find({ date });
        const enrichedLogs = logs.map(log => {
            const med = medicines.find(m => m.medicineNo === log.medicineNo);
            return {
                ...log.toObject(),
                // Override with fresh medicine data to ensure name/details are current
                name: med?.name || log.name,
                scheduledTime: med?.scheduledTime || log.scheduledTime
            };
        });

        const filePath = await generateDailyReport(date, enrichedLogs, medicines);

        res.download(filePath, path.basename(filePath), (err) => {
            if (err) {
                console.error('Error sending report:', err);
                // If download fails, still send path
                res.status(500).json({ message: 'Failed to send report' });
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST return report data (JSON) for on-screen reports and verification
router.post('/report/data', async (req, res) => {
    try {
        const date = req.body.date || moment().format('YYYY-MM-DD');
        const medicines = await Medicine.find().sort({ medicineNo: 1 });
        const logs = await DailyLog.find({ date });

        // Enrich logs with latest medicine info
        const enrichedLogs = logs.map(log => {
            const med = medicines.find(m => m.medicineNo === log.medicineNo);
            return {
                ...log.toObject(),
                name: med?.name || log.name,
                scheduledTime: med?.scheduledTime || log.scheduledTime,
                timeSlot: med?.timeSlot || med?.timeSlot || 'Unknown'
            };
        });

        // Prepare sorted medicines by slot and scheduled time
        const timeSlotOrder = { 'Morning': 1, 'Noon': 2, 'Evening': 3, 'Night': 4 };
        const sortedMeds = medicines.sort((a, b) => {
            const slotDiff = (timeSlotOrder[a.timeSlot] || 99) - (timeSlotOrder[b.timeSlot] || 99);
            if (slotDiff !== 0) return slotDiff;
            return a.scheduledTime.localeCompare(b.scheduledTime);
        });

        // Build rows with required gap calculations
        const rows = sortedMeds.map((med, idx) => {
            const log = enrichedLogs.find(l => l.medicineNo === med.medicineNo);
            const status = log ? log.status : 'PENDING';
            const taken = log && log.takenTime ? moment(log.takenTime).format('HH:mm') : null;

            // schedule vs taken deviation - validate times and format
            let scheduleVsTaken = 'N/A';
            try {
                if (!med.scheduledTime || !taken) {
                    scheduleVsTaken = 'N/A';
                } else {
                    const scheduled = moment(`${date}T${med.scheduledTime}`, 'YYYY-MM-DDTHH:mm', true);
                    const actual = moment(`${date}T${taken}`, 'YYYY-MM-DDTHH:mm', true);
                    if (!scheduled.isValid() || !actual.isValid()) {
                        scheduleVsTaken = 'N/A';
                    } else {
                        const diffMs = actual.diff(scheduled);
                        const absDur = moment.duration(Math.abs(diffMs));
                        const hh = String(Math.floor(absDur.asHours())).padStart(2, '0');
                        const mm = String(absDur.minutes()).padStart(2, '0');
                        if (diffMs === 0) {
                            scheduleVsTaken = 'On Time';
                        } else {
                            const sign = diffMs > 0 ? '+' : '-';
                            scheduleVsTaken = `${sign}${hh}h ${mm}m`;
                        }
                    }
                }
            } catch (e) {
                scheduleVsTaken = 'N/A';
            }

            return {
                no: String(idx + 1).padStart(2, '0'),
                slot: med.timeSlot,
                medicineNo: med.medicineNo,
                name: med.name,
                scheduled: med.scheduledTime,
                taken: taken || '-',
                status,
                scheduleVsTaken
            };
        });

        // Calculate slot gaps (scheduled) and actual taken slot gaps per row (versus previous row)
        for (let i = 0; i < rows.length; i++) {
            const prev = rows[i - 1];
            const cur = rows[i];
            // Scheduled slot gap
            if (prev) {
                const [h1, m1] = prev.scheduled.split(':').map(Number);
                const [h2, m2] = cur.scheduled.split(':').map(Number);
                const mins1 = h1 * 60 + m1;
                let mins2 = h2 * 60 + m2;
                let diff = mins2 - mins1;
                // Simplified same-day logic: if next time is earlier, treat as PM-ish and add 12 hours
                if (diff < 0) {
                    mins2 += 12 * 60; // add 12 hours
                    diff = mins2 - mins1;
                }
                const gh = Math.floor(diff / 60);
                const gm = diff % 60;
                cur.scheduledSlotGap = `${String(gh).padStart(2,'0')}h ${String(gm).padStart(2,'0')}m`;
            } else {
                cur.scheduledSlotGap = '-';
            }

            // Actual taken slot gap
            if (prev && prev.taken !== '-' && cur.taken !== '-') {
                let prevTaken = moment(`${date}T${prev.taken}`);
                let curTaken = moment(`${date}T${cur.taken}`);
                let diffMs = curTaken.diff(prevTaken);
                // Simplified same-day logic: if curTaken earlier, add 12 hours to curTaken
                if (diffMs < 0) {
                    curTaken = curTaken.add(12, 'hours');
                    diffMs = curTaken.diff(prevTaken);
                }
                const dh = Math.floor(moment.duration(diffMs).asHours());
                const dm = moment.duration(diffMs).minutes();
                cur.actualTakenSlotGap = `${String(dh).padStart(2,'0')}h ${String(dm).padStart(2,'0')}m`;
            } else {
                cur.actualTakenSlotGap = '-';
            }
        }

        const summary = {
            taken: rows.filter(r => r.status === 'TAKEN').length,
            missed: rows.filter(r => r.status === 'MISSED').length,
            pending: rows.filter(r => r.status === 'PENDING').length
        };

        res.json({ date, rows, summary });
    } catch (err) {
        console.error('Report data error:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST mark medicine as completed (Voice Command)
router.post('/:medicineNo/complete', async (req, res) => {
    try {
        const { medicineNo } = req.params;
        const today = getTodayDate();
        const now = new Date();

        const medicine = await Medicine.findOne({ medicineNo });
        if (!medicine) {
            return res.status(404).json({ message: 'Medicine not found' });
        }

        let log = await DailyLog.findOne({ date: today, medicineNo });

        if (log) {
            if (log.status === 'TAKEN') {
                return res.status(400).json({ message: 'Medicine already taken' });
            }
            log.status = 'TAKEN';
            log.takenTime = now;
            await log.save();
        } else {
            // Create new log if not exists
            log = new DailyLog({
                date: today,
                medicineNo: medicine.medicineNo,
                name: medicine.name,
                scheduledTime: medicine.scheduledTime,
                takenTime: now,
                status: 'TAKEN'
            });
            await log.save();
        }

        res.json({ message: `Medicine ${medicineNo} marked as TAKEN`, log });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST Seed medicines (for setup)
router.post('/seed', async (req, res) => {
    try {
        await Medicine.deleteMany({});
        const medicines = [
            { medicineNo: 1, name: 'Paracetamol', scheduledTime: '09:00', frequency: 'Daily', timeSlot: 'Morning', dosage: '' },
            { medicineNo: 2, name: 'Vitamin D', scheduledTime: '09:30', frequency: 'Daily', timeSlot: 'Morning', dosage: '' },
            { medicineNo: 3, name: 'Amoxicillin', scheduledTime: '14:00', frequency: 'Daily', timeSlot: 'Noon', dosage: '' },
            { medicineNo: 4, name: 'Ibuprofen', scheduledTime: '20:00', frequency: 'Daily', timeSlot: 'Night', dosage: '' }
        ];
        await Medicine.insertMany(medicines);
        res.json({ message: 'Medicines seeded' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE a medicine and its logs
router.delete('/:medicineNo', async (req, res) => {
    try {
        const { medicineNo } = req.params;
        const num = Number(medicineNo);
        const med = await Medicine.findOneAndDelete({ medicineNo: num });
        if (!med) return res.status(404).json({ message: 'Medicine not found' });

        // Remove all daily logs for this medicine
        await DailyLog.deleteMany({ medicineNo: med.medicineNo });

        res.json({ message: `Medicine ${medicineNo} deleted` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH update medicine details
router.patch('/:medicineNo', async (req, res) => {
    try {
        const { medicineNo } = req.params;
        const updates = req.body || {};
        const num = Number(medicineNo);
        const med = await Medicine.findOneAndUpdate({ medicineNo: num }, updates, { new: true });
        if (!med) return res.status(404).json({ message: 'Medicine not found' });
        res.json({ message: 'Medicine updated', medicine: med });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST set taken time for a medicine (manual input)
router.post('/:medicineNo/taken', async (req, res) => {
    try {
        const { medicineNo } = req.params;
        const { takenTime, date } = req.body || {};
        const day = date || getTodayDate();
        const num = Number(medicineNo);

        const medicine = await Medicine.findOne({ medicineNo: num });
        if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

        const timeValue = takenTime ? new Date(takenTime) : new Date();

        let log = await DailyLog.findOne({ date: day, medicineNo: num });
        if (log) {
            log.takenTime = timeValue;
            log.status = 'TAKEN';
            await log.save();
        } else {
            log = new DailyLog({
                date: day,
                medicineNo: medicine.medicineNo,
                name: medicine.name,
                scheduledTime: medicine.scheduledTime,
                takenTime: timeValue,
                status: 'TAKEN'
            });
            await log.save();
        }

        res.json({ message: 'Taken time updated', log });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
