// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Borrowing.sol";


contract Liquidations is
    Borrowing
{

    event LiquidationIncentiveChanged(uint32 fraction);
    event LiquidatedToken(address who, IERC20Metadata token, uint256 amount);
    event Liquidated(address who, uint256 value);


    // 1 = 0.0001%
    uint32 private _liquidationIncentive;


    function getLiquidationIncentive() public view returns (uint32)
    {
        return _liquidationIncentive;
    }

    /**
     * @dev
     * Additional amount of funds account will be charged in case of liquidation
     */
    function _getAccountLiquidationIncentiveValue(
        address account
    ) private view returns (uint256)
    {
        uint256 debitValue = getAccountDebitValue(account);
        return debitValue * _liquidationIncentive / 1e6;
    }

    /**
     * @dev
     * Total liquidation value for given account
     */
    function getAccountLiquidationValue(
        address account
    ) public view returns (uint256)
    {
        return getAccountDebitValue(account) + _getAccountLiquidationIncentiveValue(account);
    }

    /**
     * @inheritdoc Borrowing
     *
     * @dev
     * Liquidity should be reduced with liquidation incentive factor
     */
    function getAccountLiquidity(
        address account
    ) public view virtual override returns (int256)
    {
        return super.getAccountLiquidity(account)
            - int256(_getAccountLiquidationIncentiveValue(account))
            ;
    }


    function setLiquidationIncentive(uint32 liquidationIncentive) public
        onlyOwner
    {
        _liquidationIncentive = liquidationIncentive;

        emit LiquidationIncentiveChanged(liquidationIncentive);
    }

    function liquidate(
        address account
    ) public
    {
        int256 liquidity = getAccountLiquidity(account);
        if (liquidity >= 0) {
            return;
        }

        uint256 liquidationValue = getAccountLiquidationValue(account);
        uint256 liquidatedValue = 0;

        // try to liquidate enough funds
        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint i = 0; i<tokens.length; ++i) {
            IERC20Metadata token = tokens[i];

            uint256 depositAmount = getAccountTokenDeposit(token, account);
            if (depositAmount == 0) {
                continue;
            }

            uint8 tokenDecimals = token.decimals();

            uint256 tokenDepositValue = _getAccountTokenDepositValue(token, account);

            uint256 requiredLiquidationAmount = depositAmount * liquidationValue / tokenDepositValue;
            uint256 liquidationAmount = requiredLiquidationAmount > depositAmount
                ? depositAmount
                : requiredLiquidationAmount;

            // partialLiquidationValue(8 digits precise) =
            //      liquidationAmount(<tokenDecimals> digits precise)
            //      * tokenPrice (8 digits precise)
            uint256 partialLiquidationValue = liquidationAmount * getTokenPrice(token) / (10 ** tokenDecimals);

            // reduce deposit
            _decreaseAccountDeposit(
                token,
                account,
                liquidationAmount
            );

            // adjust liquidation left
            liquidatedValue += partialLiquidationValue;
            liquidationValue -= partialLiquidationValue;

            emit LiquidatedToken(account, token, liquidationAmount);
        }

        // clear loans
        for (uint i = 0; i<tokens.length; ++i) {
            IERC20Metadata token = tokens[i];

            uint256 debit = getAccountTokenDebit(token, account);
            if (debit > 0) {
                _decreaseAccountDebit(token, account, debit);
            }
        }

        emit Liquidated(account, liquidatedValue);
    }

}
