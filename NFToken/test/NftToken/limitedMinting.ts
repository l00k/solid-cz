import { BurnedEvent, MintedEvent, SampleToken, TransferEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { AccountState, TestContext } from './TestContext';


describe('Limited minting', async() => {
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
        nftToken = await testContext.initNftTokenContract(
            'SToken',
            'STK',
            'https://example.com/',
            5
        );
        
        [ owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
    });
    
    
    it('Should not allow to create more than cap', async() => {
        await testContext.createTokens(5);
        
        const tx = nftToken
            .connect(owner)
            .mint(
                owner.address,
                {
                    name: `Token`,
                    features: 0x00,
                    createdAt: 0,
                }
            );
        await assertErrorMessage(tx, 'MaxSupplyReached()');
    });
    
    it('Should allow to create more after burning some tokens', async() => {
        await testContext.createTokens(5);
        
        await txExec(
            nftToken
                .connect(owner)
                .burn(1)
        );
        
        // one more allowed
        await testContext.createTokens(1);
        
        const tx = nftToken
            .connect(owner)
            .mint(
                owner.address,
                {
                    name: `Token`,
                    features: 0x00,
                    createdAt: 0,
                }
            );
        await assertErrorMessage(tx, 'MaxSupplyReached()');
    });
    
    
});
