import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pm")({
  beforeLoad: () => {
    // Redirect to external ethPM site
    window.location.href = "https://ethpm.eth.limo/";
  },
});
