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

    event SupportedAssetAdded(IERC20Metadata token);
    event PriceFeedChanged(IERC20Metadata token, AggregatorV3Interface priceFeed);


    IERC20Metadata[] private _tokens;

    mapping(IERC20Metadata => bool) private _tokenSupported;
    mapping(IERC20Metadata => AggregatorV3Interface) private _priceFeeds;



    function getSupportedTokens() public view returns (IERC20Metadata[] memory)
    {
        return _tokens;
    }

    function isTokenSupported(IERC20Metadata token) public view returns (bool)
    {
        return _tokenSupported[token];
    }

    function getPriceFeed(IERC20Metadata token) public view onlySupportedAsset(token) returns (AggregatorV3Interface)
    {
        return _priceFeeds[token];
    }


    modifier onlySupportedAsset(IERC20Metadata token)
    {
        if (!isTokenSupported(token)) {
            revert TokenIsNotSupported();
        }
        _;
    }


    /**
     * @dev Returns token price
     * Normalized to 8 digits precission
     */
    function getTokenPrice(IERC20Metadata token) public view onlySupportedAsset(token) returns (uint256)
    {
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
        AggregatorV3Interface priceFeed
    ) public
        onlyOwner
    {
        if (isTokenSupported(token)) {
            revert TokenIsAlreadySupported();
        }

        _tokens.push(token);
        _tokenSupported[token] = true;

        _priceFeeds[token] = priceFeed;

        emit SupportedAssetAdded(token);
    }

    function setPriceFeed(
        IERC20Metadata token,
        AggregatorV3Interface priceFeed
    ) public
        onlySupportedAsset(token)
        onlyOwner
    {
        _priceFeeds[token] = priceFeed;

        emit PriceFeedChanged(token, priceFeed);
    }

}
