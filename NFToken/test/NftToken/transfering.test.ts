import {
    ApprovalEvent,
    ApprovalForAllEvent,
    BurnedEvent,
    MintedEvent,
    SampleToken,
    TransferEvent
} from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { AccountState, TestContext } from './TestContext';


const zeroAddress = '0x0000000000000000000000000000000000000000';


describe('Transfering', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    let dave : SignerWithAddress;
    let eva : SignerWithAddress;
    
    let testContext : TestContext;
    let nftToken : SampleToken;
    
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        nftToken = await testContext.initNftTokenContract();
        
        [ owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
        
        // create tokens
        await testContext.createTokens(15);
        await testContext.sendTokens(3);
    });
    
    
    it('Should allow transfering only allowed tokens (owner)', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        // non allowed
        {
            const tx = nftToken
                .connect(bob)
                .transferFrom(
                    alice.address,
                    bob.address,
                    tokenId
                );
            await assertErrorMessage(tx, `NotAllowed()`)
        }
        
        // allowed
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    .transferFrom(
                        alice.address,
                        bob.address,
                        tokenId
                    )
            );
            
            const event : TransferEvent = findEvent(result, 'Transfer');
            expect(event.args.from).to.be.equal(alice.address);
            expect(event.args.to).to.be.equal(bob.address);
            expect(event.args.tokenId).to.be.equal(tokenId);
        }
    });
    
    it('Should properly handle approving', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        // approved for no one
        {
            const allowance = await nftToken.getApproved(tokenId);
            expect(allowance).to.be.equal(zeroAddress);
        }
        
        // approve
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    .approve(bob.address, tokenId)
            );
            
            const event : ApprovalEvent = findEvent(result, 'Approval');
            expect(event.args.tokenId).to.be.equal(tokenId);
            expect(event.args.owner).to.be.equal(alice.address);
            expect(event.args.approved).to.be.equal(bob.address);
        }
        
        // properly approved
        {
            const allowance = await nftToken.getApproved(tokenId);
            expect(allowance).to.be.equal(bob.address);
        }
    });
    
    it('Should not be able to approve non owned token', async() => {
        const tokenId = testContext.accountsState.bob.nfts[0];
        
        // approve
        {
            const tx = nftToken
                .connect(alice)
                .approve(carol.address, tokenId);
            
            await assertErrorMessage(tx, `NotAllowed()`);
        }
    });
    
    it('Should allow transfering only allowed tokens (approve)', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        // non allowed
        {
            const tx = nftToken
                .connect(bob)
                .transferFrom(
                    alice.address,
                    bob.address,
                    tokenId
                );
            await assertErrorMessage(tx, `NotAllowed()`)
        }
        
        // approve
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    .approve(bob.address, tokenId)
            );
        }
        
        // allowed
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(bob)
                    .transferFrom(
                        alice.address,
                        bob.address,
                        tokenId
                    )
            );
            
            const event : TransferEvent = findEvent(result, 'Transfer');
            expect(event.args.from).to.be.equal(alice.address);
            expect(event.args.to).to.be.equal(bob.address);
            expect(event.args.tokenId).to.be.equal(tokenId);
        }
    });
    
    it('Should remove allowance after transfering', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        // approve
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    .approve(bob.address, tokenId)
            );
        }
        
        // transfer
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(bob)
                    .transferFrom(
                        alice.address,
                        bob.address,
                        tokenId
                    )
            );
        }
        
        // checks
        {
            const allowance = await nftToken.getApproved(tokenId);
            expect(allowance).to.be.equal(zeroAddress);
        }
    });
    
    it('Should properly handle approving for all', async() => {
        // not approved yet
        {
            const allowance = await nftToken.isApprovedForAll(alice.address, bob.address);
            expect(allowance).to.be.equal(false);
        }
        
        // approve
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    .setApprovalForAll(bob.address, true)
            );
            
            const event : ApprovalForAllEvent = findEvent(result, 'ApprovalForAll');
            expect(event.args.owner).to.be.equal(alice.address);
            expect(event.args.operator).to.be.equal(bob.address);
            expect(event.args.approved).to.be.equal(true);
        }
        
        // properly approved
        {
            const allowance = await nftToken.isApprovedForAll(alice.address, bob.address);
            expect(allowance).to.be.equal(true);
        }
    });
    
    it('Should allow transfering only allowed tokens (approvalForAll)', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        // non allowed
        {
            const tx = nftToken
                .connect(bob)
                .transferFrom(
                    alice.address,
                    bob.address,
                    tokenId
                );
            await assertErrorMessage(tx, `NotAllowed()`)
        }
        
        // approve
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    .setApprovalForAll(bob.address, true)
            );
        }
        
        // allowed
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(bob)
                    .transferFrom(
                        alice.address,
                        bob.address,
                        tokenId
                    )
            );
            
            const event : TransferEvent = findEvent(result, 'Transfer');
            expect(event.args.from).to.be.equal(alice.address);
            expect(event.args.to).to.be.equal(bob.address);
            expect(event.args.tokenId).to.be.equal(tokenId);
        }
    });
    
    it('Should prevent sending token to non compilant contract (safeTransfer)', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        const nonHolderContract = await testContext.deployContract('NonHolderContract');
        
        // non allowed
        {
            const tx = nftToken
                .connect(alice)
                ['safeTransferFrom(address,address,uint256)'](
                    alice.address,
                    nonHolderContract.address,
                    tokenId
                );
            await assertErrorMessage(tx, `RecipientNotAccepted("${nonHolderContract.address}")`);
        }
        
    });
    
    it('Should allow sending token to compilant contract (safeTransfer)', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        const holderContract = await testContext.deployContract('HolderContract');
        
        // allowed
        {
            const [tx, result] = await txExec(
                nftToken
                    .connect(alice)
                    ['safeTransferFrom(address,address,uint256)'](
                        alice.address,
                        holderContract.address,
                        tokenId
                    )
            );
            
            const event : TransferEvent = findEvent(result, 'Transfer');
            expect(event.args.from).to.be.equal(alice.address);
            expect(event.args.to).to.be.equal(holderContract.address);
            expect(event.args.tokenId).to.be.equal(tokenId);
        }
    });
    
    it('Should not prevent sending token to non compilant contract (transfer)', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        const nonHolderContract = await testContext.deployContract('NonHolderContract');
        
        const [tx, result] = await txExec(
            nftToken
                .connect(alice)
                .transferFrom(
                    alice.address,
                    nonHolderContract.address,
                    tokenId
                )
        );
        
        const event : TransferEvent = findEvent(result, 'Transfer');
        expect(event.args.from).to.be.equal(alice.address);
        expect(event.args.to).to.be.equal(nonHolderContract.address);
        expect(event.args.tokenId).to.be.equal(tokenId);
    });
    
    it('Should properly handle alternative form of safeTransfer', async() => {
        const tokenId = testContext.accountsState.alice.nfts[0];
        
        const [tx, result] = await txExec(
            nftToken
                .connect(alice)
                ['safeTransferFrom(address,address,uint256,bytes)'](
                    alice.address,
                    bob.address,
                    tokenId,
                    []
                )
        );
        
        const event : TransferEvent = findEvent(result, 'Transfer');
        expect(event.args.from).to.be.equal(alice.address);
        expect(event.args.to).to.be.equal(bob.address);
        expect(event.args.tokenId).to.be.equal(tokenId);
    });
    
    
    
});
