const cron = require('node-cron');
const moment = require('moment');
const Medicine = require('../models/Medicine');
const DailyLog = require('../models/DailyLog');
const { generateDailyReport } = require('../utils/pdfGenerator');

// 1. Missed Detection at 11:59 PM
cron.schedule('59 23 * * *', async () => {
    console.log('Running Missed Medicine Detection...');
    const today = moment().format('YYYY-MM-DD');

    try {
        const medicines = await Medicine.find();

        for (const med of medicines) {
            const log = await DailyLog.findOne({ date: today, medicineNo: med.medicineNo });

            if (!log) {
                // Not logged at all -> MISSED
                await DailyLog.create({
                    date: today,
                    medicineNo: med.medicineNo,
                    name: med.name,
                    scheduledTime: med.scheduledTime,
                    status: 'MISSED'
                });
            } else if (log.status === 'PENDING') {
                // Logged but pending -> MISSED
                log.status = 'MISSED';
                await log.save();
            }
        }
        console.log('Missed detection complete.');
    } catch (err) {
        console.error('Error in missed detection:', err);
    }
});

// 2. PDF Report & Daily Reset at 12:00 AM (Midnight)
cron.schedule('0 0 * * *', async () => {
    console.log('Generating Daily Report...');
    // Report is for the *previous* day
    const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');

    try {
        const medicines = await Medicine.find().sort({ medicineNo: 1 });
        const logs = await DailyLog.find({ date: yesterday });

        const filePath = await generateDailyReport(yesterday, logs, medicines);
        console.log(`Report generated: ${filePath}`);

        // Reset is implicit: New day requests will look for today's logs, which don't exist yet.
        // We could optionally pre-create PENDING logs for today here if desired, 
        // but the current logic handles "no log" as "PENDING" in the UI until 11:59 PM.

    } catch (err) {
        console.error('Error in daily report generation:', err);
    }
});

console.log('Cron jobs scheduled.');
