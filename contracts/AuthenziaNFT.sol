// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AuthenziaNFT
 * @dev ERC721 NFT contract for Authenzia marketplace with royalties, lazy minting, and content verification
 */
contract AuthenziaNFT is ERC721, ERC721URIStorage, ERC721Royalty, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using ECDSA for bytes32;

    Counters.Counter private _tokenIdCounter;
    
    // Marketplace fee (in basis points, e.g., 250 = 2.5%)
    uint96 public marketplaceFee = 250;
    address public marketplaceFeeRecipient;
    
    // Content verification
    mapping(uint256 => string) public contentHashes; // SHA-256 hashes
    mapping(string => bool) public usedHashes; // Prevent duplicate content
    
    // Lazy minting
    mapping(bytes32 => bool) public usedVouchers;
    address public authorizedMinter;
    
    // Events
    event NFTMinted(uint256 indexed tokenId, address indexed to, string contentHash, string tokenURI);
    event LazyMinted(uint256 indexed tokenId, address indexed to, bytes32 voucherHash);
    event ContentHashSet(uint256 indexed tokenId, string contentHash);
    
    // Lazy mint voucher structure
    struct LazyMintVoucher {
        uint256 tokenId;
        address to;
        string tokenURI;
        string contentHash;
        uint96 royaltyBps;
        address royaltyRecipient;
        bytes signature;
    }

    constructor(
        string memory name,
        string memory symbol,
        address _marketplaceFeeRecipient,
        address _authorizedMinter
    ) ERC721(name, symbol) {
        marketplaceFeeRecipient = _marketplaceFeeRecipient;
        authorizedMinter = _authorizedMinter;
        _tokenIdCounter.increment(); // Start from token ID 1
    }

    /**
     * @dev Mint NFT with content verification and royalties
     */
    function mintNFT(
        address to,
        string memory tokenURI,
        string memory contentHash,
        address royaltyRecipient,
        uint96 royaltyBps
    ) public onlyOwner returns (uint256) {
        require(!usedHashes[contentHash], "Content already exists");
        require(royaltyBps <= 1000, "Royalty too high"); // Max 10%
        
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        _setTokenRoyalty(tokenId, royaltyRecipient, royaltyBps);
        
        contentHashes[tokenId] = contentHash;
        usedHashes[contentHash] = true;
        
        emit NFTMinted(tokenId, to, contentHash, tokenURI);
        return tokenId;
    }

    /**
     * @dev Lazy mint using signed voucher
     */
    function lazyMint(LazyMintVoucher calldata voucher) public payable nonReentrant returns (uint256) {
        // Verify voucher hasn't been used
        bytes32 voucherHash = keccak256(abi.encode(voucher.tokenId, voucher.to, voucher.tokenURI, voucher.contentHash));
        require(!usedVouchers[voucherHash], "Voucher already used");
        
        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            voucherHash
        ));
        address signer = messageHash.recover(voucher.signature);
        require(signer == authorizedMinter, "Invalid signature");
        
        // Verify content hasn't been used
        require(!usedHashes[voucher.contentHash], "Content already exists");
        require(voucher.royaltyBps <= 1000, "Royalty too high");
        
        // Mark voucher as used
        usedVouchers[voucherHash] = true;
        
        // Mint NFT
        _safeMint(voucher.to, voucher.tokenId);
        _setTokenURI(voucher.tokenId, voucher.tokenURI);
        _setTokenRoyalty(voucher.tokenId, voucher.royaltyRecipient, voucher.royaltyBps);
        
        contentHashes[voucher.tokenId] = voucher.contentHash;
        usedHashes[voucher.contentHash] = true;
        
        emit LazyMinted(voucher.tokenId, voucher.to, voucherHash);
        return voucher.tokenId;
    }

    /**
     * @dev Batch mint multiple NFTs (gas efficient)
     */
    function batchMint(
        address[] calldata recipients,
        string[] calldata tokenURIs,
        string[] calldata contentHashes,
        address[] calldata royaltyRecipients,
        uint96[] calldata royaltyBps
    ) public onlyOwner returns (uint256[] memory) {
        require(recipients.length == tokenURIs.length, "Array length mismatch");
        require(recipients.length == contentHashes.length, "Array length mismatch");
        require(recipients.length == royaltyRecipients.length, "Array length mismatch");
        require(recipients.length == royaltyBps.length, "Array length mismatch");
        
        uint256[] memory tokenIds = new uint256[](recipients.length);
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(!usedHashes[contentHashes[i]], "Content already exists");
            require(royaltyBps[i] <= 1000, "Royalty too high");
            
            uint256 tokenId = _tokenIdCounter.current();
            _tokenIdCounter.increment();
            
            _safeMint(recipients[i], tokenId);
            _setTokenURI(tokenId, tokenURIs[i]);
            _setTokenRoyalty(tokenId, royaltyRecipients[i], royaltyBps[i]);
            
            contentHashes[tokenId] = contentHashes[i];
            usedHashes[contentHashes[i]] = true;
            
            tokenIds[i] = tokenId;
            emit NFTMinted(tokenId, recipients[i], contentHashes[i], tokenURIs[i]);
        }
        
        return tokenIds;
    }

    /**
     * @dev Update content hash for existing token (only owner)
     */
    function updateContentHash(uint256 tokenId, string memory newContentHash) public onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        require(!usedHashes[newContentHash], "Content hash already used");
        
        // Remove old hash from used hashes
        string memory oldHash = contentHashes[tokenId];
        if (bytes(oldHash).length > 0) {
            usedHashes[oldHash] = false;
        }
        
        // Set new hash
        contentHashes[tokenId] = newContentHash;
        usedHashes[newContentHash] = true;
        
        emit ContentHashSet(tokenId, newContentHash);
    }

    /**
     * @dev Check if content hash is already used
     */
    function isContentUsed(string memory contentHash) public view returns (bool) {
        return usedHashes[contentHash];
    }

    /**
     * @dev Get content hash for token
     */
    function getContentHash(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return contentHashes[tokenId];
    }

    /**
     * @dev Update marketplace fee (only owner)
     */
    function setMarketplaceFee(uint96 _marketplaceFee) public onlyOwner {
        require(_marketplaceFee <= 1000, "Fee too high"); // Max 10%
        marketplaceFee = _marketplaceFee;
    }

    /**
     * @dev Update marketplace fee recipient (only owner)
     */
    function setMarketplaceFeeRecipient(address _recipient) public onlyOwner {
        marketplaceFeeRecipient = _recipient;
    }

    /**
     * @dev Update authorized minter for lazy minting (only owner)
     */
    function setAuthorizedMinter(address _minter) public onlyOwner {
        authorizedMinter = _minter;
    }

    /**
     * @dev Get next token ID
     */
    function getNextTokenId() public view returns (uint256) {
        return _tokenIdCounter.current();
    }

    /**
     * @dev Get total supply
     */
    function totalSupply() public view returns (uint256) {
        return _tokenIdCounter.current() - 1;
    }

    // Required overrides
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage, ERC721Royalty) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Royalty) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
