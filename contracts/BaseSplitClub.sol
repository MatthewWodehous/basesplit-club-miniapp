// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BaseSplitClub is ERC721, Ownable, ReentrancyGuard {
    struct Bill {
        address creator;
        string title;
        uint256 totalAmount;
        uint256 paidAmount;
        bool receiptMinted;
    }

    uint256 public nextBillId;
    uint256 private nextTokenId;
    string private baseTokenURI;

    mapping(uint256 => Bill) public bills;
    mapping(uint256 => address[]) private billParticipants;
    mapping(uint256 => mapping(address => uint256)) public amountDue;
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => mapping(address => bool)) private isParticipant;
    mapping(address => uint256) public walletPaymentCount;
    mapping(address => uint256) public rewardPoints;
    mapping(address => address) public referralOf;
    mapping(uint256 => uint256) public receiptBill;
    mapping(uint256 => mapping(address => bool)) public receiptClaimed;

    event BillCreated(uint256 indexed billId, address indexed creator, string title, uint256 totalAmount);
    event SharePaid(uint256 indexed billId, address indexed payer, uint256 amount, address indexed referrer);
    event ReceiptMinted(uint256 indexed billId, uint256 indexed tokenId, address indexed collector);
    event BaseURISet(string newBaseURI);

    constructor(string memory initialBaseURI) ERC721("BaseSplit Club Receipt", "BSPLIT") Ownable(msg.sender) {
        baseTokenURI = initialBaseURI;
        nextTokenId = 1;
    }

    function createBill(string calldata title, address[] calldata participants, uint256[] calldata amounts)
        external
        returns (uint256 billId)
    {
        require(bytes(title).length > 0, "Title required");
        require(participants.length > 0, "Participants required");
        require(participants.length == amounts.length, "Array length mismatch");

        billId = nextBillId++;
        uint256 totalAmount;

        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            uint256 amount = amounts[i];
            require(participant != address(0), "Participant required");
            require(amount > 0, "Amount required");
            require(!isParticipant[billId][participant], "Duplicate participant");

            billParticipants[billId].push(participant);
            amountDue[billId][participant] = amount;
            isParticipant[billId][participant] = true;
            totalAmount += amount;
        }

        bills[billId] = Bill({
            creator: msg.sender,
            title: title,
            totalAmount: totalAmount,
            paidAmount: 0,
            receiptMinted: false
        });

        emit BillCreated(billId, msg.sender, title, totalAmount);
    }

    function payShare(uint256 billId, address referrer) external nonReentrant {
        Bill storage bill = bills[billId];
        require(bill.creator != address(0), "Bill not found");
        require(isParticipant[billId][msg.sender], "Not a participant");
        require(!paid[billId][msg.sender], "Already paid");

        uint256 amount = amountDue[billId][msg.sender];
        require(amount > 0, "No amount due");

        address effectiveReferrer = address(0);
        if (walletPaymentCount[msg.sender] == 0 && referrer != address(0) && referrer != msg.sender) {
            referralOf[msg.sender] = referrer;
            rewardPoints[referrer] += 25;
            rewardPoints[msg.sender] += 10;
            effectiveReferrer = referrer;
        }

        paid[billId][msg.sender] = true;
        bill.paidAmount += amount;
        walletPaymentCount[msg.sender] += 1;
        rewardPoints[msg.sender] += 5;

        emit SharePaid(billId, msg.sender, amount, effectiveReferrer);
    }

    function mintReceipt(uint256 billId) external nonReentrant returns (uint256 tokenId) {
        require(canMintReceipt(billId, msg.sender), "Receipt unavailable");

        bills[billId].receiptMinted = true;
        receiptClaimed[billId][msg.sender] = true;
        tokenId = nextTokenId++;
        receiptBill[tokenId] = billId;
        rewardPoints[msg.sender] += 15;

        _safeMint(msg.sender, tokenId);

        emit ReceiptMinted(billId, tokenId, msg.sender);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseTokenURI = newBaseURI;
        emit BaseURISet(newBaseURI);
    }

    function billSettled(uint256 billId) public view returns (bool) {
        Bill storage bill = bills[billId];
        return bill.creator != address(0) && bill.paidAmount >= bill.totalAmount;
    }

    function canMintReceipt(uint256 billId, address wallet) public view returns (bool) {
        Bill storage bill = bills[billId];
        return billSettled(billId)
            && !bill.receiptMinted
            && !receiptClaimed[billId][wallet]
            && (wallet == bill.creator || isParticipant[billId][wallet]);
    }

    function getBillParticipants(uint256 billId) external view returns (address[] memory) {
        return billParticipants[billId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseTokenURI, _toString(tokenId), ".json");
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
