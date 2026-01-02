import { useState, useEffect, useRef } from 'react';

const useVoiceCommand = ({ onMarkTaken, onAddMedicine } = {}) => {
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState(null);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            setError('Browser does not support voice recognition.');
            return;
        }
    }, []);

    const startListening = (customHandler = null, lang = 'hi-IN') => {
        setError(null);
        setTranscript('');
        setIsListening(true);

        if (recognitionRef.current) {
            // Already listening
            return;
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true; // Enable continuous mode
        recognition.lang = lang;
        recognition.interimResults = true;

        recognitionRef.current = recognition;

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            const currentText = finalTranscript || interimTranscript;
            setTranscript(currentText);

            if (finalTranscript && customHandler) {
                customHandler(finalTranscript);
            } else if (finalTranscript) {
                processCommand(finalTranscript);
            }
        };

        recognition.onerror = (event) => {
            console.error('Voice error:', event.error);
            if (event.error === 'no-speech') return;
            setError('Voice recognition error: ' + event.error);
            stopListening();
        };

        recognition.onend = () => {
            if (recognitionRef.current) {
                setIsListening(false);
                recognitionRef.current = null;
            } else {
                setIsListening(false);
            }
        };

        recognition.start();
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    };

    const processCommand = (text) => {
        // Check for marking taken: "Medicine <number> completed"
        const markRegex = /medicine\s+(\d+)\s+(completed|taken)/i;
        const markMatch = text.match(markRegex);
        if (markMatch && onMarkTaken) {
            const medicineNo = parseInt(markMatch[1], 10);
            onMarkTaken(medicineNo);
            return;
        }

        // Check for adding: "Add medicine <name> at <HH:MM> [slot <slot>] [dosage <txt>]"
        const addRegex = /add\s+medicine\s+(.+?)\s+at\s+(\d{1,2}:\d{2})(?:\s+slot\s+(\w+))?(?:\s+dosage\s+(.+))?/i;
        const addMatch = text.match(addRegex);
        if (addMatch && onAddMedicine) {
            const name = addMatch[1].trim();
            const scheduledTime = addMatch[2].trim();
            const timeSlot = addMatch[3] ? addMatch[3].trim() : 'Morning';
            const dosage = addMatch[4] ? addMatch[4].trim() : '';
            onAddMedicine({ name, scheduledTime, timeSlot, dosage });
            return;
        }

        setError('Command not recognized. Try "Medicine <number> completed" or "Add medicine <name> at HH:MM"');
    };

    return { isListening, error, transcript, startListening, stopListening };
};

export default useVoiceCommand;
