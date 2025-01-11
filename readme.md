# Media Downloader Utility API

A powerful and flexible media downloading API built with ElysiaJS that supports multiple platforms for video extraction and downloading.

## Features

- Multi-platform video extraction support
- Cookie-based authentication handling
- Customizable User-Agent management
- Swagger documentation integration
- Rate limiting and request validation
- Error handling and detailed logging

## Installation

```bash
# Using Bun
bun install 
```
## API Endpoints

### GET /extract

Extract video information from supported platforms.

```typescript
GET /extract?url={video_url}
```

**Query Parameters:**
- `url` (required): The URL of the video to extract

**Query Parameters:**
- `url` (required): The download URL obtained from extract endpoint
- `format` (optional): Desired format (default: best available)

## Error Handling

The API uses standard HTTP status codes:

- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 429: Too Many Requests
- 500: Internal Server Error

Errors are returned in the following format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

## Security

- Rate limiting is implemented to prevent abuse
- User-Agent validation to prevent spoofing
- Cookie-based session management
- Input sanitization for all parameters

## Core Framework

- ElysiaJS - A fast, and friendly Bun web framework
- @elysiajs/cookie - Cookie management for ElysiaJS
- @elysiajs/swagger - OpenAPI/Swagger integration

## Utilities

- cheerio - Fast, flexible implementation of core jQuery for parsing HTML
- node-fetch - Light-weight module that brings Fetch API to Node.js
- dotenv - Zero-dependency module that loads environment variables

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.