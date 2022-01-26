// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


error WrongAmount(uint256 amount);
error AmountExceedAllowed(uint256 required, uint256 allowed);
error InsufficientFunds(uint256 required, uint256 owned);


contract CoinBase is
    IERC20,
    IERC20Metadata
{

    string private _name;
    string private _symbol;
    uint8 private _decimals;

    uint256 internal _totalSupply;

    mapping(address => uint256) internal _balances;

    // [owner][spender]
    mapping(address => mapping(address => uint256)) private _allowed;


    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply_,
        uint8 decimals_
    ) {
        _name = name_;
        _symbol = symbol_;
        _totalSupply = initialSupply_;
        _decimals = decimals_;

        // entire supply on creator address
        _balances[msg.sender] = initialSupply_;
    }

    function name() external view returns (string memory)
    {
        return _name;
    }

    function symbol() external view returns (string memory)
    {
        return _symbol;
    }

    function decimals() external view returns (uint8)
    {
        return _decimals;
    }

    function totalSupply() override external view returns (uint256)
    {
        return _totalSupply;
    }

    function balanceOf(address account_) override external view returns (uint256)
    {
        return _balances[account_];
    }

    function _transfer(address sender_, address recipient_, uint256 amount_) virtual internal
    {
        if (amount_ == 0) {
            revert WrongAmount(amount_);
        }
        if (_balances[sender_] < amount_) {
            revert InsufficientFunds(amount_, _balances[sender_]);
        }

        _balances[sender_] -= amount_;
        _balances[recipient_] += amount_;

        emit Transfer(sender_, recipient_, amount_);
    }

    function transfer(address recipient_, uint256 amount_) override external returns (bool)
    {
        _transfer(msg.sender, recipient_, amount_);
        return (true);
    }

    function allowance(address owner_, address spender_) override external view returns (uint256)
    {
        return _allowed[owner_][spender_];
    }

    function approve(address spender_, uint256 amount_) override external returns (bool)
    {
        _allowed[msg.sender][spender_] = amount_;

        emit Approval(msg.sender, spender_, amount_);

        return true;
    }

    function transferFrom(
        address sender_,
        address recipient_,
        uint256 amount_
    ) override external returns (bool)
    {
        if (amount_ == 0) {
            revert WrongAmount(amount_);
        }
        if (_allowed[sender_][msg.sender] < amount_) {
            revert AmountExceedAllowed(amount_, _allowed[sender_][msg.sender]);
        }

        _allowed[sender_][msg.sender] -= amount_;
        _transfer(sender_, recipient_, amount_);

        return true;
    }

}
