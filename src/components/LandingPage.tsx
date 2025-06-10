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

        <h1 style={{ textAlign: 'center', margin: '20px 0', fontFamily: 'var(--font-display)' }}>
          ZAMM DEFI
        </h1>

        <div className="ascii-divider">════════════════════════════════════</div>

        <div style={{ textAlign: 'center', margin: '30px 0' }}>
          <p style={{ marginBottom: '20px' }} aria-live="polite">
            {finalText || text}
          </p>
          <div className="loading-bar" style={{ width: '300px', margin: '20px auto' }}>
            <div 
              className="loading-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p>[{Math.round(progress)}%]</p>
        </div>

        {/* Stats Cards */}
        <div style={{ margin: '40px 0', fontSize: '14px' }}>
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
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

          {/* Protocol Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '20px',
            marginTop: '30px',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
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
        </div>

        <div style={{ textAlign: 'center', margin: '40px 0' }}>
          <button
            className="button"
            onClick={handleEnterApp}
            disabled={!enterEnabled}
            style={{ 
              opacity: enterEnabled ? 1 : 0.5,
              fontSize: '16px',
              padding: '12px 24px'
            }}
            aria-label="Enter the ZAMM application"
          >
            ENTER ZAMM
          </button>
        </div>

        <div className="ascii-divider">════════════════════════════════════</div>

        <p style={{ 
          textAlign: 'center', 
          margin: '20px 0', 
          fontSize: '12px',
          letterSpacing: '1px'
        }}>
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
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    border: '2px solid var(--terminal-black)',
    marginBottom: '15px',
    background: 'linear-gradient(90deg, #f8f8f8 0%, #ffffff 100%)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: '8px',
        height: '8px',
        background: color,
        borderRadius: '50%'
      }}></div>
      <span style={{ fontWeight: 'bold' }}>{label}</span>
    </div>
    <span style={{
      color: color,
      fontWeight: 'bold',
      fontFamily: 'monospace'
    }}>
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
  <div style={{
    textAlign: 'center',
    padding: '20px',
    border: '2px solid var(--terminal-black)',
    background: '#f9f9f9'
  }}>
    <div style={{
      fontSize: '11px',
      marginBottom: '8px',
      color: '#666',
      fontWeight: 'bold',
      letterSpacing: '1px'
    }}>
      {label}
    </div>
    <div style={{ 
      fontWeight: 'bold', 
      fontSize: '18px', 
      marginBottom: '5px' 
    }}>
      {primary}
    </div>
    <div style={{ fontSize: '11px', color: '#666' }}>
      {secondary}
    </div>
  </div>
));
ProtocolStat.displayName = 'ProtocolStat';

export default LandingPage;