// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Liquidations.sol";


contract Interest is
    Liquidations
{

    event LoanInterestConfigChanged(IERC20Metadata token, LoanInterestConfig interestConfig);
    event InterestOnTokenApplied(IERC20Metadata token, uint256 amount);


    struct LoanInterestConfig {
        uint64 base;
        uint64 optimalUtilization;
        uint64 slope1;
        uint64 slope2;
    }


    uint64 private constant SECONDS_IN_YEAR = 31536000;

    /**
     * @dev
     * Difference of debit and loanAcc informs about interest amount
     * account => token => uint256
     */
    mapping(address => mapping(IERC20Metadata => uint256)) private _accountLoanAcc;

    // 8 digits precise
    mapping(IERC20Metadata => LoanInterestConfig) private _loanInterestConfig;

    mapping(IERC20Metadata => uint64) _lastInterestDistribution;



    /**
     * @dev
     * Base token loan interest (it is reduced by platform commission)
     * Precission: 8 digits
     */
    function getTokenLoanInterestConfig(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (LoanInterestConfig memory)
    {
        return _loanInterestConfig[token];
    }

    /**
     * @dev
     * Returns token utilization - borrowed assets / deposited assets ratio
     * Precission: 8 digits
     */
    function getTokenUtilization(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint64)
    {
        uint256 totalDeposit = getTotalTokenDeposit(token);
        if (totalDeposit == 0) {
            return 0;
        }

        return uint64(
            getTotalTokenDebit(token) * 1e8 / getTotalTokenDeposit(token)
        );
    }

    /**
     * @dev
     * Returns token interest rate (depending on utilization)
     * Precission: 8 digits
     */
    function getTokenInterestRate(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint64)
    {
        LoanInterestConfig memory interestConfig = getTokenLoanInterestConfig(token);
        if (interestConfig.optimalUtilization == 0) {
            return 0;
        }

        uint64 utilization = getTokenUtilization(token);

        uint64 interest = interestConfig.base;

        if (utilization <= interestConfig.optimalUtilization) {
            interest += interestConfig.slope1
                * utilization
                / interestConfig.optimalUtilization;
        }
        else {
            interest += interestConfig.slope1;
            interest += interestConfig.slope2
                * (utilization - interestConfig.optimalUtilization)
                / (1e8 - interestConfig.optimalUtilization);
        }

        return interest;
    }


    function setTokenLoanInterestConfig(
        IERC20Metadata token,
        LoanInterestConfig calldata interestConfig
    ) public
        onlySupportedAsset(token)
        onlyOwner
    {
        _loanInterestConfig[token] = interestConfig;

        emit LoanInterestConfigChanged(token, interestConfig);
    }


    function _applyInterestOnToken(
        IERC20Metadata token
    ) internal
    {
        if (_lastInterestDistribution[token] == 0) {
            return;
        }

        uint64 deltaTime = uint64(block.timestamp) - _lastInterestDistribution[token];
        if (deltaTime == 0) {
            return;
        }

        uint64 interestRate = getTokenInterestRate(token);
        if (interestRate == 0) {
            return;
        }

        // amount(token decimals precise) =
        //      totalDebit(token decimals precise)
        //      * interestRate(8 digits precise)
        //      * (deltaTime / SECONDS_IN_YEAR)
        uint256 interestAmount = getTotalTokenDebit(token)
            * interestRate
            * deltaTime
            / SECONDS_IN_YEAR
            / 1e8;

        // increase debit (fee)
        _increaseTotalDebit(
            token,
            interestAmount
        );

        // distribute funds (rewards and tresoury)
        _distributeFunds(
            token,
            interestAmount
        );

        emit InterestOnTokenApplied(token, interestAmount);

        _lastInterestDistribution[token] = uint64(block.timestamp);
    }


    /**
     * All external actions which cause debit or deposit shares change
     * need to apply _applyinterestontoken
     */

    function _beforeDeposit(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        super._beforeDeposit(token, amount);
        _applyInterestOnToken(token);
    }

    function _beforeWithdraw(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        super._beforeWithdraw(token, amount);
        _applyInterestOnToken(token);
    }

    function _beforeBorrow(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        super._beforeBorrow(token, amount);
        _applyInterestOnToken(token);
    }

    function _afterBorrow(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        super._afterBorrow(token, amount);

        // initiate distribution time
        if (_lastInterestDistribution[token] == 0) {
            _lastInterestDistribution[token] = uint64(block.timestamp);
        }
    }

    function _beforeRepay(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        super._beforeRepay(token, amount);
        _applyInterestOnToken(token);
    }

}
