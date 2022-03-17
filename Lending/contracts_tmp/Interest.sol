// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Liquidations.sol";


contract Interest is
    Liquidations
{

    event LoanInterestConfigChanged(IERC20Metadata token, LoanInterestConfig interestConfig);


    struct LoanInterestConfig {
        uint32 base;
        uint32 optimalUtilisation;
        uint32 slope1;
        uint32 slope2;
    }


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
    function getTokenDepositUtilisation(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint32)
    {
        return uint32(
            getTotalTokenDebit(token) * 1e8 / getTotalTokenDeposit(token)
        );
    }

    /**
     * @dev
     * Returns token borrow interest (depending on utilisation)
     * Precission: 6 digits
     */
    function getTokenBorrowInterest(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint32)
    {
        LoanInterestConfig memory interestConfig = getTokenLoanInterestConfig(token);

        uint32 utilisation = getTokenDepositUtilisation(token);

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

    /**
     * @dev
     * Returns token lending interest (reduced by commission)
     * Precission: 6 digits
     */
    function getTokenLendingInterest(
        IERC20Metadata token
    ) public view onlySupportedAsset(token) returns (uint32)
    {
        uint32 borrowInterest = getTokenBorrowInterest(token);
        uint32 platformCommission = getTokenPlatformCommission(token);

        // lendingInterest(6 digits precise) =
        //      borrowInterest(6 digits precise)
        //      * tokenUtilisation(6 digsts precise)
        //      * [1 - platformCommission](6 digits precise)
        return borrowInterest
            * getTokenDepositUtilisation(token)
            * (1e6 - platformCommission)
            / 1e12;
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

}
