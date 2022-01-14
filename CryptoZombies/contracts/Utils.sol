// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


function memcmp(bytes memory a, bytes memory b) pure returns (bool)
{
    return (a.length == b.length) && (keccak256(a) == keccak256(b));
}

function strcmp(string memory a, string memory b) pure returns (bool)
{
    return memcmp(abi.encodePacked(a), abi.encodePacked(b));
}
