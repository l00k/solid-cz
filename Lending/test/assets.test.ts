import { TokenMock } from '@/TokenMock';
import {
    LendingProtocol,
    PriceFeedChangedEvent,
    SupportedAssetAddedEvent
} from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { assertEvent, assertIsAvailableOnlyForOwner, createTokenMock, deployContract, txExec } from './helpers/utils';


const UPDATED_PRICEFEED_ADDRESS = '0x6Df09E975c830ECae5bd4eD9d90f3A95a4f88012';

const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
const WBTC_PRICEFEED_ADDRESS = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';


describe('Assets component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    
    let mainContract : LendingProtocol;
    let smplToken : TokenMock;
    let priceFeedContract : PriceFeedMock;
    
    
    async function pushNewPriceIntoFeed (
        priceFeedContract : PriceFeedMock,
        price : BigNumber
    )
    {
        return priceFeedContract
            .pushRoundData({
                answer: price,
                roundId: 0,
                answeredInRound: 0,
                startedAt: 0,
                updatedAt: 0,
            });
    }
    
    
    before(async() => {
        [ owner, alice ] = await ethers.getSigners();
    });
    
    beforeEach(async() => {
        mainContract = await deployContract('LendingProtocol');
        
        // create sample tokens
        smplToken = await createTokenMock('Sample', 'SMPL');
        
        // create price feeds
        priceFeedContract = await deployContract('PriceFeedMock');
        
        await txExec(
            priceFeedContract.setDecimals(8)
        );
    });
    
    
    describe('Initial state', () => {
        it('Should return empty assets list', async() => {
            expect(
                await mainContract.getSupportedTokens()
            ).to.be.eql([]);
        });
    });
    
    
    describe('For not supported token', () => {
        it('Should return token is not supported', async() => {
            expect(
                await mainContract.isTokenSupported(smplToken.address)
            ).to.be.eql(false);
        });
        
        it('getPriceFeed() should revert', async() => {
            expect(
                mainContract.getPriceFeed(smplToken.address)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTokenPrice() should revert', async() => {
            expect(
                mainContract.getTokenPrice(smplToken.address)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setPriceFeed() should revert', async() => {
            expect(
                mainContract
                    .connect(owner)
                    .setPriceFeed(
                        smplToken.address,
                        priceFeedContract.address
                    )
            ).to.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('Adding new assets', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .addSupportedAsset(
                        smplToken.address,
                        priceFeedContract.address
                    );
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .addSupportedAsset(
                        smplToken.address,
                        priceFeedContract.address
                    )
            );
            
            await assertEvent<SupportedAssetAddedEvent>(result, 'SupportedAssetAdded', {
                token: smplToken.address
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .addSupportedAsset(
                            smplToken.address,
                            priceFeedContract.address
                        )
                );
            });
            
            it('Should return new item in getter', async() => {
                expect(
                    await mainContract.getSupportedTokens()
                ).to.include(smplToken.address);
            });
            
            it('Should return token is supported', async() => {
                expect(
                    await mainContract.isTokenSupported(smplToken.address)
                ).to.be.eql(true);
            });
            
            it('Should return price feed by token', async() => {
                expect(
                    await mainContract.getPriceFeed(smplToken.address)
                ).to.be.equal(priceFeedContract.address);
            });
        });
    });
    
    
    describe('With assets added', () => {
        beforeEach(async() => {
            // add supported assets
            await txExec(
                mainContract
                    .connect(owner)
                    .addSupportedAsset(
                        smplToken.address,
                        priceFeedContract.address
                    )
            );
        });
        
        it('Should not allow to add already supported token asset', async() => {
            expect(
                mainContract
                    .connect(owner)
                    .addSupportedAsset(
                        smplToken.address,
                        priceFeedContract.address
                    )
            ).to.be.revertedWith('TokenIsAlreadySupported()');
        });
        
        
        describe('Price fetching', () => {
            beforeEach(async() => {
                await txExec(
                    pushNewPriceIntoFeed(priceFeedContract, ethers.utils.parseUnits('25', 8))
                );
            });
            
            it('Should return token price', async() => {
                expect(
                    await mainContract.getTokenPrice(smplToken.address)
                ).to.be.equal(ethers.utils.parseUnits('25', 8));
            });
        });
        
        
        describe('Updating existing asset price feed', () => {
            it('Should allow to execute only by owner', async() => {
                await assertIsAvailableOnlyForOwner(async(account) => {
                    return mainContract
                        .connect(account)
                        .setPriceFeed(
                            smplToken.address,
                            UPDATED_PRICEFEED_ADDRESS
                        );
                });
            });
            
            it('Should emit event', async() => {
                const [ tx, result ] = await txExec(
                    mainContract
                        .connect(owner)
                        .setPriceFeed(
                            smplToken.address,
                            UPDATED_PRICEFEED_ADDRESS
                        )
                );
                
                await assertEvent<PriceFeedChangedEvent>(result, 'PriceFeedChanged', {
                    token: smplToken.address,
                    priceFeed: UPDATED_PRICEFEED_ADDRESS
                });
            });
            
            describe('successfully', () => {
                beforeEach(async() => {
                    await txExec(
                        mainContract
                            .connect(owner)
                            .setPriceFeed(
                                smplToken.address,
                                UPDATED_PRICEFEED_ADDRESS
                            )
                    );
                });
                
                it('Should return updated item in getter', async() => {
                    expect(
                        await mainContract.getPriceFeed(smplToken.address)
                    ).to.be.equal(UPDATED_PRICEFEED_ADDRESS);
                });
            });
        });
        
    });
    
});
