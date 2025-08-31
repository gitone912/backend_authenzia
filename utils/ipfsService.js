// Optional IPFS imports - gracefully handle missing packages
let Web3Storage, pinataSDK, create;
try {
  const web3StorageModule = await import('web3.storage');
  Web3Storage = web3StorageModule.Web3Storage;
} catch (error) {
  console.warn('⚠️ web3.storage not available:', error.message);
}

try {
  const pinataModule = await import('@pinata/sdk');
  pinataSDK = pinataModule.default;
} catch (error) {
  console.warn('⚠️ @pinata/sdk not available:', error.message);
}

try {
  const ipfsModule = await import('ipfs-http-client');
  create = ipfsModule.create;
} catch (error) {
  console.warn('⚠️ ipfs-http-client not available:', error.message);
}

import crypto from 'crypto';

export class IPFSService {
  constructor() {
    this.web3StorageToken = process.env.WEB3_STORAGE_TOKEN;
    this.pinataApiKey = process.env.PINATA_API_KEY;
    this.pinataSecretKey = process.env.PINATA_SECRET_KEY;
    this.ipfsGateway = process.env.IPFS_GATEWAY || 'https://ipfs.io/ipfs/';

    // Initialize clients only if packages are available
    this.web3Storage = null;
    this.pinata = null;
    this.ipfsClient = null;

    try {
      if (Web3Storage && this.web3StorageToken) {
        this.web3Storage = new Web3Storage({ token: this.web3StorageToken });
        console.log('✅ Web3.Storage initialized');
      }
    } catch (error) {
      console.warn('⚠️ Web3.Storage initialization failed:', error.message);
    }

    try {
      if (pinataSDK && this.pinataApiKey && this.pinataSecretKey) {
        this.pinata = new pinataSDK(this.pinataApiKey, this.pinataSecretKey);
        console.log('✅ Pinata initialized');
      }
    } catch (error) {
      console.warn('⚠️ Pinata initialization failed:', error.message);
    }

    try {
      if (create && process.env.INFURA_PROJECT_ID) {
        this.ipfsClient = create({
          host: 'ipfs.infura.io',
          port: 5001,
          protocol: 'https',
          headers: {
            authorization: `Basic ${Buffer.from(process.env.INFURA_PROJECT_ID + ':' + process.env.INFURA_PROJECT_SECRET).toString('base64')}`
          }
        });
        console.log('✅ IPFS HTTP client initialized');
      } else {
        console.log('⚠️ IPFS HTTP client disabled - missing Infura credentials');
      }
    } catch (error) {
      console.warn('⚠️ IPFS HTTP client initialization failed:', error.message);
    }

    // Log IPFS service status
    const availableServices = [];
    if (this.web3Storage) availableServices.push('Web3.Storage');
    if (this.pinata) availableServices.push('Pinata');
    if (this.ipfsClient) availableServices.push('IPFS HTTP');

    if (availableServices.length > 0) {
      console.log(`📦 IPFS services available: ${availableServices.join(', ')}`);
    } else {
      console.log('⚠️ No IPFS services configured - files will be stored locally only');
    }
  }

  // Generate SHA-256 hash for content
  generateHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Upload to Web3.Storage
  async uploadToWeb3Storage(buffer, filename, metadata = {}) {
    if (!this.web3Storage) {
      throw new Error('Web3.Storage not configured');
    }

    try {
      const file = new File([buffer], filename, { type: 'application/octet-stream' });
      const cid = await this.web3Storage.put([file], {
        name: filename,
        maxRetries: 3,
        wrapWithDirectory: false
      });

      return {
        cid: cid,
        url: `${this.ipfsGateway}${cid}`,
        gateway: this.ipfsGateway,
        provider: 'web3.storage',
        hash: this.generateHash(buffer),
        size: buffer.length,
        filename,
        metadata
      };
    } catch (error) {
      throw new Error(`Web3.Storage upload failed: ${error.message}`);
    }
  }

  // Upload to Pinata
  async uploadToPinata(buffer, filename, metadata = {}) {
    if (!this.pinata) {
      throw new Error('Pinata not configured');
    }

    try {
      const options = {
        pinataMetadata: {
          name: filename,
          ...metadata
        },
        pinataOptions: {
          cidVersion: 0
        }
      };

      const result = await this.pinata.pinFileToIPFS(buffer, options);

      return {
        cid: result.IpfsHash,
        url: `${this.ipfsGateway}${result.IpfsHash}`,
        gateway: this.ipfsGateway,
        provider: 'pinata',
        hash: this.generateHash(buffer),
        size: buffer.length,
        filename,
        metadata,
        pinSize: result.PinSize,
        timestamp: result.Timestamp
      };
    } catch (error) {
      throw new Error(`Pinata upload failed: ${error.message}`);
    }
  }

  // Upload to IPFS HTTP client
  async uploadToIPFS(buffer, filename, metadata = {}) {
    if (!this.ipfsClient) {
      throw new Error('IPFS client not configured');
    }

    try {
      const result = await this.ipfsClient.add(buffer, {
        pin: true,
        wrapWithDirectory: false
      });

      return {
        cid: result.cid.toString(),
        url: `${this.ipfsGateway}${result.cid.toString()}`,
        gateway: this.ipfsGateway,
        provider: 'ipfs-http-client',
        hash: this.generateHash(buffer),
        size: buffer.length,
        filename,
        metadata,
        path: result.path
      };
    } catch (error) {
      throw new Error(`IPFS upload failed: ${error.message}`);
    }
  }

  // Main upload method with fallback
  async uploadFile(buffer, filename, metadata = {}) {
    const errors = [];

    // Check if any IPFS services are available
    if (!this.web3Storage && !this.pinata && !this.ipfsClient) {
      console.log('⚠️ No IPFS services available - skipping IPFS upload');
      return null; // Return null instead of throwing error
    }

    // Try Web3.Storage first
    if (this.web3Storage) {
      try {
        console.log('📤 Uploading to Web3.Storage...');
        return await this.uploadToWeb3Storage(buffer, filename, metadata);
      } catch (error) {
        console.warn('Web3.Storage upload failed:', error.message);
        errors.push(`Web3.Storage: ${error.message}`);
      }
    }

    // Try Pinata as fallback
    if (this.pinata) {
      try {
        console.log('📤 Uploading to Pinata...');
        return await this.uploadToPinata(buffer, filename, metadata);
      } catch (error) {
        console.warn('Pinata upload failed:', error.message);
        errors.push(`Pinata: ${error.message}`);
      }
    }

    // Try IPFS HTTP client as last resort
    if (this.ipfsClient) {
      try {
        console.log('📤 Uploading to IPFS HTTP client...');
        return await this.uploadToIPFS(buffer, filename, metadata);
      } catch (error) {
        console.warn('IPFS HTTP client upload failed:', error.message);
        errors.push(`IPFS HTTP: ${error.message}`);
      }
    }

    console.warn(`⚠️ All IPFS upload methods failed: ${errors.join(', ')}`);
    return null; // Return null instead of throwing error
  }

  // Upload metadata JSON to IPFS
  async uploadMetadata(metadata) {
    const metadataJson = JSON.stringify(metadata, null, 2);
    const buffer = Buffer.from(metadataJson, 'utf8');
    const filename = `metadata_${Date.now()}.json`;

    return await this.uploadFile(buffer, filename, { type: 'metadata' });
  }

  // Create NFT metadata standard format
  createNFTMetadata(asset, ipfsData) {
    return {
      name: asset.title,
      description: asset.description,
      image: ipfsData.url,
      external_url: `${process.env.FRONTEND_URL}/asset/${asset._id}`,
      attributes: [
        {
          trait_type: "Creator",
          value: asset.creator.username || asset.creator
        },
        {
          trait_type: "Category",
          value: asset.category
        },
        {
          trait_type: "License",
          value: asset.license
        },
        {
          trait_type: "File Hash",
          value: ipfsData.hash
        },
        {
          trait_type: "Upload Date",
          value: asset.createdAt
        }
      ],
      properties: {
        files: [
          {
            uri: ipfsData.url,
            type: asset.originalFile.mimetype,
            cdn: false
          }
        ],
        category: asset.category,
        creators: [
          {
            address: asset.creator.walletAddress || "",
            share: 100
          }
        ]
      },
      collection: {
        name: "Authenzia NFT Marketplace",
        family: "Authenzia"
      }
    };
  }

  // Get IPFS URL from CID
  getIPFSUrl(cid, gateway = null) {
    const selectedGateway = gateway || this.ipfsGateway;
    return `${selectedGateway}${cid}`;
  }

  // Test IPFS connectivity
  async testConnectivity() {
    const testData = Buffer.from('IPFS connectivity test', 'utf8');
    const testFilename = `test_${Date.now()}.txt`;

    try {
      const result = await this.uploadFile(testData, testFilename, { test: true });
      console.log('✅ IPFS connectivity test successful:', result);
      return result;
    } catch (error) {
      console.error('❌ IPFS connectivity test failed:', error.message);
      throw error;
    }
  }
}

export default IPFSService;
