import { useState, useEffect } from "react";
import { decodeAbiParameters } from "viem";
import { useEnsName } from "wagmi";
import { Loader2, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type DecodedParam = {
  name: string;
  type: string;
  value: string;
};

type DecodedCalldata = {
  functionName: string;
  signature: string;
  params: DecodedParam[];
};

// Multicall signatures
const MULTICALL_SELECTORS = [
  "0xac9650d8", // multicall(bytes[])
  "0x5ae401dc", // multicall(uint256,bytes[])
  "0x1f0464d1", // multicall(bytes32,bytes[])
  "0x252dba42", // aggregate((address,bytes)[])
];

const shortenAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const etherscanUrl = (address: string) => {
  return `https://etherscan.io/address/${address}`;
};

// Component for address with ENS resolution and etherscan link
const AddressLink = ({ address, className }: { address: string; className?: string }) => {
  const { data: ensName } = useEnsName({
    address: address as `0x${string}`,
    chainId: 1,
  });

  return (
    <a
      href={etherscanUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono hover:underline inline-flex items-center gap-1 ${className ?? ""}`}
      title={address}
    >
      {ensName ?? shortenAddress(address)}
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  );
};

// Copy button component
const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label ? `${label} copied!` : "Copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-muted transition-colors" title="Copy">
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 opacity-50 hover:opacity-100" />
      )}
    </button>
  );
};

// Decode calldata using openchain.xyz API
const useDecodeCalldata = (calldata: string | null) => {
  const [decoded, setDecoded] = useState<DecodedCalldata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!calldata || calldata === "0x" || calldata.length < 10) {
      setDecoded(null);
      return;
    }

    const selector = calldata.slice(0, 10);
    const encodedParams = calldata.length > 10 ? (`0x${calldata.slice(10)}` as `0x${string}`) : null;

    const fetchAndDecode = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`https://api.openchain.xyz/signature-database/v1/lookup?function=${selector}`);
        if (!response.ok) throw new Error("Failed to fetch");

        const data = await response.json();
        if (!data.ok || !data.result?.function?.[selector]?.length) {
          setDecoded(null);
          return;
        }

        // Get the first matching signature
        const signatureData = data.result.function[selector][0];
        const signature = signatureData.name;

        // signature format: "functionName(type1,type2,...)"
        const match = signature.match(/^([^(]+)\(([^)]*)\)$/);
        if (!match) {
          setDecoded(null);
          return;
        }

        const functionName = match[1];
        const paramTypesStr = match[2];

        if (!paramTypesStr || !encodedParams) {
          // No parameters
          setDecoded({ functionName, signature, params: [] });
          return;
        }

        // Parse parameter types (handle complex types like tuples)
        const paramTypes = parseParamTypes(paramTypesStr);

        // Decode parameters using viem
        try {
          const abiParams = paramTypes.map((type: string, i: number) => ({
            name: `param${i}`,
            type,
          }));

          const decodedValues = decodeAbiParameters(abiParams, encodedParams);

          const params: DecodedParam[] = paramTypes.map((type: string, i: number) => ({
            name: `param${i}`,
            type,
            value: formatParamValue(decodedValues[i], type),
          }));

          setDecoded({ functionName, signature, params });
        } catch (decodeError) {
          console.error("Decode error:", decodeError);
          // If decoding fails, still show the function name
          setDecoded({ functionName, signature, params: [] });
        }
      } catch (error) {
        console.error("Failed to decode calldata:", error);
        setDecoded(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndDecode();
  }, [calldata]);

  return { decoded, isLoading };
};

// Parse parameter types handling nested parentheses for tuples
const parseParamTypes = (paramTypesStr: string): string[] => {
  const types: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of paramTypesStr) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) types.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) types.push(current.trim());
  return types;
};

// Format parameter values for display
const formatParamValue = (value: unknown, type: string): string => {
  if (value === null || value === undefined) return "null";

  if (type === "address") {
    return value as string;
  }

  if (type.startsWith("uint") || type.startsWith("int")) {
    return (value as bigint).toString();
  }

  if (type === "bool") {
    return value ? "true" : "false";
  }

  if (type === "bytes" || type.startsWith("bytes")) {
    return value as string;
  }

  if (type === "string") {
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  }

  return String(value);
};

// Component to decode a single call (used recursively for multicall)
const DecodedCall = ({ calldata, depth = 0 }: { calldata: string; depth?: number }) => {
  const { decoded, isLoading } = useDecodeCalldata(calldata);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Decoding...</span>
      </div>
    );
  }

  if (!decoded) {
    return <div className="text-[10px] font-mono text-muted-foreground truncate">{calldata.slice(0, 20)}...</div>;
  }

  const isMulticall = MULTICALL_SELECTORS.includes(calldata.slice(0, 10).toLowerCase());

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px]">
        <span className="font-mono font-semibold text-primary">{decoded.functionName}</span>
        <span className="text-muted-foreground">
          ({decoded.params.length} param{decoded.params.length !== 1 ? "s" : ""})
        </span>
      </div>

      {decoded.params.length > 0 && (
        <div className={`rounded p-2 space-y-1.5 text-[10px] ${depth > 0 ? "bg-background/60" : "bg-background/80"}`}>
          {decoded.params.map((param, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">{param.type}</span>
                {param.type === "address" ? (
                  <AddressLink address={param.value} className="text-[10px]" />
                ) : param.type === "bytes[]" && isMulticall ? (
                  <span className="text-muted-foreground">[{JSON.parse(param.value).length} calls]</span>
                ) : (
                  <span className="font-mono break-all">{param.value}</span>
                )}
              </div>

              {/* Recursively decode multicall children */}
              {param.type === "bytes[]" && isMulticall && depth < 2 && (
                <MulticallChildren bytesArray={param.value} depth={depth + 1} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Component to decode multicall children
const MulticallChildren = ({ bytesArray, depth }: { bytesArray: string; depth: number }) => {
  const [expanded, setExpanded] = useState(true);

  let calls: string[] = [];
  try {
    calls = JSON.parse(bytesArray);
  } catch {
    return null;
  }

  if (calls.length === 0) return null;

  return (
    <div className="ml-2 border-l-2 border-primary/20 pl-2 space-y-2">
      <button onClick={() => setExpanded(!expanded)} className="text-[9px] text-muted-foreground hover:text-foreground">
        {expanded ? "▼" : "▶"} {calls.length} nested call{calls.length !== 1 ? "s" : ""}
      </button>

      {expanded &&
        calls.map((call, i) => (
          <div key={i} className="space-y-1">
            <div className="text-[9px] text-muted-foreground">Call {i + 1}:</div>
            <DecodedCall calldata={call} depth={depth} />
          </div>
        ))}
    </div>
  );
};

// Main component - accepts calldata and shows decoded + raw with copy
export const CalldataDecoder = ({ calldata }: { calldata: string }) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!calldata || calldata === "0x") {
    return <span className="text-[10px] text-muted-foreground">Empty</span>;
  }

  return (
    <div className="space-y-2">
      {/* Decoded view - expanded by default */}
      <DecodedCall calldata={calldata} />

      {/* Raw calldata - collapsed by default */}
      <div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showRaw ? "▼" : "▶"} Raw
          </button>
          <CopyButton text={calldata} label="Calldata" />
        </div>
        {showRaw && (
          <div className="mt-1 p-2 bg-background/60 rounded text-[9px] font-mono break-all max-h-20 overflow-auto">
            {calldata}
          </div>
        )}
      </div>
    </div>
  );
};
