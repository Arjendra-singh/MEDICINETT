const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// Helper function to format time difference
const formatTimeDiff = (diffMs) => {
    const duration = moment.duration(diffMs);
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const generateDailyReport = (date, logs, medicines) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const reportsDir = path.join(__dirname, '../../reports');

        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const filename = `MEDICINETT_Report_${date}.pdf`;
        const filePath = path.join(reportsDir, filename);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // ===== HEADER =====
        doc.fontSize(24).font('Helvetica-Bold').text('MEDICINETT', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('Daily Medicine Report', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(11).text(`Date: ${date}`, { align: 'right' });
        doc.moveDown(0.8);

        // ===== MAIN TABLE =====
        const tableConfig = {
            startX: 30,
            startY: doc.y,
            // widths sum should fit within A4 - margins
            colWidths: [30, 60, 130, 50, 50, 50, 60, 60, 45],
            rowHeight: 22,
            fontSize: 9
        };

        const columns = [
            'No.', 'Slot', 'Medicine Name', 'Scheduled', 'Taken', 'Status',
            'Schedule vs Taken', 'Scheduled Slot Gap', 'Actual Taken Slot Gap'
        ];
        const columnKeys = ['no', 'slot', 'name', 'scheduled', 'taken', 'status', 'scheduleVsTaken', 'scheduledSlotGap', 'actualTakenSlotGap'];

        // Prepare sorted data by time slot order
        const timeSlotOrder = { 'Morning': 1, 'Noon': 2, 'Evening': 3, 'Night': 4 };
        const sortedMeds = medicines.sort((a, b) => {
            const slotDiff = timeSlotOrder[a.timeSlot] - timeSlotOrder[b.timeSlot];
            if (slotDiff !== 0) return slotDiff;
            return a.scheduledTime.localeCompare(b.scheduledTime);
        });

        // Build table rows with proper formatting, computing required gaps
        const rows = sortedMeds.map((med, idx) => {
            const log = logs.find(l => l.medicineNo === med.medicineNo);
            const status = log ? log.status : 'PENDING';
            const takenTime = log && log.takenTime ? moment(log.takenTime).format('HH:mm') : '-';

            // schedule vs taken deviation - robust formatting
            let scheduleVsTaken = 'N/A';
            try {
                if (!med.scheduledTime || !(log && log.takenTime)) {
                    scheduleVsTaken = 'N/A';
                } else {
                    const scheduled = moment(`${date}T${med.scheduledTime}`, 'YYYY-MM-DDTHH:mm', true);
                        const actual = moment(`${date}T${takenTime}`, 'YYYY-MM-DDTHH:mm', true);
                    if (!scheduled.isValid() || !actual.isValid()) {
                        scheduleVsTaken = 'N/A';
                    } else {
                        const diffMs = actual.diff(scheduled);
                        const absDur = moment.duration(Math.abs(diffMs));
                        const hh = String(Math.floor(absDur.asHours())).padStart(2,'0');
                        const mm = String(absDur.minutes()).padStart(2,'0');
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
                name: med.name,
                scheduled: med.scheduledTime,
                taken: takenTime,
                status: status,
                scheduleVsTaken: scheduleVsTaken,
                scheduledSlotGap: '-',
                actualTakenSlotGap: '-'
            };
        });

        // Draw table header
        doc.font('Helvetica-Bold').fontSize(8);
        let y = tableConfig.startY;
        
        doc.rect(tableConfig.startX, y, 490, tableConfig.rowHeight).stroke();
        
        let x = tableConfig.startX;
        columns.forEach((col, i) => {
            const cellY = y + (tableConfig.rowHeight - 12) / 2;
            doc.text(col, x + 3, cellY, { width: tableConfig.colWidths[i] - 6, align: 'center' });
            x += tableConfig.colWidths[i];
        });

        y += tableConfig.rowHeight;

        // Draw table rows
        doc.font('Helvetica').fontSize(8);
        // compute scheduled slot gaps and actual taken slot gaps (vs previous row)
        for (let i = 0; i < rows.length; i++) {
            const prev = rows[i - 1];
            const cur = rows[i];
            if (prev) {
                // scheduled slot gap: simplified same-day logic (if next earlier, add 12h)
                const [h1, m1] = prev.scheduled.split(':').map(Number);
                const [h2, m2] = cur.scheduled.split(':').map(Number);
                let mins1 = h1 * 60 + m1;
                let mins2 = h2 * 60 + m2;
                let diff = mins2 - mins1;
                if (diff < 0) {
                    mins2 += 12 * 60; // normalize by adding 12 hours
                    diff = mins2 - mins1;
                }
                const gh = Math.floor(diff / 60);
                const gm = diff % 60;
                cur.scheduledSlotGap = `${String(gh).padStart(2,'0')}h ${String(gm).padStart(2,'0')}m`;

                // actual taken slot gap: simplified same-day logic (if next earlier, add 12h)
                if (prev.taken !== '-' && cur.taken !== '-') {
                    let prevTaken = moment(`${date}T${prev.taken}`);
                    let curTaken = moment(`${date}T${cur.taken}`);
                    let diffMs = curTaken.diff(prevTaken);
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
        }

        rows.forEach((row, rowIdx) => {
            // Draw row background alternating
            if (rowIdx % 2 === 0) {
                doc.rect(tableConfig.startX, y, 490, tableConfig.rowHeight).fill('#f5f5f5').stroke('#f5f5f5');
                doc.fillColor('black');
            } else {
                doc.rect(tableConfig.startX, y, 490, tableConfig.rowHeight).stroke();
            }

            // Color code based on status (apply to status cell)
            const statusColor = row.status === 'TAKEN' ? '#197d3b' : row.status === 'MISSED' ? '#cc0000' : '#d97706';

            let cellX = tableConfig.startX;
            columnKeys.forEach((key, i) => {
                const cellY = y + (tableConfig.rowHeight - 12) / 2;
                const cellWidth = tableConfig.colWidths[i];
                let align = 'center';
                if (key === 'name') align = 'left';

                // Status cell has colored text
                if (key === 'status') {
                    doc.fillColor(statusColor);
                    doc.text(row[key], cellX + 3, cellY, { width: cellWidth - 6, align });
                    doc.fillColor('black');
                } else {
                    // Gaps coloring: green if <=60m, orange if <=180m, red otherwise
                    if (key === 'scheduleVsTaken' || key === 'scheduledSlotGap' || key === 'actualTakenSlotGap') {
                        const val = row[key];
                        if (val && val !== '-' && val !== 'On Time') {
                            const m = val.match(/([+-]?)(\d+)h\s+(\d+)m/);
                            if (m) {
                                const hours = Number(m[2]);
                                const mins = Number(m[3]);
                                const totalMins = hours * 60 + mins;
                                const gapColor = totalMins <= 60 ? '#1f7a1f' : totalMins <= 180 ? '#d97706' : '#b91c1c';
                                doc.fillColor(gapColor);
                            }
                        }
                        doc.text(row[key], cellX + 3, cellY, { width: cellWidth - 6, align });
                        doc.fillColor('black');
                    } else {
                        doc.text(row[key], cellX + 3, cellY, { width: cellWidth - 6, align });
                    }
                }

                cellX += cellWidth;
            });

            doc.fillColor('black');
            y += tableConfig.rowHeight;
        });

        // Draw bottom border
        doc.rect(tableConfig.startX, y - tableConfig.rowHeight, 490, tableConfig.rowHeight).stroke();

        y += 15;

        // ===== SUMMARY SECTION =====
        doc.fontSize(10).font('Helvetica-Bold').text('Summary', 30, y);
        y += 15;

        doc.font('Helvetica').fontSize(8);
        const taken = rows.filter(r => r.status === 'TAKEN').length;
        const missed = rows.filter(r => r.status === 'MISSED').length;
        const pending = rows.filter(r => r.status === 'PENDING').length;

        doc.text(`✓ Taken: ${taken} | ✗ Missed: ${missed} | ⊘ Pending: ${pending}`, 30, y);
        y += 20;

        // ===== FOOTER =====
        doc.fontSize(8).text(`Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')} | MEDICINETT System`, 30, y, { align: 'center' });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
};

module.exports = { generateDailyReport };
