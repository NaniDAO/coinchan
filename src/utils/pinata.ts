export async function pinJsonToPinata(jsonObject: Record<string, unknown>): Promise<string> {
  const pinataJWT = import.meta.env.VITE_PINATA_JWT;
  if (!pinataJWT) {
    throw new Error("PINATA_JWT is not defined in environment variables.");
  }

  const pinRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pinataJWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(jsonObject),
  });

  const pinJson = await pinRes.json();
  if (!pinJson?.IpfsHash) {
    throw new Error(`Failed to pin JSON to IPFS: ${pinJson?.error || ""}`);
  }

  return `ipfs://${pinJson.IpfsHash}`;
}

export async function pinImageToPinata(
  imageBuffer: ArrayBuffer,
  fileName: string,
  pinataMetadata: Record<string, unknown>,
): Promise<string> {
  const pinataJWT = import.meta.env.VITE_PINATA_JWT;
  if (!pinataJWT) {
    throw new Error("PINATA_JWT is not defined in environment variables.");
  }

  const formData = new FormData();
  formData.append("file", new Blob([imageBuffer]), fileName);
  formData.append("pinataMetadata", JSON.stringify(pinataMetadata));

  const pinRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${pinataJWT}` },
    body: formData,
  });

  const pinJson = await pinRes.json();
  if (!pinJson?.IpfsHash) {
    throw new Error(`Failed to pin image to IPFS: ${pinJson?.error || ""}`);
  }

  return `ipfs://${pinJson.IpfsHash}`;
}
