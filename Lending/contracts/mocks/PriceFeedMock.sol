// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";


contract PriceFeedMock is
    AggregatorV3Interface
{

    struct RoundData {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    uint8 private _decimals;
    RoundData[] private _roundsData;


    function decimals() external view override returns (uint8)
    {
        return _decimals;
    }

    function description() external pure override returns (string memory)
    {
        return "Price feed mock";
    }

    function version() external pure override returns (uint256)
    {
        return 0;
    }

    /**
     * @dev Access methods for mocking feed data
     */
    function setDecimals(uint8 decimals_) public
    {
        _decimals = decimals_;
    }

    function pushRoundData(RoundData calldata roundData) public
    {
        _roundsData.push(roundData);
    }


    /**
     * @dev Public price feed interface
     */
    function getRoundData(uint80 roundId_) external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    )
    {
        if (roundId_ >= _roundsData.length) {
            revert("No data present");
        }

        RoundData storage roundData = _roundsData[roundId_];
        return (
            roundData.roundId,
            roundData.answer,
            roundData.startedAt,
            roundData.updatedAt,
            roundData.answeredInRound
        );
    }

    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    )
    {
        uint256 roundId_ = _roundsData.length - 1;
        RoundData storage roundData = _roundsData[roundId_];
        return (
            roundData.roundId,
            roundData.answer,
            roundData.startedAt,
            roundData.updatedAt,
            roundData.answeredInRound
        );
    }

}
