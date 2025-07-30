// Favicon management with ZAMM animation support and static fallback

export class FaviconManager {
  private static instance: FaviconManager;
  private animatedFaviconUrl: string = '/zammzamm.gif'; // We'll need to add this file
  private staticFaviconUrl: string = '/zammzamm.png';
  private currentFavicon: 'animated' | 'static' = 'static';
  private supportsAnimatedFavicon: boolean = true;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  
  private constructor() {
    this.init();
  }

  static getInstance(): FaviconManager {
    if (!FaviconManager.instance) {
      FaviconManager.instance = new FaviconManager();
    }
    return FaviconManager.instance;
  }

  private async init() {
    // Check if browser supports animated favicons
    this.supportsAnimatedFavicon = this.checkAnimatedFaviconSupport();
    
    // Try to load animated favicon
    if (this.supportsAnimatedFavicon) {
      await this.tryLoadAnimatedFavicon();
    }
    
    // Set initial favicon (prefer animated if available)
    if (this.supportsAnimatedFavicon) {
      this.setAnimated();
    } else {
      this.setStatic();
    }
  }

  private checkAnimatedFaviconSupport(): boolean {
    // Most modern browsers support animated favicons (GIF)
    // Safari on iOS has limited support
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // For now, disable on iOS to ensure consistent behavior
    return !isIOS;
  }

  private async tryLoadAnimatedFavicon(): Promise<void> {
    try {
      // First, check if we have a pre-generated GIF
      const response = await fetch(this.animatedFaviconUrl);
      if (response.ok) {
        // GIF exists, we can use it directly
        return;
      }
    } catch (error) {
      // GIF doesn't exist, try to create frames from video
      console.log('No GIF found, will extract frames from video');
    }

    // If no GIF, create animated favicon from video frames
    await this.createAnimatedFaviconFromVideo();
  }

  private async createAnimatedFaviconFromVideo(): Promise<void> {
    try {
      // Create video element to load the zammzamm video
      this.videoElement = document.createElement('video');
      this.canvasElement = document.createElement('canvas');
      const ctx = this.canvasElement.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Set canvas size for favicon (32x32 or 64x64 for retina)
      const faviconSize = 64;
      this.canvasElement.width = faviconSize;
      this.canvasElement.height = faviconSize;

      // Load video
      this.videoElement.src = '/zammzamm.mp4';
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      
      await new Promise((resolve, reject) => {
        this.videoElement!.onloadeddata = resolve;
        this.videoElement!.onerror = reject;
      });

      // For now, just use a single frame from the video as animated favicon
      // In a production environment, you'd extract multiple frames and create a GIF server-side
      this.videoElement.currentTime = 0.5; // Get frame at 0.5 seconds
      
      await new Promise(resolve => {
        this.videoElement!.onseeked = resolve;
      });

      // Draw video frame to canvas
      ctx.drawImage(this.videoElement, 0, 0, faviconSize, faviconSize);
      
      // Convert to data URL
      this.animatedFaviconUrl = this.canvasElement.toDataURL('image/png');
      
      // Clean up
      this.videoElement.remove();
      this.videoElement = null;
      
    } catch (error) {
      console.warn('Failed to create animated favicon from video:', error);
      this.supportsAnimatedFavicon = false;
    }
  }

  private updateFavicon() {
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    
    if (!favicon) {
      // Create favicon link if it doesn't exist
      const newFavicon = document.createElement('link');
      newFavicon.rel = 'icon';
      newFavicon.type = this.currentFavicon === 'animated' ? 'image/gif' : 'image/png';
      newFavicon.href = this.currentFavicon === 'animated' ? this.animatedFaviconUrl : this.staticFaviconUrl;
      document.head.appendChild(newFavicon);
    } else {
      // Update existing favicon
      const isGif = this.animatedFaviconUrl.endsWith('.gif');
      favicon.type = this.currentFavicon === 'animated' ? (isGif ? 'image/gif' : 'image/png') : 'image/png';
      favicon.href = this.currentFavicon === 'animated' ? this.animatedFaviconUrl : this.staticFaviconUrl;
    }
    
    // Always use static PNG for Apple touch icon (iOS doesn't support animated icons)
    if (appleTouchIcon) {
      appleTouchIcon.href = this.staticFaviconUrl;
    }
  }

  public setAnimated() {
    if (this.supportsAnimatedFavicon) {
      this.currentFavicon = 'animated';
      this.updateFavicon();
    }
  }

  public setStatic() {
    this.currentFavicon = 'static';
    this.updateFavicon();
  }

  public toggle() {
    if (this.currentFavicon === 'static' && this.supportsAnimatedFavicon) {
      this.setAnimated();
    } else {
      this.setStatic();
    }
  }

  public isAnimated(): boolean {
    return this.currentFavicon === 'animated';
  }

  // Clean up resources when no longer needed
  public destroy() {
    if (this.videoElement) {
      this.videoElement.remove();
      this.videoElement = null;
    }
    if (this.canvasElement) {
      this.canvasElement.remove();
      this.canvasElement = null;
    }
  }
}

// Initialize favicon manager after DOM is ready
if (typeof window !== 'undefined') {
  // Use DOMContentLoaded to ensure the favicon link is accessible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      FaviconManager.getInstance();
    });
  } else {
    // DOM is already loaded
    FaviconManager.getInstance();
  }
}