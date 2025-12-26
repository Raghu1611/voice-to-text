/**
 * ClipboardService
 * Handles interactions with the system clipboard using Tauri API.
 */
import { writeText } from '@tauri-apps/api/clipboard';

export const ClipboardService = {
    /**
     * Copy text to system clipboard.
     * Returns true if successful.
     */
    async copyToClipboard(text: string): Promise<boolean> {
        try {
            if (!text) return false;
            await writeText(text);
            return true;
        } catch (error) {
            console.error('[ClipboardService] Failed to copy:', error);
            return false;
        }
    }
};
