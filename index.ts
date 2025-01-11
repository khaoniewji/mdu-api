import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import { extractVideo } from './src/processor/extractvideo'
import { listAvailableFormats, getFormatsByType } from './src/processor/platform/youtube'
import { listAvailableFormats as listTikTokFormats } from './src/processor/platform/tiktok'

const app = new Elysia()
    .use(swagger({
        documentation: {
            info: {
                title: 'MDU API',
                description: 'Media Download Utility API',
                version: '1.0.0'
            },
            tags: [
                { name: 'Media', description: 'Media extraction and download endpoints' }
            ]
        }
    }))
    .get('/', ({ path }) => path)
    .get('/extract', async ({ query }) => {
        if (!query.url) {
            throw new Error('URL is required')
        }
        return await extractVideo({
            url: query.url.toString(),
            format: query.format?.toString(),
            quality: query.quality?.toString(),
            download: query.download === 'true',
            info: query.info === 'true',
            type: query.type as 'audio' | 'video' | undefined
        })
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
                Parameters:
                - url: Video URL (required, supports YouTube and TikTok)
                - format: Desired format (mp4, webm)
                - quality: Desired quality (360p, 720p, 1080p, or 'highest' for best available)
                - download: Get direct download URL (true/false)
                - info: Get only video info without formats (true/false)
                - type: Filter by media type (audio/video)

                Returns video metadata including available formats filtered by type if specified.
                For TikTok videos, 'highest' quality will prioritize no-watermark versions when available.
            `
        }
    })
    .get('/formats', async ({ query }) => {
        if (!query.url) {
            throw new Error('URL is required')
        }

        const url = query.url.toString();
        let formats;

        // Determine platform and use appropriate format listing function
        if (url.includes('tiktok.com') || url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
            formats = await listTikTokFormats(url);
        } else if (query.type) {
            formats = await getFormatsByType(url, query.type as 'audio' | 'video');
        } else {
            formats = await listAvailableFormats(url);
        }

        return {
            success: true,
            formats: formats.map(format => ({
                quality: format.quality,
                format: format.format,
                mimeType: format.mimeType,
                type: format.type,
                size: format.size,
                url: format.url
            }))
        }
    }, {
        query: t.Object({
            url: t.String(),
            type: t.Optional(t.Union([t.Literal('audio'), t.Literal('video')]))
        }),
        detail: {
            summary: 'List all available formats for a media',
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
    .onError(({ code, error }) => {
        return {
            success: false,
            error: 'message' in error ? error.message : 'Unknown error',
            code: code
        }
    })
    .listen(3000)

console.log('🦊 MDU API is running at http://localhost:3000')