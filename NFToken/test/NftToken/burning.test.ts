import { BurnedEvent, MintedEvent, SampleToken, TransferEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { AccountState, TestContext } from './TestContext';


const zeroAddress = '0x0000000000000000000000000000000000000000';


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
        await testContext.createTokens(15);
        await testContext.sendTokens(3);
    });
    
    
    it('Should allow to execute burn only by token owner', async() => {
        for (const [ accountName, account ] of Object.entries(testContext.accounts)) {
            const accountState : AccountState = testContext.accountsState[accountName];
            
            const tokenId = accountState.nfts[0];
            await assertIsAvailableOnlyForOwner(async(account) => {
                return nftToken
                    .connect(account)
                    .burn(tokenId);
            }, account, `NotAllowed()`);
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
            expect(transferEvent.args.to).to.be.equal(zeroAddress);
            expect(transferEvent.args.tokenId).to.be.equal(tokenId);
            
            // verify token exists
            const exists = await nftToken.exists(tokenId);
            expect(exists).to.be.equal(false);
        }
    });
    
    it('Should decrease balance', async() => {
        let totalSupply = await nftToken.totalSupply();
    
        for (const [ accountName, account ] of Object.entries(testContext.accounts)) {
            const accountState : AccountState = testContext.accountsState[accountName];
            
            const tokenId = accountState.nfts[0];
            
            // check before
            {
                const balance = await nftToken.balanceOf(account.address);
                expect(balance).to.be.equal(3);
                
                const currentTotalSupply = await nftToken.totalSupply();
                expect(currentTotalSupply).to.be.equal(totalSupply);
                
                const exists = await nftToken.exists(tokenId);
                expect(exists).to.be.equal(true);
            }
            
            // burn
            const [ tx, result ] = await txExec(
                nftToken
                    .connect(account)
                    .burn(tokenId)
            );
            
            totalSupply = totalSupply.sub(1);
            
            // check balance after
            {
                const balance = await nftToken.balanceOf(account.address);
                expect(balance).to.be.equal(2);
                
                const currentTotalSupply = await nftToken.totalSupply();
                expect(currentTotalSupply).to.be.equal(totalSupply);
                
                const exists = await nftToken.exists(tokenId);
                expect(exists).to.be.equal(false);
            }
        }
    });
    
    
});
