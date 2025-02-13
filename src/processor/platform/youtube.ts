import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import type { VideoMetadata } from '../extractvideo';

interface VideoInfo {
    title: string;
    description: string;
    duration: number;
    thumbnail: string;
    formats: VideoFormat[];
}

interface VideoFormat {
    quality: string;
    format: string;
    mimeType: string;
    type: 'audio' | 'video';
    size: number;
    url: string;
}

export async function extractYouTubeVideo(url: string, format?: string, quality?: string): Promise<VideoMetadata> {
    try {
        const videoId = extractVideoId(url);
        const videoInfo = await fetchVideoInfo(videoId);
        
        if (!videoInfo.formats || videoInfo.formats.length === 0) {
            throw new Error('No video formats found');
        }

        // Filter out formats without URLs
        videoInfo.formats = videoInfo.formats.filter(format => format.url && format.url.length > 0);
        
        if (videoInfo.formats.length === 0) {
            throw new Error('No formats with valid URLs found');
        }
        
        return {
            title: videoInfo.title,
            description: videoInfo.description,
            duration: videoInfo.duration,
            thumbnail: videoInfo.thumbnail,
            formats: videoInfo.formats
        };
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to extract YouTube video: ${error.message}`);
        } else {
            throw new Error('Failed to extract YouTube video: Unknown error');
        }
    }
}

// Helper function to decode cipher
function decodeCipher(signatureCipher: string): string {
    try {
        const params = new URLSearchParams(signatureCipher);
        const url = params.get('url') || '';
        const sp = params.get('sp') || '';
        const s = params.get('s') || '';
        
        if (!url) return '';
        
        // Construct the final URL with the signature
        const decodedUrl = decodeURIComponent(url);
        if (s && sp) {
            return `${decodedUrl}&${sp}=${encodeURIComponent(s)}`;
        }
        return decodedUrl;
    } catch (error) {
        console.error('Error decoding cipher:', error);
        return '';
    }
}

function extractFormatsFromPlayerResponse(playerResponse: any): VideoFormat[] {
    const formats: VideoFormat[] = [];
    
    try {
        const streamingData = playerResponse?.streamingData;
        if (!streamingData) return formats;

        // Process adaptive formats
        const adaptiveFormats = streamingData.adaptiveFormats || [];
        adaptiveFormats.forEach((format: any) => {
            let finalUrl = '';
            if (format.url) {
                finalUrl = format.url;
            } else if (format.signatureCipher) {
                finalUrl = decodeCipher(format.signatureCipher);
            }

            if (finalUrl) {
                const { mimeType, type } = getMimeType(format.mimeType);
                formats.push({
                    quality: format.qualityLabel || format.quality,
                    format: mimeType.split('/')[1] || 'unknown',
                    mimeType,
                    type,
                    size: format.contentLength ? parseInt(format.contentLength) : 0,
                    url: finalUrl
                });
            }
        });

        // Process regular formats
        const regularFormats = streamingData.formats || [];
        regularFormats.forEach((format: any) => {
            let finalUrl = '';
            if (format.url) {
                finalUrl = format.url;
            } else if (format.signatureCipher) {
                finalUrl = decodeCipher(format.signatureCipher);
            }

            if (finalUrl) {
                const { mimeType, type } = getMimeType(format.mimeType);
                formats.push({
                    quality: format.qualityLabel || format.quality,
                    format: mimeType.split('/')[1] || 'unknown',
                    mimeType,
                    type,
                    size: format.contentLength ? parseInt(format.contentLength) : 0,
                    url: finalUrl
                });
            }
        });

        // Sort formats by quality (resolution for video, bitrate for audio)
        return formats.sort((a, b) => {
            if (a.type === 'video' && b.type === 'video') {
                const aQuality = parseInt(a.quality.replace(/[^\d]/g, '') || '0');
                const bQuality = parseInt(b.quality.replace(/[^\d]/g, '') || '0');
                return bQuality - aQuality;
            }
            return 0;
        });
    } catch (error) {
        console.error('Error extracting formats from player response:', error);
    }

    return formats;
}

// Rest of the functions remain the same
function extractVideoId(url: string): string {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    
    if (!match) {
        throw new Error('Invalid YouTube URL');
    }
    
    return match[1];
}

async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const jsonLd = $('script[type="application/ld+json"]').html();
        let videoData = {};
        if (jsonLd) {
            try {
                videoData = JSON.parse(jsonLd);
            } catch (e) {
                console.error('Failed to parse JSON-LD:', e);
            }
        }

        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
        let playerResponse = {};
        if (playerResponseMatch) {
            try {
                playerResponse = JSON.parse(playerResponseMatch[1]);
            } catch (e) {
                console.error('Failed to parse player response:', e);
            }
        }

        const title = $('meta[name="title"]').attr('content') || 
                     $('meta[property="og:title"]').attr('content') ||
                     'Untitled';
        const description = $('meta[name="description"]').attr('content') || 
                          $('meta[property="og:description"]').attr('content') ||
                          '';
        const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        
        const formats = extractFormatsFromPlayerResponse(playerResponse);
        
        if (formats.length === 0) {
            throw new Error('No video formats found');
        }
        
        return {
            title,
            description,
            duration: extractDuration(playerResponse),
            thumbnail,
            formats
        };
    } catch (error: any) {
        throw new Error(`Failed to fetch video info: ${error.message}`);
    }
}

function getMimeType(mimeTypeStr: string): { mimeType: string; type: 'audio' | 'video' } {
    const parts = mimeTypeStr?.split(';')[0].split('/') || ['', ''];
    const type = parts[0] === 'audio' ? 'audio' : 'video';
    return {
        mimeType: parts.join('/'),
        type
    };
}

function extractDuration(playerResponse: any): number {
    try {
        return parseInt(playerResponse?.videoDetails?.lengthSeconds || '0', 10);
    } catch (error) {
        return 0;
    }
}

export async function getFormatsByType(url: string, type: 'audio' | 'video'): Promise<VideoFormat[]> {
    try {
        const videoId = extractVideoId(url);
        const videoInfo = await fetchVideoInfo(videoId);
        return videoInfo.formats.filter(format => format.type === type);
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to get ${type} formats: ${error.message}`);
        }
        throw new Error(`Failed to get ${type} formats: Unknown error`);
    }
}

export async function listAvailableFormats(url: string): Promise<VideoFormat[]> {
    try {
        const videoId = extractVideoId(url);
        const videoInfo = await fetchVideoInfo(videoId);
        return videoInfo.formats;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to list formats: ${error.message}`);
        }
        throw new Error('Failed to list formats: Unknown error');
    }
}

export function getSupportedQualities(): string[] {
    return ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', 'highest'];
}

export function getSupportedFormats(): string[] {
    return ['mp4', 'webm'];
}