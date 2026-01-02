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

        // Use timestamp for unique medicineNo
        const nextNo = Date.now();

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

        const logs = await DailyLog.find({ date });

        const filePath = await generateDailyReport(date, logs, medicines);

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
            { medicineNo: 1, name: 'Paracetamol', scheduledTime: '09:00', frequency: 'Daily', timeSlot: 'Morning' },
            { medicineNo: 2, name: 'Vitamin D', scheduledTime: '09:00', frequency: 'Daily', timeSlot: 'Morning' },
            { medicineNo: 3, name: 'Amoxicillin', scheduledTime: '14:00', frequency: 'Daily', timeSlot: 'Noon' },
            { medicineNo: 4, name: 'Ibuprofen', scheduledTime: '20:00', frequency: 'Daily', timeSlot: 'Night' }
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
