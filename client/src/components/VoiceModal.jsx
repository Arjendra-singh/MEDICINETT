import React from 'react';
import { FaMicrophone, FaTimes, FaRedo, FaForward } from 'react-icons/fa';

const VoiceModal = ({ isOpen, step, transcript, isListening, error, onClose, onRetry, onSkip }) => {
    if (!isOpen) return null;

    const getPrompt = () => {
        switch (step) {
            case 'NAME': return "Please tell me the medicine name.";
            case 'TIME': return "Please tell me the medicine schedule time.";
            case 'DOSAGE': return "Please tell me the dosage (optional).";
            default: return "";
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-fade-in">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                    <FaTimes size={20} />
                </button>

                {/* Content */}
                <div className="text-center space-y-6">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {getPrompt()}
                    </h3>

                    {/* Microphone Animation */}
                    <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 scale-110 ring-4 ring-red-200 dark:ring-red-900/50' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                        <FaMicrophone size={40} className={isListening ? 'animate-pulse' : ''} />
                    </div>

                    <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                        Listening in Hindi / English
                    </div>

                    {/* Transcript / Status */}
                    <div className="min-h-[60px] flex items-center justify-center">
                        {isListening ? (
                            <p className="text-gray-500 dark:text-gray-400 animate-pulse">Listening...</p>
                        ) : transcript ? (
                            <p className="text-lg font-medium text-gray-800 dark:text-gray-200">"{transcript}"</p>
                        ) : (
                            <p className="text-gray-400 text-sm">Waiting for input...</p>
                        )}
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 p-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-center gap-4 pt-2">
                        {!isListening && (
                            <button
                                onClick={onRetry}
                                className="flex items-center gap-2 px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-full font-medium transition-colors"
                            >
                                <FaRedo size={14} /> Retry
                            </button>
                        )}

                        {step === 'DOSAGE' && (
                            <button
                                onClick={onSkip}
                                className="flex items-center gap-2 px-6 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-full font-medium transition-colors"
                            >
                                <FaForward size={14} /> Skip
                            </button>
                        )}
                    </div>
                </div>

                {/* Step Indicator */}
                <div className="flex justify-center gap-2 mt-8">
                    {['NAME', 'TIME', 'DOSAGE'].map((s, i) => (
                        <div
                            key={s}
                            className={`h-2 rounded-full transition-all duration-300 ${s === step ? 'w-8 bg-blue-600' :
                                ['NAME', 'TIME', 'DOSAGE'].indexOf(step) > i ? 'w-2 bg-blue-400' : 'w-2 bg-gray-200 dark:bg-gray-700'
                                }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VoiceModal;
