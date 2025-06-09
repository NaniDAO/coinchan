import { sdk } from "@farcaster/frame-sdk";
import "../index.css";
import { useEffect, useState } from "react";

import PoolActions from "../PoolActions";
import { LandingPage } from "../components/LandingPage";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [showLanding, setShowLanding] = useState(true);

  useEffect(() => {
    sdk.actions.ready(); // @TODO farcaster integration
    
    // Check if user has visited before
    const hasVisited = localStorage.getItem('zamm-visited');
    if (hasVisited) {
      setShowLanding(false);
    }
  }, []);

  const handleEnterApp = () => {
    localStorage.setItem('zamm-visited', 'true');
    setShowLanding(false);
  };

  if (showLanding) {
    return <LandingPage onEnterApp={handleEnterApp} />;
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <PoolActions />
    </div>
  );
}
