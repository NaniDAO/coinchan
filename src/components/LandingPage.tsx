import React, { useState, useEffect } from 'react';
import { ZammLogo } from './ZammLogo';

interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Loading Ethereum...');
  const [enterEnabled, setEnterEnabled] = useState(false);

  useEffect(() => {
    // Simulate loading progress
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        const increment = Math.random() * 12 + 3;
        const newProgress = Math.min(prev + increment, 100);
        
        if (newProgress >= 100) {
          clearInterval(interval);
          
          // Fade to "Initialized"
          setTimeout(() => {
            setLoadingText('Initialized');
          }, 400);
          
          // Then fade to slogan
          setTimeout(() => {
            setLoadingText('The Efficient Ethereum Exchange');
            setEnterEnabled(true);
          }, 1800);
        }
        
        return newProgress;
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  const handleEnterApp = () => {
    if (onEnterApp) {
      onEnterApp();
    }
  };

  const handleLogoClick = () => {
    // Logo animation is handled by the ZammLogo component
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
          onClick={handleLogoClick}
          className="landing-logo"
        />

        <h1 style={{ textAlign: 'center', margin: '20px 0', fontFamily: 'var(--font-display)' }}>
          ZAMM DEFI
        </h1>

        <div className="ascii-divider">════════════════════════════════════</div>

        <div style={{ textAlign: 'center', margin: '30px 0' }}>
          <p id="loadingText" style={{ marginBottom: '20px' }}>{loadingText}</p>
          <div className="loading-bar" style={{ width: '300px', margin: '20px auto' }}>
            <div 
              className="loading-fill" 
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <p>[{Math.round(loadingProgress)}%]</p>
        </div>

        {/* Stats Cards */}
        <div style={{ margin: '40px 0', fontSize: '14px' }}>
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <StatsCard 
              label="ETH Price:" 
              value="$2,525.51" 
              color="#00d4ff"
            />
            <StatsCard 
              label="Gas Price:" 
              value="1.1 GWEI" 
              color="#ffe066"
            />
            <StatsCard 
              label="Launch Cost:" 
              value="$1.33" 
              color="#ff6b9d"
            />
            <StatsCard 
              label="Network Status:" 
              value="READY" 
              color="#66d9a6"
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
              primary="7,698.880857 Ξ"
              secondary="($19,439,594.80)"
            />
            <ProtocolStat 
              label="SWAPS"
              primary="30,515"
              secondary="24H: +234"
            />
            <ProtocolStat 
              label="COINS"
              primary="321"
              secondary="Active: 142"
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
      <div className="ticker">
        <div className="ticker__track">
          <span className="ticker__item">ZAMM Ξ2.53</span>
          <span className="ticker__item">ETH Ξ3,142.85</span>
          <span className="ticker__item">WBTC Ξ98,234.00</span>
          <span className="ticker__item">DAI Ξ1.00</span>
          {/* Repeat for seamless loop */}
          <span className="ticker__item">ZAMM Ξ2.53</span>
          <span className="ticker__item">ETH Ξ3,142.85</span>
          <span className="ticker__item">WBTC Ξ98,234.00</span>
          <span className="ticker__item">DAI Ξ1.00</span>
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
}> = ({ label, value, color }) => (
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
);

// Protocol Stats Component
const ProtocolStat: React.FC<{
  label: string;
  primary: string;
  secondary: string;
}> = ({ label, primary, secondary }) => (
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
);

export default LandingPage;