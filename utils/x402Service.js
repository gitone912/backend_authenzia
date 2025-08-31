import express from 'express';
import { paymentMiddleware } from 'x402-express';
import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';

export class X402Service {
  constructor() {
    this.receivingWallet = process.env.COINBASE_RECEIVING_WALLET;
    this.facilitatorUrl = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
    this.network = process.env.X402_NETWORK || 'base-sepolia';

    // Initialize Coinbase SDK with error handling
    try {
      if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
        this.coinbase = new Coinbase({
          apiKeyId: process.env.CDP_API_KEY_ID,
          apiKeySecret: process.env.CDP_API_KEY_SECRET,
        });
        console.log(`🪙 X402 Service initialized for ${this.network} with Coinbase SDK`);
      } else {
        console.warn('⚠️ Coinbase API keys not found, running in mock mode');
        this.coinbase = null;
      }
    } catch (error) {
      console.warn('⚠️ Coinbase SDK initialization failed:', error.message);
      this.coinbase = null;
    }
  }

  // Create payment middleware for protected routes
  createPaymentMiddleware(routes) {
    try {
      if (!this.receivingWallet) {
        console.warn('⚠️ No receiving wallet configured, X402 middleware disabled');
        return (req, res, next) => next(); // Pass-through middleware
      }

      return paymentMiddleware(
        this.receivingWallet,
        routes,
        {
          url: this.facilitatorUrl,
        }
      );
    } catch (error) {
      console.error('❌ Failed to create X402 middleware:', error);
      return (req, res, next) => next(); // Pass-through middleware on error
    }
  }

  // Generate payment configuration for NFT purchase
  generateNFTPaymentConfig(assetId, price, metadata = {}) {
    return {
      [`GET /api/nft/${assetId}/purchase`]: {
        price: `$${price}`,
        network: this.network,
        config: {
          description: `Purchase NFT: ${metadata.title || 'Digital Asset'}`,
          inputSchema: {
            type: "object",
            properties: {
              buyerAddress: { 
                type: "string", 
                description: "Buyer's wallet address" 
              }
            },
            required: ["buyerAddress"]
          },
          outputSchema: {
            type: "object",
            properties: {
              transactionHash: { type: "string" },
              tokenId: { type: "string" },
              contractAddress: { type: "string" },
              status: { type: "string" }
            }
          },
          metadata: {
            assetId,
            title: metadata.title,
            creator: metadata.creator,
            category: metadata.category
          }
        }
      }
    };
  }

  // Process successful x402 payment and trigger NFT mint
  async processPayment(paymentData, assetData, buyerAddress) {
    try {
      console.log('💰 Processing x402 payment for NFT mint:', {
        asset: assetData._id,
        buyer: buyerAddress,
        amount: paymentData.amount
      });

      // Create or get buyer's smart wallet
      const buyerWallet = await this.getOrCreateSmartWallet(buyerAddress);
      
      // Mint NFT to buyer's wallet
      const mintResult = await this.mintNFTToBuyer(assetData, buyerWallet);
      
      // Record payment in database
      const paymentRecord = await this.recordPayment({
        assetId: assetData._id,
        buyerAddress,
        amount: paymentData.amount,
        currency: 'USDC',
        network: this.network,
        transactionHash: mintResult.transactionHash,
        tokenId: mintResult.tokenId,
        status: 'completed'
      });

      return {
        success: true,
        transactionHash: mintResult.transactionHash,
        tokenId: mintResult.tokenId,
        contractAddress: mintResult.contractAddress,
        paymentId: paymentRecord._id,
        status: 'completed'
      };

    } catch (error) {
      console.error('❌ Payment processing failed:', error);
      throw error;
    }
  }

  // Get or create Coinbase Smart Wallet for user
  async getOrCreateSmartWallet(userAddress) {
    try {
      if (!this.coinbase) {
        console.warn('⚠️ Coinbase SDK not available, returning mock wallet');
        return {
          getId: () => `mock-wallet-${userAddress.slice(0, 8)}`,
          getDefaultAddress: () => ({ getId: () => userAddress })
        };
      }

      // Check if user already has a smart wallet
      let wallet = await this.findExistingWallet(userAddress);

      if (!wallet) {
        // Create new smart wallet with account abstraction
        wallet = await this.coinbase.createWallet({
          networkId: this.network === 'base-sepolia' ? 'base-sepolia' : 'base-mainnet',
          name: `NFT-Wallet-${userAddress.slice(0, 8)}`,
        });

        console.log('✅ Created new smart wallet:', wallet.getId());
      }

      return wallet;
    } catch (error) {
      console.error('Failed to get/create smart wallet:', error);
      // Return mock wallet on error
      return {
        getId: () => `error-wallet-${userAddress.slice(0, 8)}`,
        getDefaultAddress: () => ({ getId: () => userAddress })
      };
    }
  }

  // Find existing wallet for user
  async findExistingWallet(userAddress) {
    try {
      const wallets = await this.coinbase.listWallets();
      return wallets.find(wallet => 
        wallet.getDefaultAddress()?.getId().toLowerCase() === userAddress.toLowerCase()
      );
    } catch (error) {
      console.warn('Could not find existing wallet:', error.message);
      return null;
    }
  }

  // Mint NFT using gasless transaction
  async mintNFTToBuyer(assetData, buyerWallet) {
    try {
      // This would integrate with your smart contract
      // For now, returning mock data - implement with actual contract
      const mockMintResult = {
        transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
        tokenId: Math.floor(Math.random() * 10000).toString(),
        contractAddress: process.env.CONTRACT_ADDRESS || '0x...',
        gasSponsored: true
      };

      console.log('🎨 NFT minted (mock):', mockMintResult);
      return mockMintResult;
    } catch (error) {
      console.error('NFT minting failed:', error);
      throw error;
    }
  }

  // Record payment in database
  async recordPayment(paymentData) {
    try {
      // Import Payment model
      const { default: Payment } = await import('../models/Payment.js');
      
      const payment = new Payment({
        asset: paymentData.assetId,
        buyerAddress: paymentData.buyerAddress,
        amount: paymentData.amount,
        currency: paymentData.currency,
        network: paymentData.network,
        transactionHash: paymentData.transactionHash,
        tokenId: paymentData.tokenId,
        paymentMethod: 'x402',
        status: paymentData.status,
        processedAt: new Date()
      });

      await payment.save();
      console.log('💾 Payment recorded:', payment._id);
      return payment;
    } catch (error) {
      console.error('Failed to record payment:', error);
      throw error;
    }
  }

  // Create auction with x402 payment integration
  async createAuction(assetData, auctionParams) {
    const auctionConfig = {
      [`POST /api/auction/${assetData._id}/bid`]: {
        price: `$${auctionParams.minBid}`,
        network: this.network,
        config: {
          description: `Place bid on: ${assetData.title}`,
          inputSchema: {
            type: "object",
            properties: {
              bidAmount: { type: "number", minimum: auctionParams.minBid },
              bidderAddress: { type: "string" }
            },
            required: ["bidAmount", "bidderAddress"]
          },
          outputSchema: {
            type: "object",
            properties: {
              bidId: { type: "string" },
              status: { type: "string" },
              escrowAddress: { type: "string" }
            }
          }
        }
      }
    };

    return auctionConfig;
  }

  // Process auction bid with escrow
  async processBid(auctionId, bidData) {
    try {
      // Create escrow for bid amount
      const escrowWallet = await this.createEscrowWallet(bidData.amount);
      
      // Record bid
      const bid = await this.recordBid({
        auctionId,
        bidderAddress: bidData.bidderAddress,
        amount: bidData.amount,
        escrowAddress: escrowWallet.getDefaultAddress().getId(),
        status: 'active'
      });

      return {
        success: true,
        bidId: bid._id,
        escrowAddress: escrowWallet.getDefaultAddress().getId(),
        status: 'escrowed'
      };
    } catch (error) {
      console.error('Bid processing failed:', error);
      throw error;
    }
  }

  // Create escrow wallet for auction bids
  async createEscrowWallet(amount) {
    try {
      const escrowWallet = await this.coinbase.createWallet({
        networkId: this.network === 'base-sepolia' ? 'base-sepolia' : 'base-mainnet',
        name: `Escrow-${Date.now()}`,
      });

      console.log(`🔒 Escrow wallet created for $${amount}:`, escrowWallet.getId());
      return escrowWallet;
    } catch (error) {
      console.error('Failed to create escrow wallet:', error);
      throw error;
    }
  }

  // Record auction bid
  async recordBid(bidData) {
    try {
      // This would use your Bid model
      const mockBid = {
        _id: `bid_${Date.now()}`,
        ...bidData,
        createdAt: new Date()
      };
      
      console.log('📝 Bid recorded:', mockBid._id);
      return mockBid;
    } catch (error) {
      console.error('Failed to record bid:', error);
      throw error;
    }
  }

  // Settle auction and distribute funds
  async settleAuction(auctionId, winningBid) {
    try {
      // Transfer NFT to winner
      const transferResult = await this.transferNFTToWinner(winningBid);
      
      // Distribute funds (seller, marketplace fee, royalties)
      const distributionResult = await this.distributeFunds(winningBid);
      
      // Release escrow
      await this.releaseEscrow(winningBid.escrowAddress);

      return {
        success: true,
        nftTransfer: transferResult,
        fundsDistribution: distributionResult,
        status: 'settled'
      };
    } catch (error) {
      console.error('Auction settlement failed:', error);
      throw error;
    }
  }

  // Transfer NFT to auction winner
  async transferNFTToWinner(winningBid) {
    // Implement actual NFT transfer logic
    console.log('🏆 Transferring NFT to auction winner:', winningBid.bidderAddress);
    return { success: true, transactionHash: `0x${Math.random().toString(16).substr(2, 64)}` };
  }

  // Distribute auction funds
  async distributeFunds(winningBid) {
    // Implement fund distribution logic (seller, marketplace fee, royalties)
    console.log('💰 Distributing auction funds:', winningBid.amount);
    return { success: true, distributions: [] };
  }

  // Release escrow funds
  async releaseEscrow(escrowAddress) {
    console.log('🔓 Releasing escrow funds:', escrowAddress);
    return { success: true };
  }
}

export default X402Service;
