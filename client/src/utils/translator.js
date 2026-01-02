import axios from 'axios';

/**
 * Translates text from one language to another using MyMemory API.
 * @param {string} text - The text to translate.
 * @param {string} fromLang - Source language code (e.g., 'hi').
 * @param {string} toLang - Target language code (e.g., 'en').
 * @returns {Promise<string>} - The translated text.
 */
export const translateText = async (text, fromLang = 'hi', toLang = 'en') => {
    if (!text) return '';

    // If text contains only ASCII (English), return as is
    if (/^[\x00-\x7F]*$/.test(text)) {
        return text;
    }

    try {
        const response = await axios.get('https://api.mymemory.translated.net/get', {
            params: {
                q: text,
                langpair: `${fromLang}|${toLang}`
            }
        });

        if (response.data && response.data.responseData) {
            return response.data.responseData.translatedText;
        }
        return text;
    } catch (error) {
        console.error('Translation error:', error);
        return text; // Fallback to original text
    }
};
