// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";


contract NftToken is
    IERC721,
    IERC721Metadata,
    Ownable
{
    using Address for address;


    error InvalidArgument();
    error RecipientNotAccepted(address recipient);
    error TransferNotAllowed(uint256 tokenId);
    error NotTokenOwner(uint256 tokenId);
    error TokenNotExist(uint256 tokenId);


    event BaseURIChanged(string baseURI);

    event Minted(address indexed to, uint256 indexed tokenId);
    event Burned(address indexed from, uint256 indexed tokenId);



    struct Token {
        string URI;
        uint256 features;
    }


    string private _name;
    string private _symbol;
    string private _baseURI;

    Token[] public tokens;

    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _owners;
    mapping(uint256 => address) private _allowance;

    // _fullAllowance[owner][operator]
    mapping(address => mapping(address => bool)) private _fullAllowance;


    constructor (
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    )
    {
        _name = name_;
        _symbol = symbol_;
        _baseURI = baseURI_;
    }


    /**
     * ERC721 Metadata views
     */
    function name() public view override returns (string memory)
    {
        return _name;
    }

    function symbol() public view override returns (string memory)
    {
        return _symbol;
    }

    function balanceOf(address owner) public view override returns (uint256)
    {
        return _balances[owner];
    }

    /**
     * ERC721 views
     */
    function ownerOf(uint256 tokenId) public view override returns (address)
    {
        return _owners[tokenId];
    }

    function getApproved(uint256 tokenId) public view override returns (address)
    {
        return _allowance[tokenId];
    }

    function isApprovedForAll(address owner, address operator) public view override returns (bool)
    {
        return _fullAllowance[owner][operator];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory)
    {
        Token storage token = tokens[tokenId];
        return string(abi.encodePacked(_baseURI, token.URI));
    }

    /**
     * ERC165 views
     */
    function supportsInterface(bytes4 interfaceId) public pure override returns (bool)
    {
        return interfaceId == type(IERC721).interfaceId
            || interfaceId == type(IERC721Metadata).interfaceId;
    }

    /**
     * Views
     */
    function baseURI() public view returns (string memory)
    {
        return _baseURI;
    }

    function exists(uint256 tokenId) public view returns (bool)
    {
        return _owners[tokenId] != address(0);
    }


    /**
     * @dev Change base URI by owner
     */
    function changeBaseURI(string calldata baseURI_) external
        onlyOwner
    {
        _baseURI = baseURI_;
        emit BaseURIChanged(baseURI_);
    }

    /**
     * @dev Mints new token.
     * Allowed only to contract owner
     */
    function mint(
        address to,
        Token calldata token
    ) external
        onlyOwner
    {
        _mint(
            to,
            token
        );
    }

    /**
     * @dev Burns existing token
     * Allowed only to token owner
     */
    function burn(uint256 tokenId) external
    {
        _verifyTokenExists(tokenId);
        _verifyAllowance(tokenId, msg.sender);

        _burn(tokenId);
    }


    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
     * are aware of the ERC721 protocol to prevent tokens from being forever locked.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override
    {
        _verifyTokenExists(tokenId);
        _verifyAllowance(tokenId, msg.sender);

        _safeTransfer(from, to, tokenId, "");
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata data
    ) public override
    {
        _verifyTokenExists(tokenId);
        _verifyAllowance(tokenId, msg.sender);

        _safeTransfer(from, to, tokenId, data);
    }


    /**
     * @dev Transfers `tokenId` token from `from` to `to`.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external override
    {
        _verifyTokenExists(tokenId);
        _verifyAllowance(tokenId, msg.sender);

        _transfer(from, to, tokenId);
    }

    /**
     * @dev Gives permission to `to` to transfer `tokenId` token to another account.
     * The approval is cleared when the token is transferred.
     */
    function approve(address to, uint256 tokenId) external override
    {
        _verifyTokenExists(tokenId);
        _verifyAllowance(tokenId, msg.sender);

        _allowance[tokenId] = to;

        emit Approval(ownerOf(tokenId), to, tokenId);
    }

    /**
     * @dev Approve or remove `operator` as an operator for the caller.
     * Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller.
     */
    function setApprovalForAll(address operator, bool approved_) external override
    {
        if (operator == msg.sender) {
            revert InvalidArgument();
        }

        _fullAllowance[msg.sender][operator] = approved_;

        emit ApprovalForAll(msg.sender, operator, approved_);
    }



    function _verifyTokenExists(uint256 tokenId) internal view
    {
        if (!exists(tokenId)) {
            revert TokenNotExist(tokenId);
        }
    }

    function _verifyTokenOwner(uint256 tokenId, address owner) internal view
    {
        if (owner != ownerOf(tokenId)) {
            revert NotTokenOwner(tokenId);
        }
    }

    function _verifyAllowance(uint256 tokenId, address spender) internal view
    {
        address owner = ownerOf(tokenId);

        if (owner == msg.sender) {
            return;
        }
        else if (getApproved(tokenId) == spender) {
            return;
        }
        else if (isApprovedForAll(owner, spender)) {
            return;
        }

        revert TransferNotAllowed(tokenId);
    }

    function _verifyTokenRecievementAllowed(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
    ) internal
    {
        if (to.isContract()) {
            try IERC721Receiver(to).onERC721Received(from, to, tokenId, _data) returns (bytes4 retval) {
                if (retval != IERC721Receiver.onERC721Received.selector) {
                    revert RecipientNotAccepted(to);
                }
            }
            catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert RecipientNotAccepted(to);
                } else {
                    // pass though internal error
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }


    function _safeTransfer(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) internal
    {
        _verifyTokenRecievementAllowed(from, to, tokenId, data);

        _transfer(from, to, tokenId);
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal
    {
        _verifyTokenOwner(tokenId, from);

        --_balances[from];
        ++_balances[to];

        _owners[tokenId] = to;

        // clear allowance
        _allowance[tokenId] = address(0);

        emit Transfer(from, to, tokenId);
    }


    function _safeMint(
        address to,
        Token calldata token
    ) internal returns (uint256)
    {
        uint256 tokenId = _mint(to, token);
        _verifyTokenRecievementAllowed(address(0), to, tokenId, "");
        return tokenId;
    }

    function _mint(
        address to,
        Token calldata token
    ) internal returns (uint256)
    {
        // create token
        tokens.push(token);
        uint256 tokenId = tokens.length - 1;

        _owners[tokenId] = to;
        ++_balances[to];

        emit Minted(to, tokenId);

        return tokenId;
    }


    function _burn(uint256 tokenId) internal
    {
        address owner = ownerOf(tokenId);

        _owners[tokenId] = address(0);

        // clear allowance
        _allowance[tokenId] = address(0);

        emit Burned(owner, tokenId);
    }

}
