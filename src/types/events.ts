// Custom event types for the application

export interface ENSZapEthAmountChangeDetail {
  amount: string;
}

export interface ENSZapEvents {
  ensZapEthAmountChange: CustomEvent<ENSZapEthAmountChangeDetail>;
}

// Extend Window interface to include our custom events
declare global {
  interface WindowEventMap {
    ensZapEthAmountChange: CustomEvent<ENSZapEthAmountChangeDetail>;
  }
}
