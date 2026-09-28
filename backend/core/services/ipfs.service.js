const pinataSDK = require("@pinata/sdk");
const axios = require("axios");

const uploadToIPFS = async (data) => {
  const PINATA_API_KEY = process.env.PINATA_API_KEY;
  const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("Pinata not configured");
  }

  const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_KEY);

  try {
    const result = await pinata.pinJSONToIPFS(data);
    return result.IpfsHash;
  } catch (error) {
    console.error("IPFS Upload Error:", error);
    throw new Error("IPFS upload failed");
  }
};

const fetchFromIPFS = async (ipfsHash) => {
  try {
    const url = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("IPFS Fetch Error:", error.message);
    throw new Error("IPFS fetch failed");
  }
}; 

module.exports = {
  uploadToIPFS,
  fetchFromIPFS,
};
