// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Borrowing.sol";
import "./SwapProviderInterface.sol";


contract Liquidations is
    Borrowing
{

    event LiquidationIncentiveChanged(uint64 fraction);
    event LiquidatedDeposit(address who, IERC20Metadata token, uint256 amount);


    // 8 digits precise
    uint64 private _liquidationIncentive;

    SwapProviderInterface private _swapProvider;


    function getLiquidationIncentive() public view returns (uint64)
    {
        return _liquidationIncentive;
    }


    function _getAccountTokenLiquidationIncentiveAmount(
        IERC20Metadata token,
        address account
    ) private view returns (uint256)
    {
        uint256 debit = getAccountTokenDebit(token, account);
        return debit * _liquidationIncentive / 1e8;
    }

    function _getAccountTokenLiquidationAmount(
        IERC20Metadata token,
        address account
    ) private view returns (uint256)
    {
        uint256 debit = getAccountTokenDebit(token, account);
        uint256 incentiveAmount = debit * _liquidationIncentive / 1e8;
        return debit + incentiveAmount;
    }

    function _getAccountLiquidationIncentiveValue(
        address account
    ) private view returns (uint256)
    {
        uint256 value = 0;

        IERC20Metadata[] memory tokens = getSupportedTokens();
        for (uint256 i=0; i < tokens.length; ++i) {
            IERC20Metadata token = tokens[i];

            uint8 tokenDecimals = token.decimals();
            uint256 price = getTokenPrice(token);
            uint256 amount = _getAccountTokenLiquidationIncentiveAmount(token, account);

            value += amount
                * price
                / (10 ** tokenDecimals);
        }

        return value;
    }


    /**
     * @inheritdoc Borrowing
     *
     * @dev
     * Liquidity should be reduced with liquidation incentive factor
     */
    function getAccountCollateralization(
        address account
    ) public view virtual override returns (int256)
    {
        return super.getAccountCollateralization(account)
            - int256(_getAccountLiquidationIncentiveValue(account))
            ;
    }


    function setSwapProvider(
        SwapProviderInterface swapProvider
    ) public
        onlyOwner
    {
        _swapProvider = swapProvider;

        // set unlimited allowance of tokens
        IERC20Metadata[] memory tokens = getSupportedTokens();
        for (uint i = 0; i<tokens.length; ++i) {
            tokens[i].approve(
                address(swapProvider),
                type(uint256).max
            );
        }
    }

    function setLiquidationIncentive(
        uint64 liquidationIncentive
    ) public
        onlyOwner
    {
        _liquidationIncentive = liquidationIncentive;

        emit LiquidationIncentiveChanged(liquidationIncentive);
    }

    function liquidate(address account) public
    {
        int256 collateralization = getAccountCollateralization(account);
        if (collateralization >= 0) {
            // it is still collateralized - no need for liquidation
            return;
        }

        IERC20Metadata[] memory tokens = getSupportedTokens();
        for (uint i = 0; i<tokens.length; ++i) {
            IERC20Metadata token = tokens[i];

            uint256 debit = getAccountTokenDebit(token, account);
            if (debit > 0) {
                bool result = _liquidateLoan(token, account);
                if (!result) {
                    // it was not possible to liquidate entire loan
                    // entire deposit didn't satisify liqudation value
                    // no need to try with other loans
                    break;
                }
            }
        }
    }

    /**
     * @dev
     * Tries to liquidate given loan
     * Assumptions:
     *      - debit in give loanToken exists
     * Returns true if loan was fully liquidated
     */
    function _liquidateLoan(
        IERC20Metadata loanToken,
        address account
    ) internal returns (bool)
    {

        // liquidate deposits
        IERC20Metadata[] memory tokens = getSupportedTokens();
        for (uint i = 0; i<tokens.length; ++i) {
            IERC20Metadata depositToken = tokens[i];

            uint256 deposit = getAccountTokenDeposit(depositToken, account);
            if (deposit == 0) {
                continue;
            }

            bool fullyRepaid = depositToken == loanToken
                ? _liquidateLoanInSameToken(loanToken, account)
                : _liquidateLoanInDifferentToken(loanToken, depositToken, account);

            if (fullyRepaid) {
                return true;
            }
        }

        return false;
    }

    /**
     * @dev
     * Tries to liquidate given loan
     * Assumptions:
     *      - debit in given token exists
     *      - deposit in given token exists
     * Returns true when fully repaid
     */
    function _liquidateLoanInSameToken(
        IERC20Metadata token,
        address account
    ) internal returns (bool)
    {
        uint256 deposit = getAccountTokenDeposit(token, account);

        uint256 loanLiquidationAmount = _getAccountTokenLiquidationAmount(token, account);

        // calculate liquidation amount
        uint256 depositLiquidationAmount = loanLiquidationAmount >= deposit
            ? deposit
            : loanLiquidationAmount;

        // liquidate account deposit
        _decreaseDepositShares(
            token,
            account,
            depositLiquidationAmount
        );
        _decreaseTotalDeposit(
            token,
            depositLiquidationAmount
        );

        emit LiquidatedDeposit(account, token, depositLiquidationAmount);

        // transfer liquidation bonus to tresoury
        uint256 liquidationBonus = depositLiquidationAmount
            * _liquidationIncentive
            / (1e8 + _liquidationIncentive);
        _depositIntoTresoury(
            token,
            liquidationBonus
        );

        // repay
        uint256 debitRepayment = depositLiquidationAmount - liquidationBonus;
        bool fullyRepaid = _repay(
            token,
            account,
            debitRepayment
        );

        return fullyRepaid;
    }

    /**
     * @dev
     * Tries to liquidate given loan
     * Assumptions:
     *      - debit in given loanToken exists
     *      - deposit in given depositToken exists
     * Returns true when fully repaid
     */
    function _liquidateLoanInDifferentToken(
        IERC20Metadata loanToken,
        IERC20Metadata depositToken,
        address account
    ) internal returns (bool)
    {
        (,, uint256 loanTokenPrice) = _getAccountTokenDebitEx(loanToken, account);
        (uint256 deposit,, uint256 depositTokenPrice) = _getAccountTokenDepositEx(depositToken, account);

        uint256 loanLiquidationAmount = _getAccountTokenLiquidationAmount(loanToken, account);

        // calculate liquidation amount

        // depositLiquidationAmount(<depositTokenDecimals> digits precise) =
        //      loanLiquidationAmount(loanTokenDecimals> digits precise)
        //      * loanTokenPrice(8 digits precise)
        //      * depositTokenPrice(8 digits precise)
        uint256 depositLiquidationAmount = loanLiquidationAmount
            * loanTokenPrice
            / depositTokenPrice
            * 10 ** (depositToken.decimals() - loanToken.decimals());

        if (depositLiquidationAmount >= deposit) {
            // liquidate entire deposit
            depositLiquidationAmount = deposit;
        }

        // reduce to swappable amount
        uint256 depositTokenLiquidAmount = getTokenLiquidAmount(depositToken);
        if (depositLiquidationAmount > depositTokenLiquidAmount) {
            depositLiquidationAmount = depositTokenLiquidAmount;
        }

        // liquidate account deposit
        _decreaseDepositShares(
            depositToken,
            account,
            depositLiquidationAmount
        );
        _decreaseTotalDeposit(
            depositToken,
            depositLiquidationAmount
        );

        emit LiquidatedDeposit(account, depositToken, depositLiquidationAmount);

        // swap deposit token to loan token
        // returns swapped tokens amount
        uint256 loanLiquidatedAmount = _swapProvider.swap(
            depositToken,
            loanToken,
            depositLiquidationAmount
        );

        // transfer liquidation bonus to tresoury
        uint256 liquidationBonus = loanLiquidatedAmount
            * _liquidationIncentive
            / (1e8 + _liquidationIncentive);
        _depositIntoTresoury(
            loanToken,
            liquidationBonus
        );

        // repay
        // calculate debit repayment from liquidated amount
        // liquidated amount includes liquidation incentive which has to be reduced
        uint256 debitRepayment = loanLiquidatedAmount - liquidationBonus;
        bool fullyRepaid = _repay(
            loanToken,
            account,
            debitRepayment
        );

        return fullyRepaid;
    }


}
