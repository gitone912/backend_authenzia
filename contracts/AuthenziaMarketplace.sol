// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title AuthenziaMarketplace
 * @dev Marketplace contract for NFT auctions and direct sales with royalty support
 */
contract AuthenziaMarketplace is ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _auctionIdCounter;
    
    // Marketplace fee (in basis points, e.g., 250 = 2.5%)
    uint256 public marketplaceFee = 250;
    address public feeRecipient;
    
    // Supported payment tokens
    mapping(address => bool) public supportedTokens;
    address public defaultPaymentToken; // USDC
    
    // Auction structure
    struct Auction {
        uint256 auctionId;
        address nftContract;
        uint256 tokenId;
        address seller;
        address paymentToken;
        uint256 startTime;
        uint256 endTime;
        uint256 reservePrice;
        uint256 minBidIncrement;
        uint256 currentBid;
        address currentBidder;
        bool settled;
        bool cancelled;
    }
    
    // Direct sale structure
    struct DirectSale {
        address nftContract;
        uint256 tokenId;
        address seller;
        address paymentToken;
        uint256 price;
        bool active;
    }
    
    // Bid structure
    struct Bid {
        address bidder;
        uint256 amount;
        uint256 timestamp;
    }
    
    // Storage
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => Bid[]) public auctionBids;
    mapping(address => mapping(uint256 => DirectSale)) public directSales; // nftContract => tokenId => sale
    mapping(address => uint256) public escrowBalances; // Bidder escrow balances
    
    // Events
    event AuctionCreated(uint256 indexed auctionId, address indexed nftContract, uint256 indexed tokenId, address seller);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed auctionId);
    event DirectSaleCreated(address indexed nftContract, uint256 indexed tokenId, address indexed seller, uint256 price);
    event DirectSalePurchased(address indexed nftContract, uint256 indexed tokenId, address indexed buyer, uint256 price);
    event DirectSaleCancelled(address indexed nftContract, uint256 indexed tokenId);
    
    constructor(address _feeRecipient, address _defaultPaymentToken) {
        feeRecipient = _feeRecipient;
        defaultPaymentToken = _defaultPaymentToken;
        supportedTokens[_defaultPaymentToken] = true;
        _auctionIdCounter.increment(); // Start from 1
    }
    
    /**
     * @dev Create auction for NFT
     */
    function createAuction(
        address nftContract,
        uint256 tokenId,
        address paymentToken,
        uint256 startTime,
        uint256 endTime,
        uint256 reservePrice,
        uint256 minBidIncrement
    ) external nonReentrant returns (uint256) {
        require(supportedTokens[paymentToken], "Payment token not supported");
        require(startTime >= block.timestamp, "Start time must be in future");
        require(endTime > startTime, "End time must be after start time");
        require(reservePrice > 0, "Reserve price must be greater than 0");
        require(minBidIncrement > 0, "Min bid increment must be greater than 0");
        
        // Transfer NFT to marketplace for escrow
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);
        
        uint256 auctionId = _auctionIdCounter.current();
        _auctionIdCounter.increment();
        
        auctions[auctionId] = Auction({
            auctionId: auctionId,
            nftContract: nftContract,
            tokenId: tokenId,
            seller: msg.sender,
            paymentToken: paymentToken,
            startTime: startTime,
            endTime: endTime,
            reservePrice: reservePrice,
            minBidIncrement: minBidIncrement,
            currentBid: 0,
            currentBidder: address(0),
            settled: false,
            cancelled: false
        });
        
        emit AuctionCreated(auctionId, nftContract, tokenId, msg.sender);
        return auctionId;
    }
    
    /**
     * @dev Place bid on auction
     */
    function placeBid(uint256 auctionId, uint256 bidAmount) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.seller != address(0), "Auction does not exist");
        require(!auction.settled, "Auction already settled");
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp >= auction.startTime, "Auction not started");
        require(block.timestamp <= auction.endTime, "Auction ended");
        require(bidAmount >= auction.reservePrice, "Bid below reserve price");
        require(bidAmount >= auction.currentBid + auction.minBidIncrement, "Bid increment too low");
        require(msg.sender != auction.seller, "Seller cannot bid");
        
        // Transfer payment token to escrow
        IERC20(auction.paymentToken).transferFrom(msg.sender, address(this), bidAmount);
        
        // Refund previous bidder
        if (auction.currentBidder != address(0)) {
            escrowBalances[auction.currentBidder] += auction.currentBid;
        }
        
        // Update auction
        auction.currentBid = bidAmount;
        auction.currentBidder = msg.sender;
        
        // Record bid
        auctionBids[auctionId].push(Bid({
            bidder: msg.sender,
            amount: bidAmount,
            timestamp: block.timestamp
        }));
        
        emit BidPlaced(auctionId, msg.sender, bidAmount);
    }
    
    /**
     * @dev Settle auction after end time
     */
    function settleAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.seller != address(0), "Auction does not exist");
        require(!auction.settled, "Auction already settled");
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp > auction.endTime, "Auction not ended");
        require(auction.currentBid >= auction.reservePrice, "Reserve price not met");
        
        auction.settled = true;
        
        // Calculate fees and royalties
        uint256 totalAmount = auction.currentBid;
        uint256 marketplaceFeeAmount = (totalAmount * marketplaceFee) / 10000;
        uint256 royaltyAmount = 0;
        address royaltyRecipient = address(0);
        
        // Check for royalties (EIP-2981)
        if (IERC165(auction.nftContract).supportsInterface(type(IERC2981).interfaceId)) {
            (royaltyRecipient, royaltyAmount) = IERC2981(auction.nftContract).royaltyInfo(auction.tokenId, totalAmount);
        }
        
        uint256 sellerAmount = totalAmount - marketplaceFeeAmount - royaltyAmount;
        
        // Transfer NFT to winner
        IERC721(auction.nftContract).transferFrom(address(this), auction.currentBidder, auction.tokenId);
        
        // Distribute payments
        IERC20(auction.paymentToken).transfer(feeRecipient, marketplaceFeeAmount);
        if (royaltyAmount > 0 && royaltyRecipient != address(0)) {
            IERC20(auction.paymentToken).transfer(royaltyRecipient, royaltyAmount);
        }
        IERC20(auction.paymentToken).transfer(auction.seller, sellerAmount);
        
        emit AuctionSettled(auctionId, auction.currentBidder, auction.currentBid);
    }
    
    /**
     * @dev Cancel auction (only seller, before any bids)
     */
    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.seller == msg.sender, "Only seller can cancel");
        require(!auction.settled, "Auction already settled");
        require(!auction.cancelled, "Auction already cancelled");
        require(auction.currentBid == 0, "Cannot cancel auction with bids");
        
        auction.cancelled = true;
        
        // Return NFT to seller
        IERC721(auction.nftContract).transferFrom(address(this), auction.seller, auction.tokenId);
        
        emit AuctionCancelled(auctionId);
    }
    
    /**
     * @dev Create direct sale listing
     */
    function createDirectSale(
        address nftContract,
        uint256 tokenId,
        address paymentToken,
        uint256 price
    ) external nonReentrant {
        require(supportedTokens[paymentToken], "Payment token not supported");
        require(price > 0, "Price must be greater than 0");
        require(IERC721(nftContract).ownerOf(tokenId) == msg.sender, "Not token owner");
        require(!directSales[nftContract][tokenId].active, "Sale already active");
        
        // Approve marketplace to transfer NFT
        require(IERC721(nftContract).isApprovedForAll(msg.sender, address(this)) || 
                IERC721(nftContract).getApproved(tokenId) == address(this), "Marketplace not approved");
        
        directSales[nftContract][tokenId] = DirectSale({
            nftContract: nftContract,
            tokenId: tokenId,
            seller: msg.sender,
            paymentToken: paymentToken,
            price: price,
            active: true
        });
        
        emit DirectSaleCreated(nftContract, tokenId, msg.sender, price);
    }
    
    /**
     * @dev Purchase NFT from direct sale
     */
    function purchaseDirectSale(address nftContract, uint256 tokenId) external nonReentrant {
        DirectSale storage sale = directSales[nftContract][tokenId];
        require(sale.active, "Sale not active");
        require(msg.sender != sale.seller, "Seller cannot purchase");
        
        sale.active = false;
        
        // Calculate fees and royalties
        uint256 totalAmount = sale.price;
        uint256 marketplaceFeeAmount = (totalAmount * marketplaceFee) / 10000;
        uint256 royaltyAmount = 0;
        address royaltyRecipient = address(0);
        
        // Check for royalties (EIP-2981)
        if (IERC165(nftContract).supportsInterface(type(IERC2981).interfaceId)) {
            (royaltyRecipient, royaltyAmount) = IERC2981(nftContract).royaltyInfo(tokenId, totalAmount);
        }
        
        uint256 sellerAmount = totalAmount - marketplaceFeeAmount - royaltyAmount;
        
        // Transfer payment from buyer
        IERC20(sale.paymentToken).transferFrom(msg.sender, address(this), totalAmount);
        
        // Transfer NFT to buyer
        IERC721(nftContract).transferFrom(sale.seller, msg.sender, tokenId);
        
        // Distribute payments
        IERC20(sale.paymentToken).transfer(feeRecipient, marketplaceFeeAmount);
        if (royaltyAmount > 0 && royaltyRecipient != address(0)) {
            IERC20(sale.paymentToken).transfer(royaltyRecipient, royaltyAmount);
        }
        IERC20(sale.paymentToken).transfer(sale.seller, sellerAmount);
        
        emit DirectSalePurchased(nftContract, tokenId, msg.sender, sale.price);
    }
    
    /**
     * @dev Cancel direct sale
     */
    function cancelDirectSale(address nftContract, uint256 tokenId) external {
        DirectSale storage sale = directSales[nftContract][tokenId];
        require(sale.seller == msg.sender, "Only seller can cancel");
        require(sale.active, "Sale not active");
        
        sale.active = false;
        
        emit DirectSaleCancelled(nftContract, tokenId);
    }
    
    /**
     * @dev Withdraw escrow balance
     */
    function withdrawEscrow() external nonReentrant {
        uint256 balance = escrowBalances[msg.sender];
        require(balance > 0, "No escrow balance");
        
        escrowBalances[msg.sender] = 0;
        IERC20(defaultPaymentToken).transfer(msg.sender, balance);
    }
    
    /**
     * @dev Get auction bids
     */
    function getAuctionBids(uint256 auctionId) external view returns (Bid[] memory) {
        return auctionBids[auctionId];
    }
    
    /**
     * @dev Add supported payment token (only owner)
     */
    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
    }
    
    /**
     * @dev Remove supported payment token (only owner)
     */
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
    }
    
    /**
     * @dev Update marketplace fee (only owner)
     */
    function setMarketplaceFee(uint256 _fee) external onlyOwner {
        require(_fee <= 1000, "Fee too high"); // Max 10%
        marketplaceFee = _fee;
    }
    
    /**
     * @dev Update fee recipient (only owner)
     */
    function setFeeRecipient(address _recipient) external onlyOwner {
        feeRecipient = _recipient;
    }
}
