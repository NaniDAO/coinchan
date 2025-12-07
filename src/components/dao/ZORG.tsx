import { useNavigate } from "@tanstack/react-router";
import { ContentView } from "./ContentView";
import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import UserSettingsMenu from "@/components/UserSettingsMenu";

export const ZORG = () => {
    const navigate = useNavigate();

    const handleExit = () => {
        navigate({ to: "/" });
    };

    return (
        <div
            className="h-screen w-screen inset-0 z-40 bg-background text-foreground overflow-hidden relative"
            style={{
                filter: "contrast(1.4) brightness(1.2) saturate(1.5)",
            }}
        >
            {/* Tiled Background GIF */}
            <div
                className="absolute inset-0 z-0 opacity-60"
                style={{
                    backgroundImage: "url(/zorg-bg.gif)",
                    backgroundRepeat: "repeat",
                    backgroundSize: "auto",
                }}
            />

            {/* Top Header with Wallet */}
            <div className="fixed top-0 left-0 right-0 z-20 bg-background/60 backdrop-blur-sm border-b border-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="font-mono text-sm sm:text-base font-bold tracking-widest">
                        ZORG DAO
                    </div>
                    <div className="flex items-center gap-2">
                        <RainbowConnectButton />
                        <UserSettingsMenu />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 h-full flex items-center justify-center p-4 sm:p-8 pt-20">
                <ContentView
                    className="w-xl max-h-[10rem] rounded-2xl"
                    mode={"join"}
                    onBack={handleExit}
                />
                <MenuView />
            </div>

            {/* Status Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/60 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between text-[10px] sm:text-xs font-mono">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <span className="text-green-400">◉ ONLINE</span>
                        <span className="text-muted-foreground hidden sm:inline">
                            NETWORK: ETHEREUM MAINNET
                        </span>
                        <span className="text-muted-foreground sm:hidden">
                            ETH MAINNET
                        </span>
                        <a
                            href="https://majeurdao.eth.limo/#/dao/1/0x5E58BA0e06ED0F5558f83bE732a4b899a674053E"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cyan-400 hover:text-cyan-300 transition-colors underline"
                        >
                            GOVERN
                        </a>
                    </div>
                    <div className="text-muted-foreground">
                        v1.0 • {new Date().toISOString().split("T")[0]}
                    </div>
                </div>
            </div>
        </div>
    );
};
