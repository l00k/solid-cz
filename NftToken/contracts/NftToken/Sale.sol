// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NftToken.sol";

abstract contract Sale is NftToken
{

    error TokenNotForSale(uint256 tokenId);
    error WrongAmountPaid(uint256 tokenId, uint256 actualPrice, uint256 paid);


    event MintedForSale(uint256 tokenId, uint256 price);
    event PriceChanged(uint256 tokenId, uint256 newPrice);
    event Sold(uint256 tokenId, uint256 value);
    event PaymentsClaimed(address target, uint256 value);


    mapping(uint256 => uint256) public tokenPrices;


    /**
     * Views
     */
    function isForSale(uint256 tokenId) public view returns (bool)
    {
        return ownerOf(tokenId) == address(this)
            && tokenPrices[tokenId] > 0;
    }


    /**
     * @dev Mints new specifc token and set is for a sale.
     */
    function mintForSale(
        uint256 price,
        Token calldata token
    ) public
        onlyOwner
    {
        uint256 tokenId = _mint(address(this), token);

        tokenPrices[tokenId] = price;

        emit MintedForSale(tokenId, price);
    }

    /**
     * @dev Changes token price in sale
     */
    function setTokenPrice(uint256 tokenId, uint256 price) public
        onlyOwner
    {
        _verifyIsForSale(tokenId);

        tokenPrices[tokenId] = price;

        emit PriceChanged(tokenId, price);
    }

    /**
     * @dev Claim paid funds
     */
    function claimPayments(address payable target) public
        onlyOwner
    {
        uint256 amount = address(this).balance;
        target.transfer(amount);

        emit PaymentsClaimed(target, amount);
    }

    /**
     * @dev Allow to buy token. Requires sending proper value in transaction.
     */
    function buy(uint256 tokenId) external payable
    {
        _verifyIsForSale(tokenId);

        if (msg.value != tokenPrices[tokenId]) {
            revert WrongAmountPaid(tokenId, tokenPrices[tokenId], msg.value);
        }

        emit Sold(tokenId, tokenPrices[tokenId]);

        _safeTransfer(address(this), msg.sender, tokenId, "");

        // clear price
        tokenPrices[tokenId] = 0;
    }


    function _verifyIsForSale(uint256 tokenId) internal view
    {
        if (!isForSale(tokenId)) {
            revert TokenNotForSale(tokenId);
        }
    }


}
