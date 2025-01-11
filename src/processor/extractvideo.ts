// ./src/process/extractvideo.ts
import { 
    detectPlatform,
    extractYouTubeVideo,
    extractTikTokVideo,
    isPlatform
} from './platform';

export interface VideoExtractRequest {
    url: string;
    format?: string;
    quality?: string;
    download?: boolean;
    info?: boolean;
    type?: 'audio' | 'video';
}

export interface VideoFormat {
    quality: string;
    format: string;
    mimeType: string;
    type: 'audio' | 'video';
    size: number;
    url: string;
}

export interface VideoMetadata {
    title: string;
    description?: string;
    duration: number;
    thumbnail?: string;
    formats: VideoFormat[];
    downloadUrl?: string;
}

/**
 * Extract video information and formats from supported platforms
 * @param request VideoExtractRequest object containing extraction parameters
 * @returns Promise<VideoMetadata> containing video information and available formats
 */
export async function extractVideo(request: VideoExtractRequest): Promise<VideoMetadata> {
    // Validate request
    if (!request.url) {
        throw new Error('URL is required');
    }

    // Set default values
    const params: VideoExtractRequest = {
        format: request.format || 'mp4',
        quality: request.quality || 'highest',
        download: request.download || false,
        info: request.info || false,
        type: request.type || 'video',
        ...request
    };

    // Detect platform and extract
    try {
        let result: VideoMetadata;
        const platform = detectPlatform(params.url);

        switch (platform) {
            case 'youtube':
                result = await extractYouTubeVideo(params.url, params.format, params.quality);
                // Apply format filtering for YouTube
                if (params.format) {
                    result.formats = result.formats.filter(format => 
                        format.format.toLowerCase() === params.format?.toLowerCase()
                    );
                    if (result.formats.length === 0) {
                        throw new Error(`No formats matching '${params.format}' found`);
                    }
                }
                // Apply quality filtering for YouTube
                if (params.quality && params.quality !== 'highest') {
                    result.formats = result.formats.filter(format => 
                        format.quality.toLowerCase().includes(params.quality?.toLowerCase() || '')
                    );
                    if (result.formats.length === 0) {
                        throw new Error(`No quality matching '${params.quality}' found`);
                    }
                }
                // Sort by quality if 'highest' is requested
                if (params.quality === 'highest') {
                    result.formats.sort((a, b) => {
                        const getQualityNumber = (quality: string) => {
                            const match = quality.match(/(\d+)p/);
                            return match ? parseInt(match[1]) : 0;
                        };
                        return getQualityNumber(b.quality) - getQualityNumber(a.quality);
                    });
                }
                break;

            case 'tiktok':
                result = await extractTikTokVideo(params.url);
                // Apply format filtering for TikTok
                if (params.format) {
                    result.formats = result.formats.filter(format => 
                        format.format.toLowerCase() === params.format?.toLowerCase()
                    );
                    if (result.formats.length === 0) {
                        throw new Error(`No formats matching '${params.format}' found`);
                    }
                }
                // Apply quality filtering for TikTok
                if (params.quality && params.quality !== 'highest') {
                    result.formats = result.formats.filter(format => 
                        format.quality.toLowerCase().includes(params.quality?.toLowerCase() || '')
                    );
                    if (result.formats.length === 0) {
                        throw new Error(`No quality matching '${params.quality}' found`);
                    }
                }
                // Sort by quality if 'highest' is requested
                if (params.quality === 'highest') {
                    result.formats.sort((a, b) => {
                        // Prioritize no-watermark versions
                        if (a.quality.includes('no watermark') && !b.quality.includes('no watermark')) return -1;
                        if (!a.quality.includes('no watermark') && b.quality.includes('no watermark')) return 1;
                        // Then prioritize by size if available
                        return (b.size || 0) - (a.size || 0);
                    });
                }
                break;

            default:
                throw new Error(`Unsupported platform. Currently supports: ${getSupportedPlatforms()}`);
        }

        // Filter formats by type if specified (applies to all platforms)
        if (params.type) {
            result.formats = result.formats.filter(format => format.type === params.type);
            if (result.formats.length === 0) {
                throw new Error(`No ${params.type} formats found`);
            }
        }

        // Remove formats without URLs
        result.formats = result.formats.filter(format => format.url && format.url.length > 0);
        
        if (result.formats.length === 0) {
            throw new Error('No valid formats found with URLs');
        }

        // Set download URL to highest quality format if download is requested
        if (params.download) {
            result.downloadUrl = result.formats[0].url;
        }

        // Remove formats if only info is requested
        if (params.info) {
            result.formats = [];
            delete result.downloadUrl;
        }

        return result;
    } catch (error: any) {
        throw new Error(`Error extracting video: ${error.message}`);
    }
}

/**
 * Get list of supported platforms
 * @returns string of comma-separated platform names
 */
function getSupportedPlatforms(): string {
    const platforms = [];
    // Get all platform checks from isPlatform
    for (const [platform] of Object.entries(isPlatform)) {
        platforms.push(platform.charAt(0).toUpperCase() + platform.slice(1));
    }
    return platforms.join(', ');
}