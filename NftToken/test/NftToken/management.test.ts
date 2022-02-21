import { NftToken } from '@/NftToken';
import { BaseURIChangedEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, mineBlock, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


const day = 24 * 3600;
const month = 30 * day;


describe('Management', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    let dave : SignerWithAddress;
    let eva : SignerWithAddress;
    
    let testContext : TestContext;
    let nftToken : NftToken;
    
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        nftToken = await testContext.initNftTokenContract();
        
        [ owner, alice, bob, carol, dave, eva ] = await ethers.getSigners();
    });
    
    
    describe('Token info', async() => {
        
        it('Should expose proper values', async() => {
            const name = await nftToken.name();
            expect(name).to.be.equal('SToken');
            
            const symbol = await nftToken.symbol();
            expect(symbol).to.be.equal('STK');
        });
        
    });
    
    describe('Change base URI', async() => {
        
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return nftToken
                    .connect(account)
                    .changeBaseURI('https://other.eth/t/');
            });
        });
        
        it('Should properly change base URI', async() => {
            const newURL = 'https://other.eth/t/';
        
            const tx = await nftToken
                .connect(owner)
                .changeBaseURI(newURL);
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            const event : BaseURIChangedEvent = findEvent(result, 'BaseURIChanged');
            expect(event.args.baseURI).to.be.equal(newURL);
            
            const baseURL = await nftToken.baseURI();
            expect(baseURL).to.be.equal(newURL);
        });
        
    });
});
