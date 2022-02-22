// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./NFToken.sol";

abstract contract Sale is NFToken
{

    error TokenNotForSale();
    error WrongAmountPaid(uint256 actualPrice, uint256 paid);


    event MintedForSale(uint256 tokenId, uint256 price);
    event PriceChanged(uint256 tokenId, uint256 newPrice);
    event Sold(uint256 tokenId, address to, uint256 price);
    event PaymentsClaimed(address target, uint256 value);


    mapping(uint256 => uint256) private _tokenPrices;


    /**
     * Views
     */
    function isForSale(uint256 tokenId) public view returns (bool)
    {
        _verifyTokenExists(tokenId);

        return ownerOf(tokenId) == address(this)
            && _tokenPrices[tokenId] > 0;
    }

    function tokenPrice(uint256 tokenId) public view returns (uint256)
    {
        _verifyIsForSale(tokenId);

        return _tokenPrices[tokenId];
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

        _tokenPrices[tokenId] = price;

        emit MintedForSale(tokenId, price);
    }

    /**
     * @dev Changes token price in sale
     */
    function setTokenPrice(uint256 tokenId, uint256 price) public
        onlyOwner
    {
        _verifyIsForSale(tokenId);

        _tokenPrices[tokenId] = price;

        emit PriceChanged(tokenId, price);
    }

    /**
     * @dev Allow to buy token. Requires sending proper value in transaction.
     */
    function buy(uint256 tokenId) external payable
    {
        _verifyIsForSale(tokenId);

        if (msg.value != _tokenPrices[tokenId]) {
            revert WrongAmountPaid(_tokenPrices[tokenId], msg.value);
        }

        emit Sold(tokenId, msg.sender, _tokenPrices[tokenId]);

        _safeTransfer(address(this), msg.sender, tokenId, "");

        // clear price
        _tokenPrices[tokenId] = 0;
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


    function _verifyIsForSale(uint256 tokenId) internal view
    {
        if (!isForSale(tokenId)) {
            revert TokenNotForSale();
        }
    }

}
