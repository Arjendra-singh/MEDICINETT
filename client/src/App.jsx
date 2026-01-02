import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaMicrophone, FaFilePdf, FaSun, FaMoon, FaPlus } from 'react-icons/fa';
import moment from 'moment';
import MedicineList from './components/MedicineList';
import ConfirmationModal from './components/ConfirmationModal';
import VoiceModal from './components/VoiceModal';
import useVoiceCommand from './hooks/useVoiceCommand';
import { translateText } from './utils/translator';

const API_URL = 'http://localhost:5000/api/medicines';

function App() {
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [mode, setMode] = useState('voice'); // 'voice' or 'manual'
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'day');
    const [currentTime, setCurrentTime] = useState(new Date());

    // Manual form state
    const [form, setForm] = useState({ name: '', scheduledTime: '', frequency: 'Daily', timeSlot: 'Morning', dosage: '' });

    // Voice Flow State
    const [voiceFlow, setVoiceFlow] = useState({
        isOpen: false,
        step: 'IDLE', // IDLE, NAME, TIME, DOSAGE
        data: {},
        error: null,
        isSubmitting: false
    });

    const fetchMedicines = async () => {
        try {
            const res = await axios.get(API_URL);
            setMedicines(res.data);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching medicines:', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMedicines();
    }, [lastUpdate]);

    // Live clock
    useEffect(() => {
        const id = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const handleVoiceCommand = async (medicineNo) => {
        try {
            await axios.post(`${API_URL}/${medicineNo}/complete`);
            setLastUpdate(Date.now()); // Trigger refresh
            alert(`Medicine ${medicineNo} marked as TAKEN!`);
        } catch (err) {
            console.error('Error processing command:', err);
            alert(err.response?.data?.message || 'Error processing command');
        }
    };

    const handleAddMedicine = async ({ name, scheduledTime, timeSlot, dosage, frequency }) => {
        try {
            const payload = {
                name,
                scheduledTime,
                timeSlot: timeSlot || 'Morning', // Default if missing
                frequency: frequency || 'Daily'
            };
            const res = await axios.post(API_URL, payload);
            setLastUpdate(Date.now());
            // alert('Medicine added'); // Removed alert for smoother flow
            return res.data.medicine;
        } catch (err) {
            console.error('Error adding medicine:', err);
            alert(err.response?.data?.message || 'Error adding medicine');
        }
    };

    const { isListening, error: voiceError, transcript, startListening, stopListening } = useVoiceCommand({ onMarkTaken: handleVoiceCommand, onAddMedicine: handleAddMedicine });

    // Voice Flow Logic
    const startVoiceFlow = () => {
        setVoiceFlow({
            isOpen: true,
            step: 'NAME',
            data: {},
            error: null
        });
        // Start listening immediately (small delay for modal render)
        setTimeout(() => startListening(handleVoiceInput, 'hi-IN'), 100);
    };

    const handleVoiceInput = async (text) => {
        // OPTIMISTIC UPDATE: Process immediately
        setVoiceFlow(prev => {
            const newState = { ...prev, error: null };

            if (prev.step === 'NAME') {
                // Optimistically set name and move to next step
                newState.data = { ...prev.data, name: text };
                newState.step = 'TIME';

                // Trigger background translation for the name
                translateText(text, 'hi', 'en').then(translated => {
                    if (translated !== text) {
                        setVoiceFlow(curr => ({
                            ...curr,
                            data: { ...curr.data, name: translated }
                        }));
                    }
                });

                // NO NEED TO RESTART LISTENING - CONTINUOUS MODE
                return newState;
            }

            if (prev.step === 'TIME') {
                // Try to parse raw text first (e.g. "9:30")
                const formats = ['h:mm a', 'h mm a', 'H:mm', 'h mm', 'h a', 'ha'];
                let parsed = moment(text, formats, true);
                if (!parsed.isValid()) parsed = moment(text, ['h:mm a', 'h mm a', 'H:mm', 'h mm', 'h a', 'ha']);

                if (parsed.isValid()) {
                    const timeStr = parsed.format('HH:mm');
                    newState.data = { ...prev.data, scheduledTime: timeStr };
                    newState.step = 'DOSAGE';
                    // NO NEED TO RESTART LISTENING
                    return newState;
                } else {
                    // If raw parsing fails, try translation (async)
                    translateText(text, 'hi', 'en').then(translated => {
                        let parsedTrans = moment(translated, formats, true);
                        if (!parsedTrans.isValid()) parsedTrans = moment(translated, ['h:mm a', 'h mm a', 'H:mm', 'h mm', 'h a', 'ha']);

                        if (parsedTrans.isValid()) {
                            const timeStr = parsedTrans.format('HH:mm');
                            setVoiceFlow(curr => {
                                if (curr.step !== 'TIME') return curr; // User moved on?
                                const updated = { ...curr, data: { ...curr.data, scheduledTime: timeStr }, step: 'DOSAGE' };
                                return updated;
                            });
                        } else {
                            setVoiceFlow(curr => ({ ...curr, error: 'Invalid time. Try "9:30 AM".' }));
                        }
                    });
                    return prev; // Wait for translation
                }
            }

            if (prev.step === 'DOSAGE') {
                newState.data = { ...prev.data, dosage: text };

                // Background translation for dosage
                translateText(text, 'hi', 'en').then(translated => {
                    // Just submit for now
                });

                finishVoiceFlow(newState.data);
                return { ...prev, isOpen: false, step: 'IDLE' };
            }

            return prev;
        });
    };

    const isSubmittingRef = useRef(false);

    const finishVoiceFlow = async (data) => {
        if (isSubmittingRef.current) return; // Synchronous lock
        isSubmittingRef.current = true;

        stopListening();

        // Determine time slot based on time
        const hour = parseInt(data.scheduledTime.split(':')[0]);
        let slot = 'Morning';
        if (hour >= 12 && hour < 17) slot = 'Noon';
        else if (hour >= 17 && hour < 21) slot = 'Evening';
        else if (hour >= 21 || hour < 5) slot = 'Night';

        try {
            await handleAddMedicine({
                name: data.data?.name || data.name,
                scheduledTime: data.scheduledTime,
                timeSlot: slot,
                dosage: data.dosage
            });
            // Close modal on success
            setVoiceFlow({ isOpen: false, step: 'IDLE', data: {}, error: null });
        } catch (err) {
            console.error("Voice add error", err);
            setVoiceFlow(prev => ({ ...prev, error: "Failed to add. Please try again." }));
        } finally {
            isSubmittingRef.current = false;
        }
    };

    const retryVoiceStep = () => {
        setVoiceFlow(prev => ({ ...prev, error: null }));
        startListening(handleVoiceInput, 'hi-IN');
    };

    const skipDosage = () => {
        // Use current state data
        setVoiceFlow(prev => {
            finishVoiceFlow({ ...prev.data, dosage: '' });
            return { isOpen: false, step: 'IDLE', data: {}, error: null };
        });
    };

    const closeVoiceModal = () => {
        setVoiceFlow({ isOpen: false, step: 'IDLE', data: {}, error: null });
    };

    const handleManualRefresh = () => {
        setLastUpdate(Date.now());
    };

    // Theme toggle
    useEffect(() => {
        if (theme === 'night') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(t => (t === 'day' ? 'night' : 'day'));

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
    };

    const submitForm = async (e) => {
        e.preventDefault();
        await handleAddMedicine(form);
        setForm({ name: '', scheduledTime: '', frequency: 'Daily', timeSlot: 'Morning', dosage: '' });
    };

    const generateReport = async (date) => {
        if (medicines.length === 0) {
            alert('No medicines data available to generate report.');
            return;
        }
        try {
            const res = await axios.post(`${API_URL}/report`, { date }, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MEDICINETT_Report_${date || new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error generating report:', err);
            alert(err.response?.data?.message || 'Failed to generate report');
        }
    };

    const [pendingDelete, setPendingDelete] = useState(null);

    const confirmDelete = (medicineNo) => setPendingDelete(medicineNo);
    const cancelDelete = () => setPendingDelete(null);

    const deleteMedicine = async () => {
        if (!pendingDelete) return;
        try {
            await axios.delete(`${API_URL}/${pendingDelete}`);
            // Optimistically update UI
            setMedicines(meds => meds.filter(m => m.medicineNo !== Number(pendingDelete)));
            setPendingDelete(null);
        } catch (err) {
            console.error('Delete error:', err);
            alert('Failed to delete medicine');
        }
    };

    const updateMedicine = async (medicineNo, updates) => {
        try {
            const res = await axios.patch(`${API_URL}/${medicineNo}`, updates);
            const updated = res.data.medicine;
            setMedicines(meds => meds.map(m => (m.medicineNo === Number(medicineNo) ? { ...m, ...updated } : m)));
        } catch (err) {
            console.error('Update error:', err);
            alert('Failed to update medicine');
        }
    };

    const setTakenTime = async (medicineNo, isoTime) => {
        try {
            const res = await axios.post(`${API_URL}/${medicineNo}/taken`, { takenTime: isoTime });
            const log = res.data.log;
            setMedicines(meds => meds.map(m => (m.medicineNo === Number(medicineNo) ? { ...m, takenTime: log.takenTime, status: log.status } : m)));
        } catch (err) {
            console.error('Set taken error:', err);
            alert('Failed to set taken time');
        }
    };

    return (
        <div className="min-h-screen pb-12 transition-colors duration-200">
            {/* Header */}
            <header className="bg-blue-700 dark:bg-blue-900 text-white shadow-lg sticky top-0 z-40 transition-colors duration-200">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">MEDICINETT</h1>
                        <p className="text-blue-200 text-sm">Medicine Time Tracker</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <p className="font-mono text-xl">{currentTime.toLocaleTimeString()}</p>
                            <p className="text-sm text-blue-200">{currentTime.toLocaleDateString()}</p>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-yellow-300"
                            aria-label="Toggle Theme"
                        >
                            {theme === 'day' ? <FaMoon size={20} /> : <FaSun size={20} />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8">

                {/* Controls */}
                <div className="flex flex-wrap gap-4 mb-8 justify-center items-center">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setMode(m => m === 'manual' ? 'voice' : 'manual')} className={`btn-primary ${mode === 'manual' ? 'bg-blue-800 ring-2 ring-blue-400' : 'bg-blue-600'}`}>
                            <FaPlus /> {mode === 'manual' ? 'Close Form' : 'Add Medicine'}
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={startVoiceFlow} disabled={isListening} className={`btn-primary ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-600'}`}>
                            <FaMicrophone /> {isListening ? 'Listening...' : 'Start Voice Input'}
                        </button>

                        <button onClick={() => generateReport()} className="btn-primary bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600">
                            <FaFilePdf /> Generate PDF
                        </button>
                    </div>
                </div>

                {/* Mode Panels */}
                {mode === 'manual' && (
                    <div className="max-w-xl mx-auto mb-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-4 border-b dark:border-gray-700 pb-2">Add Medicine (Manual)</h3>
                        <form onSubmit={submitForm} className="grid gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <input name="name" value={form.name} onChange={handleFormChange} required placeholder="Medicine name" className="input" />
                                <input name="scheduledTime" value={form.scheduledTime} onChange={handleFormChange} required placeholder="Time (HH:MM)" className="input" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <select name="timeSlot" value={form.timeSlot} onChange={handleFormChange} className="input">
                                    <option>Morning</option>
                                    <option>Noon</option>
                                    <option>Evening</option>
                                    <option>Night</option>
                                </select>
                                <select name="frequency" value={form.frequency} onChange={handleFormChange} className="input">
                                    <option>Daily</option>
                                    <option>Weekly</option>
                                </select>
                            </div>
                            <div className="flex gap-2 justify-end mt-2">
                                <button type="button" onClick={() => setForm({ name: '', scheduledTime: '', frequency: 'Daily', timeSlot: 'Morning', dosage: '' })} className="btn-secondary">Reset</button>
                                <button type="submit" className="btn-primary bg-green-600 hover:bg-green-700">Add Medicine</button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Feedback Area */}
                {transcript && !voiceFlow.isOpen && (
                    <div className="max-w-md mx-auto mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-center">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">Heard: <span className="font-bold">"{transcript}"</span></p>
                    </div>
                )}
                {voiceError && !voiceFlow.isOpen && (
                    <div className="max-w-md mx-auto mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-center">
                        <p className="text-sm text-red-600 dark:text-red-300">{voiceError}</p>
                    </div>
                )}

                {/* Medicine Lists */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
                        <p className="mt-4 text-gray-500 dark:text-gray-400">Loading schedule...</p>
                    </div>
                ) : (
                    <>
                        <MedicineList medicines={medicines} timeSlot="Morning" onDelete={confirmDelete} onUpdate={updateMedicine} onSetTaken={setTakenTime} />
                        <MedicineList medicines={medicines} timeSlot="Noon" onDelete={confirmDelete} onUpdate={updateMedicine} onSetTaken={setTakenTime} />
                        <MedicineList medicines={medicines} timeSlot="Evening" onDelete={confirmDelete} onUpdate={updateMedicine} onSetTaken={setTakenTime} />
                        <MedicineList medicines={medicines} timeSlot="Night" onDelete={confirmDelete} onUpdate={updateMedicine} onSetTaken={setTakenTime} />
                    </>
                )}

                {/* Delete confirmation modal */}
                <ConfirmationModal
                    isOpen={pendingDelete !== null}
                    title="Delete Medicine"
                    message="Do you want to delete medicine details?"
                    onConfirm={deleteMedicine}
                    onCancel={cancelDelete}
                />

                {/* Voice Input Modal */}
                <VoiceModal
                    isOpen={voiceFlow.isOpen}
                    step={voiceFlow.step}
                    transcript={transcript}
                    isListening={isListening}
                    error={voiceFlow.error}
                    onClose={closeVoiceModal}
                    onRetry={retryVoiceStep}
                    onSkip={skipDosage}
                />
            </main>

            {/* Footer (fixed bottom center) */}
            <footer className="fixed bottom-0 left-0 w-full bg-gray-800 dark:bg-gray-950 text-gray-400 dark:text-gray-500 py-4 z-30 border-t border-gray-700 dark:border-gray-900">
                <div className="max-w-screen-md mx-auto px-4 text-center">
                    <p>&copy; {new Date().getFullYear()} MEDICINETT System. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}

export default App;
