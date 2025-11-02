# Sid Reader

**Sid Reader** is a modern, progressive web application for reading interactive digital stories and e-books. Built with vanilla JavaScript and CSS, it provides a rich, immersive reading experience with AI-powered narrative assistance and multimedia support.

## Features

### 📖 Core Reading Experience
- **Virtual Pagination**: Smooth page-by-page navigation through stories
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Table of Contents**: Organized navigation by story sections (prefaces, episodes, conclusions)
- **Progress Tracking**: Automatically saves your reading position
- **Accessibility**: Screen reader support and keyboard navigation

### 🎨 Rich Media Support
- **Image Galleries**: View and interact with story images in an elegant lightbox
- **Video Integration**: Auto-playing video thumbnails with full-screen viewing
- **Cover Carousel**: Beautiful cover art display with automatic slideshow
- **Media Caching**: Intelligent caching for offline reading and improved performance

### 🤖 AI-Powered Narrator
- **Interactive Chat**: Ask questions about the story using OpenAI's GPT models
- **Context-Aware Responses**: AI understands and responds based on story content
- **Multi-language Support**: Supports English, Italian, Spanish, French, and German
- **Semantic Search**: Finds relevant story sections using vector embeddings
- **Privacy-First**: API keys stored in session storage only

### 🌐 Decentralized Content
- **IPFS Support**: Load stories from IPFS networks with automatic gateway fallback
- **Multiple Gateway Support**: Automatically tries different IPFS gateways for reliability
- **Offline Capabilities**: Service worker enables offline reading of cached content
- **Progressive Loading**: Smart content loading with progress indicators

### 📱 Progressive Web App
- **Service Worker**: Offline functionality and intelligent caching
- **Touch Gestures**: Swipe navigation support (when enabled)
- **Responsive UI**: Adapts to different screen sizes and orientations
- **Fast Loading**: Modular architecture for optimal performance

## Story Format

Sid Reader works with JSON-based story manifests and narratives:

### Manifest Structure
```json
{
  "title": "Story Title",
  "assets": {
    "cover": ["cover1.jpg", "cover2.mp4"],
    "narrative": "narrative.json"
  }
}
```

### Narrative Structure
```json
{
  "title": "Story Title",
  "author": "Author Name",
  "language": "en",
  "content": [
    {
      "type": "preface",
      "title": "Chapter Title",
      "content": "Story text content...",
      "metadata": {
        "date": "2024-01-01",
        "location": "45.79, 9.11"
      },
      "media": ["image1.jpg", "video1.mp4"]
    }
  ]
}
```

## Usage

### Basic Usage
1. Open `index.html` in a web browser
2. Add query parameters to load a story:
   - `?manifest=https://example.com/story/manifest.json`
   - `?cid=QmHash123...` (for IPFS content)

### AI Narrator Setup
1. Click the chat bubble (💬) button
2. Enter your OpenAI API key when prompted
3. Start asking questions about the story

### Supported Media Types
- **Images**: JPG, PNG, WebP, GIF, BMP
- **Videos**: MP4, MOV, WebM, MKV, AVI

## Technical Architecture

### Modular Design
The application is built with a modular architecture for maintainability and performance:

- **Core**: `core/reader.js`, `core/utils.js`, `core/navigation.js`
- **Components**: `components/cover.js`, `components/lightbox.js`, `components/media-gallery.js`
- **AI Integration**: `agent.js` (loaded on-demand)
- **Story Loading**: `stories.reader.js`
- **Service Worker**: `sw.js`

### Key Components

#### Reader Core (`core/reader.js`)
- Virtual pagination system
- Story rendering and navigation
- Table of contents generation
- Progress tracking

#### AI Agent (`agent.js`)
- OpenAI integration for chat functionality
- Vector embeddings for semantic search
- Multi-language narrator responses
- Context-aware story analysis

#### Media Gallery (`components/media-gallery.js`)
- Image and video thumbnail display
- Lightbox integration
- Lazy loading for performance

#### Service Worker (`sw.js`)
- Offline functionality
- Intelligent media caching
- Cache size management
- Network-first for JSON, cache-first for media

### Storage and Caching
- **Session Storage**: Reading progress and API keys
- **Cache API**: Static assets and media files
- **IndexedDB**: Media metadata for cache management
- **Memory Cache**: Runtime media optimization

## Browser Support

- Modern browsers with ES6+ support
- Service Worker support for offline functionality
- Web APIs: Fetch, Cache API, IndexedDB
- Progressive enhancement for older browsers

## Installation

Sid Reader is a client-side application that requires no server installation:

1. Clone or download the repository
2. Serve the files using any web server (e.g., `python -m http.server`)
3. Access through a web browser

For IPFS content, ensure your stories follow the supported manifest format.

## Contributing

The codebase is organized for easy contribution:
- Modular component architecture
- Clear separation of concerns
- Comprehensive error handling
- Accessibility considerations

## License

This project is open source. Check the repository for license details.

---

**Sid Reader** transforms digital storytelling by combining modern web technologies with AI assistance, creating an immersive and interactive reading experience for the digital age.