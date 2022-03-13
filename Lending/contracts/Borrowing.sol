// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Deposits.sol";


contract Borrowing is
    Deposits
{

    error ZeroTokenPrice();
    error AmountExceedWithdrawableLimit();
    error AmountExceedBorrowableLimit();

    event BorrowableFractionChanged(IERC20Metadata token, uint32 fraction);
    event LoanOpened(address who, IERC20Metadata token, uint256 amount);
    event LoanPartiallyRepaid(address who, IERC20Metadata token, uint256 amount);
    event LoanFullyRepaid(address who, IERC20Metadata token);


    // 1 = 0.0001%
    mapping(IERC20Metadata => uint32) private _tokenBorrowableFractions;

    // account => token => uint256
    mapping(address => mapping(IERC20Metadata => uint256)) private _accountDebit;

    // token => uint256
    mapping(IERC20Metadata => uint256) private _totalDebit;


    function getAccountTokenDebit(
        IERC20Metadata token,
        address account
    ) public view virtual returns (uint256)
    {
        _verifyTokenSupported(token);

        return _accountDebit[account][token];
    }

    function getTotalTokenDebit(IERC20Metadata token) public view returns (uint256)
    {
        _verifyTokenSupported(token);
        return _totalDebit[token];
    }

    /**
     * @dev
     * Liqudity factor limits total amount of funds which can be borrowed by users
     */
    function getTokenBorrowableFraction(IERC20Metadata token) public view returns (uint32)
    {
        _verifyTokenSupported(token);
        return _tokenBorrowableFractions[token];
    }

    /**
     * @dev
     * Returns total amount of deposit tokens reduced by liqudity factor
     */
    function getTotalTokenBorrowable(
        IERC20Metadata token
    ) public view returns (uint256)
    {
        _verifyTokenSupported(token);
        _verifyAssetActive(token);

        uint256 tokenDeposits = getTotalTokenDeposit(token);
        uint32 tokenBorrowableFraction = getTokenBorrowableFraction(token);
        uint256 totalBorrowable = tokenDeposits * tokenBorrowableFraction / 1e6;

        uint256 tokenBorrowed = getTotalTokenDebit(token);

        return totalBorrowable - tokenBorrowed;
    }

    /**
     * @dev
     * Returns value borrowable by account depending on his current liquidity
     * It is limited to current global borrowable token amount (limited by borrowable fraction)
     */
    function getAccountTokenBorrowable(
        IERC20Metadata token,
        address account
    ) public view returns (uint256)
    {
        _verifyTokenSupported(token);
        _verifyAssetActive(token);

        uint256 borrowableTotal = getTotalTokenBorrowable(token);
        if (borrowableTotal == 0) {
            return 0;
        }

        uint8 tokenDecimals = token.decimals();
        uint256 tokenPrice = getTokenPrice(token);

        int256 accountLiquidity = getAccountLiquidity(account);
        if (accountLiquidity <= 0) {
            return 0;
        }

        // borrowableAmount(<tokenDecimals> digits precise) =
        //      accountLiquidity(8 digits precise)
        //      / tokenPrice(8 digits precise)
        uint256 borrowableAmount = uint256(accountLiquidity) * (10 ** tokenDecimals)
            / tokenPrice;

        return borrowableAmount > borrowableTotal
            ? borrowableTotal
            : borrowableAmount;
    }

    /**
     * @dev
     * Returns total account debit in USD
     * Precision: 8 digits
     */
    function getAccountDebitValue(
        address account
    ) public view virtual returns (uint256)
    {
        uint256 totalDebit = 0;

        IERC20Metadata[] memory tokens = getSupportedTokens();

        for (uint i = 0; i<tokens.length; ++i) {
            IERC20Metadata token = tokens[i];

            uint256 tokenDebit = getAccountTokenDebit(token, account);
            if (tokenDebit == 0) {
                continue;
            }

            uint8 tokenDecimals = token.decimals();
            uint256 tokenPrice = getTokenPrice(token);

            // liquidity(8 digits precise) =
            //      debit (<tokenDecimals> digits precise)
            //      * price(8 digits precise)
            totalDebit += tokenDebit * tokenPrice / (10 ** tokenDecimals);
        }

        return totalDebit;
    }

    /**
     * @inheritdoc Deposits
     *
     * @dev
     * Liquidity should be reduced with borrowed amount
     * It may return negative value if total debit is larger than account deposit liquditiy
     */
    function getAccountLiquidity(
        address account
    ) public view virtual override returns (int256)
    {
        return super.getAccountLiquidity(account)
            - int256(getAccountDebitValue(account))
            ;
    }

    /**
     * @dev
     * Amount of funds available to withdraw should be limited by open loans
     */
    function getAccountTokenWithdrawable(
        IERC20Metadata token,
        address account
    ) public view virtual returns (uint256)
    {
        _verifyTokenSupported(token);

        uint256 deposit = super.getAccountTokenDeposit(token, account);
        if (deposit == 0) {
            return 0;
        }

        int256 liquidity = getAccountLiquidity(account);
        if (liquidity <= 0) {
            return 0;
        }

        uint32 collateralFactor = getTokenCollateralFactor(token);
        uint8 tokenDecimals = token.decimals();
        uint256 tokenPrice = getTokenPrice(token);

        // withdrawable(<tokenDecimals> digits precise) =
        //      liquidity (8 digits precise)
        //      / collateralFactor(6 digits precise)
        //      / tokenPrice (8 digits precise)
        uint256 maxWithdrawable = uint256(liquidity) * (10 ** (tokenDecimals + 6))
            / collateralFactor
            / tokenPrice;

        return deposit <= maxWithdrawable
            ? deposit
            : maxWithdrawable;
    }



    function setTokenBorrowableFraction(
        IERC20Metadata token,
        uint32 borrowableFraction
    ) public
        onlyOwner
    {
        _verifyTokenSupported(token);

        _tokenBorrowableFractions[token] = borrowableFraction;

        emit BorrowableFractionChanged(token, borrowableFraction);
    }

    function _increaseAccountDebit(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal
    {
        _totalDebit[token] += amount;
        _accountDebit[account][token] += amount;
    }

    function _decreaseAccountDebit(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal
    {
        _totalDebit[token] -= amount;
        _accountDebit[account][token] -= amount;
    }

    function borrow(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        _verifyTokenSupported(token);
        _verifyAssetActive(token);

        uint256 borrowable = getAccountTokenBorrowable(
            token,
            msg.sender
        );
        if (amount > borrowable) {
            revert AmountExceedBorrowableLimit();
        }

        _increaseAccountDebit(token, msg.sender, amount);

        bool result = token.transfer(msg.sender, amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        emit LoanOpened(msg.sender, token, amount);
    }

    /**
     * @dev
     * Before withdrawing ensure requested amount not exceed withdrawable amount
     */
    function _beforeWithdraw(
        IERC20Metadata token,
        uint256 amount
    ) internal virtual override
    {
        super._beforeWithdraw(token, amount);

        uint256 withdrawable = getAccountTokenWithdrawable(token, msg.sender);
        if (amount > withdrawable) {
            revert AmountExceedWithdrawableLimit();
        }
    }


    function _repay(
        IERC20Metadata token,
        address account,
        uint256 amount
    ) internal
    {
        _decreaseAccountDebit(token, account, amount);

        emit LoanPartiallyRepaid(account, token, amount);

        if (_accountDebit[account][token] == 0) {
            emit LoanFullyRepaid(account, token);
        }
    }

    function repay(
        IERC20Metadata token,
        uint256 amount
    ) public
    {
        _verifyTokenSupported(token);

        uint256 debit = getAccountTokenDebit(token, msg.sender);
        if (debit == 0) {
            return;
        }
        if (amount >= debit) {
            // reduce amount
            amount = debit;
        }

        // check allowance
        uint256 allowed = token.allowance(msg.sender, address(this));
        if (amount > allowed) {
            revert InsufficientAllowance();
        }

        // try to transfer funds
        bool result = token.transferFrom(msg.sender, address(this), amount);
        /* istanbul ignore if */
        if (!result) {
            revert CouldNotTransferFunds();
        }

        _repay(
            token,
            msg.sender,
            amount
        );
    }

}
