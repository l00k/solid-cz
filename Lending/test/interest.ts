import { LoanInterestConfigChangedEvent } from '@/Interest';
import { LendingProtocol } from '@/LendingProtocol';
import { PriceFeedMock } from '@/PriceFeedMock';
import { SwapProviderMock } from '@/SwapProviderMock';
import { TokenMock } from '@/TokenMock';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import {
    assertEvent,
    assertIsAvailableOnlyForOwner,
    createTokenMock,
    deployContract,
    executeInSingleBlock,
    txExec
} from './helpers/utils';


const WBTC_ADDRESS = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';


describe('Interest component', () => {
    let owner : SignerWithAddress;
    let alice : SignerWithAddress;
    let bob : SignerWithAddress;
    let carol : SignerWithAddress;
    let dave : SignerWithAddress;
    
    let mainContract : LendingProtocol;
    
    let smplToken0 : TokenMock;
    let smplToken1 : TokenMock;
    let smplToken2 : TokenMock;
    let smplToken3 : TokenMock;
    
    let priceFeedContract0 : PriceFeedMock;
    let priceFeedContract1 : PriceFeedMock;
    let priceFeedContract2 : PriceFeedMock;
    let priceFeedContract3 : PriceFeedMock;
    
    let swapProviderMock : SwapProviderMock;
    
    
    function deposit (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    ) : Promise<ContractTransaction>[]
    {
        return [
            // approve amount before depositing
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                ),
            
            // deposit
            mainContract
                .connect(account)
                .deposit(
                    tokenContract.address,
                    amount
                ),
        ];
    }
    
    function repay (
        account : SignerWithAddress,
        tokenContract : TokenMock,
        amount : BigNumber
    ) : Promise<ContractTransaction>[]
    {
        return [
            // approve amount before repaying
            tokenContract
                .connect(account)
                .approve(
                    mainContract.address,
                    amount
                ),
            // repay
            mainContract
                .connect(account)
                .repay(
                    tokenContract.address,
                    amount
                ),
        ];
    }
    
    async function pushNewPriceIntoFeed (
        priceFeedContract : PriceFeedMock,
        price : BigNumber
    ) : Promise<ContractTransaction>
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
        collateralFactor : number = 5e7,
        borrowableFraction : number = 5e7
    ) : Promise<[ TokenMock, PriceFeedMock ]>
    {
        const token : TokenMock = await createTokenMock(name, symbol);
        const priceFeedContract : PriceFeedMock = await deployContract('PriceFeedMock');
        
        await executeInSingleBlock(async() => [
            priceFeedContract.setDecimals(8),
            pushNewPriceIntoFeed(priceFeedContract, initialPrice),
            mainContract.connect(owner).addSupportedAsset(token.address, priceFeedContract.address),
            mainContract.connect(owner).setTokenCollateralFactor(token.address, collateralFactor)
        ]);
        
        return [
            token,
            priceFeedContract
        ];
    }
    
    
    before(async() => {
        [ owner, alice, bob, carol, dave ] = await ethers.getSigners();
    });
    
    beforeEach(async() => {
        mainContract = await deployContract('LendingProtocol');
        
        // create price feed
        [ smplToken0, priceFeedContract0 ] = await setupToken(
            'Sample0',
            'SMPL0',
            ethers.utils.parseUnits('100', 8)
        );
        
        [ smplToken1, priceFeedContract1 ] = await setupToken(
            'Sample1',
            'SMPL1',
            ethers.utils.parseUnits('25', 8)
        );
        
        [ smplToken2, priceFeedContract2 ] = await setupToken(
            'Sample2',
            'SMPL2',
            ethers.utils.parseUnits('10', 8)
        );
        
        [ smplToken3, priceFeedContract3 ] = await setupToken(
            'Sample3',
            'SMPL3',
            ethers.utils.parseUnits('10', 8)
        );
        
        await executeInSingleBlock(async() => [
            mainContract.connect(owner).setLiquidationIncentive(1e7),
            
            mainContract.connect(owner).setTokenPlatformCommission(smplToken0.address, 0),
            mainContract.connect(owner).setTokenPlatformCommission(smplToken1.address, 10e6),
            mainContract.connect(owner).setTokenPlatformCommission(smplToken2.address, 15e6),
            mainContract.connect(owner).setTokenPlatformCommission(smplToken3.address, 20e6),
        ]);
        
        await executeInSingleBlock(async() => [
            ...deposit(bob, smplToken1, ethers.utils.parseUnits('1000', 18)),
            ...deposit(bob, smplToken2, ethers.utils.parseUnits('500', 18)),
            
            ...deposit(carol, smplToken1, ethers.utils.parseUnits('600', 18)),
            ...deposit(carol, smplToken2, ethers.utils.parseUnits('500', 18)),
            ...deposit(carol, smplToken3, ethers.utils.parseUnits('250', 18)),
            
            ...deposit(alice, smplToken0, ethers.utils.parseUnits('1000', 18)),
        ]);
    });
    
    
    describe('Initial state', () => {
        it('Should return proper loan interest config', async() => {
            expect(
                await mainContract.getTokenLoanInterestConfig(smplToken1.address)
            ).to.containSubset({
                base: BigNumber.from(0),
                optimalUtilization: BigNumber.from(0),
                slope1: BigNumber.from(0),
                slope2: BigNumber.from(0),
            });
        });
        
        it('Should return proper utilization', async() => {
            expect(
                await mainContract.getTokenUtilization(smplToken1.address)
            ).to.be.equal(0);
        });
        
        it('Should return proper interest rate', async() => {
            expect(
                await mainContract.getTokenInterestRate(smplToken1.address)
            ).to.be.equal(0);
        });
    });
    
    
    describe('For non supported token', () => {
        it('getTokenLoanInterestConfig() should revert', async() => {
            expect(
                mainContract.getTokenLoanInterestConfig(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTokenUtilization() should revert', async() => {
            expect(
                mainContract.getTokenUtilization(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('getTokenInterestRate() should revert', async() => {
            await expect(
                mainContract.getTokenInterestRate(WBTC_ADDRESS)
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
        
        it('setTokenLoanInterestConfig() should revert', async() => {
            expect(
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(
                        WBTC_ADDRESS,
                        {
                            base: 0,
                            optimalUtilization: 25e6,
                            slope1: 10e6,
                            slope2: 100e6,
                        }
                    )
            ).to.be.revertedWith('TokenIsNotSupported()');
        });
    });
    
    
    describe('Changing token loan interest config', () => {
        it('Should allow to execute only by owner', async() => {
            await assertIsAvailableOnlyForOwner(async(account) => {
                return mainContract
                    .connect(account)
                    .setTokenLoanInterestConfig(smplToken1.address, {
                        base: 0,
                        optimalUtilization: 25e6,
                        slope1: 10e6,
                        slope2: 100e6,
                    });
            });
        });
        
        it('Should emit event', async() => {
            const [ tx, result ] = await txExec(
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(smplToken1.address, {
                        base: 0,
                        optimalUtilization: 25e6,
                        slope1: 10e6,
                        slope2: 100e6,
                    })
            );
            
            await assertEvent<LoanInterestConfigChangedEvent>(result, 'LoanInterestConfigChanged', {
                token: smplToken1.address,
                interestConfig: <any>{
                    base: BigNumber.from(0),
                    optimalUtilization: BigNumber.from(25e6),
                    slope1: BigNumber.from(10e6),
                    slope2: BigNumber.from(100e6),
                }
            });
        });
        
        describe('successfully', () => {
            beforeEach(async() => {
                await txExec(
                    mainContract
                        .connect(owner)
                        .setTokenLoanInterestConfig(smplToken1.address, {
                            base: 0,
                            optimalUtilization: 25e6,
                            slope1: 10e6,
                            slope2: 100e6,
                        })
                );
            });
            
            it('Should update state', async() => {
                expect(
                    await mainContract.getTokenLoanInterestConfig(smplToken1.address)
                ).to.containSubset({
                    base: BigNumber.from(0),
                    optimalUtilization: BigNumber.from(25e6),
                    slope1: BigNumber.from(10e6),
                    slope2: BigNumber.from(100e6),
                });
            });
        });
    });
    
    
    describe('with token loan interest configured', () => {
        beforeEach(async() => {
            await executeInSingleBlock(async() => [
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(smplToken1.address, {
                        base: 0,
                        optimalUtilization: 25e6,
                        slope1: 10e6,
                        slope2: 100e6,
                    }),
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(smplToken2.address, {
                        base: 0,
                        optimalUtilization: 25e6,
                        slope1: 20e6,
                        slope2: 150e6,
                    }),
                mainContract
                    .connect(owner)
                    .setTokenLoanInterestConfig(smplToken3.address, {
                        base: 10e6,
                        optimalUtilization: 50e6,
                        slope1: 30e6,
                        slope2: 300e6,
                    }),
            ]);
        });
        
        // deposits
        // (1000 + 600)
        // (500 + 500)
        // (0 + 250)
        
        // with token loan interest configured
        describe('with borrowed assets', () => {
            beforeEach(async() => {
                await executeInSingleBlock(async() => [
                    mainContract
                        .connect(alice)
                        .borrow(
                            smplToken1.address,
                            ethers.utils.parseUnits('200', 18)
                        ),
                    mainContract
                        .connect(alice)
                        .borrow(
                            smplToken2.address,
                            ethers.utils.parseUnits('200', 18)
                        ),
                    mainContract
                        .connect(carol)
                        .borrow(
                            smplToken2.address,
                            ethers.utils.parseUnits('300', 18)
                        ),
                ]);
                await executeInSingleBlock(async() => [
                    mainContract
                        .connect(alice)
                        .borrow(
                            smplToken3.address,
                            ethers.utils.parseUnits('200', 18)
                        ),
                ]);
            });
            
            
            it('Should return proper utilization', async() => {
                // 200 / 1600 = 12.5%
                expect(
                    await mainContract.getTokenUtilization(smplToken1.address)
                ).to.be.equal(12500000);
                // 500 / 1000 = 50%
                expect(
                    await mainContract.getTokenUtilization(smplToken2.address)
                ).to.be.equal(50000000);
                // 200 / 250 = 80%
                expect(
                    await mainContract.getTokenUtilization(smplToken3.address)
                ).to.be.equal(80000000);
            });
            
            it('Should return proper interest rate', async() => {
                // 0% + 10% * (12.5% / 25%) = 5%
                expect(
                    await mainContract.getTokenInterestRate(smplToken1.address)
                ).to.be.equal(5000000);
                // 0% + 20% + [150% * (25% / 75%)] = 70%
                expect(
                    await mainContract.getTokenInterestRate(smplToken2.address)
                ).to.be.equal(70000000);
                // 10% + 30% + [300% * (30% / 50%)] = 220%
                expect(
                    await mainContract.getTokenInterestRate(smplToken3.address)
                ).to.be.equal(220000000);
            });
            
            
            // with token loan interest configured
            // with Alice deposit and borrow
            describe('trigger interest applying on AAA', () => {
                beforeEach(async() => {
                    await executeInSingleBlock(async() => [
                        ...deposit(
                            dave,
                            smplToken1,
                            ethers.utils.parseUnits('100', 18)
                        )
                    ], 31506);
                });
                
                it('Should increase total debit', async() => {
                    // 200 * 5% * 31536 / 31536000 = 0.01
                    expect(
                        await mainContract.getTotalTokenDebit(smplToken1.address)
                    ).to.be.equal(ethers.utils.parseUnits('200.01', 18));
                });
                
                it('Should increase Alice debit', async() => {
                    // 0.01 * (200 / 200) = 0.01
                    expect(
                        await mainContract.getAccountTokenDebit(smplToken1.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('200.01', 18));
                });
                
                it('Should increase total deposit', async() => {
                    // 1600 + 100 + 0.01
                    expect(
                        await mainContract.getTotalTokenDeposit(smplToken1.address)
                    ).to.be.equal(ethers.utils.parseUnits('1700.01', 18));
                });
                
                it('Should increase tresoury deposit', async() => {
                    // 0.01 * 10% = 0.001
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken1.address, mainContract.address)
                    ).to.be.equal(ethers.utils.parseUnits('0.001', 18).sub(1));
                });
                
                it('Should increase deposits of Bob', async() => {
                    // 0.009 * (1000 / 1600) = 0.005625
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken1.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('1000.005625', 18));
                });
                
                it('Should increase deposits of Carol', async() => {
                    // 0.009 * (600 / 1600) = 0.003375
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken1.address, carol.address)
                    ).to.be.equal(ethers.utils.parseUnits('600.003375', 18));
                });
            });
            
            
            // with token loan interest configured
            // with Alice deposit and borrow
            describe('trigger interest applying on BBB', () => {
                beforeEach(async() => {
                    await executeInSingleBlock(async() => [
                        ...deposit(
                            dave,
                            smplToken2,
                            ethers.utils.parseUnits('100', 18)
                        )
                    ], 31506);
                });
                
                it('Should increase total debit', async() => {
                    // 500 * 70% * 31536 / 31536000 = 0.35
                    expect(
                        await mainContract.getTotalTokenDebit(smplToken2.address)
                    ).to.be.equal(ethers.utils.parseUnits('500.35', 18));
                });
                
                it('Should increase Alice debit', async() => {
                    // 0.35 * (200 / 500) = 0.14
                    expect(
                        await mainContract.getAccountTokenDebit(smplToken2.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('200.14', 18));
                });
                
                it('Should increase Carol debit', async() => {
                    // 0.35 * (300 / 500) = 0.21
                    expect(
                        await mainContract.getAccountTokenDebit(smplToken2.address, carol.address)
                    ).to.be.equal(ethers.utils.parseUnits('300.21', 18));
                });
                
                it('Should increase total deposit', async() => {
                    // 1000 + 100 + 0.35
                    expect(
                        await mainContract.getTotalTokenDeposit(smplToken2.address)
                    ).to.be.equal(ethers.utils.parseUnits('1100.35', 18));
                });
                
                it('Should increase tresoury deposit', async() => {
                    // 0.35 * 15% = 0.0525
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken2.address, mainContract.address)
                    ).to.be.equal(ethers.utils.parseUnits('0.0525', 18).sub(1));
                });
                
                it('Should increase deposits of Bob', async() => {
                    // 0.2975 * (500 / 1000) = 0.14875
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken2.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('500.14875', 18));
                });
                
                it('Should increase deposits of Carol', async() => {
                    // 0.2975 * (500 / 1000) = 0.14875
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken2.address, bob.address)
                    ).to.be.equal(ethers.utils.parseUnits('500.14875', 18));
                });
            });
            
            
            // with token loan interest configured
            // with Alice deposit and borrow
            describe('trigger interest applying on CCC', () => {
                beforeEach(async() => {
                    await executeInSingleBlock(async() => [
                        ...deposit(
                            dave,
                            smplToken3,
                            ethers.utils.parseUnits('100', 18)
                        )
                    ], 31516);
                });
                
                it('Should increase total debit', async() => {
                    // 200 * 220% * 31536 / 31536000 = 0.44
                    expect(
                        await mainContract.getTotalTokenDebit(smplToken3.address)
                    ).to.be.equal(ethers.utils.parseUnits('200.44', 18));
                });
                
                it('Should increase Alice debit', async() => {
                    // 0.44 * (200 / 200) = 0.44
                    expect(
                        await mainContract.getAccountTokenDebit(smplToken3.address, alice.address)
                    ).to.be.equal(ethers.utils.parseUnits('200.44', 18));
                });
                
                it('Should increase total deposit', async() => {
                    // 250 + 100 + 0.44
                    expect(
                        await mainContract.getTotalTokenDeposit(smplToken3.address)
                    ).to.be.equal(ethers.utils.parseUnits('350.44', 18));
                });
                
                it('Should increase tresoury deposit', async() => {
                    // 0.44 * 20% = 0.088
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken3.address, mainContract.address)
                    ).to.be.equal(ethers.utils.parseUnits('0.088', 18).sub(1));
                });
                
                it('Should increase deposits of Carol', async() => {
                    // 0.352 * (250 / 250) = 0.352
                    expect(
                        await mainContract.getAccountTokenDeposit(smplToken3.address, carol.address)
                    ).to.be.equal(ethers.utils.parseUnits('250.352', 18).add(1));
                });
            });
            
        });
    });
});
