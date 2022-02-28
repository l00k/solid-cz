import { BurnedEvent, MintedEvent, SampleToken, TransferEvent } from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, txExec } from '../helpers/utils';
import { AccountState, TestContext } from './TestContext';


const zeroAddress = '0x0000000000000000000000000000000000000000';


describe('Enumeration', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    
    let testContext : TestContext;
    let nftToken : SampleToken;
    
    
    async function checkGlobalList(tokenList : Set<number>)
    {
        const balance = (await nftToken.totalSupply()).toNumber();
        expect(balance).to.be.equal(tokenList.size);
        
        for (let idx = 0; idx < balance; ++idx) {
            const tokenId = await nftToken.tokenByIndex(idx);
            expect(tokenList.has(tokenId.toNumber())).to.be.true;
            
            tokenList.delete(tokenId.toNumber());
        }
        
        expect(tokenList.size).to.be.equal(0);
    }
    
    async function checkAccountList(address : string, tokenList : Set<number>)
    {
        const balance = (await nftToken.balanceOf(address)).toNumber();
        expect(balance).to.be.equal(tokenList.size);
        
        for (let idx = 0; idx < balance; ++idx) {
            const tokenId = await nftToken.tokenOfOwnerByIndex(address, idx);
            
            expect(tokenList.has(tokenId.toNumber())).to.be.true;
            
            tokenList.delete(tokenId.toNumber());
        }
        
        expect(tokenList.size).to.be.equal(0);
    }
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        nftToken = await testContext.initNftTokenContract();
        
        [ owner, alice, bob, carol ] = await ethers.getSigners();
    });
    
    
    describe('Without tokens', async() => {
        it('Returns proper totalSupply', async() => {
            const totalSupply = await nftToken.totalSupply();
            expect(totalSupply).to.be.equal(0);
        });
        
        it('Return proper error when out of bound global list', async() => {
            const query = nftToken.tokenByIndex(1);
            await assertErrorMessage(query, `IndexOutOfBound(${0})`);
        });
        
        it('Return proper error when out of bound account list', async() => {
            const query = nftToken.tokenOfOwnerByIndex(owner.address, 1);
            await assertErrorMessage(query, `IndexOutOfBound(${0})`);
        });
    });
    
    
    describe('With minted tokens', async() => {
        beforeEach(async() => {
            await testContext.createTokens(5);
        });
    
        it('Returns proper totalSupply', async() => {
            const totalSupply = await nftToken.totalSupply();
            expect(totalSupply).to.be.equal(5);
        });
    
        it('Properly iterates though global list', async() => {
            await checkGlobalList(new Set([ 0, 1, 2, 3, 4 ]));
        });
    
        it('Properly iterates though account list', async() => {
            await checkAccountList(owner.address, new Set([ 0, 1, 2, 3, 4 ]));
        });
        
        
        describe('Sending to itself', async() => {
            beforeEach(async() => {
                await txExec(
                    nftToken
                        .connect(owner)
                        ['safeTransferFrom(address,address,uint256)'](
                            owner.address,
                            owner.address,
                            0
                        )
                );
            });
            
            it('Returns proper totalSupply', async() => {
                const totalSupply = await nftToken.totalSupply();
                expect(totalSupply).to.be.equal(5);
            });
        
            it('Properly iterates though global list', async() => {
                await checkGlobalList(new Set([ 0, 1, 2, 3, 4 ]));
            });
        
            it('Properly iterates though account list', async() => {
                await checkAccountList(owner.address, new Set([ 0, 1, 2, 3, 4 ]));
            });
        });
        
        for (const id of [ 0, 4 ]) {
            describe(`Sending (#${id}) to someone else`, async() => {
                beforeEach(async() => {
                    await txExec(
                        nftToken
                            .connect(owner)
                            ['safeTransferFrom(address,address,uint256)'](
                                owner.address,
                                alice.address,
                                id
                            )
                    );
                });
                
                it('Returns proper totalSupply', async() => {
                    const totalSupply = await nftToken.totalSupply();
                    expect(totalSupply).to.be.equal(5);
                });
            
                it('Properly iterates though global list', async() => {
                    await checkGlobalList(new Set([ 0, 1, 2, 3, 4 ]));
                });
            
                it('Properly iterates though account list', async() => {
                    {
                        const tokenList = new Set([ 0, 1, 2, 3, 4 ]);
                        tokenList.delete(id);
                        await checkAccountList(owner.address, tokenList);
                    }
                    
                    {
                        const tokenList = new Set([ id ]);
                        await checkAccountList(alice.address, tokenList);
                    }
                });
            });
        }
        
        for (const id of [ 0, 4 ]) {
            describe(`Burning (#${id})`, async() => {
                beforeEach(async() => {
                    await txExec(
                        nftToken
                            .connect(owner)
                            .burn(id)
                    );
                });
                
                it('Returns proper totalSupply', async() => {
                    const totalSupply = await nftToken.totalSupply();
                    expect(totalSupply).to.be.equal(4);
                });
            
                it('Properly iterates though global list', async() => {
                    const tokenList = new Set([ 0, 1, 2, 3, 4 ]);
                    tokenList.delete(id);
                    await checkGlobalList(tokenList);
                });
            
                it('Properly iterates though account list', async() => {
                    const tokenList = new Set([ 0, 1, 2, 3, 4 ]);
                    tokenList.delete(id);
                    await checkAccountList(owner.address, tokenList);
                });
            });
        }
    });
    
});
