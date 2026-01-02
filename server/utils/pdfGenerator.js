const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const generateDailyReport = (date, logs, medicines) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const reportsDir = path.join(__dirname, '../../reports');

        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const filename = `MEDICINETT_Report_${date}.pdf`;
        const filePath = path.join(reportsDir, filename);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('MEDICINETT – Daily Medicine Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Date: ${date}`, { align: 'right' });
        doc.moveDown();

        // Table Header
        const tableTop = 150;
        const itemHeight = 30;

        doc.font('Helvetica-Bold');
        doc.text('No.', 50, tableTop);
        doc.text('Medicine Name', 100, tableTop);
        doc.text('Scheduled', 300, tableTop);
        doc.text('Taken Time', 400, tableTop);
        doc.text('Status', 500, tableTop);

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table Rows
        let y = tableTop + 25;
        doc.font('Helvetica');

        medicines.forEach((med) => {
            const log = logs.find(l => l.medicineNo === med.medicineNo);
            const status = log ? log.status : 'PENDING'; // Should be MISSED if past day
            const takenTime = log && log.takenTime ? moment(log.takenTime).format('HH:mm:ss') : '-';

            // Highlight Missed in Red
            if (status === 'MISSED') {
                doc.fillColor('red');
            } else if (status === 'TAKEN') {
                doc.fillColor('green');
            } else {
                doc.fillColor('black');
            }

            doc.text(med.medicineNo.toString(), 50, y);
            doc.text(med.name, 100, y);
            doc.text(med.scheduledTime, 300, y);
            doc.text(takenTime, 400, y);
            doc.text(status, 500, y);

            doc.fillColor('black'); // Reset
            y += itemHeight;
        });

        // Time Intervals Calculation
        const takenLogs = logs
            .filter(l => l.status === 'TAKEN' && l.takenTime)
            .sort((a, b) => new Date(a.takenTime) - new Date(b.takenTime));

        if (takenLogs.length >= 2) {
            y += 20;
            doc.fontSize(14).text('Time Intervals Between Medicines', 50, y);
            y += 25;
            doc.fontSize(10);

            for (let i = 0; i < takenLogs.length - 1; i++) {
                const current = takenLogs[i];
                const next = takenLogs[i + 1];

                const diffMs = new Date(next.takenTime) - new Date(current.takenTime);
                const duration = moment.duration(diffMs);
                const hours = Math.floor(duration.asHours());
                const minutes = duration.minutes();
                const seconds = duration.seconds();

                const timeString = `${hours}h ${minutes}m ${seconds}s`;

                doc.text(`${current.name} -> ${next.name}: ${timeString}`, 50, y);
                y += 15;
            }
        }

        // Footer
        doc.moveTo(50, y).lineTo(550, y).stroke();
        doc.moveDown(2);
        doc.fontSize(10).text(`Generated at: ${moment().format('YYYY-MM-DD HH:mm:ss')}`, { align: 'center' });
        doc.text('System: MEDICINETT', { align: 'center' });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
};

module.exports = { generateDailyReport };
