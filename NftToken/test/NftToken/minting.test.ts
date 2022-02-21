import { MintedEvent, SampleToken } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { TestContext } from './TestContext';


describe('Minting', async() => {
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
    
    
    it('Should allow to execute mint only by owner', async() => {
        await assertIsAvailableOnlyForOwner(async(account) => {
            return nftToken
                .connect(account)
                .mint(
                    alice.address,
                    {
                        name: 'Test',
                        features: 0x12345678,
                        createdAt: 0,
                    }
                );
        });
    });
    
    it('Should allow to execute safeMint only by owner', async() => {
        await assertIsAvailableOnlyForOwner(async(account) => {
            return nftToken
                .connect(account)
                .safeMint(
                    alice.address,
                    {
                        name: 'Test',
                        features: 0x12345678,
                        createdAt: 0,
                    }
                );
        });
    });
    
    it('Should properly mint token', async() => {
        for (let i = 0; i < 3; ++i) {
            // mint
            const [ tx, result ] = await txExec(
                nftToken
                    .connect(owner)
                    .safeMint(
                        alice.address,
                        {
                            name: `Test ${i}`,
                            features: 0x12345678,
                            createdAt: 0,
                        }
                    )
            );
            
            const lastBlock = await ethers.provider.getBlock('latest');
            
            const event : MintedEvent = findEvent(result, 'Minted');
            expect(event.args.to).to.be.equal(alice.address);
            expect(event.args.tokenId).to.be.equal(i);
            
            // verify token ownership
            const tokenOwner = await nftToken.ownerOf(i);
            expect(tokenOwner).to.be.equal(alice.address);
            
            // verify token data
            const token = await nftToken.tokens(i);
            expect(token.name).to.be.equal(`Test ${i}`);
            expect(token.features).to.be.equal(0x12345678);
            expect(token.createdAt).to.be.equal(lastBlock.timestamp);
        }
    });
    
    it('Should increase balance', async() => {
        for (let i = 0; i < 3; ++i) {
            // check before
            {
                const balance = await nftToken.balanceOf(alice.address);
                expect(balance).to.be.equal(i);
                
                const totalSupply = await nftToken.totalSupply();
                expect(totalSupply).to.be.equal(i);
                
                const exists = await nftToken.exists(i);
                expect(exists).to.be.equal(false);
            }
            
            // mint
            const [ tx, result ] = await txExec(
                nftToken
                    .connect(owner)
                    .safeMint(
                        alice.address,
                        {
                            name: `Test ${i}`,
                            features: 0x12345678,
                            createdAt: 0,
                        }
                    )
            );
            
            // check balance after
            {
                const balance = await nftToken.balanceOf(alice.address);
                expect(balance).to.be.equal(i + 1);
                
                const totalSupply = await nftToken.totalSupply();
                expect(totalSupply).to.be.equal(i + 1);
                
                const exists = await nftToken.exists(i);
                expect(exists).to.be.equal(true);
            }
        }
    });
    
});
