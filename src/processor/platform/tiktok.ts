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
        const cleanUrl = await sanitizeTikTokUrl(url);
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

async function sanitizeTikTokUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        // Get the final URL after redirects
        const finalUrl = response.url;
        const urlObj = new URL(finalUrl);
        
        // Handle different TikTok URL formats
        if (urlObj.hostname === 'vm.tiktok.com' || urlObj.hostname === 'vt.tiktok.com') {
            return finalUrl;
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
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1'
        };

        // Fetch main page first
        const response = await fetch(url, {
            headers,
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract video data using multiple methods
        const videoData = await extractVideoData($);
        let formats = await extractFormats($, videoData);

        // If no formats found, try embed method
        if (formats.length === 0) {
            const embedUrl = await getEmbedUrl(url);
            if (embedUrl) {
                const embedFormats = await extractFromEmbed(embedUrl);
                formats = [...formats, ...embedFormats];
            }
        }

        // If still no formats, try API method
        if (formats.length === 0) {
            const apiFormats = await extractFromApi(url);
            formats = [...formats, ...apiFormats];
        }

        // Filter out duplicate URLs and empty URLs
        formats = formats
            .filter(format => format.url && format.url.length > 0)
            .filter((format, index, self) => 
                index === self.findIndex(t => t.url === format.url)
            );

        // Sort formats by quality
        formats.sort((a, b) => {
            // Prioritize no-watermark versions
            if (a.quality.includes('no watermark') && !b.quality.includes('no watermark')) return -1;
            if (!a.quality.includes('no watermark') && b.quality.includes('no watermark')) return 1;
            return 0;
        });

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

async function extractFromApi(url: string): Promise<VideoFormat[]> {
    try {
        const videoId = url.split('/video/')[1]?.split('?')[0];
        if (!videoId) return [];

        const apiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet'
            }
        });

        if (!response.ok) return [];

        const data = await response.json();
        const videoData = (data as any).aweme_list?.[0];
        if (!videoData) return [];

        const formats: VideoFormat[] = [];
        
        // Add no watermark version if available
        if (videoData.video?.play_addr?.url_list?.[0]) {
            formats.push({
                quality: 'original (no watermark)',
                format: 'mp4',
                size: 0,
                url: videoData.video.play_addr.url_list[0],
                mimeType: 'video/mp4',
                type: 'video'
            });
        }

        // Add watermarked version if available
        if (videoData.video?.download_addr?.url_list?.[0]) {
            formats.push({
                quality: 'original (watermark)',
                format: 'mp4',
                size: 0,
                url: videoData.video.download_addr.url_list[0],
                mimeType: 'video/mp4',
                type: 'video'
            });
        }

        return formats;
    } catch (error) {
        console.error('Failed to extract from API:', error);
        return [];
    }
}

async function extractVideoData($: cheerio.CheerioAPI): Promise<any> {
    // Try multiple methods to extract video data
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

    // Method 3: SIGI_STATE data
    if (Object.keys(videoData).length === 0) {
        const sigiState = $('script#SIGI_STATE').html();
        if (sigiState) {
            try {
                const parsed = JSON.parse(sigiState);
                videoData = parsed.ItemModule?.[Object.keys(parsed.ItemModule)[0]] || {};
            } catch (e) {
                console.error('Failed to parse SIGI_STATE:', e);
            }
        }
    }

    return videoData;
}

async function extractFormats($: cheerio.CheerioAPI, videoData: any): Promise<VideoFormat[]> {
    const formats: VideoFormat[] = [];
    
    // Method 1: Direct video element
    $('video[src]').each((_, elem) => {
        const src = $(elem).attr('src');
        if (src && src.startsWith('http')) {
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
    
    if (videoUrl && videoUrl.startsWith('http')) {
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
    const videoUrls = [
        videoData.videoUrl,
        videoData.video?.playAddr,
        videoData.video?.downloadAddr,
        videoData.video?.playUrl
    ].filter(url => url && url.startsWith('http'));

    videoUrls.forEach(url => {
        formats.push({
            quality: 'original',
            format: 'mp4',
            size: 0,
            url,
            mimeType: 'video/mp4',
            type: 'video'
        });
    });

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

export function getSupportedQualities(): string[] {
    return ['original', 'original (no watermark)', 'original (watermark)', 'original (embed)'];
}

export function getSupportedFormats(): string[] {
    return ['mp4'];
}