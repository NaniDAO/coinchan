// Favicon management with ZAMM animation support and static fallback

export class FaviconManager {
  private static instance: FaviconManager;
  private animatedFaviconUrl: string = '/zammzamm.gif';
  private staticFaviconUrl: string = '/zammzamm.png';
  private currentFavicon: 'animated' | 'static' = 'static';
  private supportsAnimatedFavicon: boolean = true;
  
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
      // Check if the GIF exists
      const response = await fetch(this.animatedFaviconUrl);
      if (!response.ok) {
        throw new Error('GIF not found');
      }
      // GIF exists, we can use it directly
    } catch (error) {
      console.warn('Animated favicon not available, will use static fallback');
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
      favicon.type = this.currentFavicon === 'animated' ? 'image/gif' : 'image/png';
      favicon.href = this.currentFavicon === 'animated' ? this.animatedFaviconUrl : this.staticFaviconUrl;
      
      // Force refresh by adding a timestamp query parameter
      const timestamp = new Date().getTime();
      favicon.href = `${favicon.href}?v=${timestamp}`;
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