import { TokenMock } from '@/TokenMock';
import { LendingProtocol, LoanInterestChangedEvent, PlatformCommissionChangedEvent } from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { ContractReceipt } from '@ethersproject/contracts/src.ts/index';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import { assertEvent, assertIsAvailableOnlyForOwner, createTokenMock, deployContract, txExec } from './helpers/utils';


const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';


describe('Interest component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    
    let mainContract : LendingProtocol;
    
    let smplToken0 : TokenMock;
    let smplToken1 : TokenMock;
    let smplToken2 : TokenMock;
    let smplToken3 : TokenMock;
    
    let priceFeedContract0 : PriceFeedMock;
    let priceFeedContract1 : PriceFeedMock;
    let priceFeedContract2 : PriceFeedMock;
    let priceFeedContract3 : PriceFeedMock;
    
    
    async function deposit (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    )
    {
        // approve amount before depositing
        await txExec(
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                )
        );
        
        return mainContract
            .connect(account)
            .deposit(
                tokenContract.address,
                amount
            );
    }
    
    async function repay (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    ) : Promise<ContractTransaction>
    {
        // approve amount before repaying
        await txExec(
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                )
        );
        
        return mainContract
            .connect(account)
            .repay(
                tokenContract.address,
                amount
            );
    }
    
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
    
    async function setupToken (
        name : string,
        symbol : string,
        initialPrice : BigNumber,
        collateralFactor : number = 5e5,
        borrowableFraction : number = 5e5
    ) : Promise<[ TokenMock, PriceFeedMock ]>
    {
        const token : TokenMock = await createTokenMock(name, symbol);
        
        const priceFeedContract : PriceFeedMock = await deployContract('PriceFeedMock');
        await txExec(
            priceFeedContract.setDecimals(8)
        );
        await txExec(
            pushNewPriceIntoFeed(priceFeedContract, initialPrice)
        );
        
        await txExec(
            mainContract.connect(owner).addSupportedAsset(token.address, priceFeedContract.address, true)
        );
        
        await txExec(
            mainContract.connect(owner).setTokenCollateralFactor(token.address, collateralFactor)
        );
        
        await txExec(
            mainContract.connect(owner).setTokenBorrowableFraction(token.address, borrowableFraction)
        );
        
        return [
            token,
            priceFeedContract
        ];
    }
    
    
    before(async() => {
        [ owner, alice, bob, carol ] = await ethers.getSigners();
    });
    
    beforeEach(async() => {
        mainContract = await deployContract('LendingProtocol');
        
        // create price feed
        [ smplToken0, priceFeedContract0 ] = await setupToken(
            'Sample0',
            'SMPL0',
            ethers.utils.parseUnits('10', 8)
        );
        
        [ smplToken1, priceFeedContract1 ] = await setupToken(
            'Sample1',
            'SMPL1',
            ethers.utils.parseUnits('25', 8)
        );
        
        [ smplToken2, priceFeedContract2 ] = await setupToken(
            'Sample1',
            'SMPL1',
            ethers.utils.parseUnits('10', 8)
        );
        
        [ smplToken3, priceFeedContract3 ] = await setupToken(
            'Sample2',
            'SMPL2',
            ethers.utils.parseUnits('10', 8)
        );
        
        // provide liquidity
        await txExec(
            deposit(bob, smplToken1, ethers.utils.parseUnits('1000', 18))
        );
        
        await txExec(
            deposit(carol, smplToken2, ethers.utils.parseUnits('1000', 18))
        );
        
        await txExec(
            deposit(carol, smplToken3, ethers.utils.parseUnits('1000', 18))
        );
        
        // others
        await txExec(
            mainContract
                .connect(owner)
                .setLiquidationIncentive(1e5)
        );
    });
    
    
    describe('Initial state', () => {
        it('Should return proper loan interest', async() => {
            const baseInterest = await mainContract.getTokenBaseLoanInterest(smplToken1.address);
            expect(baseInterest.min).to.be.equal(0);
            expect(baseInterest.max).to.be.equal(0);
        });
        
        it('Should return proper platform commission', async() => {
            const amount = await mainContract.getTokenPlatformCommission(smplToken1.address);
            expect(amount).to.be.equal(0);
        });
    });
    
    
    describe('For not supported token', () => {
        it('getTokenBaseLoanInterest() should revert', async() => {
            const query = mainContract.getTokenBaseLoanInterest(WBTC_ADDRESS);
            await expect(query).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenPlatformCommission() should revert', async() => {
            const query = mainContract.getTokenPlatformCommission(WBTC_ADDRESS);
            await expect(query).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenBaseLoanInterest() should revert', async() => {
            const tx = mainContract
                .connect(owner)
                .setTokenBaseLoanInterest(
                    WBTC_ADDRESS,
                    { min: 1e4, max: 1e5 }
                );
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenBaseLoanInterest() should revert', async() => {
            const tx = mainContract
                .connect(owner)
                .setTokenPlatformCommission(
                    WBTC_ADDRESS,
                    2e5
                );
            await expect(tx).to.be.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('Changing loan interest', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setTokenBaseLoanInterest(
                        smplToken1.address,
                        { min: 1e4, max: 1e5 }
                    );
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setTokenBaseLoanInterest(
                        smplToken1.address,
                        { min: 1e4, max: 1e5 }
                    )
            );
            
            await assertEvent<LoanInterestChangedEvent>(result, 'LoanInterestChanged', {
                minInterest: 1e4,
                maxInterest: 1e5,
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenBaseLoanInterest(
                            smplToken1.address,
                            { min: 1e4, max: 1e5 }
                        )
                );
            });
            
            it('Should update state', async() => {
                const baseInterest = await mainContract.getTokenBaseLoanInterest(smplToken1.address);
                expect(baseInterest.min).to.be.equal(1e4);
                expect(baseInterest.max).to.be.equal(1e5);
            });
        });
    });
    
    
    describe('Changing platform commission', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setTokenPlatformCommission(smplToken1.address, 2e5);
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setTokenPlatformCommission(smplToken1.address, 2e5)
            );
            
            await assertEvent<PlatformCommissionChangedEvent>(result, 'PlatformCommissionChanged', {
                fraction: 2e5,
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenPlatformCommission(smplToken1.address, 2e5)
                );
            });
            
            it('Should update state', async() => {
                const fraction = await mainContract.getTokenPlatformCommission(smplToken1.address);
                expect(fraction).to.be.equal(2e5);
            });
        });
    });
    
    
    describe('with loan interest and platform commission configured', () => {
        beforeEach(async() => {
            const tokens = [ smplToken0, smplToken1, smplToken2, smplToken3 ];
            for (const token of tokens) {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenBaseLoanInterest(
                            token.address,
                            { min: 1e4, max: 1e5 }
                        )
                );
                
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenPlatformCommission(token.address, 2e5)
                );
            }
        });
        
        // with loan interest and platform commission configured
        describe('with liquidity provided by Alice', () => {
            beforeEach(async() => {
                await txExec(
                    deposit(
                        alice,
                        smplToken1,
                        ethers.utils.parseUnits('40', 18)
                    )
                );
                
                await txExec(
                    deposit(
                        alice,
                        smplToken2,
                        ethers.utils.parseUnits('50', 18)
                    )
                );
                
                await txExec(
                    deposit(
                        alice,
                        smplToken3,
                        ethers.utils.parseUnits('50', 18)
                    )
                );
            });
            
            
            // with loan interest and platform commission configured
            // with liquidity provided by Alice
            describe('with Alice borrowed one asset', () => {
                beforeEach(async() => {
                    await txExec(
                        mainContract
                            .connect(alice)
                            .borrow(
                                smplToken2.address,
                                ethers.utils.parseUnits('30', 18)
                            )
                    );
                });
                
                
                // ################
                
                // with loan interest and platform commission configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with collateral asset price drop (liquidation of part of deposit)', () => {
                    beforeEach(async() => {
                        await pushNewPriceIntoFeed(
                            priceFeedContract1,
                            ethers.utils.parseUnits('1', 8)
                        );
                        
                        await pushNewPriceIntoFeed(
                            priceFeedContract3,
                            ethers.utils.parseUnits('1', 8)
                        );
                    });
                    
                    
                    // ################
                    
                    
                    describe('liquidating', () => {
                        let tx : ContractTransaction;
                        let result : ContractReceipt;
                        
                        beforeEach(async() => {
                            [ tx, result ] = await txExec(
                                mainContract
                                    .connect(owner)
                                    .liquidate(alice.address)
                            );
                        });
                        
                        
                        // ################
                    });
                });
                
                
                // with loan interest and platform commission configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with collateral asset price drop (liquidation of entire deposit)', () => {
                    beforeEach(async() => {
                        // first withdraw deposit
                        await txExec(
                            mainContract
                                .connect(alice)
                                .withdraw(
                                    smplToken2.address,
                                    ethers.utils.parseUnits('49', 18)
                                )
                        );
                        
                        await pushNewPriceIntoFeed(
                            priceFeedContract1,
                            ethers.utils.parseUnits('1', 8)
                        );
                        
                        await pushNewPriceIntoFeed(
                            priceFeedContract3,
                            ethers.utils.parseUnits('1', 8)
                        );
                    });
                    
                    
                    // ################
                    
                    
                    describe('liquidating', () => {
                        let tx : ContractTransaction;
                        let result : ContractReceipt;
                        
                        beforeEach(async() => {
                            [ tx, result ] = await txExec(
                                mainContract
                                    .connect(owner)
                                    .liquidate(alice.address)
                            );
                        });
                        
                        
                        
                        // ################
                    });
                });
                
                
                // with loan interest and platform commission configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with borrowed asset price increase', () => {
                    beforeEach(async() => {
                        await pushNewPriceIntoFeed(
                            priceFeedContract2,
                            ethers.utils.parseUnits('100', 8)
                        );
                    });
                    
                    
                    // ################
                    
                    
                    describe('liquidating', () => {
                        // ################
                    });
                });
                
                
                // with loan interest and platform commission configured
                // with liquidity provided by Alice
                // with Alice borrowed one asset
                describe('with Alice borrowed second asset', () => {
                    beforeEach(async() => {
                        await txExec(
                            mainContract
                                .connect(alice)
                                .borrow(
                                    smplToken3.address,
                                    ethers.utils.parseUnits('50', 18)
                                )
                        );
                    });
                    
                    
                    // ################
                    
                    
                    // with loan interest and platform commission configured
                    // with liquidity provided by Alice
                    // with Alice borrowed one asset
                    // with Alice borrowed second asset
                    describe('with collateral asset price drop', () => {
                        beforeEach(async() => {
                            await pushNewPriceIntoFeed(
                                priceFeedContract1,
                                ethers.utils.parseUnits('10', 8)
                            );
                        });
                        
                        
                        // ################
                        
                        
                        describe('liquidating', () => {
                            let tx : ContractTransaction;
                            let result : ContractReceipt;
                            
                            beforeEach(async() => {
                                [ tx, result ] = await txExec(
                                    mainContract
                                        .connect(owner)
                                        .liquidate(alice.address)
                                );
                            });
                            
                            
                            // ################
                        });
                    });
                });
                
            });
        });
    });
});
