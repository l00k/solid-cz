import {
    MintedForSaleEvent,
    PaymentsClaimedEvent,
    PriceChangedEvent,
    SampleToken,
    SoldEvent,
    TransferEvent
} from '@/SampleToken';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import {
    assertErrorMessage,
    assertEtherBalanceChange,
    assertEvent,
    assertIsAvailableOnlyForOwner,
    findEvent,
    txExec
} from '../helpers/utils';
import { TestContext } from './TestContext';


const zeroAddress = '0x0000000000000000000000000000000000000000';


describe('Sale', async() => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    
    let testContext : TestContext;
    let nftToken : SampleToken;
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        nftToken = await testContext.initNftTokenContract();
        
        [ owner, alice, bob, carol ] = await ethers.getSigners();
        
        await testContext.createTokens(3);
    });
    
    
    describe('Non existing token', async() => {
        const tokenId = BigNumber.from(100);
    
        it('Should throw errors when checking for sale', async() => {
            const query = nftToken.isForSale(tokenId);
            await assertErrorMessage(query, 'TokenNotExist()');
        });
        
        it('Should throw when checking prices', async() => {
            const query = nftToken.tokenPrice(tokenId);
            await assertErrorMessage(query, 'TokenNotExist()');
        });
        
        describe('Change token price', async() => {
            it('Should throw errors when trying to change price', async() => {
                const tx = nftToken
                    .connect(owner)
                    .setTokenPrice(
                        tokenId,
                        ethers.utils.parseEther('2.0')
                    );
                await assertErrorMessage(tx, 'TokenNotExist()');
            });
        });
        
        describe('Buying tokens', async() => {
            it('Should be for a sale', async() => {
                const tx = nftToken
                    .connect(alice)
                    .buy(tokenId);
                await assertErrorMessage(tx, 'TokenNotExist()');
            });
        });
    });
    
    describe('With tokens not for sale', async() => {
        const tokenId = BigNumber.from(0);
        
        it('Should not be for a sale', async() => {
            const isForSale = await nftToken.isForSale(tokenId);
            expect(isForSale).to.be.equal(false);
        });
        
        it('Should throw when checking prices', async() => {
            const query = nftToken.tokenPrice(tokenId);
            await assertErrorMessage(query, 'TokenNotForSale()');
        });
        
        describe('Change token price', async() => {
            it('Should throw errors when trying to change price', async() => {
                const tx = nftToken
                    .connect(owner)
                    .setTokenPrice(
                        tokenId,
                        ethers.utils.parseEther('2.0')
                    );
                await assertErrorMessage(tx, 'TokenNotForSale()');
            });
        });
        
        describe('Buying tokens', async() => {
            it('Should be for a sale', async() => {
                const tx = nftToken
                    .connect(alice)
                    .buy(tokenId);
                await assertErrorMessage(tx, 'TokenNotForSale()');
            });
        });
    });
    
    describe('Minting for sale', async() => {
        it('Should allow only owner to mint tokens for sale', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return nftToken
                    .connect(account)
                    .mintForSale(
                        ethers.utils.parseEther('1.0'),
                        {
                            name: 'Test',
                            features: 0x12345678,
                            createdAt: 0,
                        }
                    );
            });
        });
        
        it('Should emit event', async() => {
            const [tx, result] = await txExec(
                nftToken
                    .connect(owner)
                    .mintForSale(
                        ethers.utils.parseEther('1.0'),
                        {
                            name: 'Test',
                            features: 0x12345678,
                            createdAt: 0,
                        }
                    )
            );
            
            assertEvent<MintedForSaleEvent>(result, 'MintedForSale', {
                tokenId: BigNumber.from(3),
                price: ethers.utils.parseEther('1.0'),
            });
        });
    });
    
    describe('With minted tokens for sale', async() => {
        let tokenId : BigNumber;
    
        beforeEach(async() => {
            const [tx, result] = await txExec(
                nftToken
                    .connect(owner)
                    .mintForSale(
                        ethers.utils.parseEther('1.0'),
                        {
                            name: 'Test',
                            features: 0x12345678,
                            createdAt: 0,
                        }
                    )
            );
            
            const event : MintedForSaleEvent = findEvent(result, 'MintedForSale');
            tokenId = event.args.tokenId;
        });
        
        it('Should be for a sale', async() => {
            const isForSale = await nftToken.isForSale(tokenId);
            expect(isForSale).to.be.equal(true);
        });
        
        it('Should have proper price', async() => {
            const price = await nftToken.tokenPrice(tokenId);
            expect(price).to.be.equal(ethers.utils.parseEther('1.0'));
        });
        
        describe('Change token price', async() => {
            it('Should be able to execute only by owner', async() => {
                await assertIsAvailableOnlyForOwner(async(account) => {
                    return nftToken
                        .connect(account)
                        .setTokenPrice(
                            tokenId,
                            ethers.utils.parseEther('2.0')
                        );
                });
            });
            
            it('Emits event', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(owner)
                        .setTokenPrice(
                            tokenId,
                            ethers.utils.parseEther('2.0')
                        )
                );
                
                assertEvent<PriceChangedEvent>(result, 'PriceChanged', {
                    tokenId,
                    newPrice: ethers.utils.parseEther('2.0'),
                })
            });
        });
        
        describe('With price changed', async() => {
            beforeEach(async() => {
                await txExec(
                    nftToken
                        .connect(owner)
                        .setTokenPrice(
                            tokenId,
                            ethers.utils.parseEther('2.0')
                        )
                );
            });
            
            it('Should be for a sale', async() => {
                const isForSale = await nftToken.isForSale(tokenId);
                expect(isForSale).to.be.equal(true);
            });
            
            it('Should have proper price', async() => {
                const price = await nftToken.tokenPrice(tokenId);
                expect(price).to.be.equal(ethers.utils.parseEther('2.0'));
            });
        });
        
        
        describe('Buying tokens', async() => {
            it('Should verify proper tx value', async() => {
                const tx = nftToken
                    .connect(alice)
                    .buy(tokenId, { value: ethers.utils.parseEther('1.5') });
                await assertErrorMessage(tx, `WrongAmountPaid(${ethers.utils.parseEther('1.0')}, ${ethers.utils.parseEther('1.5')})`);
            });
            
            it('Should emit Sold event', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(alice)
                        .buy(tokenId, { value: ethers.utils.parseEther('1.0') })
                );
                
                assertEvent<SoldEvent>(result, 'Sold', {
                    tokenId,
                    to: alice.address,
                    price: ethers.utils.parseEther('1.0')
                })
            });
            
            it('Should emit Transfer event', async() => {
                const [tx, result] = await txExec(
                    nftToken
                        .connect(alice)
                        .buy(tokenId, { value: ethers.utils.parseEther('1.0') })
                );
                
                assertEvent<TransferEvent>(result, 'Transfer', {
                    from: nftToken.address,
                    to: alice.address,
                    tokenId,
                })
            });
            
            it('Should transfer funds', async() => {
                await assertEtherBalanceChange(async() => {
                    const [tx, result] = await txExec(
                        nftToken
                            .connect(alice)
                            .buy(tokenId, { value: ethers.utils.parseEther('1.0') })
                    );
                    
                    return {
                        [alice.address]: result.gasUsed.mul(result.effectiveGasPrice),
                    }
                }, {
                    [nftToken.address]: ethers.utils.parseEther('1.0'),
                    [alice.address]: ethers.utils.parseEther('-1.0'),
                })
            });
        });
        
        describe('With bought token', async() => {
            beforeEach(async() => {
                await txExec(
                    nftToken
                        .connect(alice)
                        .buy(tokenId, { value: ethers.utils.parseEther('1.0') })
                );
            });
            
            it('Should not be for a sale anymore', async() => {
                const isForSale = await nftToken.isForSale(tokenId);
                expect(isForSale).to.be.equal(false);
            });
            
            it('Should throw when checking prices', async() => {
                const query = nftToken.tokenPrice(tokenId);
                await assertErrorMessage(query, 'TokenNotForSale()');
            });
            
            it('Should should have proper owner', async() => {
                const owner = await nftToken.ownerOf(tokenId);
                expect(owner).to.be.equal(alice.address);
            });
            
            
            describe('Claiming payments', async() => {
                it('Should be able to execute only by owner', async() => {
                    await assertIsAvailableOnlyForOwner(async(account) => {
                        return nftToken
                            .connect(account)
                            .claimPayments(owner.address);
                    });
                });
                
                it('Should emit PaymentsClaimed event', async() => {
                    const [tx, result] = await txExec(
                        nftToken
                            .connect(owner)
                            .claimPayments(owner.address)
                    );
                    
                    assertEvent<PaymentsClaimedEvent>(result, 'PaymentsClaimed', {
                        target: owner.address,
                        value: ethers.utils.parseEther('1.0'),
                    })
                });
                
                it('Should properly transfer funds', async() => {
                    await assertEtherBalanceChange(async() => {
                        const [tx, result] = await txExec(
                            nftToken
                                .connect(owner)
                                .claimPayments(owner.address)
                        );
                        
                        return {
                            [owner.address]: result.gasUsed.mul(result.effectiveGasPrice),
                        }
                    }, {
                        [nftToken.address]: ethers.utils.parseEther('-1.0'),
                        [owner.address]: ethers.utils.parseEther('1.0'),
                    })
                });
                
                
            });
        });
        
    });
    
});
