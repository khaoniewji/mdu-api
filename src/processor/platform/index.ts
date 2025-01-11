// ./src/processor/platform/index.ts

// Import from platform-specific modules
import {
    extractYouTubeVideo,
    listAvailableFormats as listYouTubeFormats,
    getFormatsByType as getYouTubeFormatsByType
} from './youtube';

import {
    extractTikTokVideo,
    listAvailableFormats as listTikTokFormats
} from './tiktok';

// Re-export platform-specific functions
export {
    // YouTube exports
    extractYouTubeVideo,
    listYouTubeFormats,
    getYouTubeFormatsByType,
    
    // TikTok exports
    extractTikTokVideo,
    listTikTokFormats
};

// Export platform detection utilities
export const isPlatform = {
    youtube: (url: string): boolean => {
        return url.includes('youtube.com') || url.includes('youtu.be');
    },
    tiktok: (url: string): boolean => {
        const tiktokDomains = ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'];
        try {
            const urlObj = new URL(url);
            return tiktokDomains.some(domain => urlObj.hostname.endsWith(domain));
        } catch {
            return false;
        }
    }
};

// Export a utility function to identify the platform
export function detectPlatform(url: string): 'youtube' | 'tiktok' | 'unknown' {
    if (isPlatform.youtube(url)) return 'youtube';
    if (isPlatform.tiktok(url)) return 'tiktok';
    return 'unknown';
}