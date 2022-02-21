import { BurnedEvent, MintedEvent, SampleToken, TransferEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { AccountState, TestContext } from './TestContext';


describe('Burning', async() => {
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
        await testContext.createTokens(25);
        await testContext.sendTokens(5);
    });
    
    
    it('Should allow to execute burn only by token owner', async() => {
        for (const [ accountName, account ] of Object.entries(testContext.accounts)) {
            const accountState : AccountState = testContext.accountsState[accountName];
            
            const tokenId = accountState.nfts[0];
            await assertIsAvailableOnlyForOwner(async(account) => {
                return nftToken
                    .connect(account)
                    .burn(tokenId);
            }, account, `NotAllowed(${tokenId})`);
        }
    });
    
    it('Should properly burn token', async() => {
        for (const [ accountName, account ] of Object.entries(testContext.accounts)) {
            const accountState : AccountState = testContext.accountsState[accountName];
            
            // burn
            const tokenId = accountState.nfts[0];
            const [ tx, result ] = await txExec(
                nftToken
                    .connect(account)
                    .burn(tokenId)
            );
            
            const burnedEvent : BurnedEvent = findEvent(result, 'Burned');
            expect(burnedEvent.args.from).to.be.equal(account.address);
            expect(burnedEvent.args.tokenId).to.be.equal(tokenId);
            
            const transferEvent : TransferEvent = findEvent(result, 'Transfer');
            expect(transferEvent.args.from).to.be.equal(account.address);
            expect(transferEvent.args.to).to.be.equal('0x0000000000000000000000000000000000000000');
            expect(transferEvent.args.tokenId).to.be.equal(tokenId);
            
            // verify token exists
            const exists = await nftToken.exists(tokenId);
            expect(exists).to.be.equal(false);
        }
    });
    
    
});
