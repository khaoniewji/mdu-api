import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import type { VideoMetadata } from '../extractvideo';

interface TikTokVideoInfo {
    title: string;
    description: string;
    duration: number;
    thumbnail: string;
    formats: VideoFormat[];
}

interface VideoFormat {
    quality: string;
    format: string;
    size: number;
    url: string;
    mimeType: string;
    type: 'audio' | 'video';
}

export async function extractTikTokVideo(url: string): Promise<VideoMetadata> {
    try {
        const cleanUrl = sanitizeTikTokUrl(url);
        const videoInfo = await fetchTikTokInfo(cleanUrl);
        
        if (!videoInfo.formats || videoInfo.formats.length === 0) {
            throw new Error('No video formats found');
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
            throw new Error(`Failed to extract TikTok video: ${error.message}`);
        } else {
            throw new Error('Failed to extract TikTok video: Unknown error');
        }
    }
}

function sanitizeTikTokUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        
        // Handle different TikTok URL formats
        if (urlObj.hostname === 'vm.tiktok.com' || urlObj.hostname === 'vt.tiktok.com') {
            return url;
        }
        
        // For regular TikTok URLs, clean up unnecessary parameters
        const allowedParams = ['id']; // Keep only essential parameters
        const newSearch = new URLSearchParams();
        const params = new URLSearchParams(urlObj.search);
        
        for (const [key, value] of params) {
            if (allowedParams.includes(key)) {
                newSearch.append(key, value);
            }
        }
        
        urlObj.search = newSearch.toString();
        return urlObj.toString();
    } catch (error) {
        throw new Error('Invalid TikTok URL');
    }
}

async function fetchTikTokInfo(url: string): Promise<TikTokVideoInfo> {
    try {
        // Enhanced browser-like headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };

        // First request to handle redirects and get the final URL
        const response = await fetch(url, {
            headers,
            redirect: 'follow',
            follow: 5 // Allow up to 5 redirects
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract video metadata from multiple possible locations
        const videoData = extractVideoData($);
        const formats = await extractFormats($, videoData);

        if (!formats || formats.length === 0) {
            // Fallback method: Try to extract from embed data
            const embedUrl = await getEmbedUrl(url);
            if (embedUrl) {
                const embedFormats = await extractFromEmbed(embedUrl);
                if (embedFormats && embedFormats.length > 0) {
                    formats.push(...embedFormats);
                }
            }
        }

        return {
            title: extractTitle($, videoData),
            description: extractDescription($, videoData),
            duration: extractDuration($, videoData),
            thumbnail: extractThumbnail($, videoData),
            formats
        };
    } catch (error: any) {
        throw new Error(`Failed to fetch TikTok info: ${error.message}`);
    }
}

function extractVideoData($: cheerio.CheerioAPI): any {
    // Try multiple methods to extract video data
    const scripts = $('script').get();
    let videoData = {};

    // Method 1: JSON-LD data
    const jsonLd = $('script[type="application/ld+json"]').html();
    if (jsonLd) {
        try {
            videoData = JSON.parse(jsonLd);
        } catch (e) {
            console.error('Failed to parse JSON-LD:', e);
        }
    }

    // Method 2: Next.js data
    if (Object.keys(videoData).length === 0) {
        const nextData = $('#__NEXT_DATA__').html();
        if (nextData) {
            try {
                const parsed = JSON.parse(nextData);
                videoData = parsed.props?.pageProps?.videoData || {};
            } catch (e) {
                console.error('Failed to parse Next.js data:', e);
            }
        }
    }

    // Method 3: Embedded video data
    if (Object.keys(videoData).length === 0) {
        scripts.forEach(script => {
            const content = $(script).html() || '';
            if (content.includes('window.__INIT_PROPS__')) {
                try {
                    const dataMatch = content.match(/window\.__INIT_PROPS__\s*=\s*({.+?});/);
                    if (dataMatch) {
                        videoData = JSON.parse(dataMatch[1]);
                    }
                } catch (e) {
                    console.error('Failed to parse embedded data:', e);
                }
            }
        });
    }

    return videoData;
}

async function extractFormats($: cheerio.CheerioAPI, videoData: any): Promise<VideoFormat[]> {
    const formats: VideoFormat[] = [];
    
    // Method 1: Direct video element
    $('video[src]').each((_, elem) => {
        const src = $(elem).attr('src');
        if (src) {
            formats.push({
                quality: 'original',
                format: 'mp4',
                size: 0,
                url: src,
                mimeType: 'video/mp4',
                type: 'video'
            });
        }
    });

    // Method 2: Meta tags
    const videoUrl = $('meta[property="og:video"]').attr('content') ||
                    $('meta[property="og:video:url"]').attr('content');
    
    if (videoUrl) {
        formats.push({
            quality: 'original',
            format: 'mp4',
            size: 0,
            url: videoUrl,
            mimeType: 'video/mp4',
            type: 'video'
        });
    }

    // Method 3: Video data from script tags
    if (videoData.videoUrl || videoData.video?.playAddr) {
        formats.push({
            quality: 'original',
            format: 'mp4',
            size: 0,
            url: videoData.videoUrl || videoData.video.playAddr,
            mimeType: 'video/mp4',
            type: 'video'
        });
    }

    return formats;
}

async function getEmbedUrl(url: string): Promise<string | null> {
    try {
        const videoId = url.split('/video/')[1]?.split('?')[0];
        if (videoId) {
            return `https://www.tiktok.com/embed/v2/${videoId}`;
        }
    } catch (error) {
        console.error('Failed to get embed URL:', error);
    }
    return null;
}

async function extractFromEmbed(embedUrl: string): Promise<VideoFormat[]> {
    try {
        const response = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
        });

        if (!response.ok) return [];

        const html = await response.text();
        const $ = cheerio.load(html);
        
        const formats: VideoFormat[] = [];
        $('video[src]').each((_, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                formats.push({
                    quality: 'original (embed)',
                    format: 'mp4',
                    size: 0,
                    url: src,
                    mimeType: 'video/mp4',
                    type: 'video'
                });
            }
        });

        return formats;
    } catch (error) {
        console.error('Failed to extract from embed:', error);
        return [];
    }
}

// Helper functions remain the same...
function extractTitle($: cheerio.CheerioAPI, videoData: any): string {
    return (
        videoData?.name ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().replace(' | TikTok', '').trim() ||
        'Untitled TikTok Video'
    );
}

function extractDescription($: cheerio.CheerioAPI, videoData: any): string {
    return (
        videoData?.description ||
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        ''
    );
}

function extractDuration($: cheerio.CheerioAPI, videoData: any): number {
    const duration = videoData?.duration ||
                    $('meta[property="video:duration"]').attr('content');
    
    if (duration) {
        const durationNum = parseInt(duration);
        return isNaN(durationNum) ? 0 : durationNum;
    }
    
    return 0;
}

function extractThumbnail($: cheerio.CheerioAPI, videoData: any): string {
    return (
        videoData?.thumbnailUrl ||
        $('meta[property="og:image"]').attr('content') ||
        ''
    );
}

export async function listAvailableFormats(url: string): Promise<VideoFormat[]> {
    try {
        const videoInfo = await fetchTikTokInfo(url);
        return videoInfo.formats;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to list formats: ${error.message}`);
        }
        throw new Error('Failed to list formats: Unknown error');
    }
}