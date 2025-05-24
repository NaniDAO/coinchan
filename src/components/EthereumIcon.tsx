import { useTheme, type ThemeMode } from "@/lib/theme";

// Light mode Ethereum SVG (original)
const ETH_LIGHT_SVG = `<svg fill="#000000" width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<g fill-rule="evenodd">
<path d="M16 32C7.163 32 0 24.837 0 16S7.163 0 16 0s16 7.163 16 16-7.163 16-16 16zm7.994-15.781L16.498 4 9 16.22l7.498 4.353 7.496-4.354zM24 17.616l-7.502 4.351L9 17.617l7.498 10.378L24 17.616z"/>
<g fill-rule="nonzero">
<path fill-opacity=".298" d="M16.498 4v8.87l7.497 3.35zm0 17.968v6.027L24 17.616z"/>
<path fill-opacity=".801" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/>
<path fill-opacity=".298" d="M9 16.22l7.498 4.353v-7.701z"/>
</g>
</g>
</svg>`;

// Dark mode Ethereum SVG (provided by user - more colorful and visible)
const ETH_DARK_SVG = `<svg width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<style type="text/css">
<![CDATA[
    .st0{fill:#E3F2FD;}
    .st1{fill:#80D8FF;}
    .st2{fill:#1AD2A4;}
    .st3{fill:#ECEFF1;}
    .st4{fill:#55FB9B;}
    .st5{fill:#BBDEFB;}
    .st6{fill:#C1AEE1;}
    .st7{fill:#FF5252;}
    .st8{fill:#FF8A80;}
    .st9{fill:#FFB74D;}
    .st10{fill:#FFF176;}
    .st11{fill:#FFFFFF;}
    .st12{fill:#65C7EA;}
    .st13{fill:#CFD8DC;}
    .st14{fill:#37474F;}
    .st15{fill:#78909C;}
    .st16{fill:#42A5F5;}
    .st17{fill:#455A64;}
]]>
</style>
<g id="Ethereum_x2C__crypto_x2C__cryptocurrency_1_">
<g id="XMLID_2_">
<g id="XMLID_41_">
<polygon class="st1" id="XMLID_690_" points="7.62,18.83 16.01,30.5 16.01,24.1"/>
</g>
<g id="XMLID_42_">
<polygon class="st16" id="XMLID_13_" points="16.01,30.5 24.38,18.78 16.01,24.1"/>
</g>
<g id="XMLID_43_">
<polygon class="st10" id="XMLID_14_" points="16.01,1.5 7.62,16.23 16.01,12.3"/>
</g>
<g id="XMLID_46_">
<polygon class="st8" id="XMLID_15_" points="24.38,16.18 16.01,1.5 16.01,12.3"/>
</g>
<g id="XMLID_47_">
<polygon class="st6" id="XMLID_16_" points="16.01,21.5 24.38,16.18 16.01,12.3"/>
</g>
<g id="XMLID_48_">
<polygon class="st4" id="XMLID_18_" points="16.01,12.3 7.62,16.23 16.01,21.5"/>
</g>
</g>
<g id="XMLID_4_">
<g id="XMLID_19_">
<path class="st17" d="M16.01,22c-0.09,0-0.18-0.03-0.27-0.08l-8.39-5.27c-0.23-0.14-0.3-0.44-0.17-0.67l8.39-14.73c0.18-0.31,0.69-0.31,0.87,0l8.36,14.68c0.13,0.23,0.06,0.53-0.17,0.67l-8.36,5.32C16.2,21.97,16.11,22,16.01,22zM8.3,16.06l7.71,4.85l7.69-4.89L16.01,2.51L8.3,16.06z"/>
</g>
<g id="XMLID_31_">
<path class="st17" d="M16.01,31c-0.28,0-0.5-0.22-0.5-0.5v-6.4c0-0.28,0.22-0.5,0.5-0.5s0.5,0.22,0.5,0.5v6.4C16.51,30.78,16.29,31,16.01,31z"/>
</g>
<g id="XMLID_20_">
<path class="st17" d="M16.01,31c-0.16,0-0.31-0.08-0.41-0.21L7.22,19.12c-0.14-0.19-0.12-0.46,0.04-0.63c0.16-0.17,0.43-0.21,0.63-0.08l8.12,5.11l8.1-5.15c0.2-0.13,0.47-0.1,0.63,0.08c0.16,0.17,0.18,0.44,0.04,0.63l-8.36,11.72C16.33,30.92,16.16,30.98,16.01,31zM9.52,20.61l6.49,9.03l6.47-9.06l-6.2,3.94c-0.16,0.1-0.37,0.1-0.53,0L9.52,20.61z"/>
</g>
<g id="XMLID_30_">
<path class="st17" d="M16.01,22c-0.09,0-0.18-0.03-0.27-0.08l-8.39-5.27c-0.15-0.1-0.24-0.27-0.23-0.45s0.12-0.34,0.29-0.42l8.39-3.93c0.13-0.06,0.29-0.06,0.42,0l8.36,3.88c0.17,0.08,0.28,0.24,0.29,0.42c0.01,0.18-0.08,0.36-0.23,0.45l-8.36,5.32C16.2,21.97,16.11,22,16.01,22zM8.67,16.29l7.34,4.62l7.33-4.66l-7.32-3.4L8.67,16.29z"/>
</g>
<g id="XMLID_32_">
<path class="st17" d="M16.01,22c-0.28,0-0.5-0.22-0.5-0.5v-20c0-0.28,0.22-0.5,0.5-0.5s0.5,0.22,0.5,0.5v20C16.51,21.78,16.29,22,16.01,22z"/>
</g>
<g id="XMLID_192_">
<path class="st17" d="M16.01,22c-0.09,0-0.18-0.03-0.27-0.08l-8.39-5.27c-0.23-0.14-0.3-0.44-0.17-0.67l8.39-14.73c0.18-0.31,0.69-0.31,0.87,0l8.36,14.68c0.13,0.23,0.06,0.53-0.17,0.67l-8.36,5.32C16.2,21.97,16.11,22,16.01,22zM8.3,16.06l7.71,4.85l7.69-4.89L16.01,2.51L8.3,16.06z"/>
</g>
</g>
</g>
</svg>`;

export function EthereumIcon({ className }: { className?: string }) {
  const { theme } = useTheme();
  
  // Use the colorful dark mode SVG when in dark mode, original for light mode
  const svgContent = theme === "dark" ? ETH_DARK_SVG : ETH_LIGHT_SVG;
  const dataUri = `data:image/svg+xml;base64,${btoa(svgContent)}`;
  
  return (
    <img 
      src={dataUri} 
      alt="Ethereum" 
      className={className}
    />
  );
}

// Export the data URIs for use in TokenMeta
export function getEthereumIconDataUri(theme: ThemeMode = "light"): string {
  const svgContent = theme === "dark" ? ETH_DARK_SVG : ETH_LIGHT_SVG;
  return `data:image/svg+xml;base64,${btoa(svgContent)}`;
}