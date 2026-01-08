import React, { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaClock, FaEdit, FaSave } from 'react-icons/fa';

const MedicineList = ({ medicines = [], timeSlot, onDelete, onUpdate, onSetTaken }) => {
  const [editingMap, setEditingMap] = useState({});

  const filtered = medicines.filter(m => m.timeSlot === timeSlot);
  if (!filtered.length) return null;

  const startEdit = (med) => {
    setEditingMap(prev => ({
      ...prev,
      [med.medicineNo]: {
        values: {
          name: med.name,
          scheduledTime: med.scheduledTime,
          dosage: med.dosage || ''
        },
        takenTime: med.takenTime ? formatTime(med.takenTime) : ''
      }
    }));
  };

  const cancelEdit = (id) => {
    setEditingMap(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleValueChange = (id, field, value) => {
    setEditingMap(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        values: { ...prev[id].values, [field]: value }
      }
    }));
  };

  const handleTakenChange = (id, value) => {
    try {
      setEditingMap(prev => {
        if (!prev[id]) {
          return prev;
        }
        return {
          ...prev,
          [id]: { ...prev[id], takenTime: value }
        };
      });
    } catch (err) {
      console.error('Error updating taken time:', err);
    }
  };

  const saveEdit = (id) => {
    onUpdate?.(id, editingMap[id].values);
    cancelEdit(id);
  };

  const saveTaken = (id) => {
    try {
      const time = editingMap[id]?.takenTime;
      if (!time || time.trim() === '') {
        alert('Please set a valid time');
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const isoTime = `${today}T${time}:00`;
      onSetTaken?.(id, isoTime);
    } catch (err) {
      console.error('Error saving taken time:', err);
      alert('Error saving time');
    }
  };

  return (
    <div className="mb-8">
      <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
        {timeSlot}
      </h3>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(med => {
          const edit = editingMap[med.medicineNo];

          return (
            <div
              key={med.medicineNo}
              className="card border-l-4 relative overflow-hidden transition-all hover:shadow-lg"
              style={{ borderColor: getStatusColor(med.status) }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 mr-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">#{med.medicineNo}</span>

                  {!edit ? (
                    <>
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white">{med.name}</h4>
                      <div className="flex items-center text-gray-600 dark:text-gray-300 mt-1 text-sm">
                        <FaClock className="mr-1" />
                        <span>{med.scheduledTime}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Dosage: {med.dosage || '-'}
                      </p>
                    </>
                  ) : (
                    <div className="grid gap-2 mt-1">
                      <input
                        className="input text-sm"
                        value={edit.values.name}
                        onChange={e => handleValueChange(med.medicineNo, 'name', e.target.value)}
                        placeholder="Name"
                      />
                      <input
                        type="time"
                        className="input text-sm"
                        value={edit.values.scheduledTime}
                        onChange={e => handleValueChange(med.medicineNo, 'scheduledTime', e.target.value)}
                      />
                      <input
                        className="input text-sm"
                        placeholder="Dosage"
                        value={edit.values.dosage}
                        onChange={e => handleValueChange(med.medicineNo, 'dosage', e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onDelete?.(med.medicineNo)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  aria-label="Delete medicine"
                >
                  <FaTimesCircle size={20} />
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <span className={`status-badge ${getStatusBadgeClass(med.status)}`}>
                    {med.status}
                  </span>
                  <StatusIcon status={med.status} />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2 items-start">
                    <TimePickerSpinner 
                      value={edit?.takenTime || ''}
                      onChange={(val) => handleTakenChange(med.medicineNo, val)}
                    />
                    <button
                      className="btn-primary px-3 py-1 text-xs whitespace-nowrap mt-1"
                      onClick={() => saveTaken(med.medicineNo)}
                    >
                      Set Time
                    </button>
                  </div>

                  <div className="flex justify-end mt-2">
                    {!edit ? (
                      <button onClick={() => startEdit(med)} className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline flex items-center gap-1">
                        <FaEdit /> Edit Details
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(med.medicineNo)} className="text-green-600 dark:text-green-400 text-sm font-medium hover:underline flex items-center gap-1">
                          <FaSave /> Save
                        </button>
                        <button onClick={() => cancelEdit(med.medicineNo)} className="text-gray-500 dark:text-gray-400 text-sm font-medium hover:underline">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const formatTime = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toISOString().slice(11, 16);
};

const getStatusColor = (status) => {
  switch (status) {
    case 'TAKEN': return '#10B981'; // Green
    case 'MISSED': return '#EF4444'; // Red
    default: return '#9CA3AF'; // Gray
  }
};

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'TAKEN': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    case 'MISSED': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

const StatusIcon = ({ status }) => {
  switch (status) {
    case 'TAKEN': return <FaCheckCircle className="text-green-500 text-xl" />;
    case 'MISSED': return <FaTimesCircle className="text-red-500 text-xl" />;
    default: return null;
  }
};

// Simple Time Picker Component
const TimePickerSpinner = ({ value, onChange }) => {
  const handleChange = (e) => {
    const newValue = e.target.value;
    if (newValue) {
      onChange(newValue);
    }
  };

  return (
    <input
      type="time"
      value={value || ''}
      onChange={handleChange}
      className="input text-sm py-2 px-3 w-32 cursor-pointer"
      style={{ fontSize: '16px' }}
    />
  );
};

export default MedicineList;
