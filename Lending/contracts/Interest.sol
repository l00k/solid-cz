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
        uint32 base;
        uint32 optimalUtilisation;
        uint32 slope1;
        uint32 slope2;
    }


    uint32 private constant SECONDS_IN_YEAR = 31536000;

    /**
     * @dev
     * Difference of debit and loanAcc informs about interest amount
     * account => token => uint256
     */
    mapping(address => mapping(IERC20Metadata => uint256)) private _accountLoanAcc;

    // 1 = 0.0001%
    mapping(IERC20Metadata => LoanInterestConfig) private _loanInterestConfig;

    mapping(IERC20Metadata => uint64) _lastInterestDistribution;



    /**
     * @dev
     * Base token loan interest (it is reduced by platform commission)
     * Precission: 6 digits
     */
    function getTokenLoanInterestConfig(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (LoanInterestConfig memory)
    {
        return _loanInterestConfig[token];
    }

    /**
     * @dev
     * Returns token utilisation - borrowed assets / deposited assets ratio
     * Precission: 6 digits
     */
    function getTokenUtilisation(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint32)
    {
        uint256 totalDeposit = getTotalTokenDeposit(token);
        if (totalDeposit == 0) {
            return 0;
        }

        return uint32(
            getTotalTokenDebit(token) * 1e8 / getTotalTokenDeposit(token)
        );
    }

    /**
     * @dev
     * Returns token borrow interest (depending on utilisation)
     * Precission: 6 digits
     */
    function getTokenBorrowInterestRate(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint32)
    {
        LoanInterestConfig memory interestConfig = getTokenLoanInterestConfig(token);

        uint32 utilisation = getTokenUtilisation(token);

        uint32 interest = interestConfig.base;

        if (utilisation <= interestConfig.optimalUtilisation) {
            interest += utilisation * interestConfig.slope1;
        }
        else {
            interest += interestConfig.slope1 * interestConfig.optimalUtilisation;
            interest += interestConfig.slope2
                * (utilisation - interestConfig.optimalUtilisation)
                / (1e6 - interestConfig.optimalUtilisation);
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

    function _applyInterest() internal
    {
        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint i=0; i < tokens.length; ++i) {
            _applyInterestOnToken(tokens[i]);
        }
    }

    function _applyInterestOnToken(
        IERC20Metadata token
    ) internal
    {
        uint64 deltaTime = uint64(block.timestamp) - _lastInterestDistribution[token];
        if (deltaTime == 0) {
            return;
        }

        uint32 interestRate = getTokenBorrowInterestRate(token);

        // amount(token decimals precise) =
        //      totalDebit(token decimals precise)
        //      * interestRate(6 digits precise)
        //      * (deltaTime / SECONDS_IN_YEAR)
        uint256 interestAmount = getTotalTokenDebit(token)
            * interestRate
            * deltaTime
            / SECONDS_IN_YEAR
            / 1e6;

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
        _applyInterestOnToken(token);
    }

    function _beforeWithdraw(
        IERC20Metadata token,
        address fromAccount,
        address toAccount,
        uint256 amount
    ) internal override
    {
        _applyInterestOnToken(token);
    }

    function _beforeBorrow(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        _applyInterestOnToken(token);
    }

    function _beforeRepay(
        IERC20Metadata token,
        uint256 amount
    ) internal override
    {
        _applyInterestOnToken(token);
    }

}
