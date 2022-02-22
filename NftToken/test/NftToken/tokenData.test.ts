import { SampleToken } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { TestContext } from './TestContext';

const rlp = require('rlp');


describe('Token data', async() => {
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
        await testContext.createTokens(5);
        await testContext.sendTokens(1);
    });
    
    
    it('Should return proper URI', async() => {
        for (let tokenId = 0; tokenId < 5; ++tokenId) {
            const token = await nftToken.tokens(tokenId);
            
            const targetURI = `https://example.com/0x${tokenId.toString(16).padStart(32, '0')}`;
            const actualURI = await nftToken.tokenURI(tokenId);
            expect(actualURI).to.be.equal(targetURI);
        }
    });
    
});
