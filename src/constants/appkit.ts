import { createAppKit } from '@reown/appkit'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet } from '@reown/appkit/networks'

// Project ID for Reown AppKit
const projectId = '9aec7613816460c56ad283ad8e416293'

const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [mainnet]
})

// Create application's metadata object
const metadata = {
  name: 'Coinchan',
  description: 'A platform for creating, trading, and managing crypto tokens/coins',
  url: window.location.origin,
  icons: ['/coinchan-logo.png']
}

// Create AppKit instance
export const appkit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [mainnet],
  metadata,
  projectId,
  features: {
    analytics: true
  }
})

// Export the modal for use in components
export const { open: openAppKitModal } = appkit 