// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import "./NFToken.sol";


import "hardhat/console.sol";


abstract contract Enumerable is
    IERC721Enumerable,
    NFToken
{

    error IndexOutOfBound(uint256 bound);


    mapping(address => uint256[]) private _ownedTokensListByAccount;

    // Token IDX in list
    mapping(uint256 => uint256) private _ownedTokenIndices;

    uint256[] private _globalTokenList;
    mapping(uint256 => uint256) private _globalTokenIndices;



    constructor()
    {
        _supportedInterfaces[type(IERC721Enumerable).interfaceId] = true;
    }


    function totalSupply() public virtual override(IERC721Enumerable, NFToken) view returns (uint256)
    {
        return NFToken.totalSupply();
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) external override view returns (uint256)
    {
        if (index >= balanceOf(owner)) {
            revert IndexOutOfBound(balanceOf(owner));
        }

        return _ownedTokensListByAccount[owner][index];
    }

    function tokenByIndex(uint256 index) external override view returns (uint256)
    {
        if (index >= totalSupply()) {
            revert IndexOutOfBound(totalSupply());
        }

        return _globalTokenList[index];
    }


    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(NFToken)
    {
        super._afterTokenTransfer(from, to, tokenId);

        if (from == to) {
            return;
        }

        if (from == address(0)) {
            _addToGlobalList(tokenId);
        }
        else {
            _removeFromAccountList(from, tokenId);
        }

        if (to == address(0)) {
            _removeFromGlobalList(tokenId);
        }
        else {
            _addToAccountList(to, tokenId);
        }
    }

    function _addToGlobalList(
        uint256 tokenId
    ) internal
    {
        _globalTokenList.push(tokenId);
        _globalTokenIndices[tokenId] = _globalTokenList.length - 1;
    }

    function _addToAccountList(
        address account,
        uint256 tokenId
    ) internal
    {
        _ownedTokensListByAccount[account].push(tokenId);
        _ownedTokenIndices[tokenId] = _ownedTokensListByAccount[account].length - 1;
    }

    function _removeFromAccountList(
        address account,
        uint256 tokenId
    ) internal
    {
        uint256 lastIndex = balanceOf(account) - 1;
        uint256 tokenIndex = _ownedTokenIndices[tokenId];

        if (tokenIndex != lastIndex) {
            // swap tokens
            uint256 lastTokenId = _ownedTokensListByAccount[account][lastIndex];

            _ownedTokensListByAccount[account][tokenIndex] = lastTokenId;
            _ownedTokenIndices[lastTokenId] = tokenIndex;
        }

        delete _ownedTokenIndices[tokenId];
        _ownedTokensListByAccount[account].pop();
    }

    function _removeFromGlobalList(
        uint256 tokenId
    ) internal
    {
        uint256 lastIndex = totalSupply() - 1;
        uint256 tokenIndex = _globalTokenIndices[tokenId];

        if (tokenIndex != lastIndex) {
            // swap tokens
            uint256 lastTokenId = _globalTokenList[lastIndex];

            _globalTokenList[tokenIndex] = lastTokenId;
            _globalTokenIndices[lastTokenId] = tokenIndex;
        }

        delete _globalTokenIndices[tokenId];
        _globalTokenList.pop();
    }

}
