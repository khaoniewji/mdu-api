import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { extractVideo } from './processor/extractvideo'
import { 
    listAvailableFormats, 
    getFormatsByType,
    getSupportedQualities,
    getSupportedFormats
} from './processor/platform/youtube'
import { 
    listAvailableFormats as listTikTokFormats,
    getSupportedQualities as getTikTokQualities
} from './processor/platform/tiktok'
import { detectPlatform } from './processor/platform'

const app = new Elysia()
    .use(swagger({
        documentation: {
            info: {
                title: 'Media Download Utility API',
                description: 'API for extracting and downloading media from various platforms',
                version: '1.0.0'
            },
            tags: [
                { name: 'Media', description: 'Media extraction and download endpoints' },
                { name: 'Info', description: 'Platform and format information endpoints' }
            ]
        }
    }))
    .get('/', () => ({
        status: 'ok',
        message: 'Media Download Utility API is running',
        version: '1.0.0'
    }))
    .get('/extract', async ({ query }) => {
        if (!query.url) {
            throw new Error('URL is required')
        }

        try {
            const result = await extractVideo({
                url: query.url.toString(),
                format: query.format?.toString(),
                quality: query.quality?.toString(),
                download: query.download === 'true',
                info: query.info === 'true',
                type: query.type as 'audio' | 'video' | undefined
            });

            return {
                success: true,
                data: result
            };
        } catch (error: any) {
            throw new Error(`Extraction failed: ${error.message}`);
        }
    }, {
        query: t.Object({
            url: t.String(),
            format: t.Optional(t.String()),
            quality: t.Optional(t.String()),
            download: t.Optional(t.String()),
            info: t.Optional(t.String()),
            type: t.Optional(t.Union([t.Literal('audio'), t.Literal('video')]))
        }),
        detail: {
            summary: 'Extract video information and download options',
            tags: ['Media'],
            description: `
                Extract video information and available formats from supported platforms.

                Parameters:
                - url: Video URL (required, supports YouTube and TikTok)
                - format: Desired format (mp4, webm)
                - quality: Desired quality (360p, 720p, 1080p, or 'highest' for best available)
                - download: Get direct download URL (true/false)
                - info: Get only video info without formats (true/false)
                - type: Filter by media type (audio/video)

                Returns video metadata including:
                - Title, description, duration, thumbnail
                - Available formats filtered by specified criteria
                - Direct download URL (if requested)
                
                For TikTok videos, 'highest' quality will prioritize no-watermark versions.
                For YouTube videos, 'highest' quality will prioritize by resolution.
            `
        }
    })
    .get('/formats', async ({ query }) => {
        if (!query.url) {
            throw new Error('URL is required')
        }

        const url = query.url.toString();
        try {
            const platform = detectPlatform(url);
            let formats;

            if (platform === 'tiktok') {
                formats = await listTikTokFormats(url);
            } else if (platform === 'youtube') {
                formats = query.type 
                    ? await getFormatsByType(url, query.type as 'audio' | 'video')
                    : await listAvailableFormats(url);
            } else {
                throw new Error('Unsupported platform');
            }

            // Filter out formats without URLs and map to consistent format
            const validFormats = formats
                .filter(format => format.url && format.url.length > 0)
                .map(format => ({
                    quality: format.quality,
                    format: format.format,
                    mimeType: format.mimeType,
                    type: format.type,
                    size: format.size,
                    url: format.url
                }));

            if (validFormats.length === 0) {
                throw new Error('No valid formats found with URLs');
            }

            return {
                success: true,
                platform,
                formats: validFormats
            };
        } catch (error: any) {
            throw new Error(`Failed to list formats: ${error.message}`);
        }
    }, {
        query: t.Object({
            url: t.String(),
            type: t.Optional(t.Union([t.Literal('audio'), t.Literal('video')]))
        }),
        detail: {
            summary: 'List all available formats for a media URL',
            tags: ['Media'],
            description: `
                Lists all available formats and qualities for a video URL.
                
                Parameters:
                - url: Video URL (required, supports YouTube and TikTok)
                - type: Filter by media type (audio/video)
                
                Returns an array of format objects containing:
                - quality: Media quality (e.g., 1080p, 720p, original, no-watermark)
                - format: File format (e.g., mp4, webm)
                - mimeType: Full MIME type (e.g., video/mp4, audio/webm)
                - type: Media type (audio/video)
                - size: File size in bytes
                - url: Direct URL to the media format
                
                Note: For TikTok videos, quality options typically include 'original' and 
                'original (no watermark)' when available.
            `
        }
    })
    .get('/support', ({ query }) => {
        try {
            const platform = query.url ? detectPlatform(query.url.toString()) : undefined;
            
            const support = {
                platforms: ['youtube', 'tiktok'],
                formats: {
                    youtube: getSupportedFormats(),
                    tiktok: ['mp4']
                },
                qualities: {
                    youtube: getSupportedQualities(),
                    tiktok: getTikTokQualities()
                }
            };

            return {
                success: true,
                data: platform ? {
                    platform,
                    formats: platform === 'youtube' || platform === 'tiktok' ? support.formats[platform] : [],
                    qualities: platform === 'youtube' || platform === 'tiktok' ? support.qualities[platform] : []
                } : support
            };
        } catch (error: any) {
            throw new Error(`Failed to get support info: ${error.message}`);
        }
    }, {
        query: t.Object({
            url: t.Optional(t.String())
        }),
        detail: {
            summary: 'Get supported platforms and formats',
            tags: ['Info'],
            description: `
                Returns information about supported platforms and their capabilities.
                
                Parameters:
                - url: Optional URL to get platform-specific support information
                
                Returns:
                - List of supported platforms
                - Available formats per platform
                - Available qualities per platform
                
                If URL is provided, returns only information for that platform.
            `
        }
    })
    .onError(({ code, error }) => {
        return {
            success: false,
            error: 'message' in error ? error.message : 'Unknown error',
            code: code
        }
    })
    .listen(3000)

console.log('🦊 MDU API is running at http://localhost:3000')

export type App = typeof app