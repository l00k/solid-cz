// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";


contract Assets is
    Ownable
{

    error TokenIsAlreadySupported();
    error TokenIsNotSupported();
    error AssetIsNotActive();

    event SupportedAssetAdded(IERC20Metadata token);
    event PriceFeedChanged(IERC20Metadata token, AggregatorV3Interface priceFeed);
    event TokenActivityChanged(IERC20Metadata token, bool active);


    IERC20Metadata[] private _tokens;

    mapping(IERC20Metadata => bool) private _tokenSupported;
    mapping(IERC20Metadata => AggregatorV3Interface) private _priceFeeds;
    mapping(IERC20Metadata => bool) private _tokenActive;



    function getSupportedTokens() public view returns (IERC20Metadata[] memory)
    {
        return _tokens;
    }

    function isTokenSupported(IERC20Metadata token) public view returns (bool)
    {
        return _tokenSupported[token];
    }

    function getPriceFeed(IERC20Metadata token) public view returns (AggregatorV3Interface)
    {
        _verifyTokenSupported(token);
        return _priceFeeds[token];
    }

    function isTokenActive(IERC20Metadata token) public view returns (bool)
    {
        _verifyTokenSupported(token);
        return _tokenActive[token];
    }

    /**
     * @dev Returns token price
     * Normalized to 8 digits precission
     */
    function getTokenPrice(IERC20Metadata token) public view returns (uint256)
    {
        _verifyTokenSupported(token);

        AggregatorV3Interface priceFeed = getPriceFeed(token);

        uint8 decimals = priceFeed.decimals();
        (, int256 price,,,) = priceFeed.latestRoundData();

        return decimals >= 8
            ? uint256(price) / (10 ** (decimals - 8))
            : uint256(price) * (10 ** (8 - decimals))
            ;
    }


    function addSupportedAsset(
        IERC20Metadata token,
        AggregatorV3Interface priceFeed,
        bool active
    ) public
        onlyOwner
    {
        if (isTokenSupported(token)) {
            revert TokenIsAlreadySupported();
        }

        _tokens.push(token);
        _tokenSupported[token] = true;

        _priceFeeds[token] = priceFeed;
        _tokenActive[token] = active;

        emit SupportedAssetAdded(token);
    }

    function setPriceFeed(
        IERC20Metadata token,
        AggregatorV3Interface priceFeed
    ) public
        onlyOwner
    {
        _verifyTokenSupported(token);

        _priceFeeds[token] = priceFeed;

        emit PriceFeedChanged(token, priceFeed);
    }

    function setTokenActive(
        IERC20Metadata token,
        bool active
    ) public
        onlyOwner
    {
        _verifyTokenSupported(token);

        _tokenActive[token] = active;

        emit TokenActivityChanged(token, active);
    }


    function _verifyTokenSupported(IERC20Metadata token) internal view
    {
        if (!isTokenSupported(token)) {
            revert TokenIsNotSupported();
        }
    }

    function _verifyAssetActive(IERC20Metadata token) internal view
    {
        if (!isTokenActive(token)) {
            revert AssetIsNotActive();
        }
    }

}
