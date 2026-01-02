const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
    date: { type: String, required: true }, // Format "YYYY-MM-DD"
    medicineNo: { type: Number, required: true },
    name: { type: String, required: true },
    scheduledTime: { type: String, required: true },
    takenTime: { type: Date },
    status: { type: String, enum: ['PENDING', 'TAKEN', 'MISSED'], default: 'PENDING' }
});

// Compound index to ensure unique medicine log per day
dailyLogSchema.index({ date: 1, medicineNo: 1 }, { unique: true });

module.exports = mongoose.model('DailyLog', dailyLogSchema);
