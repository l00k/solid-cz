import { SampleToken, BaseURIChangedEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { TestContext } from './TestContext';


describe('Management', async() => {
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
    });
    
    
    describe('Token info', async() => {
        
        it('Should expose proper values', async() => {
            const name = await nftToken.name();
            expect(name).to.be.equal('SToken');
            
            const symbol = await nftToken.symbol();
            expect(symbol).to.be.equal('STK');
            
            const baseURI = await nftToken.baseURI();
            expect(baseURI).to.be.equal('https://example.com/');
            
            const maxSupply = await nftToken.maxSupply();
            expect(maxSupply).to.be.equal(1000);
        });
        
    });
    
    describe('Change base URI', async() => {
        const newURL = 'https://other.eth/t/';
        
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return nftToken
                    .connect(account)
                    .changeBaseURI(newURL);
            });
        });
        
        it('Should properly change base URI', async() => {
            const [ tx, result ] = await txExec(
                nftToken
                    .connect(owner)
                    .changeBaseURI(newURL)
            );
            
            const event : BaseURIChangedEvent = findEvent(result, 'BaseURIChanged');
            expect(event.args.baseURI).to.be.equal(newURL);
            
            const baseURL = await nftToken.baseURI();
            expect(baseURL).to.be.equal(newURL);
        });
        
    });
});
