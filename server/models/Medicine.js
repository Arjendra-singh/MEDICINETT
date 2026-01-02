const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  medicineNo: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  scheduledTime: { type: String, required: true }, // Format "HH:mm"
  dosage: { type: String },
  frequency: { type: String, required: true },
  timeSlot: { type: String, enum: ['Morning', 'Noon', 'Evening', 'Night'], required: true }
});

module.exports = mongoose.model('Medicine', medicineSchema);
