// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";


error ZombieCreationRestricted();
error NotOwnerOfZombie(uint zombieId);
error TestError(uint test);

contract Factory is
    Ownable,
    ERC721("CryptoZombies", "CZ")
{

    event NewZombie(uint zombieId, string name, uint256 dna);

    uint256 randNonce = 0;
    uint256 dnaDigits = 16;
    uint256 dnaModulus = 10 ** dnaDigits;
    uint256 cooldownTime = 1 days;

    struct Zombie {
        string name;
        uint256 dna;
        uint32 level;
        uint32 readyTime;
        uint16 winCount;
        uint16 lossCount;
    }

    Zombie[] public zombies;


    modifier onlyOwnerOf(uint256 _zombieId)
    {
        if (ownerOf(_zombieId) != msg.sender) {
            revert NotOwnerOfZombie(_zombieId);
        }
        _;
    }

    function _generateRandom(string memory _salt) internal returns (uint256)
    {
        ++randNonce;
        return uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, randNonce, _salt)));
    }

    function _createZombie(string memory _name, uint256 _dna) internal
    {
        Zombie memory zombie = Zombie(
            _name,
            _dna,
            1,
            uint32(block.timestamp + cooldownTime),
            0,
            0
        );
        zombies.push(zombie);
        uint256 tokenId = zombies.length - 1;

        _mint(msg.sender, tokenId);

        emit NewZombie(tokenId, _name, _dna);
    }

    function createRandomZombie(string memory _name) public
    {
        if (balanceOf(msg.sender) != 0) {
            revert ZombieCreationRestricted();
        }

        uint256 randDna = _generateRandom(_name) % dnaModulus;
        randDna -= randDna % 100;

        _createZombie(_name, randDna);
    }

    function getZombiesByOwner(address _owner) external view returns (uint256[] memory)
    {
        uint256[] memory result = new uint[](balanceOf(_owner));
        uint256 counter = 0;
        for (uint i = 0; i < zombies.length; ++i) {
            if (ownerOf(i) == _owner) {
                result[counter] = i;
                ++counter;
            }
        }
        return result;
    }

}
