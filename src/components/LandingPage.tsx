import React, { useState, useEffect } from 'react';
import { ZammLogo } from './ZammLogo';
import { useLandingData, useSimpleLoadingProgress } from '../hooks/use-landing-data';
import { useProtocolStats } from '../hooks/use-protocol-stats';

interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const { data: landingData } = useLandingData();
  const { data: protocolStats } = useProtocolStats();
  const { data: loadingData } = useSimpleLoadingProgress();
  const progress = loadingData?.progress || 0;
  const text = loadingData?.text || 'Initializing...';
  const stage = loadingData?.stage || 'loading';
  const [finalText, setFinalText] = useState('');
  const [enterEnabled, setEnterEnabled] = useState(false);

  useEffect(() => {
    if (stage === 'complete') {
      setTimeout(() => {
        setFinalText('The Efficient Ethereum Exchange');
        setEnterEnabled(true);
      }, 1000);
    }
  }, [stage]);

  const handleEnterApp = () => {
    if (onEnterApp) {
      onEnterApp();
    }
  };


  return (
    <div className="terminal-window">
      <div className="window-header">
        <div style={{ width: '60px' }}></div>
        <div>═══════════ ZAMM DeFi v1.0 ═══════════</div>
        <div style={{ width: '60px' }}></div>
      </div>
      
      <div className="window-content">
        <ZammLogo 
          size="landing" 
          isLoading={progress < 100}
          autoStartAnimation={true}
        />

        <h1 className="text-center my-5" style={{ fontFamily: 'var(--font-display)' }}>
          ZAMM DEFI
        </h1>

        <div className="ascii-divider">════════════════════════════════════</div>

        <div className="text-center my-8">
          <p className="mb-5" aria-live="polite">
            {finalText || text}
          </p>
          <div className="loading-bar mx-auto my-5" style={{ width: '300px' }}>
            <div 
              className="loading-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p>[{Math.round(progress)}%]</p>
        </div>

        <section className="my-10 text-sm" aria-label="Network Statistics">
          <div className="max-w-lg mx-auto">
            <StatsCard 
              label="ETH Price:" 
              value={landingData?.ethPrice || 'Loading...'} 
              color="#00d4ff"
            />
            <StatsCard 
              label="Gas Price:" 
              value={landingData?.gasPrice || 'Loading...'}
              color="#ffe066"
            />
            <StatsCard 
              label="Launch Cost:" 
              value={landingData?.launchCost || 'Loading...'}
              color="#ff6b9d"
            />
            <StatsCard 
              label="Network Status:" 
              value={landingData?.isAppReady ? 'READY' : (landingData?.networkStatus === 'error' ? 'ERROR' : 'LOADING')}
              color={landingData?.isAppReady ? '#66d9a6' : (landingData?.networkStatus === 'error' ? '#ff6b6b' : '#ffa500')}
            />
          </div>

          <div className="ascii-divider">════════════════════════════════════</div>

          <div className="grid grid-cols-3 gap-5 mt-8 max-w-2xl mx-auto">
            <ProtocolStat 
              label="ETH SWAPPED"
              primary={protocolStats?.totalEthSwapped || 'Loading...'}
              secondary={protocolStats?.totalEthSwappedUsd || ''}
            />
            <ProtocolStat 
              label="SWAPS"
              primary={protocolStats?.totalSwaps?.toLocaleString() || '0'}
              secondary={`24H: +${protocolStats?.swaps24h || 0}`}
            />
            <ProtocolStat 
              label="COINS"
              primary={protocolStats?.totalCoins?.toString() || '0'}
              secondary={`Active: ${protocolStats?.activeCoins || 0}`}
            />
          </div>
        </section>

        <div className="text-center my-10">
          <button
            className="button text-base px-6 py-3"
            onClick={handleEnterApp}
            disabled={!enterEnabled}
            style={{ opacity: enterEnabled ? 1 : 0.5 }}
            aria-label="Enter the ZAMM application"
          >
            ENTER ZAMM
          </button>
        </div>

        <div className="ascii-divider">════════════════════════════════════</div>

        <p className="text-center my-5 text-xs tracking-wider">
          EVM PRAGUE • FAIR LAUNCHES • CHEAP FEES
        </p>
      </div>

      {/* Ticker Tape */}
      <div className="ticker" role="marquee" aria-label="Live price ticker">
        <div className="ticker__track" aria-hidden="true">
          <span className="ticker__item">ZAMM $2.53</span>
          <span className="ticker__item">ETH $3,200.00</span>
          <span className="ticker__item">WBTC $98,234.00</span>
          <span className="ticker__item">DAI $1.00</span>
          {/* Repeat for seamless loop */}
          <span className="ticker__item">ZAMM $2.53</span>
          <span className="ticker__item">ETH $3,200.00</span>
          <span className="ticker__item">WBTC $98,234.00</span>
          <span className="ticker__item">DAI $1.00</span>
        </div>
      </div>
    </div>
  );
};

// Stats Card Component
const StatsCard: React.FC<{
  label: string;
  value: string;
  color: string;
}> = React.memo(({ label, value, color }) => (
  <div className="flex justify-between items-center p-4 border-2 mb-4" 
       style={{ 
         borderColor: 'var(--terminal-black)',
         background: 'linear-gradient(90deg, #f8f8f8 0%, #ffffff 100%)'
       }}>
    <div className="flex items-center gap-2">
      <div 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: color }}
      />
      <span className="font-bold">{label}</span>
    </div>
    <span 
      className="font-bold font-mono"
      style={{ color }}
    >
      {value}
    </span>
  </div>
));
StatsCard.displayName = 'StatsCard';

// Protocol Stats Component
const ProtocolStat: React.FC<{
  label: string;
  primary: string;
  secondary: string;
}> = React.memo(({ label, primary, secondary }) => (
  <div className="text-center p-5 border-2" 
       style={{ 
         borderColor: 'var(--terminal-black)',
         backgroundColor: '#f9f9f9'
       }}>
    <div className="text-xs mb-2 text-gray-600 font-bold tracking-wide">
      {label}
    </div>
    <div className="font-bold text-lg mb-1">
      {primary}
    </div>
    <div className="text-xs text-gray-600">
      {secondary}
    </div>
  </div>
));
ProtocolStat.displayName = 'ProtocolStat';

export default LandingPage;