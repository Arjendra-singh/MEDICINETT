require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const medicineRoutes = require('./routes/medicines');
require('./cron/scheduler'); // Initialize cron jobs

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medicinett';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/api/medicines', medicineRoutes);

// Basic Route
app.get('/', (req, res) => {
    res.send('MEDICINETT API is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
